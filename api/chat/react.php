<?php
/**
 * POST /api/chat/react
 * Toggle a reaction on a message.
 *
 * Body (JSON): { message_id, emoji }
 * If reaction exists, it is removed. Otherwise, it is added.
 *
 * GET /api/chat/reactions?message_id=N
 * Get all reactions for a message.
 */
require_once __DIR__ . '/../bootstrap.php';

$userId = requireAuth();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    _handleToggle($userId);
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    _handleGet($userId);
} else {
    Response::error('Method not allowed', 405);
}

function _handleToggle(int $userId): void {
    $data = Response::getJsonBody();
    $messageId = (int)($data['message_id'] ?? 0);
    $emoji = Sanitizer::trimInput($data['emoji'] ?? '');

    if ($messageId <= 0 || empty($emoji) || mb_strlen($emoji) > 10) {
        Response::error('Invalid message_id or emoji', 422);
    }

    $db = Database::getInstance();

    // Verify user has access to the message's conversation
    $stmt = $db->query(
        "SELECT m.conversation_id FROM messages m
         INNER JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
         WHERE m.id = ?",
        [$userId, $messageId]
    );
    if (!$stmt->fetch()) {
        Response::error('Access denied', 403);
    }

    // Atomic toggle: try to delete first, if nothing deleted then insert
    $db->beginTransaction();
    try {
        $deleted = $db->query(
            "DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
            [$messageId, $userId, $emoji]
        );
        $added = false;
        
        if ($deleted->rowCount() === 0) {
            // No existing reaction found — insert new one (ignore if duplicate from race)
            $db->query(
                "INSERT IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
                [$messageId, $userId, $emoji]
            );
            $added = true;
        }
        
        $db->commit();
    } catch (\Exception $e) {
        $db->rollBack();
        throw $e;
    }

    // Get conversation_id for notification
    $convStmt = $db->query("SELECT conversation_id FROM messages WHERE id = ?", [$messageId]);
    $convRow = $convStmt->fetch();
    $convId = $convRow ? (int)$convRow['conversation_id'] : 0;

    // Return updated reaction list for this message
    $reactions = _getReactionsForMessage($messageId, $userId);

    // Notify WS subscribers
    if ($convId) {
        notifyWsEvent('reaction_updated', $convId, [
            'message_id' => $messageId,
            'reactions' => $reactions,
            'user_id' => $userId,
            'emoji' => $emoji,
            'added' => $added,
        ]);
    }

    Response::success([
        'message_id' => $messageId,
        'added' => $added,
        'emoji' => $emoji,
        'reactions' => $reactions,
    ]);
}

function _handleGet(int $userId): void {
    $messageId = (int)($_GET['message_id'] ?? 0);
    if ($messageId <= 0) {
        Response::error('message_id is required', 422);
    }

    $db = Database::getInstance();

    // Verify access
    $stmt = $db->query(
        "SELECT m.conversation_id FROM messages m
         INNER JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
         WHERE m.id = ?",
        [$userId, $messageId]
    );
    if (!$stmt->fetch()) {
        Response::error('Access denied', 403);
    }

    $reactions = _getReactionsForMessage($messageId, $userId);
    Response::success(['message_id' => $messageId, 'reactions' => $reactions]);
}

function _getReactionsForMessage(int $messageId, int $currentUserId): array {
    $db = Database::getInstance();
    $stmt = $db->query(
        "SELECT mr.emoji, COUNT(*) AS count,
                GROUP_CONCAT(mr.user_id) AS user_ids,
                MAX(CASE WHEN mr.user_id = ? THEN 1 ELSE 0 END) AS user_reacted
         FROM message_reactions mr
         WHERE mr.message_id = ?
         GROUP BY mr.emoji
         ORDER BY COUNT(*) DESC, mr.emoji ASC",
        [$currentUserId, $messageId]
    );
    return $stmt->fetchAll();
}
