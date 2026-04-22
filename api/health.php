<?php
/**
 * GET /api/health.php
 * System health check for monitoring tools
 */
require_once __DIR__ . '/bootstrap.php';

$status = [
    'status'    => 'ok',
    'timestamp' => date('Y-m-d H:i:s'),
    'services'  => [
        'database' => 'unknown',
        'storage'  => 'unknown'
    ]
];

// Check Database
try {
    $db = Database::getInstance();
    $db->query("SELECT 1");
    $status['services']['database'] = 'ok';
} catch (Exception $e) {
    $status['status'] = 'error';
    $status['services']['database'] = 'error: ' . $e->getMessage();
}

// Check Storage (logs directory)
$logDir = BASE_PATH . '/logs';
if (is_dir($logDir) && is_writable($logDir)) {
    $status['services']['storage'] = 'ok';
} else {
    $status['status'] = 'error';
    $status['services']['storage'] = 'error: logs directory not writable';
}

$code = ($status['status'] === 'ok') ? 200 : 503;
Response::success($status, 'System Health Report', $code);
