<?php
/**
 * PrimeChat — Bootstrap / Common loader
 * All API endpoints include this file
 */

// Error reporting (development)
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

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
require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/session.php';

// Load models
require_once __DIR__ . '/../includes/Response.php';
require_once __DIR__ . '/../includes/Sanitizer.php';
require_once __DIR__ . '/../includes/User.php';
require_once __DIR__ . '/../includes/Auth.php';
require_once __DIR__ . '/../includes/Conversation.php';
require_once __DIR__ . '/../includes/Message.php';
require_once __DIR__ . '/../includes/Chat.php';
require_once __DIR__ . '/../includes/FileUpload.php';
