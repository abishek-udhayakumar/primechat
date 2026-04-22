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

// ── 1. New messages after last_id ──
$msgModel   = new Message();
$rawMessages = $msgModel->getForConversation($conversationId, $userId, $lastId > 0 ? $lastId : null, 50);

// ── 2. Other user's last_read_message_id ──
$otherLastRead = $msgModel->getReadStatusBatch($conversationId, $userId);

$messages = [];
foreach ($rawMessages as $msg) {
    if ($lastId > 0 && (int)$msg['id'] <= $lastId) continue;
    
    $formatted = Message::formatShorthand($msg, $userId);
    
    if ($formatted['im']) {
        if ($otherLastRead !== null && $otherLastRead >= $formatted['i']) {
            $formatted['rs'] = 'read';
        } else {
            $formatted['rs'] = 'delivered';
        }
    }
    $messages[] = $formatted;
}

// ── 4. Typing users (excluding self) ──
$chat        = new Chat();
$typingUsers = $chat->getTypingUsers($conversationId, $userId);

// ── 5. Other user online status ──
$otherUser = $convModel->getOtherParticipant($conversationId, $userId);

Response::success([
    'ms' => $messages,      // messages
    'lr' => $otherLastRead, // last_read
    'ty' => count($typingUsers) > 0, // typing
    'tu' => $typingUsers,   // typing_users
    'us' => $otherUser ? $otherUser['status'] : 'offline', // user_status
    'ls' => $otherUser ? $otherUser['last_seen'] : null,   // last_seen
]);
