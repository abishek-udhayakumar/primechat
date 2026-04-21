<?php
/**
 * GET /api/chat/messages.php
 * Fetch messages for a conversation
 * Params:
 *   conversation_id (required)
 *   after_id (optional) - fetch only messages after this ID
 *   before_id (optional) - fetch messages before this ID (for pagination/history)
 *   limit (optional) - max messages to return (default 50)
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();

$conversationId = (int) ($_GET['conversation_id'] ?? 0);
$afterId = isset($_GET['after_id']) ? (int) $_GET['after_id'] : null;
$beforeId = isset($_GET['before_id']) ? (int) $_GET['before_id'] : null;
$limit = min((int) ($_GET['limit'] ?? MESSAGES_PER_PAGE), 100);

if ($conversationId <= 0) {
    Response::error('conversation_id is required', 422);
}

// Verify user is participant
$convModel = new Conversation();
if (!$convModel->isParticipant($conversationId, $userId)) {
    Response::error('Access denied', 403);
}

// Fetch messages
$msgModel = new Message();
$messages = $msgModel->getForConversation($conversationId, $userId, $afterId, $limit, $beforeId);

// Get read status for sent messages
$otherLastRead = $msgModel->getReadStatusBatch($conversationId, $userId);

// Format messages
$formatted = [];
foreach ($messages as $msg) {
    $readStatus = 'sent';
    if ((int)$msg['sender_id'] === $userId) {
        if ($otherLastRead !== null && $otherLastRead >= (int)$msg['id']) {
            $readStatus = 'read';
        } else {
            $readStatus = 'delivered';
        }
    }

    $attachment = null;
    if ($msg['attachment_id']) {
        $attachment = [
            'id'        => $msg['attachment_id'],
            'file_name' => $msg['attachment_file_name'],
            'file_path' => $msg['attachment_file_path'],
            'file_type' => $msg['attachment_file_type'],
            'file_size' => $msg['attachment_file_size'],
            'width'     => $msg['attachment_width'],
            'height'    => $msg['attachment_height'],
            'duration'  => $msg['attachment_duration'],
        ];
    }

    $reply = null;
    if ($msg['reply_to_id']) {
        $reply = [
            'id'          => $msg['reply_to_id'],
            'content'     => $msg['reply_content'],
            'sender_id'   => $msg['reply_sender_id'],
            'sender_name' => $msg['reply_sender_name'],
            'type'        => $msg['reply_type'],
        ];
    }

    $formatted[] = [
        'id'                    => (int) $msg['id'],
        'conversation_id'      => (int) $msg['conversation_id'],
        'sender_id'            => (int) $msg['sender_id'],
        'content'              => $msg['is_deleted_for_everyone'] ? null : $msg['content'],
        'type'                 => $msg['type'],
        'is_mine'              => (int) $msg['sender_id'] === $userId,
        'is_edited'            => (bool) $msg['is_edited'],
        'is_deleted_for_everyone' => (bool) $msg['is_deleted_for_everyone'],
        'forwarded_from_id'    => $msg['forwarded_from_id'] ? (int) $msg['forwarded_from_id'] : null,
        'reply'                => $reply,
        'attachment'           => $attachment,
        'read_status'          => $readStatus,
        'sender_name'          => $msg['sender_display_name'],
        'sender_avatar'        => $msg['sender_avatar_url'],
        'created_at'           => $msg['created_at'],
        'updated_at'           => $msg['updated_at'],
    ];
}

Response::success([
    'messages'        => $formatted,
    'conversation_id' => $conversationId,
    'has_more'        => count($formatted) >= $limit,
]);
