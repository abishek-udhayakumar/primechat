<?php
require_once __DIR__ . '/includes/bootstrap.php';
$msgModel = new Message();
// Get user ID for 'pri'
$stmt = $pdo->prepare("SELECT id FROM users WHERE username = 'pri' LIMIT 1");
$stmt->execute();
$userId = $stmt->fetchColumn();

// Get user ID for 'cybertron11'
$stmt = $pdo->prepare("SELECT id FROM users WHERE username = 'cybertron11' LIMIT 1");
$stmt->execute();
$otherId = $stmt->fetchColumn();

// Get conversation
$stmt = $pdo->prepare("SELECT id FROM conversations WHERE id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = ?) AND id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = ?) AND type = 'direct'");
$stmt->execute([$userId, $otherId]);
$convId = $stmt->fetchColumn();

echo "Conv ID: $convId\n";

if ($convId) {
    $messages = $msgModel->getForConversation($convId, $userId, null, 10, null);
    print_r($messages);
}
