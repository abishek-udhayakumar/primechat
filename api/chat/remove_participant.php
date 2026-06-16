<?php
/**
 * POST /api/chat/remove_participant
 * Remove a user from a group (or leave the group).
 *
 * Body (JSON): { conversation_id, user_id? }
 * If user_id is omitted, the current user leaves the group.
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$convId = (int)($data['conversation_id'] ?? 0);
$targetUserId = (int)($data['user_id'] ?? $userId);

if ($convId <= 0) {
    Response::error('conversation_id is required', 422);
}

// Verify conversation exists and is a group
$db = Database::getInstance();
$stmt = $db->query(
    "SELECT type FROM conversations WHERE id = ?",
    [$convId]
);
$conv = $stmt->fetch();

if (!$conv || $conv['type'] !== 'group') {
    Response::error('Conversation not found or not a group', 404);
}

// Verify the action is valid: user can remove themselves, or any participant can be removed
$convModel = new Conversation();

if ($targetUserId !== $userId) {
    // Only participants can remove others
    if (!$convModel->isParticipant($convId, $userId)) {
        Response::error('Access denied', 403);
    }
}

// Remove participant
$db->query(
    "DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
    [$convId, $targetUserId]
);

// Clean up: if no participants left, delete the conversation
$countStmt = $db->query(
    "SELECT COUNT(*) as cnt FROM conversation_participants WHERE conversation_id = ?",
    [$convId]
);
if ($countStmt->fetch()['cnt'] === 0) {
    $db->query("DELETE FROM conversations WHERE id = ?", [$convId]);
}

// Notify WS subscribers
notifyWsEvent('group_updated', $convId, [
    'action' => 'removed',
    'user_id' => $targetUserId,
]);

Response::success([
    'conversation_id' => $convId,
    'user_id' => $targetUserId,
], 'Participant removed');
