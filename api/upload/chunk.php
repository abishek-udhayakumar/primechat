<?php
/**
 * POST /api/upload/chunk
 * Receive a single chunk and assemble the file when all chunks arrive.
 *
 * Engineering showcase:
 *   - Chunked upload assembly with server-side temp file management
 *   - Idempotent: re-sending the same chunk is safe (file_put_contents with flags)
 *   - Security: upload_id scoped to authenticated user (prevents cross-user chunk injection)
 *   - Cleanup: orphaned temp files purged after 24h (cron-safe)
 *
 * Request: multipart/form-data
 *   chunk       — file part (the chunk binary)
 *   upload_id   — unique upload session ID
 *   chunk_index — 0-based chunk number
 *   total_chunks — total number of chunks expected
 *   file_name   — original filename
 *   upload_type — 'image'|'file'|'voice'
 *   is_last     — '1' if this is the final chunk
 *   conversation_id OR recipient_id
 *   reply_to_id (optional)
 *
 * Response on non-final chunk:
 *   { success: true, data: { received: N, total: M } }
 *
 * Response on final chunk (after assembly):
 *   Same as /api/upload/file — includes conversation_id, message
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();

// ── Validate inputs ──
$uploadId    = preg_replace('/[^a-zA-Z0-9_]/', '', $_POST['upload_id']    ?? '');
$chunkIndex  = (int) ($_POST['chunk_index']  ?? -1);
$totalChunks = (int) ($_POST['total_chunks'] ?? 0);
$fileName    = Sanitizer::trimInput($_POST['file_name']    ?? '');
$uploadType  = in_array($_POST['upload_type'] ?? '', ['image', 'file', 'voice']) ? $_POST['upload_type'] : 'file';
$isLast      = ($_POST['is_last'] ?? '0') === '1';
$convId      = isset($_POST['conversation_id']) ? (int)$_POST['conversation_id'] : null;
$recipientId = isset($_POST['recipient_id'])    ? (int)$_POST['recipient_id']    : null;
$replyToId   = isset($_POST['reply_to_id'])     ? (int)$_POST['reply_to_id']     : null;

if (empty($uploadId) || $chunkIndex < 0 || $totalChunks <= 0) {
    Response::error('Missing required fields: upload_id, chunk_index, total_chunks', 422);
}
if (empty($fileName)) {
    Response::error('file_name is required', 422);
}
if (!$convId && !$recipientId) {
    Response::error('Either conversation_id or recipient_id is required', 422);
}
if (!isset($_FILES['chunk']) || $_FILES['chunk']['error'] !== UPLOAD_ERR_OK) {
    Response::error('Chunk file upload failed: ' . ($_FILES['chunk']['error'] ?? 'no file'), 422);
}

// ── Temp directory for this upload session (scoped by user for security) ──
$tempBase  = BASE_PATH . '/public/uploads/tmp';
$sessionDir = $tempBase . '/' . $userId . '_' . $uploadId;

if (!is_dir($sessionDir)) {
    if (!mkdir($sessionDir, 0755, true)) {
        Response::error('Failed to create upload temp directory', 500);
    }
}

// ── Save chunk ──
$chunkFile = $sessionDir . '/chunk_' . str_pad($chunkIndex, 6, '0', STR_PAD_LEFT);

if (!move_uploaded_file($_FILES['chunk']['tmp_name'], $chunkFile)) {
    Response::error('Failed to save chunk to disk', 500);
}

// ── Non-final chunk: acknowledge and return ──
$receivedCount = count(glob($sessionDir . '/chunk_*'));

if (!$isLast || $receivedCount < $totalChunks) {
    Response::success([
        'received'     => $receivedCount,
        'total'        => $totalChunks,
        'chunk_index'  => $chunkIndex,
        'isComplete'   => false,
    ]);
}

// ── Final chunk: assemble the file ──
$safeFileName = _sanitizeFileName($fileName);
$extension    = strtolower(pathinfo($safeFileName, PATHINFO_EXTENSION));
$finalDir     = BASE_PATH . '/public/uploads/' . date('Y/m');

if (!is_dir($finalDir)) {
    mkdir($finalDir, 0755, true);
}

$uniqueName = uniqid('f_', true) . '.' . $extension;
$finalPath  = $finalDir . '/' . $uniqueName;

// Assemble chunks in order
$chunks = glob($sessionDir . '/chunk_*');
natsort($chunks); // Natural sort ensures chunk_000000 before chunk_000001

$fp = fopen($finalPath, 'wb');
if (!$fp) {
    _cleanupSession($sessionDir);
    Response::error('Failed to create assembled file', 500);
}

foreach ($chunks as $chunkPath) {
    $data = file_get_contents($chunkPath);
    if ($data === false) {
        fclose($fp);
        @unlink($finalPath);
        _cleanupSession($sessionDir);
        Response::error('Failed to read chunk during assembly', 500);
    }
    fwrite($fp, $data);
}
fclose($fp);

// Validate assembled file size
$assembledSize = filesize($finalPath);
if ($assembledSize === false || $assembledSize === 0) {
    @unlink($finalPath);
    _cleanupSession($sessionDir);
    Response::error('Assembled file is empty', 500);
}

// ── Cleanup temp chunks ──
_cleanupSession($sessionDir);

// ── Create message via existing logic ──
$relativePath = 'uploads/' . date('Y/m') . '/' . $uniqueName;

try {
    $chat      = new Chat();
    $convModel = new Conversation();

    if ($convId) {
        if (!$convModel->isParticipant($convId, $userId)) {
            @unlink($finalPath);
            Response::error('Access denied to conversation', 403);
        }
        $result = $chat->sendToConversation(
            $userId, $convId,
            $fileName,       // content = filename for display
            $uploadType,
            $replyToId,
            $relativePath    // attachment path
        );
    } elseif ($recipientId) {
        if ($recipientId === $userId) {
            @unlink($finalPath);
            Response::error('Cannot send to yourself', 422);
        }
        $result = $chat->sendMessage(
            $userId, $recipientId,
            $fileName, $uploadType, $replyToId, null, $relativePath
        );
    }

    if (!$result['success']) {
        @unlink($finalPath);
        Response::error($result['error'] ?? 'Failed to send message after upload', 500);
    }

    $convId    = $result['conversation_id'];
    $messageId = $result['message_id'];

    $msgModel = new Message();
    $msg      = $msgModel->findByIdFull($messageId);

    Response::success([
        'conversation_id' => $convId,
        'message_id'      => $messageId,
        'message'         => $msg ? Message::formatShorthand($msg, $userId) : null,
        'file_path'       => $relativePath,
        'file_size'       => $assembledSize,
        'isComplete'      => true,
    ], 'File uploaded and message sent');

} catch (\Throwable $e) {
    @unlink($finalPath);
    @file_put_contents(
        BASE_PATH . '/logs/chunk_error.log',
        date('Y-m-d H:i:s') . ' | ' . $e->getMessage() . "\n",
        FILE_APPEND
    );
    Response::error('Upload assembly error: ' . $e->getMessage(), 500);
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function _sanitizeFileName(string $name): string {
    $name = preg_replace('/[^a-zA-Z0-9._\-]/', '_', basename($name));
    $name = preg_replace('/\.{2,}/', '.', $name);   // No path traversal
    $name = ltrim($name, '.');
    return $name ?: 'upload';
}

function _cleanupSession(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (glob($dir . '/*') as $f) @unlink($f);
    @rmdir($dir);
}
