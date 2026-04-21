<?php
/**
 * PrimeChat — Application Configuration
 */

// App identity
define('APP_NAME', 'PrimeChat');
define('APP_VERSION', '1.0.0');
define('APP_URL', 'http://primechat.me');

// Paths
define('ROOT_PATH', dirname(__DIR__));
define('CONFIG_PATH', ROOT_PATH . '/config');
define('INCLUDES_PATH', ROOT_PATH . '/includes');
define('PUBLIC_PATH', ROOT_PATH . '/public');
define('VIEWS_PATH', ROOT_PATH . '/views');
define('UPLOADS_PATH', PUBLIC_PATH . '/uploads');

// Upload settings
define('MAX_FILE_SIZE', 25 * 1024 * 1024);        // 25MB
define('MAX_IMAGE_SIZE', 10 * 1024 * 1024);        // 10MB
define('MAX_VOICE_SIZE', 5 * 1024 * 1024);         // 5MB
define('MAX_AVATAR_SIZE', 2 * 1024 * 1024);        // 2MB

// Allowed file types
define('ALLOWED_IMAGE_TYPES', ['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
define('ALLOWED_FILE_TYPES', [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
    'application/x-rar-compressed',
]);
define('ALLOWED_VOICE_TYPES', ['audio/webm', 'video/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'application/octet-stream']);

// Polling settings
define('TYPING_TIMEOUT_SECONDS', 4);
define('ONLINE_TIMEOUT_SECONDS', 30);

// Security
define('BCRYPT_COST', 12);
define('SESSION_LIFETIME', 86400 * 7); // 7 days
define('CSRF_TOKEN_NAME', 'csrf_token');

// Pagination
define('MESSAGES_PER_PAGE', 50);
define('CONVERSATIONS_PER_PAGE', 50);
define('SEARCH_RESULTS_LIMIT', 20);
