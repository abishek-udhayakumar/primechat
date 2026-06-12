<?php
/**
 * PrimeChat — Bootstrap / Common loader
 * All API endpoints include this file
 */
require_once __DIR__ . '/../vendor/autoload.php';

// Load .env only if exists (local development / CLI)
if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
    $dotenv->load();
}

if (!defined('BASE_PATH')) {
    define('BASE_PATH', dirname(__DIR__));
}

// Load core utilities
require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/../config/session.php';
require_once __DIR__ . '/../includes/Logger.php';
require_once __DIR__ . '/../includes/Response.php';

ini_set('log_errors', '1');
define('APP_START_TIME', microtime(true));

// Global error/exception handlers
set_exception_handler(function ($e) {
    Logger::error('Uncaught Exception: ' . $e->getMessage(), [
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ]);
    Response::error('Internal Server Error', 500);
});

set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) return false;
    Logger::error("PHP Error: [$errno] $errstr", ['file' => $errfile, 'line' => $errline]);
    if ($errno === E_USER_ERROR || $errno === E_RECOVERABLE_ERROR) {
        Response::error('Critical Internal Error', 500);
    }
    return true;
});

// CORS — reflect exact origin so credentials work on HTTPS (Render, etc.)
// Wildcard '*' is rejected by browsers when credentials: 'include' is set.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_filter([
    defined('APP_URL') ? rtrim(APP_URL, '/') : '',
    'http://localhost',
    'http://127.0.0.1',
]);
if ($origin && in_array(rtrim($origin, '/'), $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
} elseif (!$origin) {
    // Same-origin request (no Origin header) — no CORS header needed
} else {
    // Unknown origin — allow for now but log it
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
header('Vary: Origin');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Load configuration
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/RateLimiter.php';

// Run pending schema migrations
runMigrations();

// Apply rate limiting
RateLimiter::check();

// Load models & core logic
require_once __DIR__ . '/../includes/Sanitizer.php';
require_once __DIR__ . '/../includes/User.php';
require_once __DIR__ . '/../includes/Auth.php';

// Initialize Auth & Validate Session
$auth = new Auth();
$isAuthed = $auth->validateSession();

// CSRF Protection for state-changing requests
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$isHealthCheck = str_contains($requestUri, '/api/health');
$isAuthAction  = str_contains($requestUri, '/api/auth/');

if (!$isHealthCheck && $_SERVER['REQUEST_METHOD'] !== 'GET' && $_SERVER['REQUEST_METHOD'] !== 'OPTIONS') {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $sessionToken = $auth->getCsrfToken();
    $csrfValid = !empty($token) && $token === $sessionToken;

    if (!$csrfValid) {
        Logger::error('CSRF token mismatch debug', [
            'received' => $token,
            'session'  => $sessionToken,
            'method'   => $_SERVER['REQUEST_METHOD'],
            'uri'      => $_SERVER['REQUEST_URI']
        ]);
        Response::error('CSRF token mismatch', 403);
    }

    // If CSRF is valid but not authed, only allow auth actions
    if (!$isAuthed && !$isAuthAction) {
        Response::error('Authentication required', 401);
    }
}

require_once __DIR__ . '/../includes/Conversation.php';
require_once __DIR__ . '/../includes/Message.php';
require_once __DIR__ . '/../includes/Chat.php';
require_once __DIR__ . '/../includes/FileUpload.php';
require_once __DIR__ . '/../includes/WebPush.php';
require_once __DIR__ . '/../includes/BlockList.php';
require_once __DIR__ . '/../includes/OTP.php';

/**
 * Run pending schema migrations.
 * Uses information_schema to check existence before applying changes.
 */
function runMigrations(): void {
    try {
        $db = Database::getInstance();

        // Migration 1: client_msg_id column
        $colCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'client_msg_id'",
            [DB_NAME]
        )->fetch();
        if (!$colCheck || $colCheck['cnt'] == 0) {
            $db->query("ALTER TABLE messages ADD COLUMN client_msg_id VARCHAR(255) DEFAULT NULL AFTER is_deleted_for_everyone");
            Logger::info('Migration: added client_msg_id column');
        }

        // Migration 2: client_msg_id index
        $idxCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages' AND INDEX_NAME = 'idx_messages_client_msg_id'",
            [DB_NAME]
        )->fetch();
        if (!$idxCheck || $idxCheck['cnt'] == 0) {
            $db->query("CREATE INDEX idx_messages_client_msg_id ON messages(client_msg_id)");
            Logger::info('Migration: added idx_messages_client_msg_id index');
        }

        // Migration 3: last_message_id column on conversations
        $colCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'last_message_id'",
            [DB_NAME]
        )->fetch();
        if (!$colCheck || $colCheck['cnt'] == 0) {
            $db->query("ALTER TABLE conversations ADD COLUMN last_message_id INT UNSIGNED DEFAULT NULL AFTER name");
            Logger::info('Migration: added last_message_id column');
        }

        // Migration 4: last_message_id FK constraint
        $fkCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'conversations' AND CONSTRAINT_NAME = 'fk_conv_last_message'",
            [DB_NAME]
        )->fetch();
        if (!$fkCheck || $fkCheck['cnt'] == 0) {
            $db->query(
                "ALTER TABLE conversations ADD CONSTRAINT fk_conv_last_message
                 FOREIGN KEY (last_message_id) REFERENCES messages(id) ON DELETE SET NULL"
            );
            Logger::info('Migration: added fk_conv_last_message constraint');
        }

        // Migration 5: backfill last_message_id for existing conversations
        $backfillCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM conversations WHERE last_message_id IS NULL AND id IN (SELECT DISTINCT conversation_id FROM messages)"
        )->fetch();
        if ($backfillCheck && $backfillCheck['cnt'] > 0) {
            $db->query(
                "UPDATE conversations c
                 SET c.last_message_id = (
                     SELECT MAX(m.id) FROM messages m WHERE m.conversation_id = c.id
                 )
                 WHERE c.last_message_id IS NULL"
            );
            Logger::info('Migration: backfilled last_message_id for existing conversations');
        }

        // Migration 6: message_reactions table
        $tableCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'message_reactions'",
            [DB_NAME]
        )->fetch();
        if (!$tableCheck || $tableCheck['cnt'] == 0) {
            $db->query(
                "CREATE TABLE message_reactions (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    message_id INT UNSIGNED NOT NULL,
                    user_id INT UNSIGNED NOT NULL,
                    emoji VARCHAR(10) NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_msg_user_emoji (message_id, user_id, emoji),
                    INDEX idx_message (message_id),
                    CONSTRAINT fk_mr_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                    CONSTRAINT fk_mr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            Logger::info('Migration: created message_reactions table');
        }

        // Migration 7: push_subscriptions table
        $tableCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'push_subscriptions'",
            [DB_NAME]
        )->fetch();
        if (!$tableCheck || $tableCheck['cnt'] == 0) {
            $db->query(
                "CREATE TABLE push_subscriptions (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    user_id INT UNSIGNED NOT NULL,
                    endpoint VARCHAR(500) NOT NULL,
                    p256dh_key VARCHAR(255) NOT NULL,
                    auth_key VARCHAR(255) NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_user_endpoint (user_id, endpoint(255)),
                    INDEX idx_user (user_id),
                    CONSTRAINT fk_ps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            Logger::info('Migration: created push_subscriptions table');
        }

        // Migration 8: blocked_users table
        $tableCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'blocked_users'",
            [DB_NAME]
        )->fetch();
        if (!$tableCheck || $tableCheck['cnt'] == 0) {
            $db->query(
                "CREATE TABLE blocked_users (
                    user_id INT UNSIGNED NOT NULL,
                    blocked_user_id INT UNSIGNED NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, blocked_user_id),
                    INDEX idx_blocked (blocked_user_id),
                    CONSTRAINT fk_bu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    CONSTRAINT fk_bu_blocked FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            Logger::info('Migration: created blocked_users table');
        }

        // Migration 9: message_reports table
        $tableCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'message_reports'",
            [DB_NAME]
        )->fetch();
        if (!$tableCheck || $tableCheck['cnt'] == 0) {
            $db->query(
                "CREATE TABLE message_reports (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    reporter_id INT UNSIGNED NOT NULL,
                    message_id INT UNSIGNED NOT NULL,
                    reason VARCHAR(255) DEFAULT NULL,
                    status ENUM('pending', 'reviewed', 'dismissed', 'action_taken') NOT NULL DEFAULT 'pending',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_status (status),
                    INDEX idx_message (message_id),
                    CONSTRAINT fk_mr_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
                    CONSTRAINT fk_mr_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            Logger::info('Migration: created message_reports table');
        }

        // Migration 10: email_verified + phone_verified columns on users
        $colCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified'",
            [DB_NAME]
        )->fetch();
        if (!$colCheck || $colCheck['cnt'] == 0) {
            $db->query("ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER phone_normalized");
            $db->query("ALTER TABLE users ADD COLUMN phone_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER email_verified");
            Logger::info('Migration: added email_verified/phone_verified columns');
        }

        // Migration 11: otp_codes table
        $tableCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'otp_codes'",
            [DB_NAME]
        )->fetch();
        if (!$tableCheck || $tableCheck['cnt'] == 0) {
            $db->query(
                "CREATE TABLE otp_codes (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    user_id INT UNSIGNED NOT NULL,
                    type ENUM('email', 'phone') NOT NULL,
                    code VARCHAR(6) NOT NULL,
                    expires_at DATETIME NOT NULL,
                    verified TINYINT(1) NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_user_type (user_id, type),
                    INDEX idx_code (code),
                    CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            Logger::info('Migration: created otp_codes table');
        }

        // Migration 12: thread_root_id column on messages
        $colCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'thread_root_id'",
            [DB_NAME]
        )->fetch();
        if (!$colCheck || $colCheck['cnt'] == 0) {
            $db->query("ALTER TABLE messages ADD COLUMN thread_root_id INT UNSIGNED DEFAULT NULL AFTER forwarded_from_id");
            $db->query("ALTER TABLE messages ADD INDEX idx_thread_root (thread_root_id)");
            $db->query("ALTER TABLE messages ADD CONSTRAINT fk_msg_thread_root FOREIGN KEY (thread_root_id) REFERENCES messages(id) ON DELETE SET NULL");
            Logger::info('Migration: added thread_root_id column to messages');
        }

        // Migration 13: expires_at column on messages (ephemeral messages)
        $colCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'expires_at'",
            [DB_NAME]
        )->fetch();
        if (!$colCheck || $colCheck['cnt'] == 0) {
            $db->query("ALTER TABLE messages ADD COLUMN expires_at DATETIME DEFAULT NULL AFTER updated_at");
            Logger::info('Migration: added expires_at column to messages');
        }

        // Migration 14: pinned_messages table
        $tableCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'pinned_messages'",
            [DB_NAME]
        )->fetch();
        if (!$tableCheck || $tableCheck['cnt'] == 0) {
            $db->query(
                "CREATE TABLE pinned_messages (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    conversation_id INT UNSIGNED NOT NULL,
                    message_id INT UNSIGNED NOT NULL,
                    pinned_by INT UNSIGNED NOT NULL,
                    pinned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_conv_message (conversation_id, message_id),
                    INDEX idx_conversation (conversation_id),
                    CONSTRAINT fk_pm_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                    CONSTRAINT fk_pm_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                    CONSTRAINT fk_pm_user FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            Logger::info('Migration: created pinned_messages table');
        }

        // Migration 15: FULLTEXT index on messages.content
        // MySQL 8.0 caches information_schema (stats_expiry defaults to 86400s),
        // so we force a fresh read to avoid "Duplicate key name" errors.
        $db->query("SET SESSION information_schema_stats_expiry = 0");
        $fulltextCheck = $db->query(
            "SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages' AND INDEX_NAME = 'ft_messages_content'",
            [DB_NAME]
        )->fetch();
        if (!$fulltextCheck || $fulltextCheck['cnt'] == 0) {
            $db->query("CREATE FULLTEXT INDEX ft_messages_content ON messages(content)");
            Logger::info('Migration: added ft_messages_content FULLTEXT index');
        }

        Logger::info('Migrations completed');
    } catch (\Throwable $e) {
        Logger::warning('Migration check failed (non-fatal): ' . $e->getMessage());
    }
}
