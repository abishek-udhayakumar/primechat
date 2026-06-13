<?php
/**
 * GET  /api/auth/sessions  — List active sessions for current user
 * DELETE /api/auth/sessions — Revoke a specific session
 *
 * Engineering showcase:
 *   - Session enumeration (which devices are logged in)
 *   - Remote sign-out (revoke other sessions via token invalidation)
 *   - Device fingerprinting (UA parsing for device type icon)
 *   - Security: cannot revoke current session without explicit confirmation
 *
 * Interview points:
 *   - PHP sessions stored in files by default — query via session_save_path()
 *   - Production alternative: sessions in Redis with SCAN + TTL
 *   - Why list sessions? Key trust signal (used by Google, WhatsApp, Telegram)
 *   - Trade-off: File-based session listing is O(n) scans. Redis SCAN is O(n)
 *     but much faster with keyspace pattern matching.
 */
require_once __DIR__ . '/../bootstrap.php';

$userId = requireAuth();

// ── GET: List all active sessions ──
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $sessions = _getActiveSessions($userId);
    Response::success($sessions);

// ── DELETE: Revoke a session ──
} elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $data      = Response::getJsonBody();
    $targetSid = Sanitizer::trimInput($data['session_id'] ?? '');

    if (empty($targetSid)) {
        Response::error('session_id is required', 422);
    }

    // Prevent revoking current session via this endpoint (use logout for that)
    if ($targetSid === session_id()) {
        Response::error('Cannot revoke current session via this endpoint. Use /auth/logout.', 400);
    }

    $success = _revokeSession($userId, $targetSid);
    if (!$success) {
        Response::error('Session not found or already expired', 404);
    }

    Response::success(null, 'Session revoked');
} else {
    Response::error('Method not allowed', 405);
}

/**
 * List all active sessions for a user.
 * Reads session files to find ones belonging to this user.
 *
 * Production note: In a Redis-backed session store, this would be:
 *   KEYS session:user:{userId}:*  or via a user→sessions index set
 */
function _getActiveSessions(int $userId): array {
    $db = Database::getInstance();

    // Use database sessions table if it exists (preferred production approach)
    try {
        $stmt = $db->query(
            "SELECT id, session_token, user_agent, ip_address, last_active, created_at
             FROM user_sessions
             WHERE user_id = ? AND expires_at > NOW() AND is_revoked = 0
             ORDER BY last_active DESC",
            [$userId]
        );
        $rows = $stmt->fetchAll();

        $currentSid = session_id();
        $sessions   = [];
        foreach ($rows as $row) {
            $sessions[] = _formatSession($row, $currentSid);
        }
        return $sessions;

    } catch (\Throwable $e) {
        // Fallback: file-based session scan (for environments without sessions table)
        return _getFileBasedSessions($userId);
    }
}

function _getFileBasedSessions(int $userId): array {
    $savePath = session_save_path() ?: sys_get_temp_dir();
    $sessions = [];
    $currentSid = session_id();

    if (!is_dir($savePath)) return [];

    $files = glob($savePath . '/sess_*');
    if (!$files) return [];

    foreach ($files as $file) {
        if (!is_readable($file)) continue;

        $data = file_get_contents($file);
        if (strpos($data, "user_id|i:$userId") === false) continue;

        $sid = str_replace($savePath . '/sess_', '', $file);
        $mtime = filemtime($file);

        $sessions[] = [
            'session_id'  => $sid,
            'is_current'  => $sid === $currentSid,
            'device_type' => 'unknown',
            'browser'     => 'Unknown Browser',
            'ip'          => 'Unknown IP',
            'last_active' => date('Y-m-d H:i:s', $mtime),
            'created_at'  => date('Y-m-d H:i:s', $mtime),
        ];
    }

    // Sort: current session first, then most recent
    usort($sessions, fn($a, $b) => $b['is_current'] <=> $a['is_current'] ?: strtotime($b['last_active']) <=> strtotime($a['last_active']));

    return $sessions;
}

function _revokeSession(int $userId, string $targetSid): bool {
    $db = Database::getInstance();

    // Try database sessions table first
    try {
        $stmt = $db->query(
            "UPDATE user_sessions SET is_revoked = 1
             WHERE session_token = ? AND user_id = ? AND is_revoked = 0",
            [$targetSid, $userId]
        );
        return $stmt->rowCount() > 0;
    } catch (\Throwable $e) {
        // Fallback: delete session file
        $savePath = session_save_path() ?: sys_get_temp_dir();
        $file = $savePath . '/sess_' . preg_replace('/[^a-zA-Z0-9]/', '', $targetSid);

        if (!file_exists($file)) return false;

        // Verify the session belongs to this user before deleting
        $data = file_get_contents($file);
        if (strpos($data, "user_id|i:$userId") === false) return false;

        return unlink($file);
    }
}

function _formatSession(array $row, string $currentSid): array {
    $ua         = $row['user_agent'] ?? '';
    $deviceType = _detectDeviceType($ua);
    $browser    = _detectBrowser($ua);

    return [
        'session_id'  => $row['session_token'] ?? $row['id'],
        'is_current'  => ($row['session_token'] ?? '') === $currentSid,
        'device_type' => $deviceType,
        'browser'     => $browser,
        'ip'          => $row['ip_address'] ?? 'Unknown',
        'last_active' => $row['last_active'],
        'created_at'  => $row['created_at'],
    ];
}

function _detectDeviceType(string $ua): string {
    if (preg_match('/Mobile|Android|iPhone|iPad/i', $ua)) return 'mobile';
    if (preg_match('/Tablet|iPad/i', $ua)) return 'tablet';
    return 'desktop';
}

function _detectBrowser(string $ua): string {
    if (preg_match('/Chrome\/(\d+)/i', $ua, $m)) return "Chrome {$m[1]}";
    if (preg_match('/Firefox\/(\d+)/i', $ua, $m)) return "Firefox {$m[1]}";
    if (preg_match('/Safari\/(\d+)/i', $ua)) return 'Safari';
    if (preg_match('/Edge\/(\d+)/i', $ua, $m)) return "Edge {$m[1]}";
    return 'Unknown Browser';
}
