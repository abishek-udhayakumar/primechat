<?php
/**
 * PrimeChat — OTP (One-Time Password) Handler
 * Used for email and phone verification.
 */

class OTP {
    private Database $db;
    private const CODE_LENGTH = 6;
    private const EXPIRY_SECONDS = 600; // 10 minutes
    private const RATE_LIMIT_SECONDS = 60; // 1 per 60s
    private const RATE_LIMIT_HOUR = 5; // 5 per hour

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /**
     * Generate and store a new OTP code.
     * Returns the code on success, false on rate limit.
     */
    public function generate(int $userId, string $type): string|false {
        // Rate limit check
        $stmt = $this->db->query(
            "SELECT COUNT(*) AS cnt, MAX(created_at) AS last FROM otp_codes
             WHERE user_id = ? AND type = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
            [$userId, $type]
        );
        $rate = $stmt->fetch();

        if ($rate && (int)$rate['cnt'] >= self::RATE_LIMIT_HOUR) {
            return false; // Too many requests
        }

        if ($rate && $rate['last']) {
            $lastTime = strtotime($rate['last']);
            if (time() - $lastTime < self::RATE_LIMIT_SECONDS) {
                return false; // Too soon
            }
        }

        // Invalidate old codes for this user+type
        $this->db->query(
            "DELETE FROM otp_codes WHERE user_id = ? AND type = ?",
            [$userId, $type]
        );

        // Generate 6-digit code
        $code = str_pad((string)random_int(0, 999999), self::CODE_LENGTH, '0', STR_PAD_LEFT);

        $this->db->query(
            "INSERT INTO otp_codes (user_id, type, code, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))",
            [$userId, $type, $code, self::EXPIRY_SECONDS]
        );

        return $code;
    }

    /**
     * Verify an OTP code.
     * Returns true if valid, false otherwise.
     */
    public function verify(int $userId, string $type, string $code): bool {
        $stmt = $this->db->query(
            "SELECT id, verified FROM otp_codes
             WHERE user_id = ? AND type = ? AND code = ? AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1",
            [$userId, $type, $code]
        );
        $row = $stmt->fetch();

        if (!$row || $row['verified']) {
            return false;
        }

        // Mark as verified
        $this->db->query(
            "UPDATE otp_codes SET verified = 1 WHERE id = ?",
            [(int)$row['id']]
        );

        // Update user verification status
        $column = $type === 'email' ? 'email_verified' : 'phone_verified';
        $this->db->query(
            "UPDATE users SET $column = 1 WHERE id = ?",
            [$userId]
        );

        return true;
    }
}
