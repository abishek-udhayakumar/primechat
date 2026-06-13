<?php
/**
 * POST /api/auth/verify_otp
 * Verify an OTP code sent to email or phone.
 *
 * Body (JSON): { type: "email"|"phone", code: "123456" }
 */
require_once __DIR__ . '/../bootstrap.php';
Response::requireMethod('POST');

$userId = requireAuth();
$data = Response::getJsonBody();

$type = $data['type'] ?? '';
$code = Sanitizer::trimInput($data['code'] ?? '');

if (!in_array($type, ['email', 'phone'])) {
    Response::error('type must be "email" or "phone"', 422);
}

if (!preg_match('/^\d{6}$/', $code)) {
    Response::error('Invalid code format (6 digits required)', 422);
}

$otp = new OTP();
$verified = $otp->verify($userId, $type, $code);

if (!$verified) {
    Response::error('Invalid or expired verification code', 422);
}

// Regenerate session ID after privilege escalation (email/phone verified)
$auth = new Auth();
$auth->regenerateSession();

Response::success([
    'type' => $type,
    'verified' => true,
], ucfirst($type) . ' verified successfully');
