<?php
/**
 * GET /api/chat/heartbeat.php
 * Ultra-lightweight endpoint for unread counts and latest message ID.
 * Optimized for 0.1 CPU core environments.
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();
session_write_close(); // Release session lock early — critical for concurrent polling

// Heartbeat - update online status
(new User())->updateStatus($userId, 'online');

$db = Database::getInstance();

// 1. Total unread count
$unreadStmt = $db->query(
    "SELECT SUM(unread_count) as total FROM conversation_participants WHERE user_id = ?",
    [$userId]
);
$totalUnread = (int) ($unreadStmt->fetch()['total'] ?? 0);

// 2. Latest message ID across all conversations
$latestStmt = $db->query(
    "SELECT MAX(id) as max_id FROM messages m
     INNER JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
     WHERE cp.user_id = ?
     AND NOT EXISTS (
        SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?
     )",
    [$userId, $userId]
);
$latestId = (int) ($latestStmt->fetch()['max_id'] ?? 0);

Response::success([
    'tu' => $totalUnread, // total_unread
    'li' => $latestId,    // latest_id
]);
