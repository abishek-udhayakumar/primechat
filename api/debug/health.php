<?php
/**
 * GET /api/debug/health
 * Diagnostic endpoint — returns system state for debugging production issues.
 * REMOVE THIS FILE after debugging is complete.
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$checks = [];

// 1. Session check
$checks['session'] = [
    'status' => session_status() === PHP_SESSION_ACTIVE ? 'active' : 'inactive',
    'id' => substr(session_id(), 0, 8) . '...',
    'user_id' => $_SESSION['user_id'] ?? null,
    'has_csrf' => !empty($_SESSION['csrf_token']),
];

// 2. Database check
try {
    $db = Database::getInstance();
    $stmt = $db->query("SELECT 1 AS ok");
    $checks['database'] = ['status' => 'connected'];
} catch (\Exception $e) {
    $checks['database'] = ['status' => 'FAILED', 'error' => $e->getMessage()];
}

// 3. Schema check — verify critical tables and columns exist
try {
    $tables = ['users', 'conversations', 'conversation_participants', 'messages', 'attachments'];
    $missing = [];
    foreach ($tables as $t) {
        $stmt = $db->query("SHOW TABLES LIKE ?", [$t]);
        if (!$stmt->fetch()) $missing[] = $t;
    }
    $checks['tables'] = $missing ? ['status' => 'MISSING', 'missing' => $missing] : ['status' => 'ok'];

    // Check messages columns
    $stmt = $db->query("SHOW COLUMNS FROM messages");
    $cols = array_column($stmt->fetchAll(), 'Field');
    $checks['messages_columns'] = $cols;

    // Check conversation_participants columns
    $stmt = $db->query("SHOW COLUMNS FROM conversation_participants");
    $cols = array_column($stmt->fetchAll(), 'Field');
    $checks['conv_participants_columns'] = $cols;

} catch (\Exception $e) {
    $checks['schema'] = ['status' => 'ERROR', 'error' => $e->getMessage()];
}

// 4. Test the exact send flow (dry run)
try {
    $userId = $_SESSION['user_id'] ?? 0;
    if ($userId) {
        // Test sanitizer
        $sanitized = Sanitizer::sanitizeMessage('test');
        $checks['sanitizer'] = 'ok';

        // Test conversation lookup
        $convModel = new Conversation();
        $checks['conversation_model'] = 'ok';

        // Test message model
        $msgModel = new Message();
        $checks['message_model'] = 'ok';
    }
} catch (\Exception $e) {
    $checks['model_test'] = ['status' => 'ERROR', 'error' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()];
}

// 5. PHP info
$checks['php'] = [
    'version' => PHP_VERSION,
    'extensions' => ['pdo' => extension_loaded('pdo'), 'pdo_mysql' => extension_loaded('pdo_mysql')],
];

// 6. Filesystem
$checks['filesystem'] = [
    'logs_writable' => is_writable(BASE_PATH . '/logs') || @mkdir(BASE_PATH . '/logs', 0777, true),
    'uploads_writable' => is_writable(BASE_PATH . '/public/uploads'),
];

Response::success($checks, 'Health check');
