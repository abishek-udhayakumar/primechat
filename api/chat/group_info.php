<?php
/**
 * GET /api/chat/group_info
 * Get group details and participant list.
 *
 * Query params:
 *   conversation_id (required)
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();
$convId = (int)($_GET['conversation_id'] ?? 0);

if ($convId <= 0) {
    Response::error('conversation_id is required', 422);
}

$db = Database::getInstance();

// Get conversation info
$stmt = $db->query(
    "SELECT id, type, name, created_at FROM conversations WHERE id = ?",
    [$convId]
);
$conv = $stmt->fetch();

if (!$conv) {
    Response::error('Conversation not found', 404);
}

// Verify participant
$convModel = new Conversation();
if (!$convModel->isParticipant($convId, $userId)) {
    Response::error('Access denied', 403);
}

$participants = $convModel->getParticipants($convId);

// Get last message info
$lastMsg = null;
if ($conv['last_message_id'] ?? null) {
    $stmt = $db->query(
        "SELECT m.id, m.content, m.type, m.created_at,
                u.display_name AS sender_name
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.id = ?",
        [$conv['last_message_id']]
    );
    $lastMsg = $stmt->fetch() ?: null;
}

Response::success([
    'conversation_id' => (int)$conv['id'],
    'type' => $conv['type'],
    'name' => $conv['name'],
    'created_at' => $conv['created_at'],
    'participant_count' => count($participants),
    'participants' => $participants,
    'last_message' => $lastMsg,
]);
