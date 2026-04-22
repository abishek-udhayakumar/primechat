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

// ── DEBUG: Temporary production debugging ──
$debugLog = BASE_PATH . '/logs/send_debug.log';
@mkdir(dirname($debugLog), 0777, true);
$debugInfo = [
    'time'       => date('Y-m-d H:i:s'),
    'user_id'    => $userId,
    'session_id' => session_id(),
    'has_csrf'   => !empty($_SERVER['HTTP_X_CSRF_TOKEN']),
    'conv_id'    => $data['conversation_id'] ?? null,
    'recip_id'   => $data['recipient_id'] ?? null,
    'content_len'=> strlen($data['content'] ?? ''),
    'type'       => $data['type'] ?? 'text',
];
@file_put_contents($debugLog, json_encode($debugInfo) . "\n", FILE_APPEND);

$content        = Sanitizer::trimInput($data['content'] ?? '');
$type           = in_array($data['type'] ?? 'text', ['text', 'image', 'file', 'voice']) ? ($data['type'] ?? 'text') : 'text';
$replyToId      = isset($data['reply_to_id'])    ? (int)$data['reply_to_id']    : null;
$conversationId = isset($data['conversation_id']) ? (int)$data['conversation_id'] : null;
$recipientId    = isset($data['recipient_id'])    ? (int)$data['recipient_id']    : null;
$clientMsgId    = Sanitizer::trimInput($data['client_msg_id'] ?? '');

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
    // Pass null for forwardedFromId (6th arg) so clientMsgId is correctly mapped to 7th arg
    $result = $chat->sendToConversation($userId, $conversationId, $content, $type, $replyToId, null, $clientMsgId);
} elseif ($recipientId) {
    if ($recipientId === $userId) {
        Response::error('Cannot send message to yourself', 422);
    }
    $result = $chat->sendMessage($userId, $recipientId, $content, $type, $replyToId, $clientMsgId);
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
    $formattedMessage = Message::formatShorthand($msg, $userId);
    if ($formattedMessage['im']) {
        $formattedMessage['rs'] = ($otherLastRead !== null && $otherLastRead >= $formattedMessage['i'] ? 'read' : 'delivered');
    }
}

Response::success([
    'message_id'      => $messageId,
    'conversation_id' => $conversationId,
    'message'         => $formattedMessage,
], 'Message sent');
