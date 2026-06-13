<?php
/**
 * POST /api/chat/read.php
 * Mark messages as read in a conversation
 * Body: { conversation_id, message_id }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$conversationId = (int) ($data['conversation_id'] ?? 0);
$messageId = (int) ($data['message_id'] ?? 0);

if ($conversationId <= 0 || $messageId <= 0) {
    Response::error('conversation_id and message_id are required', 422);
}

// Verify user is a participant of this conversation
$convModel = new Conversation();
if (!$convModel->isParticipant($conversationId, $userId)) {
    Response::error('Access denied', 403);
}

$chat = new Chat();
$chat->markAsRead($conversationId, $userId, $messageId);

Response::success(null, 'Messages marked as read');
