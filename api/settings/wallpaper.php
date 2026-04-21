<?php
/**
 * POST /api/settings/wallpaper.php
 * Save wallpaper preference
 * Body: { wallpaper: "default" | "gradient1" | ... }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$wallpaper = Sanitizer::trimInput($data['wallpaper'] ?? 'default');

$allowedWallpapers = [
    'default', 'gradient1', 'gradient2', 'gradient3',
    'dark1', 'dark2', 'pattern1', 'pattern2', 'solid1', 'solid2'
];

if (!in_array($wallpaper, $allowedWallpapers)) {
    $wallpaper = 'default';
}

$userModel = new User();
$userModel->updateProfile($userId, ['wallpaper' => $wallpaper]);

Response::success(['wallpaper' => $wallpaper], 'Wallpaper updated');
