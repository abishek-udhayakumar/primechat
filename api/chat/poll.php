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

// ── 2. Other user's last_read_message_id (for tick updates on ALL sent messages) ──
$otherLastRead = $msgModel->getReadStatusBatch($conversationId, $userId);

// ── 3. Format messages ──
$messages = [];
foreach ($rawMessages as $msg) {
    // Only include messages AFTER lastId (getForConversation with afterId already does this,
    // but lastId=0 case returns ALL messages — skip here, handled by initial load)
    if ($lastId > 0 && (int)$msg['id'] <= $lastId) continue;

    $isMine = (int)$msg['sender_id'] === $userId;

    $readStatus = 'sent';
    if ($isMine) {
        if ($otherLastRead !== null && $otherLastRead >= (int)$msg['id']) {
            $readStatus = 'read';
        } else {
            $readStatus = 'delivered';
        }
    }

    $attachment = null;
    if (!empty($msg['attachment_id'])) {
        $attachment = [
            'id'        => (int)$msg['attachment_id'],
            'file_name' => $msg['attachment_file_name'],
            'file_path' => $msg['attachment_file_path'],
            'file_type' => $msg['attachment_file_type'],
            'file_size' => (int)$msg['attachment_file_size'],
            'width'     => $msg['attachment_width'] ? (int)$msg['attachment_width'] : null,
            'height'    => $msg['attachment_height'] ? (int)$msg['attachment_height'] : null,
            'duration'  => $msg['attachment_duration'] ? (int)$msg['attachment_duration'] : null,
        ];
    }

    $reply = null;
    if (!empty($msg['reply_to_id'])) {
        $reply = [
            'id'          => (int)$msg['reply_to_id'],
            'content'     => $msg['reply_content'],
            'sender_id'   => $msg['reply_sender_id'] ? (int)$msg['reply_sender_id'] : null,
            'sender_name' => $msg['reply_sender_name'],
            'type'        => $msg['reply_type'],
        ];
    }

    $messages[] = [
        'id'                      => (int)$msg['id'],
        'conversation_id'         => (int)$msg['conversation_id'],
        'sender_id'               => (int)$msg['sender_id'],
        'sender_name'             => $msg['sender_display_name'],
        'sender_avatar'           => $msg['sender_avatar_url'],
        'content'                 => $msg['is_deleted_for_everyone'] ? null : $msg['content'],
        'type'                    => $msg['type'],
        'is_mine'                 => $isMine,
        'is_edited'               => (bool)$msg['is_edited'],
        'is_deleted_for_everyone' => (bool)$msg['is_deleted_for_everyone'],
        'forwarded_from_id'       => $msg['forwarded_from_id'] ? (int)$msg['forwarded_from_id'] : null,
        'reply'                   => $reply,
        'attachment'              => $attachment,
        'read_status'             => $readStatus,
        'created_at'              => $msg['created_at'],
        'updated_at'              => $msg['updated_at'],
    ];
}

// ── 4. Typing users (excluding self) ──
$chat        = new Chat();
$typingUsers = $chat->getTypingUsers($conversationId, $userId);

// ── 5. Other user online status ──
$otherUser = $convModel->getOtherParticipant($conversationId, $userId);

Response::success([
    'messages'          => $messages,
    'other_last_read'   => $otherLastRead,   // used by JS to update tick status on existing messages
    'typing'            => count($typingUsers) > 0,
    'typing_users'      => $typingUsers,
    'other_user_status' => $otherUser ? $otherUser['status'] : 'offline',
    'other_last_seen'   => $otherUser ? $otherUser['last_seen'] : null,
]);
