<?php
/**
 * PrimeChat — User Model
 * Handles user CRUD, search, and profile operations
 */

class User {
    private Database $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /**
     * Find user by ID
     */
    public function findById(int $id): ?array {
        $stmt = $this->db->query(
            "SELECT id, username, email, phone, display_name, avatar_url, about,
                    status, last_seen, wallpaper, theme, created_at
             FROM users WHERE id = ?",
            [$id]
        );
        $user = $stmt->fetch();
        return $user ?: null;
    }

    /**
     * Find user by email
     */
    public function findByEmail(string $email): ?array {
        $stmt = $this->db->query(
            "SELECT * FROM users WHERE email = ?",
            [strtolower(trim($email))]
        );
        $user = $stmt->fetch();
        return $user ?: null;
    }

    /**
     * Find user by username
     */
    public function findByUsername(string $username): ?array {
        $stmt = $this->db->query(
            "SELECT * FROM users WHERE username = ?",
            [strtolower(trim($username))]
        );
        $user = $stmt->fetch();
        return $user ?: null;
    }

    /**
     * Create a new user
     */
    public function create(array $data): int {
        $this->db->query(
            "INSERT INTO users (username, email, phone, phone_normalized, password_hash, display_name)
             VALUES (?, ?, ?, ?, ?, ?)",
            [
                strtolower(trim($data['username'])),
                strtolower(trim($data['email'])),
                $data['phone'] ?? null,
                isset($data['phone']) ? Sanitizer::normalizePhone($data['phone']) : null,
                password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]),
                trim($data['display_name']),
            ]
        );
        return (int) $this->db->lastInsertId();
    }

    /**
     * Update user profile
     */
    public function updateProfile(int $userId, array $data): bool {
        $fields = [];
        $params = [];

        $allowedFields = ['display_name', 'about', 'phone', 'avatar_url', 'wallpaper', 'theme'];

        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $data)) {
                if ($field === 'phone') {
                    $fields[] = 'phone = ?';
                    $params[] = $data['phone'];
                    $fields[] = 'phone_normalized = ?';
                    $params[] = $data['phone'] ? Sanitizer::normalizePhone($data['phone']) : null;
                } else {
                    $fields[] = "$field = ?";
                    $params[] = $data[$field];
                }
            }
        }

        if (empty($fields)) return false;

        $params[] = $userId;
        $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?";
        $this->db->query($sql, $params);
        return true;
    }

    /**
     * Update user online status
     */
    public function updateStatus(int $userId, string $status): void {
        $this->db->query(
            "UPDATE users SET status = ?, last_seen = NOW() WHERE id = ?",
            [$status, $userId]
        );
    }

    /**
     * Search users by username or phone number
     * Implements normalized phone search
     */
    public function search(string $query, int $currentUserId, int $limit = 20): array {
        $query = trim($query);
        if (empty($query)) return [];

        // Normalize for phone search
        $phoneNormalized = Sanitizer::normalizePhone($query);
        $likeQuery = '%' . $query . '%';
        $phoneLike = '%' . $phoneNormalized . '%';

        $stmt = $this->db->query(
            "SELECT id, username, display_name, avatar_url, about, status, last_seen
             FROM users
             WHERE id != ?
               AND (
                   username LIKE ?
                   OR display_name LIKE ?
                   OR phone LIKE ?
                   OR phone_normalized LIKE ?
               )
             ORDER BY
                CASE
                    WHEN username = ? THEN 0
                    WHEN username LIKE ? THEN 1
                    ELSE 2
                END
             LIMIT ?",
            [
                $currentUserId,
                $likeQuery,
                $likeQuery,
                $likeQuery,
                $phoneLike,
                $query,
                $query . '%',
                $limit,
            ]
        );

        return $stmt->fetchAll();
    }

    /**
     * Get user status info (online, last_seen)
     */
    public function getStatus(int $userId): ?array {
        $stmt = $this->db->query(
            "SELECT status, last_seen FROM users WHERE id = ?",
            [$userId]
        );
        $result = $stmt->fetch();
        return $result ?: null;
    }

    /**
     * Check if username is taken
     */
    public function isUsernameTaken(string $username): bool {
        $stmt = $this->db->query(
            "SELECT COUNT(*) as count FROM users WHERE username = ?",
            [strtolower(trim($username))]
        );
        return $stmt->fetch()['count'] > 0;
    }

    /**
     * Check if email is taken
     */
    public function isEmailTaken(string $email): bool {
        $stmt = $this->db->query(
            "SELECT COUNT(*) as count FROM users WHERE email = ?",
            [strtolower(trim($email))]
        );
        return $stmt->fetch()['count'] > 0;
    }
}
