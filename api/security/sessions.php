<?php
/**
 * GET /api/security/sessions.php
 * List active sessions for the current user
 */
require_once __DIR__ . '/../../bootstrap.php';
Response::requireMethod('GET');

$auth = new Auth();
$user = $auth->getCurrentUser();
if (!$user) {
    Response::error('Unauthorized', 401);
}

$db = Database::getInstance();
$stmt = $db->query(
    "SELECT id, user_agent, ip_address, last_active, created_at, session_id = ? AS is_current 
     FROM user_sessions 
     WHERE user_id = ? 
     ORDER BY last_active DESC",
    [session_id(), $user['id']]
);
$sessions = $stmt->fetchAll();

// Add browser/OS parsing logic here if needed, for now just send user_agent
Response::success(['sessions' => $sessions]);
