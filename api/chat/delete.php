<?php
/**
 * POST /api/chat/delete.php
 * Delete a message
 * Body: { message_id, delete_type: "for_me" | "for_everyone" }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$messageId = (int) ($data['message_id'] ?? 0);
$deleteType = $data['delete_type'] ?? 'for_me';

if ($messageId <= 0) {
    Response::error('message_id is required', 422);
}

$msgModel = new Message();

if ($deleteType === 'for_everyone') {
    $success = $msgModel->deleteForEveryone($messageId, $userId);
    if (!$success) {
        Response::error('Cannot delete this message for everyone. You can only delete your own messages.', 403);
    }
    Response::success(['message_id' => $messageId], 'Message deleted for everyone');
} else {
    $msgModel->deleteForMe($messageId, $userId);
    Response::success(['message_id' => $messageId], 'Message deleted for you');
}
