<?php
/**
 * GET /api/chat/poll
 * Single endpoint for real-time polling.
 * Returns: new messages (after last_id), typing status, online status, other user's last_read_id
 *
 * Params:
 *   conversation_id  (required)
 *   last_id          (required) — last known message ID; returns messages after this
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId         = requireAuth();
// Close session early to avoid blocking other concurrent polls/requests
session_write_close();

// Optional: Enable Gzip compression to reduce network payload
if (!ob_start("ob_gzhandler")) ob_start();

$conversationId = (int) ($_GET['conversation_id'] ?? 0);
$lastId         = isset($_GET['last_id']) ? (int) $_GET['last_id'] : 0;

if ($conversationId <= 0) {
    Response::error('conversation_id is required', 422);
}

// ── Heartbeat: keep user marked online ──
(new User())->updateStatus($userId, 'online');

// ── Verify participant ──
$convModel = new Conversation();
if (!$convModel->isParticipant($conversationId, $userId)) {
    Response::error('Access denied', 403);
}

$db = Database::getInstance();

// ── Auto-mark messages as DELIVERED when user polls (they are online/active) ──
$msgModel = new Message();
if ($lastId > 0) {
    // User received messages up to lastId - mark them delivered
    $msgModel->markDelivered($conversationId, $userId, $lastId);
}

// ── 1. New messages after last_id ──
$rawMessages = $msgModel->getForConversation($conversationId, $userId, $lastId > 0 ? $lastId : null, 50);

// ── 2. Other user's last_read_message_id ──
$otherLastRead = $msgModel->getReadStatusBatch($conversationId, $userId);

// ── 3. Other user online status ──
$otherUser = $convModel->getOtherParticipant($conversationId, $userId);

$messages = [];
foreach ($rawMessages as $msg) {
    // Use the explicit message_status from DB
    $formatted = Message::formatShorthand($msg, $userId);
    $messages[] = $formatted;
}

// ── 4. Typing users (excluding self) ──
$chat        = new Chat();
$typingUsers = $chat->getTypingUsers($conversationId, $userId);

// ── 5. Status Payload ──
// Also return unread count for this conversation
$unreadStmt = $db->query(
    "SELECT unread_count FROM conversation_participants WHERE conversation_id = ? AND user_id = ?",
    [$conversationId, $userId]
);
$unread = $unreadStmt->fetch();
$unreadCount = $unread ? (int)$unread['unread_count'] : 0;

Response::success([
    'ms' => $messages,       // messages
    'lr' => $otherLastRead,  // last_read
    'ty' => count($typingUsers) > 0, // typing
    'tu' => $typingUsers,    // typing_users
    'us' => $otherUser ? $otherUser['status'] : 'offline', // user_status
    'ls' => $otherUser ? $otherUser['last_seen'] : null,   // last_seen
    'uc' => $unreadCount,    // unread_count
]);
