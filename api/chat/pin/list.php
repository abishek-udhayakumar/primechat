<?php
/**
 * GET /api/chat/pin/list?conversation_id=N
 * List pinned messages in a conversation.
 */
require_once __DIR__ . '/../../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();
$convId = (int)($_GET['conversation_id'] ?? 0);

if ($convId <= 0) {
    Response::error('conversation_id is required', 422);
}

$convModel = new Conversation();
if (!$convModel->isParticipant($convId, $userId)) {
    Response::error('Access denied', 403);
}

$db = Database::getInstance();
$stmt = $db->query(
    "SELECT pm.message_id, pm.pinned_by, pm.pinned_at,
            m.content, m.type, m.created_at,
            u.display_name AS sender_name
     FROM pinned_messages pm
     JOIN messages m ON m.id = pm.message_id
     JOIN users u ON u.id = m.sender_id
     WHERE pm.conversation_id = ?
     ORDER BY pm.pinned_at DESC
     LIMIT 5",
    [$convId]
);

Response::success(['pinned_messages' => $stmt->fetchAll()]);
