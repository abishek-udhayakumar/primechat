<?php
/**
 * POST /api/chat/send
 * Send a new text message.
 * Body (JSON): { conversation_id?, recipient_id?, content, type?, reply_to_id? }
 *
 * Returns a fully-formatted message object (same shape as messages.php) so the
 * frontend can replace its optimistic temp message without a second fetch.
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data   = Response::getJsonBody();

$content        = Sanitizer::trimInput($data['content'] ?? '');
$type           = in_array($data['type'] ?? 'text', ['text', 'image', 'file', 'voice']) ? ($data['type'] ?? 'text') : 'text';
$replyToId      = isset($data['reply_to_id'])    ? (int)$data['reply_to_id']    : null;
$conversationId = isset($data['conversation_id']) ? (int)$data['conversation_id'] : null;
$recipientId    = isset($data['recipient_id'])    ? (int)$data['recipient_id']    : null;

if (empty($content) && $type === 'text') {
    Response::error('Message content is required', 422);
}

// ── Resolve conversation ──
$chat        = new Chat();
$convModel   = new Conversation();

if ($conversationId) {
    if (!$convModel->isParticipant($conversationId, $userId)) {
        Response::error('Access denied', 403);
    }
    $result = $chat->sendToConversation($userId, $conversationId, $content, $type, $replyToId);
} elseif ($recipientId) {
    if ($recipientId === $userId) {
        Response::error('Cannot send message to yourself', 422);
    }
    $result = $chat->sendMessage($userId, $recipientId, $content, $type, $replyToId);
} else {
    Response::error('Either conversation_id or recipient_id is required', 422);
}

if (!$result['success']) {
    Response::error($result['error'] ?? 'Failed to send message');
}

$conversationId = $result['conversation_id'];
$messageId      = $result['message_id'];

// ── Fetch full message (with attachment + reply JOINs) ──
$msgModel       = new Message();
$msg            = $msgModel->findByIdFull($messageId);
$otherLastRead  = $msgModel->getReadStatusBatch($conversationId, $userId);

$formattedMessage = null;

if ($msg) {
    $attachment = null;
    if (!empty($msg['attachment_id'])) {
        $attachment = [
            'id'        => (int)$msg['attachment_id'],
            'file_name' => $msg['attachment_file_name'],
            'file_path' => $msg['attachment_file_path'],
            'file_type' => $msg['attachment_file_type'],
            'file_size' => (int)$msg['attachment_file_size'],
            'width'     => $msg['attachment_width']    ? (int)$msg['attachment_width']    : null,
            'height'    => $msg['attachment_height']   ? (int)$msg['attachment_height']   : null,
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

    $isMine     = (int)$msg['sender_id'] === $userId;
    $readStatus = $isMine
        ? ($otherLastRead !== null && $otherLastRead >= (int)$msg['id'] ? 'read' : 'delivered')
        : 'sent';

    $formattedMessage = [
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

Response::success([
    'message_id'      => $messageId,
    'conversation_id' => $conversationId,
    'message'         => $formattedMessage,
], 'Message sent');
