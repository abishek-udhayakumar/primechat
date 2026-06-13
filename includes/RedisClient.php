<?php
/**
 * PrimeChat — Redis Client Wrapper
 * Provides Redis connectivity with fallback to file-based storage.
 */

class RedisClient {
    private static ?self $instance = null;
    private $redis = null;
    private bool $connected = false;
    private string $fallbackDir;

    private function __construct() {
        $this->fallbackDir = sys_get_temp_dir() . '/primechat_rate_limits';
        if (!is_dir($this->fallbackDir)) {
            mkdir($this->fallbackDir, 0777, true);
        }

        // Try to connect to Redis if configured
        if (!empty($_ENV['REDIS_HOST'])) {
            try {
                $this->redis = new \Redis();
                $host = $_ENV['REDIS_HOST'] ?? '127.0.0.1';
                $port = (int)($_ENV['REDIS_PORT'] ?? 6379);
                $timeout = (float)($_ENV['REDIS_TIMEOUT'] ?? 1.0);

                $this->connected = $this->redis->connect($host, $port, $timeout);
                if ($this->connected && !empty($_ENV['REDIS_PASSWORD'])) {
                    $this->connected = $this->redis->auth($_ENV['REDIS_PASSWORD']);
                }
                if ($this->connected) {
                    echo "[Redis] Connected to $host:$port\n";
                }
            } catch (\Exception $e) {
                echo "[Redis] Connection failed: {$e->getMessage()}\n";
                $this->connected = false;
            }
        }
    }

    public static function getInstance(): self {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function isConnected(): bool {
        return $this->connected;
    }

    /**
     * Set a value with optional TTL (in seconds)
     */
    public function set(string $key, mixed $value, ?int $ttl = null): bool {
        if ($this->connected) {
            if ($ttl !== null) {
                return $this->redis->setex($key, $ttl, serialize($value));
            }
            return $this->redis->set($key, serialize($value));
        }

        // File-based fallback
        $file = $this->fallbackDir . '/' . md5($key) . '.json';
        $data = [
            'value' => $value,
            'expires' => $ttl !== null ? time() + $ttl : null,
        ];
        return file_put_contents($file, json_encode($data)) !== false;
    }

    /**
     * Get a value
     */
    public function get(string $key): mixed {
        if ($this->connected) {
            $value = $this->redis->get($key);
            return $value !== false ? unserialize($value) : null;
        }

        // File-based fallback
        $file = $this->fallbackDir . '/' . md5($key) . '.json';
        if (!file_exists($file)) {
            return null;
        }

        $data = json_decode(file_get_contents($file), true);
        if ($data === null) {
            return null;
        }

        if (isset($data['expires']) && $data['expires'] < time()) {
            unlink($file);
            return null;
        }

        return $data['value'];
    }

    /**
     * Increment a value (for rate limiting)
     */
    public function increment(string $key, int $ttl = 60): int {
        if ($this->connected) {
            $current = $this->redis->incr($key);
            if ($current === 1) {
                $this->redis->expire($key, $ttl);
            }
            return (int)$current;
        }

        // File-based fallback
        $current = $this->get($key);
        $current = is_int($current) ? $current + 1 : 1;
        $this->set($key, $current, $ttl);
        return $current;
    }

    /**
     * Delete a key
     */
    public function del(string $key): bool {
        if ($this->connected) {
            return $this->redis->del($key) > 0;
        }

        $file = $this->fallbackDir . '/' . md5($key) . '.json';
        if (file_exists($file)) {
            return unlink($file);
        }
        return true;
    }

    /**
     * Check if a key exists
     */
    public function exists(string $key): bool {
        if ($this->connected) {
            return $this->redis->exists($key) > 0;
        }

        return $this->get($key) !== null;
    }

    /**
     * Set a hash field
     */
    public function hSet(string $hash, string $field, mixed $value): bool {
        if ($this->connected) {
            return $this->redis->hSet($hash, $field, serialize($value));
        }

        $key = "$hash:$field";
        return $this->set($key, $value);
    }

    /**
     * Get a hash field
     */
    public function hGet(string $hash, string $field): mixed {
        if ($this->connected) {
            $value = $this->redis->hGet($hash, $field);
            return $value !== false ? unserialize($value) : null;
        }

        $key = "$hash:$field";
        return $this->get($key);
    }

    /**
     * Delete a hash field
     */
    public function hDel(string $hash, string $field): bool {
        if ($this->connected) {
            return $this->redis->hDel($hash, $field) > 0;
        }

        $key = "$hash:$field";
        return $this->del($key);
    }
}
