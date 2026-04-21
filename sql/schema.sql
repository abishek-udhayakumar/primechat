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
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_type (type)
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
    is_edited               TINYINT(1)   NOT NULL DEFAULT 0,
    is_deleted_for_everyone TINYINT(1)   NOT NULL DEFAULT 0,
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_conv_created (conversation_id, created_at),
    INDEX idx_conv_id (conversation_id, id),
    INDEX idx_sender (sender_id),
    INDEX idx_reply (reply_to_id),

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
