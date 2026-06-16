<?php
/**
 * PrimeChat — Conversation Model
 * Handles conversation CRUD, participant management, listing
 */

class Conversation {
    private Database $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /**
     * Get or create a direct conversation between two users.
     * Uses direct_conversation_lookup table for race-free creation.
     */
    public function getOrCreateDirect(int $userId1, int $userId2): int {
        // Ensure consistent ordering for unique constraint
        if ($userId1 > $userId2) {
            [$userId1, $userId2] = [$userId2, $userId1];
        }

        // Try to find existing conversation (fast path)
        $stmt = $this->db->query(
            "SELECT conversation_id FROM direct_conversation_lookup
             WHERE user1_id = ? AND user2_id = ?",
            [$userId1, $userId2]
        );
        $result = $stmt->fetch();
        if ($result) {
            return (int) $result['conversation_id'];
        }

        // Atomic insert with rollback on duplicate (race condition protection)
        // NOTE: This method should be called within an existing transaction.
        // If no transaction is active, we begin one for safety.
        $alreadyInTransaction = $this->db->inTransaction();
        if (!$alreadyInTransaction) {
            $this->db->beginTransaction();
        }
        try {
            $this->db->query(
                "INSERT INTO conversations (type) VALUES ('direct')"
            );
            $convId = (int) $this->db->lastInsertId();

            $this->db->query(
                "INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)",
                [$convId, $userId1, $convId, $userId2]
            );

            $this->db->query(
                "INSERT INTO direct_conversation_lookup (user1_id, user2_id, conversation_id) VALUES (?, ?, ?)",
                [$userId1, $userId2, $convId]
            );

            if (!$alreadyInTransaction) {
                $this->db->commit();
            }
            return $convId;
        } catch (\Exception $e) {
            if (!$alreadyInTransaction) {
                $this->db->rollBack();
            }
            // If duplicate key error, another request won the race — fetch the existing one
            if (str_contains($e->getMessage(), 'Duplicate')) {
                $stmt = $this->db->query(
                    "SELECT conversation_id FROM direct_conversation_lookup
                     WHERE user1_id = ? AND user2_id = ?",
                    [$userId1, $userId2]
                );
                $result = $stmt->fetch();
                if ($result) {
                    return (int) $result['conversation_id'];
                }
            }
            throw $e;
        }
    }

    /**
     * Get all conversations for a user with last message and other participant info
     */
    public function getListForUser(int $userId, int $limit = 20, int $offset = 0): array {
        // LIMIT/OFFSET are cast to int above — safe to interpolate directly
        // (PDO does not support bound params for LIMIT/OFFSET in all drivers)
        $limit  = max(1, min($limit,  100));
        $offset = max(0, $offset);

        $stmt = $this->db->query(
            "SELECT
                c.id AS conversation_id,
                c.type,
                c.name AS conversation_name,
                c.updated_at,
                cp.unread_count,
                cp.last_read_message_id,
                -- Other participant info (for direct chats)
                other_user.id AS other_user_id,
                other_user.username AS other_username,
                other_user.display_name AS other_display_name,
                other_user.avatar_url AS other_avatar_url,
                IF(other_user.last_seen >= DATE_SUB(NOW(), INTERVAL 60 SECOND), 'online', 'offline') AS other_status,
                other_user.last_seen AS other_last_seen,
                -- Last message (denormalized via conversations.last_message_id)
                last_msg.id AS last_message_id,
                last_msg.content AS last_message_content,
                last_msg.type AS last_message_type,
                last_msg.sender_id AS last_message_sender_id,
                last_msg.is_deleted_for_everyone AS last_message_deleted,
                last_msg.created_at AS last_message_time
             FROM conversations c
             INNER JOIN conversation_participants cp
                ON cp.conversation_id = c.id AND cp.user_id = ?
             -- Get the other participant (for direct chats)
             LEFT JOIN conversation_participants cp2
                ON cp2.conversation_id = c.id AND cp2.user_id != ?
             LEFT JOIN users other_user
                ON other_user.id = cp2.user_id
             -- Get last message via denormalized column
             LEFT JOIN messages last_msg ON last_msg.id = c.last_message_id
             -- Exclude conversations with no messages
             WHERE c.last_message_id IS NOT NULL
             -- Exclude messages deleted for this user
             AND NOT EXISTS (
                SELECT 1 FROM message_deletions md
                WHERE md.message_id = c.last_message_id AND md.user_id = ?
             )
             ORDER BY last_msg.created_at DESC
             LIMIT {$limit} OFFSET {$offset}",
            [$userId, $userId, $userId]
        );

        return $stmt->fetchAll();
    }

    /**
     * Check if user is participant in a conversation
     */
    public function isParticipant(int $conversationId, int $userId): bool {
        $stmt = $this->db->query(
            "SELECT COUNT(*) as count FROM conversation_participants
             WHERE conversation_id = ? AND user_id = ?",
            [$conversationId, $userId]
        );
        return $stmt->fetch()['count'] > 0;
    }

    /**
     * Get participant info for a conversation
     */
    public function getParticipants(int $conversationId): array {
        $stmt = $this->db->query(
            "SELECT u.id, u.username, u.display_name, u.avatar_url, IF(u.last_seen >= DATE_SUB(NOW(), INTERVAL 60 SECOND), 'online', 'offline') AS status, u.last_seen
             FROM conversation_participants cp
             INNER JOIN users u ON u.id = cp.user_id
             WHERE cp.conversation_id = ?",
            [$conversationId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Get the other user in a direct conversation
     */
    public function getOtherParticipant(int $conversationId, int $currentUserId): ?array {
        $stmt = $this->db->query(
            "SELECT u.id, u.username, u.display_name, u.avatar_url, u.about, IF(u.last_seen >= DATE_SUB(NOW(), INTERVAL 60 SECOND), 'online', 'offline') AS status, u.last_seen
             FROM conversation_participants cp
             INNER JOIN users u ON u.id = cp.user_id
             WHERE cp.conversation_id = ? AND cp.user_id != ?
             LIMIT 1",
            [$conversationId, $currentUserId]
        );
        $result = $stmt->fetch();
        return $result ?: null;
    }

    /**
     * Update unread count for a participant
     */
    public function incrementUnread(int $conversationId, int $userId): void {
        $this->db->query(
            "UPDATE conversation_participants
             SET unread_count = unread_count + 1
             WHERE conversation_id = ? AND user_id = ?",
            [$conversationId, $userId]
        );
    }

    /**
     * Reset unread count for a participant
     */
    public function resetUnread(int $conversationId, int $userId): void {
        $this->db->query(
            "UPDATE conversation_participants
             SET unread_count = 0
             WHERE conversation_id = ? AND user_id = ?",
            [$conversationId, $userId]
        );
    }

    /**
     * Update last read message ID (with validation and regression prevention)
     */
    public function updateLastRead(int $conversationId, int $userId, int $messageId): void {
        // Validate message belongs to this conversation and prevent regression
        $this->db->query(
            "UPDATE conversation_participants
             SET last_read_message_id = ?, unread_count = 0
             WHERE conversation_id = ? AND user_id = ?
               AND (last_read_message_id IS NULL OR ? > last_read_message_id)
               AND EXISTS (
                   SELECT 1 FROM messages WHERE id = ? AND conversation_id = ?
               )",
            [$messageId, $conversationId, $userId, $messageId, $messageId, $conversationId]
        );
    }

    /**
     * Touch conversation updated_at
     */
    public function touch(int $conversationId): void {
        $this->db->query(
            "UPDATE conversations SET updated_at = NOW() WHERE id = ?",
            [$conversationId]
        );
    }
}
