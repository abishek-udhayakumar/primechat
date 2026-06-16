<?php
/**
 * PrimeChat — Session Configuration
 * Secure session handling with httponly, samesite
 */

// Only start session if not already active
if (session_status() === PHP_SESSION_NONE) {
    // Auto-detect HTTPS (including behind reverse proxy like Render, Nginx)
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
        || (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on')
        || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);

    // Session cookie parameters
    session_set_cookie_params([
        'lifetime' => SESSION_LIFETIME ?? 604800,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $isHttps,
        'httponly'  => true,
        'samesite' => $isHttps ? 'None' : 'Lax',
    ]);

    session_name('PRIMECHAT_SESSION');
    session_start();

    // Regenerate session ID periodically to prevent fixation
    if (!isset($_SESSION['_created'])) {
        $_SESSION['_created'] = time();
    } elseif (time() - $_SESSION['_created'] > 1800) {
        // Regenerate every 30 minutes — but skip if Auth just regenerated (prevents double-regen race)
        if (time() - ($_SESSION['_last_regen'] ?? 0) > 60) {
            session_regenerate_id(true);
            $_SESSION['_created'] = time();
            $_SESSION['_last_regen'] = time();
        }
    }

    // Ensure a CSRF token always exists
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
}

/**
 * Check if user is authenticated
 */
function isAuthenticated(): bool {
    return isset($_SESSION['user_id']) && !empty($_SESSION['user_id']);
}

/**
 * Get current user ID from session
 */
function getCurrentUserId(): ?int {
    return $_SESSION['user_id'] ?? null;
}

/**
 * Require authentication — sends 401 if not logged in
 */
function requireAuth(): int {
    if (!isAuthenticated()) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Authentication required']);
        exit;
    }
    return (int) $_SESSION['user_id'];
}

/**
 * Generate CSRF token
 */
function generateCsrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Validate CSRF token
 */
function validateCsrfToken(?string $token): bool {
    if (empty($token) || empty($_SESSION['csrf_token'])) {
        return false;
    }
    return hash_equals($_SESSION['csrf_token'], $token);
}
