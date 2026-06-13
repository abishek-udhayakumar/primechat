<?php
/**
 * PrimeChat — Scalable Rate Limiter
 * Supports Redis (distributed) and session-based (single-server) storage.
 */

interface RateLimitStoreInterface {
    public function increment(string $key, int $window): int;
    public function getStartTime(string $key): int;
    public function reset(string $key, int $startTime): void;
}

class RedisRateLimitStore implements RateLimitStoreInterface {
    private RedisClient $redis;

    public function __construct() {
        $this->redis = RedisClient::getInstance();
    }

    public function increment(string $key, int $window): int {
        return $this->redis->increment("ratelimit:$key", $window);
    }

    public function getStartTime(string $key): int {
        $data = $this->redis->get("ratelimit:{$key}:start");
        return $data ?? time();
    }

    public function reset(string $key, int $startTime): void {
        $this->redis->set("ratelimit:$key", 1, null);
        $this->redis->set("ratelimit:{$key}:start", $startTime, null);
    }
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
            // Use Redis if available, fallback to session
            if (class_exists('RedisClient') && RedisClient::getInstance()->isConnected()) {
                self::$store = new RedisRateLimitStore();
            } else {
                self::$store = new SessionRateLimitStore();
            }
        }
        return self::$store;
    }

    /**
     * Global rate limit check (backward-compatible).
     */
    public static function check(): void {
        self::checkNamed('default', self::$limit, self::$window);
    }

    /**
     * Named rate limit check.
     * Each named limiter uses a distinct session key prefix.
     *
     * @param string $name   Limiter name (e.g. 'login', 'signup', 'send')
     * @param int    $limit  Max requests allowed within the window
     * @param int    $window Time window in seconds
     */
    public static function checkNamed(string $name, int $limit, int $window): void {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $key = 'rl_' . $name . '_' . md5($ip);

        $count = self::getStore()->increment($key, $window);

        if ($count > $limit) {
            Logger::error('Rate limit exceeded', [
                'name' => $name,
                'ip'   => $ip,
                'count' => $count,
                'limit' => $limit,
                'window' => $window,
            ]);
            Response::error('Too many requests. Please try again later.', 429);
        }
    }
}
