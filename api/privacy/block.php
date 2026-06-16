<?php
/**
 * POST /api/privacy/block.php
 * Block a user
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
    Response::error('User ID to block is required');
}

if ($user['id'] == $data['blocked_user_id']) {
    Response::error('Cannot block yourself');
}

$db = Database::getInstance();
try {
    $db->query(
        "INSERT IGNORE INTO blocked_users (user_id, blocked_user_id) VALUES (?, ?)",
        [$user['id'], $data['blocked_user_id']]
    );
    Response::success(null, 'User blocked successfully');
} catch (Exception $e) {
    Response::error('Failed to block user');
}
