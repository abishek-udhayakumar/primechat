<?php
/**
 * DELETE /api/push/unsubscribe
 * Remove a browser push subscription.
 *
 * Body (JSON): { endpoint }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$endpoint = $data['endpoint'] ?? '';

if (empty($endpoint)) {
    Response::error('endpoint is required', 422);
}

$push = new WebPushHandler();
$result = $push->unsubscribe($userId, $endpoint);

if ($result) {
    Response::success(null, 'Unsubscribed from push notifications');
} else {
    Response::error('Failed to remove subscription', 500);
}
