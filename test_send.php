<?php
require 'includes/bootstrap.php';
$chat = new Chat();
// Let's create dummy users if they don't exist, or just use 1 and 2.
$db = Database::getInstance();
$db->query("INSERT IGNORE INTO users (id, username, email, password_hash, display_name) VALUES (1, 'u1', 'u1@ex.com', 'a', 'U1'), (2, 'u2', 'u2@ex.com', 'b', 'U2')");

$res = $chat->sendMessage(1, 2, 'hello', 'text', null, 'test_id_123');
print_r($res);
echo "\n---\n";
$res2 = $chat->sendMessage(1, 2, 'hello', 'text', null, 'test_id_123');
print_r($res2);
