<?php
/**
 * POST /api/chat/create_group
 * Create a new group conversation.
 *
 * Body (JSON): { name, participant_ids: [id1, id2, ...] }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$name = Sanitizer::trimInput($data['name'] ?? '');
$participantIds = $data['participant_ids'] ?? [];

if (empty($name)) {
    Response::error('Group name is required', 422);
}

if (strlen($name) > 100) {
    Response::error('Group name too long (max 100 characters)', 422);
}

// Filter and validate participant IDs
$participantIds = array_filter($participantIds, 'is_numeric');
$participantIds = array_map('intval', $participantIds);

// Ensure creator is included
if (!in_array($userId, $participantIds)) {
    $participantIds[] = $userId;
}

// Remove duplicates
$participantIds = array_unique($participantIds);

if (count($participantIds) < 2) {
    Response::error('Group must have at least 2 participants', 422);
}

$db = Database::getInstance();

$db->beginTransaction();
try {
    // Create conversation
    $db->query(
        "INSERT INTO conversations (type, name) VALUES ('group', ?)",
        [$name]
    );
    $convId = (int) $db->lastInsertId();

    // Add participants
    $stmt = $db->prepare("INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)");
    foreach ($participantIds as $pid) {
        $stmt->execute([$convId, $pid]);
    }

    $db->commit();
} catch (\Exception $e) {
    $db->rollback();
    Logger::error('Failed to create group', ['error' => $e->getMessage()]);
    Response::error('Failed to create group', 500);
}

// Get group info
$convModel = new Conversation();
$participants = $convModel->getParticipants($convId);

Response::success([
    'conversation_id' => $convId,
    'name' => $name,
    'type' => 'group',
    'participant_count' => count($participants),
    'participants' => $participants,
], 'Group created');
