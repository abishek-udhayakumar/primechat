<?php
/**
 * GET /api/search/messages
 * Search messages within a specific conversation
 *
 * Params:
 *   conversation_id (required)
 *   query (required)
 *   mode (optional): natural|boolean|query_expansion (default: boolean)
 *   limit (optional): max results (default 20, max 100)
 *   offset (optional): pagination offset (default 0)
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();
$conversationId = (int) ($_GET['conversation_id'] ?? 0);
$query = trim($_GET['query'] ?? '');
$mode = $_GET['mode'] ?? 'boolean';
$limit = min((int) ($_GET['limit'] ?? SEARCH_RESULTS_LIMIT), 100);
$offset = max((int) ($_GET['offset'] ?? 0), 0);

if ($conversationId <= 0 || empty($query)) {
    Response::error('conversation_id and query are required', 422);
}

// Validate mode
if (!in_array($mode, ['natural', 'boolean', 'query_expansion'])) {
    $mode = 'boolean';
}

// Check participant access
$convModel = new Conversation();
if (!$convModel->isParticipant($conversationId, $userId)) {
    Response::error('Access denied', 403);
}

$db = Database::getInstance();

// Check if FULLTEXT index exists
$ftExists = $db->query(
    "SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'messages' AND INDEX_NAME = 'ft_messages_content'",
    [DB_NAME]
)->fetch()['cnt'] > 0;

if ($ftExists) {
    // Use FULLTEXT search
    switch ($mode) {
        case 'natural':
            $modeSql = 'IN NATURAL LANGUAGE MODE';
            break;
        case 'query_expansion':
            $modeSql = 'IN NATURAL LANGUAGE MODE WITH QUERY EXPANSION';
            break;
        case 'boolean':
        default:
            // Add wildcard for prefix matching in boolean mode
            $query = '+' . preg_replace('/\s+/', '* +', trim($query)) . '*';
            $modeSql = 'IN BOOLEAN MODE';
            break;
    }

    // Support cursor-based pagination via before_id
    $beforeId = isset($_GET['before_id']) ? (int)$_GET['before_id'] : null;
    $beforeClause = '';
    $params = [$conversationId, $query, $userId];
    if ($beforeId) {
        $beforeClause = ' AND m.id < ?';
        $params[] = $beforeId;
    }
    $params[] = $limit + 1; // +1 to detect has_more
    $params[] = $offset;

    $stmt = $db->query(
        "SELECT m.*, u.username AS sender_username, u.display_name AS sender_display_name, u.avatar_url AS sender_avatar_url
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.conversation_id = ?
           AND MATCH(m.content) AGAINST (? $modeSql)
           AND m.type = 'text'
           AND NOT EXISTS (
               SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?
           )
           AND m.is_deleted_for_everyone = 0
           $beforeClause
         ORDER BY m.created_at DESC
         LIMIT ? OFFSET ?",
        $params
    );
} else {
    // FULLTEXT index is required. If missing, run: php scripts/migrate.php
    Logger::warning('FULLTEXT index missing on messages.content — search degraded to LIKE');
    // Support cursor-based pagination via before_id
    $beforeId = isset($_GET['before_id']) ? (int)$_GET['before_id'] : null;
    $beforeClause = '';
    $params = [$conversationId, "%$query%", $userId];
    if ($beforeId) {
        $beforeClause = ' AND m.id < ?';
        $params[] = $beforeId;
    }
    $params[] = $limit + 1; // +1 to detect has_more
    $params[] = $offset;

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
           $beforeClause
         ORDER BY m.created_at DESC
         LIMIT ? OFFSET ?",
        $params
    );
}

$rawMessages = $stmt->fetchAll();
$hasMore = count($rawMessages) > $limit;
if ($hasMore) array_pop($rawMessages); // trim the +1 sentinel row

$messages = [];
foreach ($rawMessages as $msg) {
    $messages[] = [
        'id' => $msg['id'],
        'content' => $msg['content'],
        'sender_name' => $msg['sender_id'] == $userId ? 'You' : ($msg['sender_display_name'] ?: $msg['sender_username']),
        'created_at' => $msg['created_at']
    ];
}

Response::success([
    'items' => $messages,
    'has_more' => $hasMore,
    'total' => count($messages),
]);
