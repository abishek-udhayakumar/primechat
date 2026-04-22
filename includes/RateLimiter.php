<?php
/**
 * PrimeChat — Scalable Rate Limiter
 */

interface RateLimitStoreInterface {
    public function increment(string $key, int $window): int;
    public function getStartTime(string $key): int;
    public function reset(string $key, int $startTime): void;
}

class SessionRateLimitStore implements RateLimitStoreInterface {
    public function increment(string $key, int $window): int {
        if (session_status() === PHP_SESSION_NONE) session_start();
        
        $now = time();
        if (!isset($_SESSION[$key]) || ($now - $_SESSION[$key]['start'] > $window)) {
            $_SESSION[$key] = ['count' => 1, 'start' => $now];
        } else {
            $_SESSION[$key]['count']++;
        }
        return $_SESSION[$key]['count'];
    }

    public function getStartTime(string $key): int {
        return $_SESSION[$key]['start'] ?? time();
    }

    public function reset(string $key, int $startTime): void {
        $_SESSION[$key] = ['count' => 1, 'start' => $startTime];
    }
}

class RateLimiter {
    private static int $limit = 100; 
    private static int $window = 60; 
    private static ?RateLimitStoreInterface $store = null;

    private static function getStore(): RateLimitStoreInterface {
        if (self::$store === null) {
            // Default to Session store, but easily swappable for RedisRateLimitStore
            self::$store = new SessionRateLimitStore();
        }
        return self::$store;
    }

    public static function check(): void {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $key = 'rl_' . md5($ip);
        
        $count = self::getStore()->increment($key, self::$window);

        if ($count > self::$limit) {
            Logger::error('Rate limit exceeded', ['ip' => $ip]);
            Response::error('Too many requests', 429);
        }
    }
}
