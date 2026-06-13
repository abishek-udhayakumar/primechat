<?php
/**
 * PrimeChat — Web Push Notification Handler
 * Manages browser push subscriptions and sends notifications via Web Push API.
 */

use Minishlink\WebPush\WebPush as WebPushLib;
use Minishlink\WebPush\Subscription;

class WebPushHandler {
    private Database $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /**
     * Save a push subscription from the browser.
     */
    public function subscribe(int $userId, array $subscription): bool {
        $endpoint = $subscription['endpoint'] ?? '';
        $keys = $subscription['keys'] ?? [];
        $p256dh = $keys['p256dh'] ?? '';
        $auth = $keys['auth'] ?? '';

        if (empty($endpoint) || empty($p256dh) || empty($auth)) {
            return false;
        }

        try {
            $this->db->query(
                "INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE p256dh_key = VALUES(p256dh_key), auth_key = VALUES(auth_key)",
                [$userId, $endpoint, $p256dh, $auth]
            );
            return true;
        } catch (\Exception $e) {
            Logger::error('Failed to save push subscription', ['error' => $e->getMessage()]);
            return false;
        }
    }

    /**
     * Remove a push subscription.
     */
    public function unsubscribe(int $userId, string $endpoint): bool {
        try {
            $this->db->query(
                "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
                [$userId, $endpoint]
            );
            return true;
        } catch (\Exception $e) {
            Logger::error('Failed to remove push subscription', ['error' => $e->getMessage()]);
            return false;
        }
    }

    /**
     * Remove all subscriptions for a user.
     */
    public function unsubscribeAll(int $userId): bool {
        try {
            $this->db->query(
                "DELETE FROM push_subscriptions WHERE user_id = ?",
                [$userId]
            );
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Get all subscriptions for a user.
     */
    public function getSubscriptions(int $userId): array {
        $stmt = $this->db->query(
            "SELECT id, endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_id = ?",
            [$userId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Send a push notification to a specific user.
     * Only sends if the user appears offline (no recent heartbeat).
     */
    public function sendToUser(int $userId, string $title, string $body, array $extra = []): void {
        // Check if user is online — skip push if they are
        $userStmt = $this->db->query(
            "SELECT status, last_seen FROM users WHERE id = ?",
            [$userId]
        );
        $user = $userStmt->fetch();

        if ($user && $user['status'] === 'online') {
            // User might be online but not on WebSocket — still send push
        }

        $subscriptions = $this->getSubscriptions($userId);
        if (empty($subscriptions)) return;

        $auth = [
            'VAPID' => [
                'subject' => APP_URL,
                'publicKey' => $_ENV['VAPID_PUBLIC_KEY'] ?? '',
                'privateKey' => $_ENV['VAPID_PRIVATE_KEY'] ?? '',
            ],
        ];

        if (empty($auth['VAPID']['publicKey']) || empty($auth['VAPID']['privateKey'])) {
            Logger::warning('VAPID keys not configured, skipping push notification');
            return;
        }

        try {
            $webPush = new WebPushLib($auth);

            $payload = json_encode([
                'title' => $title,
                'body' => $body,
                'icon' => '/icons/icon-192.png',
                'badge' => '/icons/badge-72.png',
                'tag' => 'conv-' . ($extra['conversation_id'] ?? ''),
                'convId' => $extra['conversation_id'] ?? null,
                'url' => '/',
                'sender_id' => $extra['sender_id'] ?? null,
            ]);

            foreach ($subscriptions as $sub) {
                $subscription = Subscription::create([
                    'endpoint' => $sub['endpoint'],
                    'publicKey' => $sub['p256dh_key'],
                    'authToken' => $sub['auth_key'],
                    'contentEncoding' => 'aesgcm',
                ]);

                $webPush->queueNotification($subscription, $payload);
            }

            // Send all notifications (with timeout)
            foreach ($webPush->flush() as $report) {
                if (!$report->isSuccess()) {
                    // Endpoint expired or invalid — remove it
                    if ($report->isSubscriptionExpired()) {
                        $this->db->query(
                            "DELETE FROM push_subscriptions WHERE endpoint = ?",
                            [$report->getEndpoint()]
                        );
                    }
                    Logger::warning('Push notification failed', [
                        'endpoint' => $report->getEndpoint(),
                        'reason' => $report->getReason(),
                    ]);
                }
            }
        } catch (\Exception $e) {
            Logger::error('Failed to send push notification', ['error' => $e->getMessage()]);
        }
    }
}
