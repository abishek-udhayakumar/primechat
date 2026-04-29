<?php
/**
 * GET /api/search/messages
 * Search messages within a specific conversation
 *
 * Params:
 *   conversation_id (required)
 *   query (required)
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();
$conversationId = (int) ($_GET['conversation_id'] ?? 0);
$query = trim($_GET['query'] ?? '');

if ($conversationId <= 0 || empty($query)) {
    Response::error('conversation_id and query are required', 422);
}

// Check participant access
$convModel = new Conversation();
if (!$convModel->isParticipant($conversationId, $userId)) {
    Response::error('Access denied', 403);
}

$db = Database::getInstance();

// Search query with indexing support (LIKE %...%)
// In a large production DB, we'd use FULLTEXT search: MATCH(content) AGAINST(? IN BOOLEAN MODE)
// For simplicity and to avoid breaking existing schemas, we use LIKE.
$stmt = $db->query(
    "SELECT m.*, u.username AS sender_username, u.display_name AS sender_display_name, u.avatar_url AS sender_avatar_url
     FROM messages m
     JOIN users u ON m.sender_id = u.id
     WHERE m.conversation_id = ? 
       AND m.content LIKE ? 
       AND m.type = 'text'
       AND NOT EXISTS (
           SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?
       )
       AND m.is_deleted_for_everyone = 0
     ORDER BY m.created_at DESC
     LIMIT 50",
    [$conversationId, "%$query%", $userId]
);

$rawMessages = $stmt->fetchAll();
$messages = [];
foreach ($rawMessages as $msg) {
    // We only need basic data for search results to keep payload small
    $messages[] = [
        'id' => $msg['id'],
        'content' => $msg['content'],
        'sender_name' => $msg['sender_id'] == $userId ? 'You' : ($msg['sender_display_name'] ?: $msg['sender_username']),
        'created_at' => $msg['created_at']
    ];
}

Response::success($messages);
