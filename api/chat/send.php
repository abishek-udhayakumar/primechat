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

// Per-endpoint rate limiting: 30 requests per 60 seconds
RateLimiter::checkNamed('send', 30, 60);

$userId = requireAuth();
$data   = Response::getJsonBody();

$content        = Sanitizer::trimInput($data['content'] ?? '');
$type           = in_array($data['type'] ?? 'text', ['text', 'image', 'file', 'voice']) ? ($data['type'] ?? 'text') : 'text';
$replyToId      = isset($data['reply_to_id'])    ? (int)$data['reply_to_id']    : null;
$conversationId = isset($data['conversation_id']) ? (int)$data['conversation_id'] : null;
$recipientId    = isset($data['recipient_id'])    ? (int)$data['recipient_id']    : null;
$clientMsgId    = Sanitizer::trimInput($data['client_msg_id'] ?? '');

if (empty($content) && $type === 'text') {
    Response::error('Message content is required', 422);
}

try {
    // ── Resolve conversation ──
    $chat        = new Chat();
    $convModel   = new Conversation();

    if ($conversationId) {
        if (!$convModel->isParticipant($conversationId, $userId)) {
            Response::error('Access denied', 403);
        }
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

    // Send push notifications to offline participants
    try {
        $participants = $convModel->getParticipants($conversationId);
        $push = new WebPushHandler();
        foreach ($participants as $p) {
            if ((int)$p['id'] === $userId) continue;
            if ($p['status'] === 'offline' || $p['status'] === 'away') {
                $senderUser = $convModel->getOtherParticipant($conversationId, (int)$p['id']);
                $senderName = $senderUser['display_name'] ?? $senderUser['username'] ?? 'Someone';
                $preview = mb_substr(strip_tags($content), 0, 100);
                $push->sendToUser((int)$p['id'], $senderName, $preview, [
                    'conversation_id' => $conversationId,
                    'sender_id' => $userId,
                ]);
            }
        }
    } catch (\Throwable $e) {
        Logger::warning('Push notification error: ' . $e->getMessage());
    }

    Response::success([
        'message_id'      => $messageId,
        'conversation_id' => $conversationId,
        'message'         => $formattedMessage,
    ], 'Message sent');

} catch (\Throwable $e) {
    Logger::error('Send message failed', [
        'user_id' => $userId,
        'error'   => $e->getMessage(),
        'file'    => $e->getFile(),
        'line'    => $e->getLine(),
    ]);
    Response::error('Failed to send message', 500);
}
