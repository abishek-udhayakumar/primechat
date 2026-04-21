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
    public function sendMessage(int $senderId, int $recipientId, string $content, string $type = 'text', ?int $replyToId = null): array {
        // Get or create conversation
        $convId = $this->conversationModel->getOrCreateDirect($senderId, $recipientId);

        // Sanitize content
        $content = Sanitizer::sanitizeMessage($content);

        if (empty($content) && $type === 'text') {
            return ['success' => false, 'error' => 'Message cannot be empty'];
        }

        // Send message
        $messageId = $this->messageModel->send($convId, $senderId, $content, $type, $replyToId);

        // Update conversation timestamp
        $this->conversationModel->touch($convId);

        // Increment unread count for recipient
        $this->conversationModel->incrementUnread($convId, $recipientId);

        // Clear typing status
        $this->clearTyping($senderId, $convId);

        // Fetch the complete message to return
        $message = $this->messageModel->findById($messageId);

        return [
            'success'         => true,
            'message_id'      => $messageId,
            'conversation_id' => $convId,
            'message'         => $message,
        ];
    }

    /**
     * Send a message to an existing conversation
     */
    public function sendToConversation(int $senderId, int $conversationId, string $content, string $type = 'text', ?int $replyToId = null, ?int $forwardedFromId = null): array {
        // Verify sender is a participant
        if (!$this->conversationModel->isParticipant($conversationId, $senderId)) {
            return ['success' => false, 'error' => 'Not a participant'];
        }

        $content = Sanitizer::sanitizeMessage($content);

        if (empty($content) && $type === 'text') {
            return ['success' => false, 'error' => 'Message cannot be empty'];
        }

        // Send message
        $messageId = $this->messageModel->send($conversationId, $senderId, $content, $type, $replyToId, $forwardedFromId);

        // Update conversation
        $this->conversationModel->touch($conversationId);

        // Increment unread for other participants
        $participants = $this->conversationModel->getParticipants($conversationId);
        foreach ($participants as $p) {
            if ($p['id'] !== $senderId) {
                $this->conversationModel->incrementUnread($conversationId, $p['id']);
            }
        }

        // Clear typing
        $this->clearTyping($senderId, $conversationId);

        $message = $this->messageModel->findById($messageId);

        return [
            'success'         => true,
            'message_id'      => $messageId,
            'conversation_id' => $conversationId,
            'message'         => $message,
        ];
    }

    /**
     * Set typing status
     */
    public function setTyping(int $userId, int $conversationId): void {
        $this->db->query(
            "INSERT INTO typing_status (user_id, conversation_id, started_at)
             VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE started_at = NOW()",
            [$userId, $conversationId]
        );
    }

    /**
     * Clear typing status
     */
    public function clearTyping(int $userId, int $conversationId): void {
        $this->db->query(
            "DELETE FROM typing_status WHERE user_id = ? AND conversation_id = ?",
            [$userId, $conversationId]
        );
    }

    /**
     * Get who is typing in a conversation (excluding current user)
     */
    public function getTypingUsers(int $conversationId, int $currentUserId): array {
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
