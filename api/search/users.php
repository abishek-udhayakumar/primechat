<?php
/**
 * GET /api/search/users.php
 * Search users by username or phone number
 * Params: q (search query)
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();

$query = Sanitizer::trimInput($_GET['q'] ?? '');

if (strlen($query) < 1) {
    Response::success(['users' => []]);
}

$userModel = new User();
$users = $userModel->search($query, $userId, SEARCH_RESULTS_LIMIT);

// Sanitize output
$formatted = array_map(function($user) {
    return [
        'id'           => (int) $user['id'],
        'username'     => $user['username'],
        'display_name' => $user['display_name'],
        'avatar_url'   => $user['avatar_url'],
        'about'        => $user['about'],
        'status'       => $user['status'],
        'last_seen'    => $user['last_seen'],
    ];
}, $users);

Response::success(['users' => $formatted]);
