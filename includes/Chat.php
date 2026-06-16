<?php
/**
 * PrimeChat — Chat Engine
 * High-level chat operations combining Conversation + Message models
 */

class Chat {
    private Database $db;
    private Conversation $conversationModel;
    private Message $messageModel;

    public function __construct() {
        $this->db = Database::getInstance();
        $this->conversationModel = new Conversation();
        $this->messageModel = new Message();
    }

    /**
     * Send a message to a user (creates conversation if needed)
     */
    public function sendMessage(int $senderId, int $recipientId, string $content, string $type = 'text', ?int $replyToId = null, ?string $clientMsgId = null, ?int $expiresIn = null): array {
        $this->db->beginTransaction();
        try {
            // Check block status INSIDE transaction (prevents TOCTOU race)
            $blockList = new BlockList();
            if ($blockList->isEitherBlocked($senderId, $recipientId)) {
                $this->db->rollBack();
                return ['success' => false, 'error' => 'Cannot send message. User may have blocked you.'];
            }

            // Get or create conversation
            $convId = $this->conversationModel->getOrCreateDirect($senderId, $recipientId);

            // Sanitize content
            $content = Sanitizer::sanitizeMessage($content);

            if (empty($content) && $type === 'text') {
                $this->db->rollBack();
                return ['success' => false, 'error' => 'Message cannot be empty'];
            }

            // Send message
            $messageId = $this->messageModel->send($convId, $senderId, $content, $type, $replyToId, null, $clientMsgId, null, $expiresIn);

            // Update conversation timestamp and last_message_id
            $this->conversationModel->touch($convId);
            $this->updateLastMessageId($convId, $messageId);

            // Increment unread count for recipient
            $this->conversationModel->incrementUnread($convId, $recipientId);

            // Clear typing status
            $this->clearTyping($senderId, $convId);

            $this->db->commit();

            // Fetch the complete message to return
            $message = $this->messageModel->findById($messageId);

            return [
                'success'         => true,
                'message_id'      => $messageId,
                'conversation_id' => $convId,
                'message'         => $message,
            ];
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Send a message to an existing conversation
     */
    public function sendToConversation(int $senderId, int $conversationId, string $content, string $type = 'text', ?int $replyToId = null, ?int $forwardedFromId = null, ?string $clientMsgId = null, ?int $threadRootId = null): array {
        // Verify sender is a participant (read-only, outside transaction)
        if (!$this->conversationModel->isParticipant($conversationId, $senderId)) {
            return ['success' => false, 'error' => 'Not a participant'];
        }

        // Batch block check for direct conversations (single query instead of N+1)
        $convType = $this->db->query("SELECT type FROM conversations WHERE id = ?", [$conversationId])->fetch();
        if ($convType && $convType['type'] === 'direct') {
            $participants = $this->conversationModel->getParticipants($conversationId);
            $otherIds = array_filter(array_map(fn($p) => (int)$p['id'], $participants), fn($id) => $id !== $senderId);
            
            if (!empty($otherIds)) {
                $blockList = new BlockList();
                foreach ($otherIds as $otherId) {
                    if ($blockList->isEitherBlocked($senderId, $otherId)) {
                        return ['success' => false, 'error' => 'Cannot send message. User may have blocked you.'];
                    }
                }
            }
        }

        $this->db->beginTransaction();
        try {
            $content = Sanitizer::sanitizeMessage($content);

            if (empty($content) && $type === 'text') {
                $this->db->rollBack();
                return ['success' => false, 'error' => 'Message cannot be empty'];
            }

            // Send message
            $messageId = $this->messageModel->send($conversationId, $senderId, $content, $type, $replyToId, $forwardedFromId, $clientMsgId, $threadRootId, null);

            // Update conversation
            $this->conversationModel->touch($conversationId);
            $this->updateLastMessageId($conversationId, $messageId);

            // Increment unread for other participants
            $participants = $this->conversationModel->getParticipants($conversationId);
            foreach ($participants as $p) {
                if ($p['id'] !== $senderId) {
                    $this->conversationModel->incrementUnread($conversationId, $p['id']);
                }
            }

            // Clear typing
            $this->clearTyping($senderId, $conversationId);

            $this->db->commit();

            $message = $this->messageModel->findById($messageId);

            return [
                'success'         => true,
                'message_id'      => $messageId,
                'conversation_id' => $conversationId,
                'message'         => $message,
            ];
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Set typing status. Uses Redis if available, falls back to database.
     */
    public function setTyping(int $userId, int $conversationId): void {
        if (class_exists('RedisClient') && RedisClient::getInstance()->isConnected()) {
            // Use Redis with TTL
            $redis = RedisClient::getInstance();
            $key = "typing:$conversationId:$userId";
            $redis->set($key, 1, TYPING_TIMEOUT_SECONDS);
        } else {
            // Fallback to database
            $this->db->query(
                "INSERT INTO typing_status (user_id, conversation_id, started_at)
                 VALUES (?, ?, NOW())
                 ON DUPLICATE KEY UPDATE started_at = NOW()",
                [$userId, $conversationId]
            );
        }
    }

    /**
     * Clear typing status. Uses Redis if available, falls back to database.
     */
    public function clearTyping(int $userId, int $conversationId): void {
        if (class_exists('RedisClient') && RedisClient::getInstance()->isConnected()) {
            // Use Redis
            $redis = RedisClient::getInstance();
            $key = "typing:$conversationId:$userId";
            $redis->del($key);
        } else {
            // Fallback to database
            $this->db->query(
                "DELETE FROM typing_status WHERE user_id = ? AND conversation_id = ?",
                [$userId, $conversationId]
            );
        }
    }

    /**
     * Get who is typing in a conversation (excluding current user).
     * Uses Redis if available, falls back to database.
     */
    public function getTypingUsers(int $conversationId, int $currentUserId): array {
        if (class_exists('RedisClient') && RedisClient::getInstance()->isConnected()) {
            // Use Redis - scan for typing keys
            $redis = RedisClient::getInstance();
            $typingUsers = [];

            // Get all participants in the conversation
            $participants = $this->conversationModel->getParticipants($conversationId);
            foreach ($participants as $p) {
                if ((int)$p['id'] === $currentUserId) continue;
                $key = "typing:$conversationId:" . $p['id'];
                if ($redis->exists($key)) {
                    $typingUsers[] = [
                        'id' => $p['id'],
                        'display_name' => $p['display_name'],
                    ];
                }
            }

            return $typingUsers;
        }

        // Fallback to database
        // Auto-clean stale typing statuses (older than TYPING_TIMEOUT_SECONDS)
        $this->db->query(
            "DELETE FROM typing_status WHERE started_at < DATE_SUB(NOW(), INTERVAL ? SECOND)",
            [TYPING_TIMEOUT_SECONDS]
        );

        $stmt = $this->db->query(
            "SELECT u.id, u.display_name
             FROM typing_status ts
             INNER JOIN users u ON u.id = ts.user_id
             WHERE ts.conversation_id = ? AND ts.user_id != ?",
            [$conversationId, $currentUserId]
        );

        return $stmt->fetchAll();
    }

    /**
     * Mark messages as read
     */
    public function markAsRead(int $conversationId, int $userId, int $messageId): void {
        $this->conversationModel->updateLastRead($conversationId, $userId, $messageId);
        $this->messageModel->markRead($conversationId, $userId, $messageId);
        $this->conversationModel->resetUnread($conversationId, $userId);
    }

    /**
     * Mark messages as delivered (called when recipient comes online or polls)
     */
    public function markAsDelivered(int $conversationId, int $userId, int $upToMessageId): int {
        $delivered = $this->messageModel->markDelivered($conversationId, $userId, $upToMessageId);
        if ($delivered > 0) {
            // Don't reset unread here - delivery != read
            // Unread is only reset on read
        }
        return $delivered;
    }

    /**
     * Get combined status for polling (online status + typing + new message count)
     */
    public function getConversationStatus(int $conversationId, int $currentUserId): array {
        $otherUser = $this->conversationModel->getOtherParticipant($conversationId, $currentUserId);
        $typingUsers = $this->getTypingUsers($conversationId, $currentUserId);

        return [
            'other_user_status'    => $otherUser ? $otherUser['status'] : 'offline',
            'other_user_last_seen' => $otherUser ? $otherUser['last_seen'] : null,
            'typing_users'         => $typingUsers,
        ];
    }

    /**
     * Handle delivery acknowledgment from WebSocket client
     */
    public function acknowledgeDelivery(int $conversationId, int $userId, int $lastReceivedId): int {
        return $this->messageModel->markDelivered($conversationId, $userId, $lastReceivedId);
    }

    /**
     * Handle read receipt from WebSocket client
     */
    public function acknowledgeRead(int $conversationId, int $userId, int $lastReadId): void {
        $this->markAsRead($conversationId, $userId, $lastReadId);
    }

    /**
     * Update the denormalized last_message_id on a conversation.
     * Uses MAX to handle any ordering edge cases.
     */
    private function updateLastMessageId(int $conversationId, int $messageId): void {
        $this->db->query(
            "UPDATE conversations SET last_message_id = ? WHERE id = ? AND (last_message_id IS NULL OR ? > last_message_id)",
            [$messageId, $conversationId, $messageId]
        );
    }

    /**
     * Forward a message to another conversation
     */
    public function forwardMessage(int $messageId, int $targetConversationId, int $senderId): array {
        $original = $this->messageModel->findById($messageId);
        if (!$original) {
            return ['success' => false, 'error' => 'Message not found'];
        }

        if ($original['is_deleted_for_everyone']) {
            return ['success' => false, 'error' => 'Cannot forward deleted message'];
        }

        // Verify sender has access to the original message's conversation
        if (!$this->conversationModel->isParticipant($original['conversation_id'], $senderId)) {
            return ['success' => false, 'error' => 'Access denied to original message'];
        }

        // Preserve all metadata including reply_to, thread_root, etc.
        $replyToId = $original['reply_to_id'] ?? null;
        $threadRootId = $original['thread_root_id'] ?? null;

        return $this->sendToConversation(
            $senderId,
            $targetConversationId,
            $original['content'],
            $original['type'],
            $replyToId,
            $messageId,
            null, // client_msg_id - will be auto-generated
            $threadRootId // pass thread_root_id
        );
    }
}
