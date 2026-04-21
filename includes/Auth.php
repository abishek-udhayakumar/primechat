<?php
/**
 * PrimeChat — Auth Helper
 * Handles login, signup, session management
 */

class Auth {
    private Database $db;
    private User $userModel;

    public function __construct() {
        $this->db = Database::getInstance();
        $this->userModel = new User();
    }

    /**
     * Register a new user
     * Returns user ID on success, throws on validation errors
     */
    public function register(array $data): array {
        $errors = [];

        // Validate required fields
        $missing = Sanitizer::validateRequired($data, ['username', 'email', 'password', 'display_name']);
        if (!empty($missing)) {
            $errors[] = 'Missing required fields: ' . implode(', ', $missing);
        }

        // Validate username
        $username = Sanitizer::trimInput($data['username'] ?? '');
        if (!Sanitizer::isValidUsername($username)) {
            $errors[] = 'Username must be 3-50 characters, alphanumeric and underscores only';
        } elseif ($this->userModel->isUsernameTaken($username)) {
            $errors[] = 'Username is already taken';
        }

        // Validate email
        $email = Sanitizer::trimInput($data['email'] ?? '');
        if (!Sanitizer::isValidEmail($email)) {
            $errors[] = 'Invalid email address';
        } elseif ($this->userModel->isEmailTaken($email)) {
            $errors[] = 'Email is already registered';
        }

        // Validate password
        $password = $data['password'] ?? '';
        if (!Sanitizer::isValidPassword($password)) {
            $errors[] = 'Password must be at least 6 characters';
        }

        // Validate phone (optional)
        $phone = Sanitizer::trimInput($data['phone'] ?? '');
        if (!empty($phone) && !Sanitizer::isValidPhone($phone)) {
            $errors[] = 'Invalid phone number';
        }

        if (!empty($errors)) {
            return ['success' => false, 'errors' => $errors];
        }

        // Create user
        $userId = $this->userModel->create([
            'username'     => $username,
            'email'        => $email,
            'password'     => $password,
            'display_name' => Sanitizer::trimInput($data['display_name']),
            'phone'        => $phone ?: null,
        ]);

        // Auto-login after registration
        $this->createSession($userId, $username);

        return [
            'success' => true,
            'user_id' => $userId,
            'username' => $username,
        ];
    }

    /**
     * Login with email/username and password
     */
    public function login(string $identifier, string $password): array {
        $identifier = Sanitizer::trimInput($identifier);

        if (empty($identifier) || empty($password)) {
            return ['success' => false, 'error' => 'Email/username and password are required'];
        }

        // Try email first, then username
        $user = null;
        if (Sanitizer::isValidEmail($identifier)) {
            $user = $this->userModel->findByEmail($identifier);
        }
        if (!$user) {
            $user = $this->userModel->findByUsername($identifier);
        }

        if (!$user) {
            return ['success' => false, 'error' => 'Invalid credentials'];
        }

        // Verify password
        if (!password_verify($password, $user['password_hash'])) {
            return ['success' => false, 'error' => 'Invalid credentials'];
        }

        // Create session
        $this->createSession((int)$user['id'], $user['username']);

        // Update status to online
        $this->userModel->updateStatus((int)$user['id'], 'online');

        return [
            'success'  => true,
            'user_id'  => $user['id'],
            'username' => $user['username'],
        ];
    }

    /**
     * Logout — destroy session and set user offline
     */
    public function logout(): void {
        $userId = getCurrentUserId();
        if ($userId) {
            $this->userModel->updateStatus($userId, 'offline');
        }

        $_SESSION = [];

        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(), '', time() - 42000,
                $params['path'], $params['domain'],
                $params['secure'], $params['httponly']
            );
        }

        session_destroy();
    }

    /**
     * Get current authenticated user data
     */
    public function getCurrentUser(): ?array {
        $userId = getCurrentUserId();
        if (!$userId) return null;

        $user = $this->userModel->findById($userId);
        if (!$user) {
            // Session exists but user not found — clear session
            $this->logout();
            return null;
        }

        return $user;
    }

    /**
     * Create a session for the user
     */
    private function createSession(int $userId, string $username): void {
        session_regenerate_id(true);
        $_SESSION['user_id']   = $userId;
        $_SESSION['username']  = $username;
        $_SESSION['_created']  = time();
        $_SESSION['ip']        = $_SERVER['REMOTE_ADDR'] ?? '';
    }
}
