<?php
/**
 * POST /api/auth/signup.php
 * Register a new user
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

// Per-endpoint rate limiting: 3 requests per 60 seconds
RateLimiter::checkNamed('signup', 3, 60);

$data = Response::getJsonBody();

$auth = new Auth();
$result = $auth->register($data);

if (!$result['success']) {
    Response::validationError($result['errors']);
}

Response::success([
    'user_id'  => $result['user_id'],
    'username' => $result['username'],
    'csrf_token' => generateCsrfToken(),
], 'Registration successful');
