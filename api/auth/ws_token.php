<?php
/**
 * POST /api/auth/ws_token
 * Generate a JWT token for WebSocket authentication.
 * Requires valid session authentication.
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$user = (new User())->findById($userId);

if (!$user) {
    Response::error('User not found', 404);
}

// Check if JWT is configured
if (!JwtManager::isConfigured()) {
    Response::error('JWT authentication not configured', 500);
}

$token = JwtManager::generateToken((int)$user['id'], $user['username']);

Response::success([
    'token' => $token,
    'expires_in' => (int)($_ENV['JWT_EXPIRY'] ?? 86400),
], 'WebSocket token generated');
