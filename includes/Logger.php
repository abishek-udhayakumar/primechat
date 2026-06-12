<?php
/**
 * PrimeChat — Centralized Logging System
 */

class Logger {
    private static string $logDir = BASE_PATH . '/logs';

    /**
     * Log an event
     */
    public static function log(string $level, string $message, array $context = []): void {
        if (!is_dir(self::$logDir)) {
            mkdir(self::$logDir, 0777, true);
        }

        $logFile = self::$logDir . '/' . date('Y-m-d') . '.log';
        $entry = [
            'timestamp' => date('Y-m-d H:i:s'),
            'level'     => strtoupper($level),
            'message'   => $message,
            'context'   => $context,
            'ip'        => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            'uri'       => $_SERVER['REQUEST_URI'] ?? 'unknown',
        ];

        file_put_contents($logFile, json_encode($entry) . PHP_EOL, FILE_APPEND);
    }

    public static function error(string $message, array $context = []): void {
        self::log('error', $message, $context);
    }

    /**
     * Critical alert (suitable for triggering notifications)
     */
    public static function alert(string $message, array $context = []): void {
        self::log('alert', $message, $context);
        
        // Write to a separate high-priority alert log
        $alertFile = self::$logDir . '/alerts.log';
        $entry = [
            'timestamp' => date('Y-m-d H:i:s'),
            'message'   => $message,
            'context'   => $context
        ];
        file_put_contents($alertFile, json_encode($entry) . PHP_EOL, FILE_APPEND);
    }

    public static function warning(string $message, array $context = []): void {
        self::log('warning', $message, $context);
    }

    public static function info(string $message, array $context = []): void {
        self::log('info', $message, $context);
    }

    public static function debug(string $message, array $context = []): void {
        if (defined('DEBUG_MODE') && DEBUG_MODE) {
            self::log('debug', $message, $context);
        }
    }
}
