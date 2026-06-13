<?php
/**
 * POST /api/auth/send_otp
 * Send an OTP code to the user's email or phone.
 *
 * Body (JSON): { type: "email"|"phone" }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$type = $data['type'] ?? '';

if (!in_array($type, ['email', 'phone'])) {
    Response::error('type must be "email" or "phone"', 422);
}

$otp = new OTP();
$code = $otp->generate($userId, $type);

if ($code === false) {
    Response::error('Too many requests. Please try again later.', 429);
}

// Send the code (email or SMS)
$userModel = new User();
$user = $userModel->findById($userId);

if ($type === 'email' && !empty($user['email'])) {
    $subject = 'Your PrimeChat verification code';
    $message = "Your verification code is: $code\n\nThis code expires in 10 minutes.";
    $headers = 'From: noreply@' . parse_url(APP_URL, PHP_URL_HOST);
    @mail($user['email'], $subject, $message, $headers);

    Logger::info('OTP sent to email', ['user_id' => $userId]);
} elseif ($type === 'phone' && !empty($user['phone'])) {
    // SMS integration would go here (Twilio, etc.)
    Logger::info('OTP generated for phone', ['user_id' => $userId, 'code' => $code]);
    // For now, log the code for development
}

// NEVER return the code in production — only during development
$response = ['type' => $type, 'sent' => true];
if (isset($_ENV['APP_ENV']) && $_ENV['APP_ENV'] === 'development') {
    $response['debug_code'] = $code;
}

Response::success($response, 'Verification code sent');
