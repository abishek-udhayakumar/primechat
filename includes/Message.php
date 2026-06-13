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
    public function send(int $conversationId, int $senderId, string $content, string $type = 'text', ?int $replyToId = null, ?int $forwardedFromId = null, ?string $clientMsgId = null, ?int $threadRootId = null, ?int $expiresIn = null): int {
        // Deduplication check — validate ownership to prevent spoofing
        if ($clientMsgId) {
            $existing = $this->findByClientMsgId($clientMsgId, $senderId);
            if ($existing) {
                return (int) $existing['id'];
            }
        }

        // If replying to a message, inherit thread_root_id
        if ($replyToId && !$threadRootId) {
            $parent = $this->findById($replyToId);
            if ($parent) {
                $threadRootId = (int)($parent['thread_root_id'] ?? $replyToId);
            }
        }

        // Calculate expires_at for ephemeral messages
        $expiresAt = null;
        if ($expiresIn !== null && in_array($expiresIn, [5, 30, 60, 300, 3600, 86400])) {
            $expiresAt = date('Y-m-d H:i:s', time() + $expiresIn);
        }

        $this->db->query(
            "INSERT INTO messages (conversation_id, sender_id, content, type, reply_to_id, forwarded_from_id, thread_root_id, client_msg_id, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [$conversationId, $senderId, $content, $type, $replyToId, $forwardedFromId, $threadRootId, $clientMsgId, $expiresAt]
        );
        return (int) $this->db->lastInsertId();
    }

    /**
     * Delete expired messages (ephemeral messages past their expiry).
     */
    public function deleteExpiredMessages(): int {
        $stmt = $this->db->query(
            "UPDATE messages SET is_deleted_for_everyone = 1, content = NULL
             WHERE expires_at IS NOT NULL AND expires_at <= NOW() AND is_deleted_for_everyone = 0"
        );
        return $stmt->rowCount();
    }

    /**
     * Find a message by client_msg_id (for deduplication).
     * Optionally validates ownership by sender_id to prevent spoofing.
     */
    public function findByClientMsgId(string $clientMsgId, ?int $senderId = null): ?array {
        $sql = "SELECT id FROM messages WHERE client_msg_id = ?";
        $params = [$clientMsgId];
        if ($senderId !== null) {
            $sql .= " AND sender_id = ?";
            $params[] = $senderId;
        }
        $stmt = $this->db->query($sql, $params);
        return $stmt->fetch() ?: null;
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

        // Extra param for reactions subquery (needs current user)
        $params[] = $userId;

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
                m.thread_root_id,
                m.is_edited,
                m.is_deleted_for_everyone,
                m.client_msg_id,
                m.expires_at,
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
                att.duration AS attachment_duration,
                -- Thread reply count
                (
                    SELECT COUNT(*) FROM messages m_thread
                    WHERE m_thread.thread_root_id = m.id
                ) AS thread_reply_count,
                -- Reactions (JSON aggregated)
                (
                    SELECT JSON_ARRAYAGG(JSON_OBJECT('e', mr.emoji, 'c', mr.cnt, 'm', mr.mine))
                    FROM (
                        SELECT mr2.emoji, COUNT(*) AS cnt,
                               MAX(CASE WHEN mr2.user_id = ? THEN 1 ELSE 0 END) AS mine
                        FROM message_reactions mr2
                        WHERE mr2.message_id = m.id
                        GROUP BY mr2.emoji
                        ORDER BY COUNT(*) DESC
                    ) mr
                ) AS reactions_json
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
     * Map message array to shorthand keys for network optimization
     */
    public static function formatShorthand(array $msg, int $userId): array {
        $isMine = (int)$msg['sender_id'] === $userId;
        
        $attachment = null;
        if (!empty($msg['attachment_id'])) {
            $attachment = [
                'i'  => (int)$msg['attachment_id'],
                'n'  => $msg['attachment_file_name'],
                'p'  => $msg['attachment_file_path'],
                't'  => $msg['attachment_file_type'],
                's'  => (int)$msg['attachment_file_size'],
                'w'  => (int)($msg['attachment_width'] ?? 0),
                'h'  => (int)($msg['attachment_height'] ?? 0),
                'd'  => (int)($msg['attachment_duration'] ?? 0),
            ];
        }

        $reply = null;
        if (!empty($msg['reply_to_id'])) {
            $reply = [
                'i'  => (int)$msg['reply_to_id'],
                'c'  => $msg['reply_content'] ?? '',
                'si' => (int)($msg['reply_sender_id'] ?? 0),
                'sn' => $msg['reply_sender_name'] ?? '',
                't'  => $msg['reply_type'] ?? 'text',
            ];
        }

        // Parse reactions from JSON if present
        $reactions = null;
        if (!empty($msg['reactions_json'])) {
            $reactions = json_decode($msg['reactions_json'], true);
        }

        return [
            'i'  => (int)$msg['id'],
            'ci' => (int)$msg['conversation_id'],
            'si' => (int)$msg['sender_id'],
            'sn' => $msg['sender_display_name'] ?? '',
            'sa' => $msg['sender_avatar_url'] ?? '',
            'c'  => $msg['is_deleted_for_everyone'] ? null : ($msg['content'] ?? ''),
            't'  => $msg['type'],
            'im' => $isMine,
            'ie' => (bool)($msg['is_edited'] ?? false),
            'id' => (bool)($msg['is_deleted_for_everyone'] ?? false),
            'ff' => $msg['forwarded_from_id'] ? (int)$msg['forwarded_from_id'] : null,
            're' => $reply,
            'at' => $attachment,
            'rt' => $reactions,
            'tr' => !empty($msg['thread_root_id']) ? (int)$msg['thread_root_id'] : null,
            'tc' => (int)($msg['thread_reply_count'] ?? 0),
            'ex' => $msg['expires_at'] ?? null,
            'rs' => 'sent', // placeholder, updated by caller if needed
            'ca' => $msg['created_at'],
            'cm' => $msg['client_msg_id'] ?? null,
        ];
    }

    /**
     * Batch-fetch reactions for a set of message IDs.
     * Returns a map of message_id => reaction summaries.
     */
    public static function getReactionsForMessages(array $messageIds, int $currentUserId): array {
        if (empty($messageIds)) return [];

        $db = Database::getInstance();
        $placeholders = implode(',', array_fill(0, count($messageIds), '?'));

        $params = array_merge($messageIds, [$currentUserId]);
        $stmt = $db->query(
            "SELECT mr.message_id, mr.emoji, COUNT(*) AS count,
                    MAX(CASE WHEN mr.user_id = ? THEN 1 ELSE 0 END) AS user_reacted
             FROM message_reactions mr
             WHERE mr.message_id IN ($placeholders)
             GROUP BY mr.message_id, mr.emoji
             ORDER BY mr.message_id, COUNT(*) DESC",
            $params
        );

        $rows = $stmt->fetchAll();
        $result = [];
        foreach ($rows as $row) {
            $mid = (int)$row['message_id'];
            if (!isset($result[$mid])) {
                $result[$mid] = [];
            }
            $result[$mid][] = [
                'e' => $row['emoji'],
                'c' => (int)$row['count'],
                'm' => (bool)$row['user_reacted'],
            ];
        }
        return $result;
    }

    /**
     * Get a single message by ID (lightweight, no attachment/reply joins)
     */
    public function findById(int $messageId): ?array {
        $stmt = $this->db->query(
            "SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type, m.thread_root_id, m.created_at, m.is_edited, m.is_deleted_for_everyone,
                     u.display_name AS sender_display_name, u.avatar_url AS sender_avatar_url
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
                m.is_deleted_for_everyone, m.client_msg_id, m.created_at, m.updated_at,
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
     * Get read status for a message.
     * For direct conversations: checks if the other participant has read it.
     * For group conversations: checks read status across all other participants.
     */
    public function getReadStatus(int $messageId, int $conversationId, int $senderId): string {
        // Get conversation type
        $stmt = $this->db->query(
            "SELECT type FROM conversations WHERE id = ?",
            [$conversationId]
        );
        $conv = $stmt->fetch();
        if (!$conv) return 'sent';

        if ($conv['type'] === 'direct') {
            // Direct: check other participant
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

        // Group: check all other participants
        $stmt = $this->db->query(
            "SELECT
                COUNT(DISTINCT cp.user_id) AS total_recipients,
                COUNT(DISTINCT CASE WHEN cp.last_read_message_id >= ? THEN cp.user_id END) AS read_by
             FROM conversation_participants cp
             WHERE cp.conversation_id = ? AND cp.user_id != ?",
            [$messageId, $conversationId, $senderId]
        );
        $result = $stmt->fetch();
        if (!$result || $result['total_recipients'] == 0) return 'sent';
        if ($result['read_by'] == 0) return 'delivered';
        if ($result['read_by'] == $result['total_recipients']) return 'read';
        // Partial read
        return 'delivered';
    }

    /**
     * Batch get read status for multiple messages.
     * Returns the highest last_read_message_id across all other participants.
     */
    public function getReadStatusBatch(int $conversationId, int $senderId): ?int {
        $stmt = $this->db->query(
            "SELECT MAX(cp.last_read_message_id) AS max_last_read
             FROM conversation_participants cp
             WHERE cp.conversation_id = ? AND cp.user_id != ?",
            [$conversationId, $senderId]
        );
        $result = $stmt->fetch();
        return $result ? ($result['max_last_read'] ? (int)$result['max_last_read'] : null) : null;
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
