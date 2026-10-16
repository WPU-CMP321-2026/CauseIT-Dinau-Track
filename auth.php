<?php
/**
 * Sign-in helpers. Include at the very top of every page and endpoint.
 * One person (Iven) signs in; there are no roles or approvals.
 */
const SESSION_DAYS = 14;

if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.gc_maxlifetime', (string) (SESSION_DAYS * 86400));
    session_set_cookie_params([
        'lifetime' => SESSION_DAYS * 86400,   // stay signed in on Iven's phone
        'path'     => '/',
        'secure'   => !empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** Baseline browser protections for every response. */
function security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; "
         . "style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
}

/** Keep signed-in pages out of the back/forward cache (stale CSRF tokens). */
function no_store_headers(): void
{
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
}

function is_logged_in(): bool
{
    return !empty($_SESSION['user_id']);
}

function current_user(): ?string
{
    return $_SESSION['username'] ?? null;
}

/** Pages redirect to login.php; API calls get a 401 JSON reply. */
function require_login(bool $isApi = false): void
{
    if (is_logged_in()) {
        return;
    }
    if ($isApi) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Please sign in again.']);
        exit;
    }
    header('Location: login.php');
    exit;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_check(?string $token): bool
{
    return is_string($token)
        && !empty($_SESSION['csrf_token'])
        && hash_equals($_SESSION['csrf_token'], $token);
}

function logout(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}
