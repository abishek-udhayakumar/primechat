<?php
/**
 * GET /api/health
 * Health check endpoint for load balancers and monitoring.
 * Returns 200 if the application is healthy.
 */

header('Content-Type: application/json');

try {
    // Load minimal dependencies
    require_once __DIR__ . '/../vendor/autoload.php';
    
    if (file_exists(__DIR__ . '/../.env')) {
        $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
        $dotenv->load();
    }

    $health = [
        'status' => 'healthy',
        'timestamp' => date('c'),
        'version' => '1.0.0',
        'checks' => [],
    ];

    // Check database connectivity
    try {
        require_once __DIR__ . '/../config/database.php';
        $db = Database::getInstance();
        $db->query("SELECT 1");
        $health['checks']['database'] = 'ok';
    } catch (\Throwable $e) {
        $health['checks']['database'] = 'error: ' . $e->getMessage();
        $health['status'] = 'degraded';
    }

    // Check Redis connectivity (optional)
    if (!empty($_ENV['REDIS_HOST'])) {
        try {
            require_once __DIR__ . '/../includes/RedisClient.php';
            $redis = RedisClient::getInstance();
            $health['checks']['redis'] = $redis->isConnected() ? 'ok' : 'disconnected';
        } catch (\Throwable $e) {
            $health['checks']['redis'] = 'error: ' . $e->getMessage();
            // Redis is optional, don't degrade health
        }
    }

    $statusCode = $health['status'] === 'healthy' ? 200 : 503;
    http_response_code($statusCode);
    echo json_encode($health);

} catch (\Throwable $e) {
    http_response_code(503);
    echo json_encode([
        'status' => 'unhealthy',
        'error' => 'Health check failed',
        'timestamp' => date('c'),
    ]);
}
