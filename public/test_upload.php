<?php
require_once __DIR__ . '/../api/bootstrap.php';

$tmpFile = tempnam(sys_get_temp_dir(), 'test_webm');
file_put_contents($tmpFile, "\x1A\x45\xDF\xA3" . str_repeat("a", 100)); // Fake webm header

$file = [
    'name' => 'voice_123.webm',
    'type' => 'audio/webm',
    'tmp_name' => $tmpFile,
    'error' => UPLOAD_ERR_OK,
    'size' => 104
];

try {
    $info = FileUpload::handle($file, 'voice');
    echo "SUCCESS\n";
    print_r($info);
} catch (\Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    $finfo = new \finfo(FILEINFO_MIME_TYPE);
    echo "Detected MIME: " . $finfo->file($tmpFile) . "\n";
}
unlink($tmpFile);
