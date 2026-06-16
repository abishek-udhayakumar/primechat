<?php
require __DIR__ . '/../vendor/autoload.php';

// Load .env only if exists (local development)
if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
    $dotenv->load();
}

// ── Security Headers ──
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss: ws: https:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';");

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
    '/'           => '/views/splash.html',
    '/onboarding' => '/views/onboarding.html',
    '/login'      => '/views/login.html',
    '/signup'     => '/views/signup.html',
    '/chat'       => '/views/chat.html',
];

if (isset($routes[$uri])) {
    $viewFile = BASE_PATH . $routes[$uri];
    
    if (file_exists($viewFile)) {
        // Check that config files exist — show setup page if missing
        $missingConfig = [];
        foreach (['/config/app.php', '/config/database.php', '/config/session.php'] as $cfg) {
            if (!file_exists(BASE_PATH . $cfg)) $missingConfig[] = $cfg;
        }
        if (!empty($missingConfig)) {
            http_response_code(503);
            header('Content-Type: text/html; charset=UTF-8');
            $list = implode(', ', $missingConfig);
            echo '<!DOCTYPE html><html><head><title>Setup Required</title><style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}.box{background:#1a1a1a;padding:2rem;border-radius:12px;border:1px solid #333;max-width:500px;text-align:center}h2{color:#f97316;margin-top:0}code{background:#111;padding:2px 6px;border-radius:4px}pre{text-align:left;background:#111;padding:1rem;border-radius:8px;overflow-x:auto;font-size:13px}</style></head><body><div class="box"><h2>Setup Required</h2><p>Missing config files: <code>' . htmlspecialchars($list) . '</code></p><pre>bash scripts/setup.sh</pre><p>Then edit <code>config/database.php</code> and <code>.env</code> with your credentials.</p></div></body></html>';
            exit;
        }

        require_once BASE_PATH . '/config/app.php';
        require_once BASE_PATH . '/config/database.php';
        require_once BASE_PATH . '/config/session.php';
        require_once BASE_PATH . '/includes/Sanitizer.php';
        require_once BASE_PATH . '/includes/User.php';
        require_once BASE_PATH . '/includes/Auth.php';

        $auth = new Auth();
        $auth->validateSession();
        $csrfToken = $auth->getCsrfToken() ?? '';

        header('Content-Type: text/html; charset=UTF-8');
        $html = file_get_contents($viewFile);
        
        // Inject CSRF meta tag into <head>
        $csrfTag = "<meta name=\"csrf-token\" content=\"$csrfToken\">";
        // Remove any existing hardcoded template tags
        $html = str_replace('<meta name="csrf-token" content="<?= $csrf_token ?? \'\' ?>">', '', $html);
        $html = preg_replace('/<meta name="csrf-token"[^>]*>/i', '', $html);
        
        if (preg_match('/<head[^>]*>/i', $html, $matches)) {
            $html = str_replace($matches[0], $matches[0] . "\n    " . $csrfTag, $html);
        }

        // Inject VAPID public key meta tag if configured
        if (!empty($_ENV['VAPID_PUBLIC_KEY'])) {
            $vapidTag = "\n    <meta name=\"vapid-public-key\" content=\"" . $_ENV['VAPID_PUBLIC_KEY'] . '">';
            $html = str_replace('</head>', $vapidTag . "\n</head>", $html);
        }
        
        echo $html;
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
