<?php
/**
 * POST /api/settings/export
 * Request a data export (GDPR).
 *
 * GET /api/settings/export
 * Download the generated export file if available.
 */
require_once __DIR__ . '/../bootstrap.php';

$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    _handleRequestExport($userId);
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    _handleDownloadExport($userId);
} else {
    Response::error('Method not allowed', 405);
}

function _handleRequestExport(int $userId): void {
    $exportDir = BASE_PATH . '/exports';
    if (!is_dir($exportDir)) {
        @mkdir($exportDir, 0700, true);
    }

    $exportFile = $exportDir . '/user_' . $userId . '_export.json';

    // Check if existing export is still fresh (less than 24h old)
    if (file_exists($exportFile) && (time() - filemtime($exportFile)) < 86400) {
        Response::success([
            'status' => 'ready',
            'file' => '/api/settings/export',
            'expires_at' => date('c', filemtime($exportFile) + 86400),
        ], 'Export already available');
        return;
    }

    $db = Database::getInstance();

    // Collect user profile
    $stmt = $db->query(
        "SELECT id, username, email, phone, display_name, about, status, theme, created_at, updated_at
         FROM users WHERE id = ?",
        [$userId]
    );
    $profile = $stmt->fetch();

    // Collect conversations
    $stmt = $db->query(
        "SELECT c.id, c.type, c.name, c.created_at,
                (SELECT GROUP_CONCAT(u.username SEPARATOR ', ')
                 FROM conversation_participants cp2
                 JOIN users u ON u.id = cp2.user_id
                 WHERE cp2.conversation_id = c.id) AS participants
         FROM conversation_participants cp
         JOIN conversations c ON c.id = cp.conversation_id
         WHERE cp.user_id = ?",
        [$userId]
    );
    $conversations = $stmt->fetchAll();

    // Collect messages
    $stmt = $db->query(
        "SELECT m.id, m.conversation_id, m.content, m.type, m.created_at,
                u.username AS sender_username
         FROM messages m
         JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
         JOIN users u ON u.id = m.sender_id
         WHERE cp.user_id = ?
         ORDER BY m.conversation_id, m.created_at
         LIMIT 10000",
        [$userId]
    );
    $messages = $stmt->fetchAll();

    // Build export data
    $exportData = [
        'exported_at' => date('c'),
        'user_id' => $userId,
        'profile' => $profile,
        'conversations' => $conversations,
        'messages' => $messages,
    ];

    $json = json_encode($exportData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if (file_put_contents($exportFile, $json) === false) {
        Response::error('Failed to generate export', 500);
    }

    Response::success([
        'status' => 'ready',
        'file' => '/api/settings/export',
        'expires_at' => date('c', time() + 86400),
    ], 'Export generated');
}

function _handleDownloadExport(int $userId): void {
    $exportFile = BASE_PATH . '/exports/user_' . $userId . '_export.json';

    if (!file_exists($exportFile)) {
        Response::error('No export available. Request one via POST first.', 404);
    }

    // Check expiry (24h)
    if (time() - filemtime($exportFile) > 86400) {
        @unlink($exportFile);
        Response::error('Export has expired. Request a new one.', 404);
    }

    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="primechat_export_' . $userId . '.json"');
    header('Content-Length: ' . filesize($exportFile));
    readfile($exportFile);
    exit;
}
