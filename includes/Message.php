<?php
/**
 * PrimeChat — Message Model
 * Handles message CRUD, replies, forwarding, edit, delete
 */

class Message {
    private Database $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /**
     * Send a new message
     */
    public function send(int $conversationId, int $senderId, string $content, string $type = 'text', ?int $replyToId = null, ?int $forwardedFromId = null): int {
        $this->db->query(
            "INSERT INTO messages (conversation_id, sender_id, content, type, reply_to_id, forwarded_from_id)
             VALUES (?, ?, ?, ?, ?, ?)",
            [$conversationId, $senderId, $content, $type, $replyToId, $forwardedFromId]
        );
        return (int) $this->db->lastInsertId();
    }

    /**
     * Get messages for a conversation (paginated)
     * Supports fetching only new messages after a given ID
     */
    public function getForConversation(int $conversationId, int $userId, ?int $afterId = null, int $limit = 50, ?int $beforeId = null): array {
        $params = [$conversationId, $userId];
        $conditions = "m.conversation_id = ?
            AND NOT EXISTS (
                SELECT 1 FROM message_deletions md
                WHERE md.message_id = m.id AND md.user_id = ?
            )";

        if ($afterId !== null) {
            $conditions .= " AND m.id > ?";
            $params[] = $afterId;
        }

        if ($beforeId !== null) {
            $conditions .= " AND m.id < ?";
            $params[] = $beforeId;
        }

        $params[] = $limit;

        // If loading older messages (beforeId), we want oldest first within the batch
        // If loading new messages (afterId), we also want oldest first
        // Otherwise, load the most recent N and reverse
        $orderDirection = ($afterId !== null) ? 'ASC' : 'DESC';

        $stmt = $this->db->query(
            "SELECT
                m.id,
                m.conversation_id,
                m.sender_id,
                m.content,
                m.type,
                m.reply_to_id,
                m.forwarded_from_id,
                m.is_edited,
                m.is_deleted_for_everyone,
                m.created_at,
                m.updated_at,
                -- Sender info
                u.username AS sender_username,
                u.display_name AS sender_display_name,
                u.avatar_url AS sender_avatar_url,
                -- Reply-to message info
                reply_msg.content AS reply_content,
                reply_msg.sender_id AS reply_sender_id,
                reply_user.display_name AS reply_sender_name,
                reply_msg.type AS reply_type,
                -- Attachment info
                att.id AS attachment_id,
                att.file_name AS attachment_file_name,
                att.file_path AS attachment_file_path,
                att.file_type AS attachment_file_type,
                att.file_size AS attachment_file_size,
                att.width AS attachment_width,
                att.height AS attachment_height,
                att.duration AS attachment_duration
             FROM messages m
             INNER JOIN users u ON u.id = m.sender_id
             LEFT JOIN messages reply_msg ON reply_msg.id = m.reply_to_id
             LEFT JOIN users reply_user ON reply_user.id = reply_msg.sender_id
             LEFT JOIN attachments att ON att.message_id = m.id
             WHERE $conditions
             ORDER BY m.id $orderDirection
             LIMIT ?",
            $params
        );

        $messages = $stmt->fetchAll();

        // Reverse if we fetched in DESC order so messages appear oldest → newest
        if ($orderDirection === 'DESC') {
            $messages = array_reverse($messages);
        }

        return $messages;
    }

    /**
     * Get a single message by ID (lightweight, no attachment/reply joins)
     */
    public function findById(int $messageId): ?array {
        $stmt = $this->db->query(
            "SELECT m.*, u.display_name AS sender_display_name, u.avatar_url AS sender_avatar_url
             FROM messages m
             INNER JOIN users u ON u.id = m.sender_id
             WHERE m.id = ?",
            [$messageId]
        );
        $msg = $stmt->fetch();
        return $msg ?: null;
    }

    /**
     * Get a single message by ID with full attachment + reply JOINs.
     * Returns the same flat-row shape as getForConversation rows.
     * Used by send.php to return a properly formatted message after insert.
     */
    public function findByIdFull(int $messageId): ?array {
        $stmt = $this->db->query(
            "SELECT
                m.id, m.conversation_id, m.sender_id, m.content, m.type,
                m.reply_to_id, m.forwarded_from_id, m.is_edited,
                m.is_deleted_for_everyone, m.created_at, m.updated_at,
                u.username AS sender_username,
                u.display_name AS sender_display_name,
                u.avatar_url AS sender_avatar_url,
                reply_msg.content AS reply_content,
                reply_msg.sender_id AS reply_sender_id,
                reply_user.display_name AS reply_sender_name,
                reply_msg.type AS reply_type,
                att.id AS attachment_id,
                att.file_name AS attachment_file_name,
                att.file_path AS attachment_file_path,
                att.file_type AS attachment_file_type,
                att.file_size AS attachment_file_size,
                att.width AS attachment_width,
                att.height AS attachment_height,
                att.duration AS attachment_duration
             FROM messages m
             INNER JOIN users u ON u.id = m.sender_id
             LEFT JOIN messages reply_msg ON reply_msg.id = m.reply_to_id
             LEFT JOIN users reply_user ON reply_user.id = reply_msg.sender_id
             LEFT JOIN attachments att ON att.message_id = m.id
             WHERE m.id = ?",
            [$messageId]
        );
        $row = $stmt->fetch();
        return $row ?: null;
    }

    /**
     * Edit a message (only by sender)
     */
    public function edit(int $messageId, int $senderId, string $newContent): bool {
        $stmt = $this->db->query(
            "UPDATE messages
             SET content = ?, is_edited = 1, updated_at = NOW()
             WHERE id = ? AND sender_id = ? AND is_deleted_for_everyone = 0",
            [$newContent, $messageId, $senderId]
        );
        return $stmt->rowCount() > 0;
    }

    /**
     * Delete message for everyone (only by sender)
     */
    public function deleteForEveryone(int $messageId, int $senderId): bool {
        $stmt = $this->db->query(
            "UPDATE messages
             SET is_deleted_for_everyone = 1, content = NULL, updated_at = NOW()
             WHERE id = ? AND sender_id = ?",
            [$messageId, $senderId]
        );
        return $stmt->rowCount() > 0;
    }

    /**
     * Delete message for current user only
     */
    public function deleteForMe(int $messageId, int $userId): bool {
        $this->db->query(
            "INSERT IGNORE INTO message_deletions (message_id, user_id) VALUES (?, ?)",
            [$messageId, $userId]
        );
        return true;
    }

    /**
     * Get read status for a message
     * Returns whether the other participant has read it
     */
    public function getReadStatus(int $messageId, int $conversationId, int $senderId): string {
        // Check if the other participant has read past this message
        $stmt = $this->db->query(
            "SELECT cp.last_read_message_id
             FROM conversation_participants cp
             WHERE cp.conversation_id = ? AND cp.user_id != ?
             LIMIT 1",
            [$conversationId, $senderId]
        );
        $result = $stmt->fetch();

        if (!$result) return 'sent';

        $lastRead = $result['last_read_message_id'];
        if ($lastRead === null) return 'delivered';
        if ($lastRead >= $messageId) return 'read';
        return 'delivered';
    }

    /**
     * Batch get read status for multiple messages
     */
    public function getReadStatusBatch(int $conversationId, int $senderId): ?int {
        $stmt = $this->db->query(
            "SELECT cp.last_read_message_id
             FROM conversation_participants cp
             WHERE cp.conversation_id = ? AND cp.user_id != ?
             LIMIT 1",
            [$conversationId, $senderId]
        );
        $result = $stmt->fetch();
        return $result ? ($result['last_read_message_id'] ? (int)$result['last_read_message_id'] : null) : null;
    }

    /**
     * Get count of new messages after a given ID
     */
    public function getNewMessageCount(int $conversationId, int $afterId): int {
        $stmt = $this->db->query(
            "SELECT COUNT(*) as count FROM messages
             WHERE conversation_id = ? AND id > ? AND is_deleted_for_everyone = 0",
            [$conversationId, $afterId]
        );
        return (int) $stmt->fetch()['count'];
    }

    /**
     * Add attachment to a message
     */
    public function addAttachment(int $messageId, array $fileData): int {
        $this->db->query(
            "INSERT INTO attachments (message_id, file_name, file_path, file_type, file_size, width, height, duration)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $messageId,
                $fileData['file_name'],
                $fileData['file_path'],
                $fileData['file_type'],
                $fileData['file_size'],
                $fileData['width'] ?? null,
                $fileData['height'] ?? null,
                $fileData['duration'] ?? null,
            ]
        );
        return (int) $this->db->lastInsertId();
    }
}
