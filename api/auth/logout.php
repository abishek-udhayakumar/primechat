<?php
/**
 * POST /api/auth/logout.php
 * Destroy session and set user offline
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$auth = new Auth();
$auth->logout();

Response::success(null, 'Logged out successfully');
