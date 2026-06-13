-- PrimeChat Database Schema
-- MySQL 8.0+ required
-- Charset: utf8mb4 for full emoji support

CREATE DATABASE IF NOT EXISTS primechat
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE primechat;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(20)  DEFAULT NULL,
    phone_normalized VARCHAR(15) DEFAULT NULL,
    email_verified  TINYINT(1)   NOT NULL DEFAULT 0,
    phone_verified  TINYINT(1)   NOT NULL DEFAULT 0,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(100) NOT NULL,
    avatar_url      VARCHAR(500) DEFAULT NULL,
    about           VARCHAR(500) DEFAULT 'Hey there! I am using PrimeChat.',
    status          ENUM('online', 'offline', 'away') NOT NULL DEFAULT 'offline',
    last_seen       DATETIME     DEFAULT NULL,
    wallpaper       VARCHAR(100) DEFAULT 'default',
    theme           ENUM('light', 'dark') NOT NULL DEFAULT 'dark',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_email (email),
    INDEX idx_phone_normalized (phone_normalized),
    INDEX idx_status (status),
    INDEX idx_username_search (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CONVERSATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type            ENUM('direct', 'group') NOT NULL DEFAULT 'direct',
    name            VARCHAR(100) DEFAULT NULL,
    last_message_id INT UNSIGNED DEFAULT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_type (type),
    INDEX idx_last_message (last_message_id),
    CONSTRAINT fk_conv_last_message FOREIGN KEY (last_message_id)
        REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CONVERSATION PARTICIPANTS
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_participants (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id     INT UNSIGNED NOT NULL,
    user_id             INT UNSIGNED NOT NULL,
    joined_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unread_count        INT UNSIGNED NOT NULL DEFAULT 0,
    last_read_message_id INT UNSIGNED DEFAULT NULL,

    UNIQUE KEY uk_conv_user (conversation_id, user_id),
    INDEX idx_user_conv (user_id, conversation_id),

    CONSTRAINT fk_cp_conversation FOREIGN KEY (conversation_id)
        REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_cp_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id         INT UNSIGNED NOT NULL,
    sender_id               INT UNSIGNED NOT NULL,
    content                 TEXT         DEFAULT NULL,
    type                    ENUM('text', 'image', 'file', 'voice', 'system') NOT NULL DEFAULT 'text',
    reply_to_id             INT UNSIGNED DEFAULT NULL,
    forwarded_from_id       INT UNSIGNED DEFAULT NULL,
    thread_root_id          INT UNSIGNED DEFAULT NULL,
    is_edited               TINYINT(1)   NOT NULL DEFAULT 0,
    is_deleted_for_everyone TINYINT(1)   NOT NULL DEFAULT 0,
    client_msg_id           VARCHAR(255) DEFAULT NULL,
    expires_at              DATETIME     DEFAULT NULL,
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_conv_created (conversation_id, created_at),
    INDEX idx_conv_id (conversation_id, id),
    INDEX idx_sender (sender_id),
    INDEX idx_reply (reply_to_id),
    UNIQUE INDEX idx_messages_client_msg_id (client_msg_id),
    FULLTEXT INDEX ft_messages_content (content),

    CONSTRAINT fk_msg_conversation FOREIGN KEY (conversation_id)
        REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id)
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_reply FOREIGN KEY (reply_to_id)
        REFERENCES messages(id) ON DELETE SET NULL,
    CONSTRAINT fk_msg_forwarded FOREIGN KEY (forwarded_from_id)
        REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PINNED MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS pinned_messages (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT UNSIGNED NOT NULL,
    message_id      INT UNSIGNED NOT NULL,
    pinned_by       INT UNSIGNED NOT NULL,
    pinned_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_conv_message (conversation_id, message_id),
    INDEX idx_conversation (conversation_id),

    CONSTRAINT fk_pm_conversation FOREIGN KEY (conversation_id)
        REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_pm_message FOREIGN KEY (message_id)
        REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_pm_user FOREIGN KEY (pinned_by)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ONE-TIME PASSWORDS (email/phone verification)
-- ============================================
CREATE TABLE IF NOT EXISTS otp_codes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    type            ENUM('email', 'phone') NOT NULL,
    code            VARCHAR(6)   NOT NULL,
    expires_at      DATETIME     NOT NULL,
    verified        TINYINT(1)   NOT NULL DEFAULT 0,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user_type (user_id, type),
    INDEX idx_code (code),

    CONSTRAINT fk_otp_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- BLOCKED USERS
-- ============================================
CREATE TABLE IF NOT EXISTS blocked_users (
    user_id         INT UNSIGNED NOT NULL,
    blocked_user_id INT UNSIGNED NOT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, blocked_user_id),
    INDEX idx_blocked (blocked_user_id),

    CONSTRAINT fk_bu_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_bu_blocked FOREIGN KEY (blocked_user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MESSAGE REPORTS
-- ============================================
CREATE TABLE IF NOT EXISTS message_reports (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT UNSIGNED NOT NULL,
    message_id  INT UNSIGNED NOT NULL,
    reason      VARCHAR(255) DEFAULT NULL,
    status      ENUM('pending', 'reviewed', 'dismissed', 'action_taken') NOT NULL DEFAULT 'pending',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_status (status),
    INDEX idx_message (message_id),

    CONSTRAINT fk_mr_reporter FOREIGN KEY (reporter_id)
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_mr_message FOREIGN KEY (message_id)
        REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MESSAGE DELETIONS (per-user deletes)
-- ============================================
CREATE TABLE IF NOT EXISTS message_deletions (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id  INT UNSIGNED NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    deleted_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_msg_user (message_id, user_id),

    CONSTRAINT fk_md_message FOREIGN KEY (message_id)
        REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_md_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ATTACHMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS attachments (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id  INT UNSIGNED NOT NULL,
    file_name   VARCHAR(255) NOT NULL,
    file_path   VARCHAR(500) NOT NULL,
    file_type   VARCHAR(100) NOT NULL,
    file_size   INT UNSIGNED NOT NULL DEFAULT 0,
    width       INT UNSIGNED DEFAULT NULL,
    height      INT UNSIGNED DEFAULT NULL,
    duration    INT UNSIGNED DEFAULT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_message (message_id),

    CONSTRAINT fk_att_message FOREIGN KEY (message_id)
        REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MESSAGE REACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS message_reactions (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id  INT UNSIGNED NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    emoji       VARCHAR(10)  NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_msg_user_emoji (message_id, user_id, emoji),
    INDEX idx_message (message_id),

    CONSTRAINT fk_mr_message FOREIGN KEY (message_id)
        REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_mr_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PUSH SUBSCRIPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    endpoint        VARCHAR(500) NOT NULL,
    p256dh_key      VARCHAR(255) NOT NULL,
    auth_key        VARCHAR(255) NOT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_user_endpoint (user_id, endpoint(255)),
    INDEX idx_user (user_id),

    CONSTRAINT fk_ps_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TYPING STATUS (ephemeral)
-- ============================================
CREATE TABLE IF NOT EXISTS typing_status (
    user_id         INT UNSIGNED NOT NULL,
    conversation_id INT UNSIGNED NOT NULL,
    started_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, conversation_id),
    INDEX idx_conv (conversation_id),

    CONSTRAINT fk_ts_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ts_conversation FOREIGN KEY (conversation_id)
        REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
