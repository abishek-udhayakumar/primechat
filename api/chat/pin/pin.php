<?php
/**
 * POST /api/chat/pin/pin
 * Pin a message in a conversation.
 *
 * Body (JSON): { conversation_id, message_id }
 */
require_once __DIR__ . '/../../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$convId = (int)($data['conversation_id'] ?? 0);
$messageId = (int)($data['message_id'] ?? 0);

if ($convId <= 0 || $messageId <= 0) {
    Response::error('conversation_id and message_id are required', 422);
}

$convModel = new Conversation();
if (!$convModel->isParticipant($convId, $userId)) {
    Response::error('Access denied', 403);
}

$db = Database::getInstance();

// Check max pin count (max 5 per conversation)
$countStmt = $db->query(
    "SELECT COUNT(*) AS cnt FROM pinned_messages WHERE conversation_id = ?",
    [$convId]
);
if ($countStmt->fetch()['cnt'] >= 5) {
    Response::error('Maximum 5 pinned messages per conversation', 422);
}

try {
    $db->query(
        "INSERT IGNORE INTO pinned_messages (conversation_id, message_id, pinned_by) VALUES (?, ?, ?)",
        [$convId, $messageId, $userId]
    );
    Response::success(['conversation_id' => $convId, 'message_id' => $messageId], 'Message pinned');
} catch (\Exception $e) {
    Response::error('Failed to pin message', 500);
}
