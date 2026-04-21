<?php
/**
 * GET /api/chat/conversations.php
 * List all conversations for the current user
 * Sorted by latest message, includes unread counts
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();

// Update user online status (heartbeat)
(new User())->updateStatus($userId, 'online');

$convModel = new Conversation();
$conversations = $convModel->getListForUser($userId);

// Format conversation data for frontend
$formatted = [];
foreach ($conversations as $conv) {
    $lastMessagePreview = $conv['last_message_content'];
    if ($conv['last_message_deleted']) {
        $lastMessagePreview = '🚫 This message was deleted';
    } elseif ($conv['last_message_type'] === 'image') {
        $lastMessagePreview = '📷 Photo';
    } elseif ($conv['last_message_type'] === 'file') {
        $lastMessagePreview = '📎 File';
    } elseif ($conv['last_message_type'] === 'voice') {
        $lastMessagePreview = '🎤 Voice message';
    }

    $formatted[] = [
        'conversation_id'    => $conv['conversation_id'],
        'type'               => $conv['type'],
        'other_user'         => [
            'id'           => $conv['other_user_id'],
            'username'     => $conv['other_username'],
            'display_name' => $conv['other_display_name'],
            'avatar_url'   => $conv['other_avatar_url'],
            'status'       => $conv['other_status'],
            'last_seen'    => $conv['other_last_seen'],
        ],
        'last_message'       => [
            'id'        => $conv['last_message_id'],
            'content'   => $lastMessagePreview,
            'type'      => $conv['last_message_type'],
            'sender_id' => $conv['last_message_sender_id'],
            'is_mine'   => (int)$conv['last_message_sender_id'] === $userId,
            'time'      => $conv['last_message_time'],
        ],
        'unread_count'       => (int) $conv['unread_count'],
    ];
}

Response::success(['conversations' => $formatted]);
