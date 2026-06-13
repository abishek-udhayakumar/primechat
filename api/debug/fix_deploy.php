<?php
header('Content-Type: text/plain');
echo "Fix deploy script\n\n";

$fixes = [
    [
        'file' => __DIR__ . '/../../includes/Logger.php',
        'old' => '    public static function info(string $message, array $context = []): void {
        self::log(\'info\', $message, $context);
    }',
        'new' => '    public static function warning(string $message, array $context = []): void {
        self::log(\'warning\', $message, $context);
    }

    public static function info(string $message, array $context = []): void {
        self::log(\'info\', $message, $context);
    }'
    ],
];

$writable = true;
foreach ($fixes as $fix) {
    $content = file_get_contents($fix['file']);
    if ($content === false) {
        echo "FAILED to read: {$fix['file']}\n";
        $writable = false;
        continue;
    }
    $newContent = str_replace($fix['old'], $fix['new'], $content);
    if ($newContent === $content) {
        echo "SKIP (no match): {$fix['file']}\n";
        continue;
    }
    if (file_put_contents($fix['file'], $newContent) !== false) {
        echo "OK: {$fix['file']}\n";
    } else {
        echo "FAILED to write: {$fix['file']}\n";
        $writable = false;
    }
}

if ($writable) {
    echo "\nFixes applied successfully!\n";
} else {
    echo "\nSome fixes failed. Check permissions.\n";
}
