<?php
/**
 * GET /api/chat/status.php
 * Get real-time status for a conversation (online, typing, new messages)
 * Params: conversation_id, last_message_id (optional)
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();

$conversationId = (int) ($_GET['conversation_id'] ?? 0);
$lastMessageId = isset($_GET['last_message_id']) ? (int) $_GET['last_message_id'] : null;

if ($conversationId <= 0) {
    Response::error('conversation_id is required', 422);
}

// Update user online status (heartbeat)
(new User())->updateStatus($userId, 'online');

$chat = new Chat();
$status = $chat->getConversationStatus($conversationId, $userId);

// Get new message count if last_message_id provided
$newMessageCount = 0;
if ($lastMessageId !== null) {
    $msgModel = new Message();
    $newMessageCount = $msgModel->getNewMessageCount($conversationId, $lastMessageId);
}

$status['new_message_count'] = $newMessageCount;

Response::success($status);
