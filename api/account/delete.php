<?php
/**
 * POST /api/account/delete.php
 * Hard deletes the user account and all associated data
 */
require_once __DIR__ . '/../../bootstrap.php';
Response::requireMethod('POST');

$auth = new Auth();
$user = $auth->getCurrentUser();
if (!$user) {
    Response::error('Unauthorized', 401);
}

// Optional: verify password before deletion
$data = json_decode(file_get_contents('php://input'), true);
if (empty($data['password'])) {
    Response::error('Password is required to delete account');
}

$userModel = new User();
$dbUser = $userModel->findByUsername($user['username']); // Get hash
if (!password_verify($data['password'], $dbUser['password_hash'])) {
    Response::error('Incorrect password', 403);
}

$db = Database::getInstance();
try {
    $db->beginTransaction();
    // Because of ON DELETE CASCADE on foreign keys, deleting the user 
    // will automatically delete their messages, contacts, sessions, and preferences.
    $db->query("DELETE FROM users WHERE id = ?", [$user['id']]);
    $db->commit();
    
    // Destroy session
    $auth->logout();
    
    Response::success(null, 'Account deleted successfully');
} catch (Exception $e) {
    $db->rollBack();
    Logger::error('Account deletion failed', ['user_id' => $user['id'], 'error' => $e->getMessage()]);
    Response::error('An error occurred while deleting the account', 500);
}
