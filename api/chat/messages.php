<?php
/**
 * GET /api/chat/messages.php
 * Fetch messages for a conversation
 * Params:
 *   conversation_id (required)
 *   after_id (optional) - fetch only messages after this ID
 *   before_id (optional) - fetch messages before this ID (for pagination/history)
 *   limit (optional) - max messages to return (default 50)
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();
session_write_close(); // Release session lock early

$conversationId = (int) ($_GET['conversation_id'] ?? 0);
$afterId = isset($_GET['after_id']) ? (int) $_GET['after_id'] : null;
$beforeId = isset($_GET['before_id']) ? (int) $_GET['before_id'] : null;
$limit = min((int) ($_GET['limit'] ?? MESSAGES_PER_PAGE), 100);

if ($conversationId <= 0) {
    Response::error('conversation_id is required', 422);
}

// Verify user is participant
$convModel = new Conversation();
if (!$convModel->isParticipant($conversationId, $userId)) {
    Response::error('Access denied', 403);
}

// Fetch messages
$msgModel = new Message();
$messages = $msgModel->getForConversation($conversationId, $userId, $afterId, $limit, $beforeId);

// Get read status for sent messages
$otherLastRead = $msgModel->getReadStatusBatch($conversationId, $userId);

// Format messages
$formatted = [];
foreach ($messages as $msg) {
    $item = Message::formatShorthand($msg, $userId);
    
    // Custom read status logic for history
    if ($item['im']) {
        if ($otherLastRead !== null && $otherLastRead >= $item['i']) {
            $item['rs'] = 'read';
        } else {
            $item['rs'] = 'delivered';
        }
    }
    
    $formatted[] = $item;
}

Response::success([
    'ms' => $formatted,
    'ci' => $conversationId,
    'hm' => count($formatted) >= $limit,
]);
