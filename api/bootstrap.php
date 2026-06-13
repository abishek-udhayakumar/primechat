<?php
/**
 * PrimeChat — Bootstrap / Common loader
 * All API endpoints include this file
 */
require_once __DIR__ . '/../vendor/autoload.php';

// Load .env only if exists (local development / CLI)
if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
    $dotenv->load();
}

if (!defined('BASE_PATH')) {
    define('BASE_PATH', dirname(__DIR__));
}

// Load core utilities — fail gracefully if config missing
if (!file_exists(__DIR__ . '/../config/app.php')) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Config missing. Run: bash scripts/setup.sh']);
    exit;
}
require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/../config/session.php';
require_once __DIR__ . '/../includes/Logger.php';
require_once __DIR__ . '/../includes/Response.php';
require_once __DIR__ . '/../includes/RedisClient.php';
require_once __DIR__ . '/../includes/JwtManager.php';

ini_set('log_errors', '1');
define('APP_START_TIME', microtime(true));

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

// CORS — only allow exact configured origins. Reject unknown origins.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_filter([
    defined('APP_URL') ? rtrim(APP_URL, '/') : '',
    'http://localhost',
    'http://127.0.0.1',
]);
if ($origin && in_array(rtrim($origin, '/'), $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
} elseif ($origin) {
    // Unknown origin — reject request instead of allowing it
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Origin not allowed']);
    exit;
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
header('Vary: Origin');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Load configuration
if (!file_exists(__DIR__ . '/../config/database.php')) {
    http_response_code(503);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Database config missing. Run: bash scripts/setup.sh']);
    exit;
}
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/RateLimiter.php';

// Apply rate limiting
// NOTE: Schema migrations must be run via `php scripts/migrate.php` during deployment.
RateLimiter::check();

// Load models & core logic
require_once __DIR__ . '/../includes/Sanitizer.php';
require_once __DIR__ . '/../includes/User.php';
require_once __DIR__ . '/../includes/Auth.php';

// Initialize Auth & Validate Session
$auth = new Auth();
$isAuthed = $auth->validateSession();

// CSRF Protection for state-changing requests
$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$isHealthCheck = str_contains($requestUri, '/api/health');
$isAuthAction  = str_contains($requestUri, '/api/auth/');

if (!$isHealthCheck && $_SERVER['REQUEST_METHOD'] !== 'GET' && $_SERVER['REQUEST_METHOD'] !== 'OPTIONS') {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $sessionToken = $auth->getCsrfToken();
    $csrfValid = !empty($token) && $token === $sessionToken;

    if (!$csrfValid) {
        Logger::error('CSRF token mismatch debug', [
            'received' => $token,
            'session'  => $sessionToken,
            'method'   => $_SERVER['REQUEST_METHOD'],
            'uri'      => $_SERVER['REQUEST_URI']
        ]);
        Response::error('CSRF token mismatch', 403);
    }

    // If CSRF is valid but not authed, only allow auth actions
    if (!$isAuthed && !$isAuthAction) {
        Response::error('Authentication required', 401);
    }
}

require_once __DIR__ . '/../includes/Conversation.php';
require_once __DIR__ . '/../includes/Message.php';
require_once __DIR__ . '/../includes/Chat.php';
require_once __DIR__ . '/../includes/FileUpload.php';
require_once __DIR__ . '/../includes/WebPush.php';
require_once __DIR__ . '/../includes/BlockList.php';
require_once __DIR__ . '/../includes/OTP.php';
