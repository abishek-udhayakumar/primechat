<?php
/**
 * PrimeChat — Simple Rate Limiter
 */

class RateLimiter {
    private static int $limit = 100; // requests
    private static int $window = 60; // seconds

    /**
     * Check if the current request exceeds the rate limit
     */
    public static function check(): void {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        $key = 'rate_limit_' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $now = time();

        if (!isset($_SESSION[$key])) {
            $_SESSION[$key] = ['count' => 1, 'start' => $now];
            return;
        }

        $data = $_SESSION[$key];

        if ($now - $data['start'] > self::$window) {
            $_SESSION[$key] = ['count' => 1, 'start' => $now];
            return;
        }

        $_SESSION[$key]['count']++;

        if ($_SESSION[$key]['count'] > self::$limit) {
            Logger::error('Rate limit exceeded', ['ip' => $_SERVER['REMOTE_ADDR']]);
            Response::error('Too many requests', 429);
        }
    }
}
