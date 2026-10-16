<?php
/** Shared start-up for every endpoint in /api. */
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../config.php';

security_headers();
header('Content-Type: application/json');
header('Cache-Control: no-store');

require_login(true);

function json_input(): array
{
    $raw = file_get_contents('php://input');
    $data = ($raw === false || $raw === '') ? [] : json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** @param mixed $data */
function respond($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function respond_error(string $message, int $status = 400, ?string $field = null): void
{
    respond(['error' => $message, 'field' => $field], $status);
}

/** Every change must carry the session's CSRF token. */
function require_csrf(): void
{
    if (!csrf_check($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
        respond_error('Your page is out of date. Please reload it.', 403);
    }
}

try {
    $pdo = db_connect();
} catch (PDOException $e) {
    respond_error('Cannot reach the database right now. Please try again.', 503);
}
