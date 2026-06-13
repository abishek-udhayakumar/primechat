<?php
/**
 * PrimeChat — JWT Token Manager
 * Handles JWT creation, validation, and verification for WebSocket auth.
 * Falls back to session-based auth if JWT_SECRET is not configured.
 */

class JwtManager {
    private static ?string $secret = null;
    private static int $expiry = 86400; // 24 hours

    /**
     * Check if JWT is configured
     */
    public static function isConfigured(): bool {
        return !empty($_ENV['JWT_SECRET']);
    }

    /**
     * Initialize JWT with secret from environment
     */
    private static function init(): void {
        if (self::$secret === null) {
            self::$secret = $_ENV['JWT_SECRET'] ?? '';
            self::$expiry = (int)($_ENV['JWT_EXPIRY'] ?? 86400);
        }
    }

    /**
     * Generate a JWT token for a user
     */
    public static function generateToken(int $userId, string $username): string {
        self::init();

        $header = self::base64UrlEncode(json_encode([
            'typ' => 'JWT',
            'alg' => 'HS256'
        ]));

        $payload = self::base64UrlEncode(json_encode([
            'sub' => $userId,
            'username' => $username,
            'iat' => time(),
            'exp' => time() + self::$expiry
        ]));

        $signature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payload", self::$secret, true)
        );

        return "$header.$payload.$signature";
    }

    /**
     * Validate and decode a JWT token
     * Returns the payload array or null if invalid
     */
    public static function validateToken(string $token): ?array {
        self::init();

        if (empty(self::$secret)) {
            return null;
        }

        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$header, $payload, $signature] = $parts;

        // Verify signature
        $expectedSignature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payload", self::$secret, true)
        );

        if (!hash_equals($expectedSignature, $signature)) {
            return null;
        }

        // Decode payload
        $data = json_decode(self::base64UrlDecode($payload), true);
        if (!$data) {
            return null;
        }

        // Check expiration
        if (isset($data['exp']) && $data['exp'] < time()) {
            return null;
        }

        return $data;
    }

    /**
     * Extract user ID from token
     */
    public static function getUserIdFromToken(string $token): ?int {
        $payload = self::validateToken($token);
        return isset($payload['sub']) ? (int)$payload['sub'] : null;
    }

    private static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string {
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
