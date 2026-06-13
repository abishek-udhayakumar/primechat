<?php
/**
 * GET /api/chat/conversations
 * Returns paginated conversation list for the current user.
 *
 * Query params:
 *   limit  (int, default 20, max 50)
 *   offset (int, default 0)
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('GET');

$userId = requireAuth();
session_write_close();

// Update user online status (heartbeat)
(new User())->updateStatus($userId, 'online');

$limit  = min((int) ($_GET['limit']  ?? 20), 50);
$offset = max((int) ($_GET['offset'] ?? 0),  0);

$convModel     = new Conversation();
$conversations = $convModel->getListForUser($userId, $limit + 1, $offset); // +1 to detect has_more

$hasMore = count($conversations) > $limit;
if ($hasMore) array_pop($conversations); // trim the +1 sentinel row

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

    $entry = [
        'i'  => $conv['conversation_id'],
        't'  => $conv['type'],
        'n'  => $conv['type'] === 'group' ? ($conv['conversation_name'] ?? 'Group') : null,
        'm'  => [
            'i'  => $conv['last_message_id'],
            'c'  => $lastMessagePreview,
            'ty' => $conv['last_message_type'],
            'si' => $conv['last_message_sender_id'],
            'im' => (int)$conv['last_message_sender_id'] === $userId,
            'tm' => $conv['last_message_time'],
        ],
        'uc' => (int) $conv['unread_count'],
    ];

    // Only include other_user for direct conversations
    if ($conv['type'] === 'direct') {
        $entry['u'] = [
            'i'  => $conv['other_user_id'],
            'u'  => $conv['other_username'],
            'n'  => $conv['other_display_name'],
            'a'  => $conv['other_avatar_url'],
            's'  => $conv['other_status'],
            'l'  => $conv['other_last_seen'],
        ];
    }

    $formatted[] = $entry;
}

Response::success([
    'conversations' => $formatted, // JS expects this key
    'has_more'      => $hasMore,
    'offset'        => $offset + count($formatted),
]);
