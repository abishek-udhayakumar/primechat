<?php
/**
 * POST /api/upload/file.php
 * Upload a file/image/voice and optionally send as message
 * Expects multipart/form-data with 'file' field
 * Optional: conversation_id, recipient_id, reply_to_id
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();

if (!isset($_FILES['file'])) {
    Response::error('No file uploaded', 422);
}

$uploadType = $_POST['upload_type'] ?? 'file';
$conversationId = isset($_POST['conversation_id']) ? (int) $_POST['conversation_id'] : null;
$recipientId = isset($_POST['recipient_id']) ? (int) $_POST['recipient_id'] : null;
$replyToId = isset($_POST['reply_to_id']) ? (int) $_POST['reply_to_id'] : null;

// Handle file upload
try {
    $fileInfo = FileUpload::handle($_FILES['file'], $uploadType);
} catch (\RuntimeException $e) {
    file_put_contents('/tmp/voice_debug.log', $e->getMessage() . " | Mime Type detected: " . (isset($_FILES['file']['tmp_name']) ? (new \finfo(FILEINFO_MIME_TYPE))->file($_FILES['file']['tmp_name']) : 'Unknown') . "\n", FILE_APPEND);
    Response::error($e->getMessage(), 422);
}

// Determine message type from upload type
$messageType = 'file';
if (in_array($uploadType, ['image', 'avatar'])) {
    $messageType = 'image';
} elseif ($uploadType === 'voice') {
    $messageType = 'voice';
    // Set duration if provided
    if (isset($_POST['duration'])) {
        $fileInfo['duration'] = (int) $_POST['duration'];
    }
}

// If avatar upload, just return the file info (no message)
if ($uploadType === 'avatar') {
    $userModel = new User();
    $userModel->updateProfile($userId, ['avatar_url' => $fileInfo['file_path']]);
    Response::success(['file' => $fileInfo, 'avatar_url' => $fileInfo['file_path']], 'Avatar uploaded');
}

// Send as message if conversation/recipient provided
if ($conversationId || $recipientId) {
    $chat = new Chat();
    $content = $fileInfo['file_name'];

    if ($conversationId) {
        $result = $chat->sendToConversation($userId, $conversationId, $content, $messageType, $replyToId);
    } else {
        $result = $chat->sendMessage($userId, $recipientId, $content, $messageType, $replyToId);
    }

    if (!$result['success']) {
        Response::error($result['error']);
    }

    // Attach file to message
    $msgModel = new Message();
    $attachmentId = $msgModel->addAttachment($result['message_id'], $fileInfo);

    Response::success([
        'message_id'      => $result['message_id'],
        'conversation_id' => $result['conversation_id'],
        'attachment'       => array_merge($fileInfo, ['id' => $attachmentId]),
    ], 'File sent');
}

// Just upload without sending
Response::success(['file' => $fileInfo], 'File uploaded');
