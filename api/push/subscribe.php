<?php
/**
 * POST /api/push/subscribe
 * Save a browser push subscription for the current user.
 *
 * Body (JSON): { endpoint, keys: { p256dh, auth } }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

if (empty($data['endpoint']) || empty($data['keys']['p256dh']) || empty($data['keys']['auth'])) {
    Response::error('Invalid subscription data', 422);
}

$push = new WebPushHandler();
$result = $push->subscribe($userId, $data);

if ($result) {
    Response::success(null, 'Subscribed to push notifications');
} else {
    Response::error('Failed to save subscription', 500);
}
