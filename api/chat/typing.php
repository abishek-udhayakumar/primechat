<?php
/**
 * POST /api/chat/typing.php
 * Set/clear typing indicator
 * Body: { conversation_id, is_typing: true|false }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$conversationId = (int) ($data['conversation_id'] ?? 0);
$isTyping = (bool) ($data['is_typing'] ?? false);

if ($conversationId <= 0) {
    Response::error('conversation_id is required', 422);
}

$chat = new Chat();

if ($isTyping) {
    $chat->setTyping($userId, $conversationId);
} else {
    $chat->clearTyping($userId, $conversationId);
}

// Also update user online status
(new User())->updateStatus($userId, 'online');

Response::success(null, 'Typing status updated');
