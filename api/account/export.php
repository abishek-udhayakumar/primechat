<?php
/**
 * GET /api/account/export.php
 * Exports user data as a JSON file
 */
require_once __DIR__ . '/../../bootstrap.php';
Response::requireMethod('GET');

$auth = new Auth();
$user = $auth->getCurrentUser();
if (!$user) {
    Response::error('Unauthorized', 401);
}

$db = Database::getInstance();

// Gather data
$exportData = [
    'profile' => [
        'id' => $user['id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'phone' => $user['phone'],
        'display_name' => $user['display_name'],
        'about' => $user['about'],
        'created_at' => $user['created_at'],
        'preferences' => $user['preferences'],
    ],
    'contacts' => [],
    'devices' => []
];

// Fetch recent contacts
$convModel = new Conversation();
$conversations = $convModel->getListForUser((int)$user['id']);
foreach ($conversations as $c) {
    if ($c['other_user_id']) {
        $exportData['contacts'][] = [
            'username' => $c['other_username'],
            'display_name' => $c['other_display_name'],
        ];
    }
}

// Fetch active sessions
$stmt = $db->query("SELECT user_agent, ip_address, created_at, last_active FROM user_sessions WHERE user_id = ?", [$user['id']]);
$exportData['devices'] = $stmt->fetchAll();

$json = json_encode($exportData, JSON_PRETTY_PRINT);
$filename = 'primechat_export_' . $user['username'] . '_' . date('Ymd_His') . '.json';

header('Content-Type: application/json');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . strlen($json));

echo $json;
exit;
