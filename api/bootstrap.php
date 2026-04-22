<?php
/**
 * PrimeChat — Bootstrap / Common loader
 * All API endpoints include this file
 */

ini_set('log_errors', '1');
define('APP_START_TIME', microtime(true));

// Load core utilities first
require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/../includes/Logger.php';
require_once __DIR__ . '/../includes/Response.php';

// Global error/exception handlers
set_exception_handler(function ($e) {
    Logger::error('Uncaught Exception: ' . $e->getMessage(), [
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ]);
    Response::error('Internal Server Error', 500);
});

set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) return false;
    Logger::error("PHP Error: [$errno] $errstr", ['file' => $errfile, 'line' => $errline]);
    if ($errno === E_USER_ERROR || $errno === E_RECOVERABLE_ERROR) {
        Response::error('Critical Internal Error', 500);
    }
    return true;
});

// CORS headers for development
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Load configuration
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/session.php';
require_once __DIR__ . '/../includes/RateLimiter.php';

// Apply rate limiting
RateLimiter::check();

// Load models & core logic
require_once __DIR__ . '/../includes/Sanitizer.php';
require_once __DIR__ . '/../includes/User.php';
require_once __DIR__ . '/../includes/Auth.php';
require_once __DIR__ . '/../includes/Conversation.php';
require_once __DIR__ . '/../includes/Message.php';
require_once __DIR__ . '/../includes/Chat.php';
require_once __DIR__ . '/../includes/FileUpload.php';
