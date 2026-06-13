<?php
/**
 * POST /api/settings/report
 * Report a message to moderators.
 *
 * Body (JSON): { message_id, reason? }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$messageId = (int)($data['message_id'] ?? 0);
$reason = Sanitizer::trimInput($data['reason'] ?? '');

if ($messageId <= 0) {
    Response::error('message_id is required', 422);
}

// Verify user has access to the message's conversation
$db = Database::getInstance();
$stmt = $db->query(
    "SELECT m.id FROM messages m
     INNER JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
     WHERE m.id = ?",
    [$userId, $messageId]
);
if (!$stmt->fetch()) {
    Response::error('Access denied', 403);
}

$blockList = new BlockList();
$result = $blockList->reportMessage($userId, $messageId, $reason ?: null);

if ($result) {
    Response::success(null, 'Message reported');
} else {
    Response::error('Failed to submit report', 500);
}
