<?php
/**
 * PrimeChat — WebSocket Server
 * Ratchet-based real-time messaging server.
 * Usage: php ws/server.php [port=8080]
 */

require __DIR__ . '/../vendor/autoload.php';

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;
use Ratchet\Server\IoServer;
use Ratchet\Http\HttpServer;
use Ratchet\WebSocket\WsServer;

// ── Bootstrap environment ──
if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
    $dotenv->load();
}

require_once __DIR__ . '/../config/app.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/Logger.php';
require_once __DIR__ . '/../includes/Sanitizer.php';
require_once __DIR__ . '/../includes/User.php';
require_once __DIR__ . '/../includes/Conversation.php';
require_once __DIR__ . '/../includes/Message.php';
require_once __DIR__ . '/../includes/Chat.php';
require_once __DIR__ . '/../includes/JwtManager.php';

/**
 * PrimeChat WebSocket Handler
 */
class PrimeChatWs implements MessageComponentInterface {
    /** @var \SplObjectStorage<ConnectionInterface> */
    protected \SplObjectStorage $clients;

    /** @var array<int, array{conn: ConnectionInterface, userId: int, username: string, conversations: array<int, bool>}> */
    protected array $userConnections = [];

    /** @var array<int, array<int, array<int, bool>>> conversation => [userId => true] */
    protected array $conversationSubscribers = [];

    protected Chat $chat;
    protected Conversation $convModel;
    protected Message $msgModel;
    protected Database $db;

    /** @var array<int, int[]> conversation_id => [last_checked_message_id] */
    protected array $lastCheckedId = [];

    /** @var array<string, int[]> IP => [timestamps] for rate limiting */
    protected array $connectionRateLimit = [];

    /** @var array<int, int> userId => connection count */
    protected array $userConnectionCount = [];

    /** @var array<int, int[]> userId => [timestamps] for message rate limiting */
    protected array $messageRateLimit = [];

    private const MAX_CONNECTIONS_PER_IP = 10;
    private const MAX_CONNECTIONS_PER_USER = 3;
    private const RATE_LIMIT_WINDOW = 60; // seconds
    private const MAX_CONNECTIONS_PER_WINDOW = 20;
    private const MAX_MESSAGES_PER_WINDOW = 30;

    public function __construct() {
        $this->clients = new \SplObjectStorage();
        $this->chat = new Chat();
        $this->convModel = new Conversation();
        $this->msgModel = new Message();
        $this->db = Database::getInstance();
        echo "[PrimeChat WS] Server initialized\n";
    }

    public function onOpen(ConnectionInterface $conn): void {
        $this->clients->attach($conn);

        // Rate limit connections by IP
        $ip = $conn->remoteAddress ?? '0.0.0.0';
        if (!$this->checkConnectionRateLimit($ip)) {
            echo "[PrimeChat WS] Connection rejected: rate limit exceeded for IP $ip\n";
            $conn->send(json_encode(['type' => 'error', 'message' => 'Rate limit exceeded']));
            $conn->close();
            return;
        }

        // Parse query string for auth token
        $queryString = $conn->httpRequest->getUri()->getQuery();
        parse_str($queryString, $params);
        $sessionId = $params['session_id'] ?? $params['token'] ?? '';

        if (empty($sessionId)) {
            echo "[PrimeChat WS] Connection rejected: no session_id\n";
            $conn->send(json_encode(['type' => 'error', 'message' => 'Authentication required']));
            $conn->close();
            return;
        }

        // Authenticate via PHP session
        $userId = $this->authenticateSession($sessionId);
        if (!$userId) {
            echo "[PrimeChat WS] Connection rejected: invalid session\n";
            $conn->send(json_encode(['type' => 'error', 'message' => 'Invalid session']));
            $conn->close();
            return;
        }

        // Get user info
        $userModel = new User();
        $user = $userModel->findById($userId);
        if (!$user) {
            $conn->close();
            return;
        }

        // Check user connection limit
        if (!isset($this->userConnectionCount[$userId])) {
            $this->userConnectionCount[$userId] = 0;
        }
        if ($this->userConnectionCount[$userId] >= self::MAX_CONNECTIONS_PER_USER) {
            echo "[PrimeChat WS] Connection rejected: max connections for user $userId\n";
            $conn->send(json_encode(['type' => 'error', 'message' => 'Maximum connections reached']));
            $conn->close();
            return;
        }
        $this->userConnectionCount[$userId]++;

        $conn->userId = $userId;
        $conn->username = $user['username'];
        $conn->conversations = [];

        $this->userConnections[$userId] = [
            'conn' => $conn,
            'userId' => $userId,
            'username' => $user['username'],
            'conversations' => [],
        ];

        // Set user online
        $userModel->updateStatus($userId, 'online');

        echo "[PrimeChat WS] User {$user['username']} (ID: $userId) connected\n";

        // Send welcome message
        $conn->send(json_encode([
            'type' => 'connected',
            'user_id' => $userId,
            'username' => $user['username'],
        ]));

        // Broadcast online status to relevant conversations
        $this->broadcastUserStatus($userId, 'online');
    }

    public function onMessage(ConnectionInterface $from, $msg): void {
        $data = json_decode($msg, true);
        if (!$data || !isset($data['type'])) return;

        $userId = $from->userId ?? null;
        if (!$userId) return;

        switch ($data['type']) {
            case 'subscribe':
                $this->handleSubscribe($from, $data);
                break;

            case 'unsubscribe':
                $this->handleUnsubscribe($from, $data);
                break;

            case 'send':
                $this->handleSend($from, $data);
                break;

            case 'typing':
                $this->handleTyping($from, $data);
                break;

            case 'read':
                $this->handleRead($from, $data);
                break;

            case 'ping':
                $from->send(json_encode(['type' => 'pong']));
                break;
        }
    }

    public function onClose(ConnectionInterface $conn): void {
        $this->clients->detach($conn);

        $userId = $conn->userId ?? null;
        if ($userId) {
            unset($this->userConnections[$userId]);

            // Decrement connection count
            if (isset($this->userConnectionCount[$userId])) {
                $this->userConnectionCount[$userId]--;
                if ($this->userConnectionCount[$userId] <= 0) {
                    unset($this->userConnectionCount[$userId]);
                }
            }

            // Unsubscribe from all conversations
            foreach ($conn->conversations as $convId => $true) {
                unset($this->conversationSubscribers[$convId][$userId]);
            }

            // Check if user has other connections
            $hasOtherConnections = false;
            foreach ($this->clients as $client) {
                if (isset($client->userId) && $client->userId === $userId) {
                    $hasOtherConnections = true;
                    break;
                }
            }

            if (!$hasOtherConnections) {
                $userModel = new User();
                $userModel->updateStatus($userId, 'offline');
                $this->broadcastUserStatus($userId, 'offline');
            }

            echo "[PrimeChat WS] User ID $userId disconnected\n";
        }
    }

    public function onError(ConnectionInterface $conn, \Exception $e): void {
        echo "[PrimeChat WS] Error: {$e->getMessage()}\n";
        $conn->close();
    }

    // ── Authentication ──

    private function authenticateSession(string $sessionId): ?int {
        // Try JWT first if configured
        if (JwtManager::isConfigured()) {
            $userId = JwtManager::getUserIdFromToken($sessionId);
            if ($userId !== null) {
                return $userId;
            }
        }

        // Fall back to session file reading
        $sessionFile = session_save_path() ?: '/tmp';
        $sessionFile .= '/sess_' . $sessionId;

        if (!file_exists($sessionFile)) {
            return null;
        }

        $sessionData = file_get_contents($sessionFile);
        if (!$sessionData) return null;

        // Parse PHP session format
        $decoded = $this->decodeSession($sessionData);
        return $decoded['user_id'] ?? null;
    }

    private function decodeSession(string $data): array {
        $result = [];
        $offset = 0;
        $length = strlen($data);

        while ($offset < $length) {
            // Find the end of the key
            $keyEnd = strpos($data, '|', $offset);
            if ($keyEnd === false) break;

            $key = substr($data, $offset, $keyEnd - $offset);
            $offset = $keyEnd + 1;

            if ($offset >= $length) break;

            $type = $data[$offset];
            $offset++;

            switch ($type) {
                case 's': // String
                    if (preg_match('/^:(\d+):"/', substr($data, $offset), $m)) {
                        $strLen = (int)$m[1];
                        $offset += strlen($m[0]);
                        $value = substr($data, $offset, $strLen);
                        $offset += $strLen + 2; // skip closing quote + semicolon
                        $result[$key] = $value;
                    }
                    break;

                case 'i': // Integer
                    if (preg_match('/^:(-?\d+);/', substr($data, $offset), $m)) {
                        $result[$key] = (int)$m[1];
                        $offset += strlen($m[0]);
                    }
                    break;

                case 'b': // Boolean
                    if (preg_match('/^:([01]);/', substr($data, $offset), $m)) {
                        $result[$key] = (bool)$m[1];
                        $offset += strlen($m[0]);
                    }
                    break;

                case 'N': // Null
                    $result[$key] = null;
                    $offset++;
                    break;

                default:
                    // Skip unknown types
                    $offset++;
                    break;
            }
        }

        return $result;
    }

    // ── Message Handlers ──

    private function handleSubscribe(ConnectionInterface $conn, array $data): void {
        $convId = (int)($data['conversation_id'] ?? 0);
        $userId = $conn->userId;

        if ($convId <= 0) return;

        // Verify participant
        if (!$this->convModel->isParticipant($convId, $userId)) {
            $conn->send(json_encode(['type' => 'error', 'message' => 'Access denied']));
            return;
        }

        $conn->conversations[$convId] = true;
        $this->conversationSubscribers[$convId][$userId] = true;

        echo "[PrimeChat WS] User $userId subscribed to conversation $convId\n";

        $conn->send(json_encode([
            'type' => 'subscribed',
            'conversation_id' => $convId,
        ]));
    }

    private function handleUnsubscribe(ConnectionInterface $conn, array $data): void {
        $convId = (int)($data['conversation_id'] ?? 0);
        $userId = $conn->userId;

        unset($conn->conversations[$convId]);
        unset($this->conversationSubscribers[$convId][$userId]);
    }

    private function handleSend(ConnectionInterface $from, array $data): void {
        $userId = $from->userId;
        $convId = (int)($data['conversation_id'] ?? 0);
        $content = Sanitizer::sanitizeMessage($data['content'] ?? '');
        $type = in_array($data['type'] ?? 'text', ['text', 'image', 'file', 'voice']) ? ($data['type'] ?? 'text') : 'text';
        $replyToId = isset($data['reply_to_id']) ? (int)$data['reply_to_id'] : null;
        $clientMsgId = $data['client_msg_id'] ?? null;

        // Check message rate limit
        if (!$this->checkMessageRateLimit($userId)) {
            $from->send(json_encode(['type' => 'error', 'message' => 'Rate limit exceeded. Please slow down.']));
            return;
        }

        if (empty($content) && $type === 'text') {
            $from->send(json_encode(['type' => 'error', 'message' => 'Message cannot be empty']));
            return;
        }

        if ($convId <= 0) {
            $from->send(json_encode(['type' => 'error', 'message' => 'conversation_id required']));
            return;
        }

        // Send message through the existing Chat engine
        $result = $this->chat->sendToConversation($userId, $convId, $content, $type, $replyToId, null, $clientMsgId);

        if (!$result['success']) {
            $from->send(json_encode(['type' => 'error', 'message' => $result['error'] ?? 'Failed']));
            return;
        }

        // Fetch the formatted message
        $msg = $this->msgModel->findByIdFull($result['message_id']);
        if ($msg) {
            $formatted = Message::formatShorthand($msg, $userId);
            $payload = json_encode([
                'type' => 'new_message',
                'conversation_id' => $convId,
                'message' => $formatted,
                'sender_id' => $userId,
            ]);

            // Broadcast to all subscribers of this conversation
            $this->broadcastToConversation($convId, $payload, $userId);
        }
    }

    private function handleTyping(ConnectionInterface $from, array $data): void {
        $userId = $from->userId;
        $convId = (int)($data['conversation_id'] ?? 0);
        $isTyping = !empty($data['is_typing']);

        if ($convId <= 0) return;

        if ($isTyping) {
            $this->chat->setTyping($userId, $convId);
        } else {
            $this->chat->clearTyping($userId, $convId);
        }

        $payload = json_encode([
            'type' => 'typing',
            'conversation_id' => $convId,
            'user_id' => $userId,
            'is_typing' => $isTyping,
        ]);

        $this->broadcastToConversation($convId, $payload, $userId);
    }

    private function handleRead(ConnectionInterface $from, array $data): void {
        $userId = $from->userId;
        $convId = (int)($data['conversation_id'] ?? 0);
        $messageId = (int)($data['message_id'] ?? 0);

        if ($convId <= 0 || $messageId <= 0) return;

        $this->chat->markAsRead($convId, $userId, $messageId);

        $payload = json_encode([
            'type' => 'read_receipt',
            'conversation_id' => $convId,
            'user_id' => $userId,
            'last_read_id' => $messageId,
        ]);

        $this->broadcastToConversation($convId, $payload, $userId);
    }

    // ── Broadcasting ──

    private function broadcastToConversation(int $convId, string $payload, ?int $excludeUserId = null): void {
        if (!isset($this->conversationSubscribers[$convId])) return;

        foreach ($this->conversationSubscribers[$convId] as $subUserId => $true) {
            if ($excludeUserId !== null && $subUserId === $excludeUserId) continue;

            if (isset($this->userConnections[$subUserId])) {
                try {
                    $this->userConnections[$subUserId]['conn']->send($payload);
                } catch (\Exception $e) {
                    echo "[PrimeChat WS] Broadcast error: {$e->getMessage()}\n";
                }
            }
        }
    }

    private function broadcastUserStatus(int $userId, string $status): void {
        // Build list of conversation IDs this user belongs to from subscriber data
        // This avoids the O(N) database query per user
        $payload = json_encode([
            'type' => 'status',
            'user_id' => $userId,
            'status' => $status,
            'last_seen' => $status === 'offline' ? date('Y-m-d H:i:s') : null,
        ]);

        $broadcastConvs = [];

        // Find conversations where this user is a participant via subscriber data
        foreach ($this->conversationSubscribers as $convId => $subscribers) {
            if (isset($subscribers[$userId])) {
                $broadcastConvs[$convId] = true;
            }
        }

        // Also check via database if user has conversations not yet subscribed
        try {
            $convs = $this->convModel->getListForUser($userId, 100, 0);
            foreach ($convs as $conv) {
                $broadcastConvs[$conv['conversation_id']] = true;
            }
        } catch (\Exception $e) {
            // Ignore database errors for broadcast
        }

        foreach ($broadcastConvs as $convId => $true) {
            if (!isset($this->conversationSubscribers[$convId])) continue;

            foreach ($this->conversationSubscribers[$convId] as $subUserId => $true) {
                if ($subUserId === $userId) continue;
                if (isset($this->userConnections[$subUserId])) {
                    try {
                        $this->userConnections[$subUserId]['conn']->send($payload);
                    } catch (\Exception $e) {
                    }
                }
            }
        }
    }

    /**
     * Check for new messages from REST API (non-WebSocket sends).
     * Called periodically from the event loop.
     */
    public function checkForNewMessages(): void {
        foreach ($this->conversationSubscribers as $convId => $subscribers) {
            if (empty($subscribers)) continue;

            $lastId = $this->lastCheckedId[$convId] ?? 0;

            try {
                // Fetch only new messages since last check (no user-specific filtering)
                $stmt = $this->db->query(
                    "SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type,
                            m.reply_to_id, m.forwarded_from_id, m.is_edited,
                            m.is_deleted_for_everyone, m.client_msg_id, m.created_at, m.updated_at,
                            u.username AS sender_username,
                            u.display_name AS sender_display_name,
                            u.avatar_url AS sender_avatar_url,
                            reply_msg.content AS reply_content,
                            reply_msg.sender_id AS reply_sender_id,
                            reply_user.display_name AS reply_sender_name,
                            reply_msg.type AS reply_type,
                            att.id AS attachment_id,
                            att.file_name AS attachment_file_name,
                            att.file_path AS attachment_file_path,
                            att.file_type AS attachment_file_type,
                            att.file_size AS attachment_file_size,
                            att.width AS attachment_width,
                            att.height AS attachment_height,
                            att.duration AS attachment_duration
                     FROM messages m
                     INNER JOIN users u ON u.id = m.sender_id
                     LEFT JOIN messages reply_msg ON reply_msg.id = m.reply_to_id
                     LEFT JOIN users reply_user ON reply_user.id = reply_msg.sender_id
                     LEFT JOIN attachments att ON att.message_id = m.id
                     WHERE m.conversation_id = ? AND m.id > ?
                     ORDER BY m.id ASC
                     LIMIT 50",
                    [$convId, $lastId]
                );

                $messages = $stmt->fetchAll();
                if (!empty($messages)) {
                    foreach ($messages as $msg) {
                        $formatted = Message::formatShorthand($msg, (int)$msg['sender_id']);
                        $payload = json_encode([
                            'type' => 'new_message',
                            'conversation_id' => $convId,
                            'message' => $formatted,
                            'sender_id' => (int)$msg['sender_id'],
                        ]);
                        $this->broadcastToConversation($convId, $payload);
                    }
                    $this->lastCheckedId[$convId] = (int)$messages[count($messages) - 1]['id'];
                }
            } catch (\Exception $e) {
                echo "[PrimeChat WS] Check messages error: {$e->getMessage()}\n";
            }
        }
    }

    // ── Rate Limiting ──

    private function checkConnectionRateLimit(string $ip): bool {
        $now = time();
        if (!isset($this->connectionRateLimit[$ip])) {
            $this->connectionRateLimit[$ip] = [];
        }

        // Clean old entries
        $this->connectionRateLimit[$ip] = array_filter(
            $this->connectionRateLimit[$ip],
            fn($ts) => $ts > $now - self::RATE_LIMIT_WINDOW
        );

        if (count($this->connectionRateLimit[$ip]) >= self::MAX_CONNECTIONS_PER_WINDOW) {
            return false;
        }

        $this->connectionRateLimit[$ip][] = $now;
        return true;
    }

    private function checkMessageRateLimit(int $userId): bool {
        $now = time();
        if (!isset($this->messageRateLimit[$userId])) {
            $this->messageRateLimit[$userId] = [];
        }

        // Clean old entries
        $this->messageRateLimit[$userId] = array_filter(
            $this->messageRateLimit[$userId],
            fn($ts) => $ts > $now - self::RATE_LIMIT_WINDOW
        );

        if (count($this->messageRateLimit[$userId]) >= self::MAX_MESSAGES_PER_WINDOW) {
            return false;
        }

        $this->messageRateLimit[$userId][] = $now;
        return true;
    }
}

// ── Server Setup ──

$port = (int)($argv[1] ?? 8080);

echo "=== PrimeChat WebSocket Server ===\n";
echo "Starting on port $port...\n";

$wsHandler = new PrimeChatWs();

$loop = \React\EventLoop\Loop::get();

// Periodically check for new messages from REST API
$loop->addPeriodicTimer(2, function () use ($wsHandler) {
    $wsHandler->checkForNewMessages();
});

// Set up WebSocket server with the shared loop
$webSock = new \React\Socket\Server('0.0.0.0:' . $port, $loop);
$server = new IoServer(
    new HttpServer(
        new WsServer($wsHandler)
    ),
    $webSock,
    $loop
);

echo "[PrimeChat WS] Server running on ws://0.0.0.0:$port\n";
$server->run();
