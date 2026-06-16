<?php
/**
 * POST /api/security/logout_device.php
 * Logout a specific active session
 */
require_once __DIR__ . '/../../bootstrap.php';
Response::requireMethod('POST');

$auth = new Auth();
$user = $auth->getCurrentUser();
if (!$user) {
    Response::error('Unauthorized', 401);
}

$data = json_decode(file_get_contents('php://input'), true);
if (empty($data['session_id_db'])) { // id from user_sessions table
    Response::error('Session ID is required');
}

$db = Database::getInstance();
// Only allow deleting sessions belonging to the current user
$stmt = $db->query(
    "DELETE FROM user_sessions WHERE id = ? AND user_id = ?",
    [$data['session_id_db'], $user['id']]
);

if ($stmt->rowCount() > 0) {
    Response::success(null, 'Session terminated successfully');
} else {
    Response::error('Session not found or already terminated');
}
