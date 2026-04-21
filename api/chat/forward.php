<?php
/**
 * POST /api/chat/forward.php
 * Forward a message to another conversation
 * Body: { message_id, conversation_id }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$messageId = (int) ($data['message_id'] ?? 0);
$targetConvId = (int) ($data['conversation_id'] ?? 0);

if ($messageId <= 0 || $targetConvId <= 0) {
    Response::error('message_id and conversation_id are required', 422);
}

$chat = new Chat();
$result = $chat->forwardMessage($messageId, $targetConvId, $userId);

if (!$result['success']) {
    Response::error($result['error']);
}

Response::success([
    'message_id'      => $result['message_id'],
    'conversation_id' => $result['conversation_id'],
], 'Message forwarded');
