<?php
/**
 * GET /api/chat/media?conversation_id=N&type=all|image|file|voice&page=N
 * Paginated media gallery for a conversation.
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();

$convId = (int)($_GET['conversation_id'] ?? 0);
$type = $_GET['type'] ?? 'all';
$page = max(1, (int)($_GET['page'] ?? 1));
$limit = 20;
$offset = ($page - 1) * $limit;

if ($convId <= 0) {
    Response::error('conversation_id is required', 422);
}

// Verify participant
$convModel = new Conversation();
if (!$convModel->isParticipant($convId, $userId)) {
    Response::error('Access denied', 403);
}

$db = Database::getInstance();

// Build type filter
$typeConditions = '';
$params = [$convId, $userId];
if ($type === 'image') {
    $typeConditions = "AND m.type = 'image'";
} elseif ($type === 'file') {
    $typeConditions = "AND m.type = 'file'";
} elseif ($type === 'voice') {
    $typeConditions = "AND m.type = 'voice'";
}

// Count total
$countStmt = $db->query(
    "SELECT COUNT(*) AS cnt FROM messages m
     LEFT JOIN attachments att ON att.message_id = m.id
     WHERE m.conversation_id = ?
       AND m.is_deleted_for_everyone = 0
       AND NOT EXISTS (
           SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?
       )
       $typeConditions
       AND (m.type IN ('image', 'file', 'voice') OR att.id IS NOT NULL)",
    $params
);
$total = (int)$countStmt->fetch()['cnt'];

// Fetch media
$stmt = $db->query(
    "SELECT m.id, m.type, m.created_at, m.content,
            att.id AS attachment_id,
            att.file_name, att.file_path, att.file_type, att.file_size,
            att.width, att.height, att.duration
     FROM messages m
     LEFT JOIN attachments att ON att.message_id = m.id
     WHERE m.conversation_id = ?
       AND m.is_deleted_for_everyone = 0
       AND NOT EXISTS (
           SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?
       )
       $typeConditions
       AND (m.type IN ('image', 'file', 'voice') OR att.id IS NOT NULL)
     ORDER BY m.created_at DESC
     LIMIT ? OFFSET ?",
    array_merge($params, [$limit, $offset])
);

$media = $stmt->fetchAll();
$formatted = [];
foreach ($media as $item) {
    $entry = [
        'message_id' => (int)$item['id'],
        'type' => $item['type'],
        'created_at' => $item['created_at'],
        'content' => $item['content'],
    ];
    if ($item['attachment_id']) {
        $entry['attachment'] = [
            'id' => (int)$item['attachment_id'],
            'file_name' => $item['file_name'],
            'file_path' => $item['file_path'],
            'file_type' => $item['file_type'],
            'file_size' => (int)$item['file_size'],
            'width' => $item['width'] ? (int)$item['width'] : null,
            'height' => $item['height'] ? (int)$item['height'] : null,
            'duration' => $item['duration'] ? (int)$item['duration'] : null,
        ];
    }
    $formatted[] = $entry;
}

Response::success([
    'media' => $formatted,
    'total' => $total,
    'page' => $page,
    'has_more' => ($offset + $limit) < $total,
]);
