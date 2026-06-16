<?php
/**
 * POST /api/privacy/unblock.php
 * Unblock a user
 */
require_once __DIR__ . '/../../bootstrap.php';
Response::requireMethod('POST');

$auth = new Auth();
$user = $auth->getCurrentUser();
if (!$user) {
    Response::error('Unauthorized', 401);
}

$data = json_decode(file_get_contents('php://input'), true);
if (empty($data['blocked_user_id'])) {
    Response::error('User ID to unblock is required');
}

$db = Database::getInstance();
$db->query(
    "DELETE FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?",
    [$user['id'], $data['blocked_user_id']]
);
Response::success(null, 'User unblocked successfully');
