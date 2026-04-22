<?php
/**
 * GET /api/chat/conversations.php
 * List all conversations for the current user
 * Sorted by latest message, includes unread counts
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();
session_write_close(); // Release session lock early

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
        'i'  => $conv['conversation_id'], // id
        't'  => $conv['type'],            // type
        'u'  => [                         // user
            'i'  => $conv['other_user_id'],
            'u'  => $conv['other_username'],
            'n'  => $conv['other_display_name'],
            'a'  => $conv['other_avatar_url'],
            's'  => $conv['other_status'],
            'l'  => $conv['other_last_seen'],
        ],
        'm'  => [                         // message
            'i'  => $conv['last_message_id'],
            'c'  => $lastMessagePreview,
            'ty' => $conv['last_message_type'],
            'si' => $conv['last_message_sender_id'],
            'im' => (int)$conv['last_message_sender_id'] === $userId,
            'tm' => $conv['last_message_time'],
        ],
        'uc' => (int) $conv['unread_count'], // unread_count
    ];
}

Response::success(['cs' => $formatted]);
