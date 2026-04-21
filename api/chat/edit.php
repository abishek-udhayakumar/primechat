<?php
/**
 * POST /api/chat/edit.php
 * Edit an existing message (sender only)
 * Body: { message_id, content }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$messageId = (int) ($data['message_id'] ?? 0);
$content = Sanitizer::sanitizeMessage($data['content'] ?? '');

if ($messageId <= 0) {
    Response::error('message_id is required', 422);
}
if (empty($content)) {
    Response::error('Content cannot be empty', 422);
}

$msgModel = new Message();
$success = $msgModel->edit($messageId, $userId, $content);

if (!$success) {
    Response::error('Cannot edit this message. You can only edit your own messages.', 403);
}

Response::success(['message_id' => $messageId], 'Message updated');
