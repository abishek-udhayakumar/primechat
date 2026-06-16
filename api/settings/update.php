<?php
/**
 * POST /api/settings/update.php
 * Update user preferences
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$auth = new Auth();
$user = $auth->getCurrentUser();
if (!$user) {
    Response::error('Unauthorized', 401);
}

$data = json_decode(file_get_contents('php://input'), true);
if (!$data || !isset($data['preferences']) || !is_array($data['preferences'])) {
    Response::error('Invalid preferences data');
}

$userModel = new User();
if ($userModel->updatePreferences((int)$user['id'], $data['preferences'])) {
    // Return updated user object
    $updatedUser = $userModel->findById((int)$user['id']);
    Response::success(['user' => $updatedUser], 'Settings updated successfully');
} else {
    Response::error('Failed to update settings');
}
