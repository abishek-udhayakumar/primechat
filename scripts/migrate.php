<?php
/**
 * PrimeChat — Database Migration Script
 * Run this script during deployment to apply pending schema migrations.
 *
 * Usage: php scripts/migrate.php
 */

require_once __DIR__ . '/../vendor/autoload.php';

// Load .env
if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
    $dotenv->load();
}

define('BASE_PATH', dirname(__DIR__));

require_once BASE_PATH . '/config/app.php';
require_once BASE_PATH . '/config/database.php';
require_once BASE_PATH . '/includes/Logger.php';

echo "PrimeChat Migration Tool\n";
echo "========================\n\n";

runMigrations();

echo "\nMigration complete.\n";

/**
 * Run pending schema migrations.
 * Uses information_schema to check existence before applying changes.
 */
function runMigrations(): void {
    $db = Database::getInstance();

    // Migration 1: client_msg_id column
    $colCheck = $db->query(
        "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'client_msg_id'",
        [DB_NAME]
    )->fetch();
    if (!$colCheck || $colCheck['cnt'] == 0) {
        $db->query("ALTER TABLE messages ADD COLUMN client_msg_id VARCHAR(255) DEFAULT NULL AFTER is_deleted_for_everyone");
        echo "[✓] Migration 1: added client_msg_id column\n";
    } else {
        echo "[—] Migration 1: client_msg_id column already exists\n";
    }

    // Migration 2: client_msg_id index
    $idxCheck = $db->query(
        "SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages' AND INDEX_NAME = 'idx_messages_client_msg_id'",
        [DB_NAME]
    )->fetch();
    if (!$idxCheck || $idxCheck['cnt'] == 0) {
        $db->query("CREATE INDEX idx_messages_client_msg_id ON messages(client_msg_id)");
        echo "[✓] Migration 2: added idx_messages_client_msg_id index\n";
    } else {
        echo "[—] Migration 2: idx_messages_client_msg_id already exists\n";
    }

    // Migration 3: last_message_id column on conversations
    $colCheck = $db->query(
        "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'last_message_id'",
        [DB_NAME]
    )->fetch();
    if (!$colCheck || $colCheck['cnt'] == 0) {
        $db->query("ALTER TABLE conversations ADD COLUMN last_message_id INT UNSIGNED DEFAULT NULL AFTER name");
        echo "[✓] Migration 3: added last_message_id column\n";
    } else {
        echo "[—] Migration 3: last_message_id column already exists\n";
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
        echo "[✓] Migration 4: added fk_conv_last_message constraint\n";
    } else {
        echo "[—] Migration 4: fk_conv_last_message already exists\n";
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
        echo "[✓] Migration 5: backfilled last_message_id for existing conversations\n";
    } else {
        echo "[—] Migration 5: no conversations need backfilling\n";
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
        echo "[✓] Migration 6: created message_reactions table\n";
    } else {
        echo "[—] Migration 6: message_reactions table already exists\n";
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
        echo "[✓] Migration 7: created push_subscriptions table\n";
    } else {
        echo "[—] Migration 7: push_subscriptions table already exists\n";
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
        echo "[✓] Migration 8: created blocked_users table\n";
    } else {
        echo "[—] Migration 8: blocked_users table already exists\n";
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
        echo "[✓] Migration 9: created message_reports table\n";
    } else {
        echo "[—] Migration 9: message_reports table already exists\n";
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
        echo "[✓] Migration 10: added email_verified/phone_verified columns\n";
    } else {
        echo "[—] Migration 10: email_verified/phone_verified already exist\n";
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
        echo "[✓] Migration 11: created otp_codes table\n";
    } else {
        echo "[—] Migration 11: otp_codes table already exists\n";
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
        echo "[✓] Migration 12: added thread_root_id column to messages\n";
    } else {
        echo "[—] Migration 12: thread_root_id already exists\n";
    }

    // Migration 13: expires_at column on messages (ephemeral messages)
    $colCheck = $db->query(
        "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'expires_at'",
        [DB_NAME]
    )->fetch();
    if (!$colCheck || $colCheck['cnt'] == 0) {
        $db->query("ALTER TABLE messages ADD COLUMN expires_at DATETIME DEFAULT NULL AFTER updated_at");
        echo "[✓] Migration 13: added expires_at column to messages\n";
    } else {
        echo "[—] Migration 13: expires_at already exists\n";
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
        echo "[✓] Migration 14: created pinned_messages table\n";
    } else {
        echo "[—] Migration 14: pinned_messages table already exists\n";
    }

    // Migration 15: FULLTEXT index on messages.content
    $db->query("SET SESSION information_schema_stats_expiry = 0");
    $fulltextCheck = $db->query(
        "SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages' AND INDEX_NAME = 'ft_messages_content'",
        [DB_NAME]
    )->fetch();
    if (!$fulltextCheck || $fulltextCheck['cnt'] == 0) {
        $db->query("CREATE FULLTEXT INDEX ft_messages_content ON messages(content)");
        echo "[✓] Migration 15: added ft_messages_content FULLTEXT index\n";
    } else {
        echo "[—] Migration 15: ft_messages_content already exists\n";
    }

    // Migration 16: direct_conversation_lookup table for race-free direct conversation creation
    $tableCheck = $db->query(
        "SELECT COUNT(*) AS cnt FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'direct_conversation_lookup'",
        [DB_NAME]
    )->fetch();
    if (!$tableCheck || $tableCheck['cnt'] == 0) {
        $db->query(
            "CREATE TABLE direct_conversation_lookup (
                user1_id INT UNSIGNED NOT NULL,
                user2_id INT UNSIGNED NOT NULL,
                conversation_id INT UNSIGNED NOT NULL,
                PRIMARY KEY (user1_id, user2_id),
                INDEX idx_conversation (conversation_id),
                CONSTRAINT fk_dcl_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                CONSTRAINT fk_dcl_user1 FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
                CONSTRAINT fk_dcl_user2 FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        echo "[✓] Migration 16: created direct_conversation_lookup table\n";

        // Backfill existing direct conversations
        $existingDirect = $db->query(
            "SELECT c.id,
                    LEAST(cp1.user_id, cp2.user_id) AS user1_id,
                    GREATEST(cp1.user_id, cp2.user_id) AS user2_id
             FROM conversations c
             INNER JOIN conversation_participants cp1 ON cp1.conversation_id = c.id
             INNER JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id > cp1.user_id
             WHERE c.type = 'direct'"
        )->fetchAll();
        foreach ($existingDirect as $row) {
            try {
                $db->query(
                    "INSERT IGNORE INTO direct_conversation_lookup (user1_id, user2_id, conversation_id) VALUES (?, ?, ?)",
                    [$row['user1_id'], $row['user2_id'], $row['id']]
                );
            } catch (\Throwable $e) {
                echo "  [!] Skipped conversation {$row['id']}: {$e->getMessage()}\n";
            }
        }
        echo "  Backfilled " . count($existingDirect) . " existing direct conversations\n";
    } else {
        echo "[—] Migration 16: direct_conversation_lookup table already exists\n";
    }

    echo "\nAll migrations completed.\n";
}
