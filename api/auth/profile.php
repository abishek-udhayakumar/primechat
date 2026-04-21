<?php
/**
 * GET/POST /api/auth/profile.php
 * GET: Fetch current user profile
 * POST: Update current user profile
 */
require_once __DIR__ . '/../bootstrap.php';

$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = (new User())->findById($userId);
    if (!$user) {
        Response::error('User not found', 404);
    }
    Response::success(['user' => $user]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = Response::getJsonBody();
    $userModel = new User();

    // Handle avatar upload separately
    if (isset($_FILES['avatar'])) {
        try {
            $fileInfo = FileUpload::handle($_FILES['avatar'], 'avatar');
            $data['avatar_url'] = $fileInfo['file_path'];
        } catch (\RuntimeException $e) {
            Response::error('Avatar upload failed: ' . $e->getMessage());
        }
    }

    $userModel->updateProfile($userId, $data);

    // Update status to online (heartbeat)
    $userModel->updateStatus($userId, 'online');

    $user = $userModel->findById($userId);
    Response::success(['user' => $user], 'Profile updated');
}

Response::error('Method not allowed', 405);
