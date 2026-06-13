<?php
/**
 * POST /api/chat/add_participant
 * Add a user to an existing group conversation.
 * Only group creator (first participant) or admin can add.
 *
 * Body (JSON): { conversation_id, user_id }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$convId = (int)($data['conversation_id'] ?? 0);
$newUserId = (int)($data['user_id'] ?? 0);

if ($convId <= 0 || $newUserId <= 0) {
    Response::error('conversation_id and user_id are required', 422);
}

$convModel = new Conversation();

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

// Verify current user is a participant
if (!$convModel->isParticipant($convId, $userId)) {
    Response::error('Access denied', 403);
}

// Check if user is already a participant
if ($convModel->isParticipant($convId, $newUserId)) {
    Response::error('User is already a participant', 422);
}

// Add participant
$db->query(
    "INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)",
    [$convId, $newUserId]
);

Response::success([
    'conversation_id' => $convId,
    'user_id' => $newUserId,
], 'Participant added');
