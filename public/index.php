<?php
/**
 * PrimeChat — Front Controller
 * 
 * ALL requests are routed through this file by .htaccess.
 * This is the single entry point for the entire application.
 *
 * DocumentRoot: /var/www/html/primechat/public
 * Project Root: /var/www/html/primechat
 */

// ── Project root (one level above public/) ──
define('BASE_PATH', dirname(__DIR__));

// ── Parse the clean URI ──
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = '/' . trim($uri, '/');  // Normalize: always starts with /, no trailing slash

// ──────────────────────────────────────────────
// 1. API ROUTING — /api/{module}/{action}
// ──────────────────────────────────────────────
if (str_starts_with($uri, '/api/')) {
    // Strip /api/ prefix and build file path
    $endpoint = substr($uri, 5); // e.g. "auth/login"
    $endpoint = rtrim($endpoint, '/');
    
    // Security: block path traversal
    if (preg_match('/\.\./', $endpoint)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid request']);
        exit;
    }
    
    $apiFile = BASE_PATH . '/api/' . $endpoint . '.php';
    
    if (file_exists($apiFile) && is_file($apiFile)) {
        require $apiFile;
        exit;
    }
    
    // Also check if file exists without .php (e.g. /api/auth/login.php as-is)
    $apiFileDirect = BASE_PATH . '/api/' . $endpoint;
    if (file_exists($apiFileDirect) && is_file($apiFileDirect) && str_ends_with($apiFileDirect, '.php')) {
        require $apiFileDirect;
        exit;
    }
    
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'API endpoint not found']);
    exit;
}

// ──────────────────────────────────────────────
// 2. FRONTEND PAGE ROUTING — Clean URLs
// ──────────────────────────────────────────────
$routes = [
    '/'        => '/views/login.html',
    '/login'   => '/views/login.html',
    '/signup'  => '/views/signup.html',
    '/chat'    => '/views/chat.html',
];

if (isset($routes[$uri])) {
    $viewFile = BASE_PATH . $routes[$uri];
    
    if (file_exists($viewFile)) {
        header('Content-Type: text/html; charset=UTF-8');
        readfile($viewFile);
        exit;
    }
}

// ──────────────────────────────────────────────
// 3. 404 — Nothing matched
// ──────────────────────────────────────────────
http_response_code(404);
header('Content-Type: text/html; charset=UTF-8');
echo '<!DOCTYPE html><html><head><title>404 — PrimeChat</title>
<style>
    body { background: #0f0f17; color: #e0e0e0; font-family: Inter, sans-serif; 
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box  { text-align: center; }
    h1    { font-size: 72px; margin: 0; background: linear-gradient(135deg, #6366f1, #8b5cf6); 
            -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    p     { color: #888; margin-top: 8px; }
    a     { color: #6366f1; text-decoration: none; }
    a:hover { text-decoration: underline; }
</style></head><body>
<div class="box"><h1>404</h1><p>Page not found</p><a href="/">← Back to PrimeChat</a></div>
</body></html>';
exit;
