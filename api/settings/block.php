<?php
/**
 * POST /api/settings/block
 * Block or unblock a user.
 *
 * GET /api/settings/block
 * List blocked users.
 *
 * Body (POST): { user_id, action: "block"|"unblock" }
 */
require_once __DIR__ . '/../bootstrap.php';

$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    _handleBlockToggle($userId);
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    _handleListBlocked($userId);
} else {
    Response::error('Method not allowed', 405);
}

function _handleBlockToggle(int $userId): void {
    $data = Response::getJsonBody();
    $targetUserId = (int)($data['user_id'] ?? 0);
    $action = $data['action'] ?? 'block';

    if ($targetUserId <= 0) {
        Response::error('user_id is required', 422);
    }

    if ($targetUserId === $userId) {
        Response::error('Cannot block yourself', 422);
    }

    $blockList = new BlockList();

    if ($action === 'block') {
        $result = $blockList->block($userId, $targetUserId);
        Response::success(['blocked' => $result], $result ? 'User blocked' : 'User already blocked');
    } elseif ($action === 'unblock') {
        $blockList->unblock($userId, $targetUserId);
        Response::success(['blocked' => false], 'User unblocked');
    } else {
        Response::error('Invalid action. Use "block" or "unblock"', 422);
    }
}

function _handleListBlocked(int $userId): void {
    $blockList = new BlockList();
    $blocked = $blockList->getBlockedUsers($userId);
    Response::success(['blocked_users' => $blocked]);
}
