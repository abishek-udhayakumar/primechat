<?php
/**
 * PrimeChat — Input Sanitization & Validation
 */

class Sanitizer {
    /**
     * Sanitize a string for safe output (XSS protection)
     */
    public static function clean(mixed $input): string {
        if ($input === null) return '';
        return htmlspecialchars(trim((string)$input), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    /**
     * Sanitize for database storage (trim only, not HTML encode)
     * HTML encoding happens on output, not storage
     */
    public static function trimInput(mixed $input): string {
        if ($input === null) return '';
        if (is_array($input)) $input = implode(' ', array_filter($input, 'is_string'));
        return trim((string)$input);
    }

    /**
     * Validate email format
     */
    public static function isValidEmail(string $email): bool {
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    /**
     * Validate username (alphanumeric, underscores, 3-50 chars)
     */
    public static function isValidUsername(string $username): bool {
        return (bool) preg_match('/^[a-zA-Z0-9_]{3,50}$/', $username);
    }

    /**
     * Validate password strength.
     * Requirements: min 12 chars, at least one uppercase, one lowercase, one digit.
     */
    public static function isValidPassword(string $password): bool {
        if (strlen($password) < 12) return false;
        if (!preg_match('/[A-Z]/', $password)) return false;
        if (!preg_match('/[a-z]/', $password)) return false;
        if (!preg_match('/[0-9]/', $password)) return false;
        return true;
    }

    /**
     * Normalize phone number for search
     * Removes +, country codes, spaces, dashes, parentheses
     */
    public static function normalizePhone(string $phone): string {
        // Remove all non-digit characters
        $normalized = preg_replace('/\D/', '', $phone);

        // Remove common country codes from the start
        // India: 91, US: 1, UK: 44, etc.
        $countryCodes = ['91', '1', '44', '86', '81', '49', '33', '61', '55', '7'];

        if (strlen($normalized) > 10) {
            foreach ($countryCodes as $code) {
                if (str_starts_with($normalized, $code) && strlen($normalized) === strlen($code) + 10) {
                    $normalized = substr($normalized, strlen($code));
                    break;
                }
            }
        }

        // If still more than 10 digits, take the last 10
        if (strlen($normalized) > 10) {
            $normalized = substr($normalized, -10);
        }

        return $normalized;
    }

    /**
     * Validate phone number (optional field, but if provided must have digits)
     */
    public static function isValidPhone(string $phone): bool {
        $normalized = self::normalizePhone($phone);
        return strlen($normalized) >= 7 && strlen($normalized) <= 15;
    }

    /**
     * Sanitize filename for safe storage
     */
    public static function sanitizeFilename(string $filename): string {
        // Remove path components
        $filename = basename($filename);
        // Replace unsafe characters
        $filename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
        // Remove multiple consecutive dots (prevent extension tricks)
        $filename = preg_replace('/\.{2,}/', '.', $filename);
        return $filename;
    }

    /**
     * Generate a unique filename
     */
    public static function generateUniqueFilename(string $originalName): string {
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $hash = bin2hex(random_bytes(16));
        $timestamp = time();
        return "{$timestamp}_{$hash}.{$ext}";
    }

    /**
     * Validate required fields in an associative array
     * Returns array of missing field names
     */
    public static function validateRequired(array $data, array $fields): array {
        $missing = [];
        foreach ($fields as $field) {
            if (!isset($data[$field]) || trim((string)$data[$field]) === '') {
                $missing[] = $field;
            }
        }
        return $missing;
    }

    /**
     * Sanitize message content
     * Allows some formatting but prevents XSS
     */
    public static function sanitizeMessage(string $content): string {
        $content = trim($content);
        // Remove null bytes
        $content = str_replace("\0", '', $content);
        // Limit length
        if (mb_strlen($content) > 5000) {
            $content = mb_substr($content, 0, 5000);
        }
        return $content;
    }
}
