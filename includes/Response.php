<?php
/**
 * PrimeChat — JSON Response Helper
 * Standardized API response format
 */

class Response {
    /**
     * Send a success response
     */
    public static function success(mixed $data = null, string $message = '', int $code = 200): void {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');

        $response = ['success' => true];
        if ($message) {
            $response['message'] = $message;
        }
        if ($data !== null) {
            $response['data'] = $data;
        }

        // Add latency metadata
        if (defined('APP_START_TIME')) {
            $response['latency_ms'] = round((microtime(true) - APP_START_TIME) * 1000, 2);
        }

        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        exit;
    }

    /**
     * Send an error response
     */
    public static function error(string $message, int $code = 400, mixed $errors = null): void {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');

        $response = [
            'success' => false,
            'error'   => $message,
        ];
        if ($errors !== null) {
            $response['errors'] = $errors;
        }

        // Log API errors (non-4xx usually indicate server issues or critical failures)
        if ($code >= 500) {
            Logger::error("API Error $code: $message", ['errors' => $errors]);
        }

        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        exit;
    }

    /**
     * Send a validation error response
     */
    public static function validationError(array $errors): void {
        self::error('Validation failed', 422, $errors);
    }

    /**
     * Require specific HTTP method
     */
    public static function requireMethod(string $method): void {
        if ($_SERVER['REQUEST_METHOD'] !== strtoupper($method)) {
            self::error('Method not allowed', 405);
        }
    }

    /**
     * Get JSON body from request
     */
    public static function getJsonBody(): array {
        $input = file_get_contents('php://input');
        $data = json_decode($input, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            // Fallback to POST data
            return $_POST;
        }

        return $data ?? [];
    }
}
