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
        // Check if either user has blocked the other (read-only, outside transaction)
        $blockList = new BlockList();
        if ($blockList->isEitherBlocked($senderId, $recipientId)) {
            return ['success' => false, 'error' => 'Cannot send message. User may have blocked you.'];
        }

        $this->db->beginTransaction();
        try {
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
    public function sendToConversation(int $senderId, int $conversationId, string $content, string $type = 'text', ?int $replyToId = null, ?int $forwardedFromId = null, ?string $clientMsgId = null): array {
        // Verify sender is a participant (read-only, outside transaction)
        if (!$this->conversationModel->isParticipant($conversationId, $senderId)) {
            return ['success' => false, 'error' => 'Not a participant'];
        }

        // For direct conversations, check block status (read-only, outside transaction)
        $convType = $this->db->query("SELECT type FROM conversations WHERE id = ?", [$conversationId])->fetch();
        if ($convType && $convType['type'] === 'direct') {
            $participants = $this->conversationModel->getParticipants($conversationId);
            foreach ($participants as $p) {
                if ((int)$p['id'] !== $senderId) {
                    $blockList = new BlockList();
                    if ($blockList->isEitherBlocked($senderId, (int)$p['id'])) {
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
            $messageId = $this->messageModel->send($conversationId, $senderId, $content, $type, $replyToId, $forwardedFromId, $clientMsgId, null, null);

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

        return $this->sendToConversation(
            $senderId,
            $targetConversationId,
            $original['content'],
            $original['type'],
            null,
            $messageId
        );
    }
}
