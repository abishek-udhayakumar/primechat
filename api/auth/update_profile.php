<?php
/**
 * POST /api/auth/update_profile.php
 * Handles multipart/form-data requests for profile editing.
 */
require_once __DIR__ . '/../bootstrap.php';

$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$userModel = new User();
$updateData = [];

// Handle display_name update
if (isset($_POST['display_name'])) {
    $displayName = trim($_POST['display_name']);
    if (empty($displayName)) {
        Response::error('Display name cannot be empty', 422);
    }
    $updateData['display_name'] = Sanitizer::clean($displayName);
}

// Handle about update
if (isset($_POST['about'])) {
    $updateData['about'] = Sanitizer::clean($_POST['about']);
}

// Handle avatar upload
if (isset($_FILES['avatar'])) {
    try {
        $fileInfo = FileUpload::handle($_FILES['avatar'], 'avatar');
        $updateData['avatar_url'] = $fileInfo['file_path'];
    } catch (\RuntimeException $e) {
        Response::error('Avatar upload failed: ' . $e->getMessage(), 422);
    }
}

if (empty($updateData)) {
    Response::error('No valid fields provided for update', 400);
}

// Perform update
if ($userModel->updateProfile($userId, $updateData)) {
    // Return updated user data
    $user = $userModel->findById($userId);
    Response::success(['user' => $user], 'Profile updated successfully');
} else {
    Response::error('Failed to update profile or no changes were made', 400);
}
