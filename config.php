<?php
/**
 * Database settings + timezone. Everything reads its settings from here.
 *
 * Put your real credentials in config.local.php (copy config.local.example.php).
 * That file is never committed and is blocked from web access by .htaccess.
 * Environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS) also work.
 */
$localConfig = __DIR__ . '/config.local.php';
if (is_file($localConfig)) {
    require_once $localConfig;
}

if (!defined('DB_HOST')) define('DB_HOST', getenv('DB_HOST') ?: '127.0.0.1');
if (!defined('DB_PORT')) define('DB_PORT', (int) (getenv('DB_PORT') ?: 3306));
if (!defined('DB_NAME')) define('DB_NAME', getenv('DB_NAME') ?: 'dinau-db');
if (!defined('DB_USER')) define('DB_USER', getenv('DB_USER') ?: 'root');
if (!defined('DB_PASS')) define('DB_PASS', getenv('DB_PASS') === false ? '' : getenv('DB_PASS'));

// Dates are stamped in Port Moresby time, whatever timezone the host uses.
if (!defined('APP_TZ')) define('APP_TZ', 'Pacific/Port_Moresby');
date_default_timezone_set(APP_TZ);

function db_dsn(): string
{
    return 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
}

/** One PDO factory for the whole app: exceptions on error, assoc rows, real prepares. */
function db_connect(): PDO
{
    return new PDO(db_dsn(), DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}
