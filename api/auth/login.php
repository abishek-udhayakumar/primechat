<?php
/**
 * POST /api/auth/login.php
 * Authenticate user with email/username and password
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

// Per-endpoint rate limiting: 5 requests per 60 seconds
RateLimiter::checkNamed('login', 5, 60);

$data = Response::getJsonBody();

$identifier = Sanitizer::trimInput($data['identifier'] ?? $data['email'] ?? '');
$password = $data['password'] ?? '';

if (empty($identifier) || empty($password)) {
    Response::error('Email/username and password are required', 422);
}

$auth = new Auth();
$result = $auth->login($identifier, $password);

if (!$result['success']) {
    Response::error($result['error'], 401);
}

// Fetch full user data
$user = (new User())->findById($result['user_id']);

Response::success([
    'user'       => $user,
    'csrf_token' => generateCsrfToken(),
], 'Login successful');
