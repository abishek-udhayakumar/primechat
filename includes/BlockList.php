<?php
/**
 * PrimeChat — Block List Manager
 * Handles user blocking/unblocking and block checks.
 */

class BlockList {
    private Database $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /**
     * Block a user.
     * Returns true if blocked, false if already blocked.
     */
    public function block(int $userId, int $blockedUserId): bool {
        if ($userId === $blockedUserId) return false;

        try {
            $this->db->query(
                "INSERT IGNORE INTO blocked_users (user_id, blocked_user_id) VALUES (?, ?)",
                [$userId, $blockedUserId]
            );
            return $this->db->query(
                "SELECT COUNT(*) AS cnt FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?",
                [$userId, $blockedUserId]
            )->fetch()['cnt'] > 0;
        } catch (\Exception $e) {
            Logger::error('Block failed', ['error' => $e->getMessage()]);
            return false;
        }
    }

    /**
     * Unblock a user.
     */
    public function unblock(int $userId, int $blockedUserId): bool {
        try {
            $this->db->query(
                "DELETE FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?",
                [$userId, $blockedUserId]
            );
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Check if userId has blocked targetUserId.
     */
    public function isBlocked(int $userId, int $targetUserId): bool {
        $stmt = $this->db->query(
            "SELECT 1 FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?",
            [$userId, $targetUserId]
        );
        return (bool) $stmt->fetch();
    }

    /**
     * Check if either user has blocked the other.
     * Used for send permission checks.
     */
    public function isEitherBlocked(int $userId, int $otherUserId): bool {
        return $this->isBlocked($userId, $otherUserId) || $this->isBlocked($otherUserId, $userId);
    }

    /**
     * Get all users blocked by userId with user info.
     */
    public function getBlockedUsers(int $userId): array {
        $stmt = $this->db->query(
            "SELECT u.id, u.username, u.display_name, u.avatar_url, bu.created_at AS blocked_at
             FROM blocked_users bu
             INNER JOIN users u ON u.id = bu.blocked_user_id
             WHERE bu.user_id = ?
             ORDER BY bu.created_at DESC",
            [$userId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Report a message.
     */
    public function reportMessage(int $reporterId, int $messageId, ?string $reason = null): bool {
        try {
            $this->db->query(
                "INSERT INTO message_reports (reporter_id, message_id, reason) VALUES (?, ?, ?)",
                [$reporterId, $messageId, $reason]
            );
            return true;
        } catch (\Exception $e) {
            Logger::error('Report failed', ['error' => $e->getMessage()]);
            return false;
        }
    }
}
