<?php
/**
 * Local setup: creates the database (if allowed) and the tables from schema.sql.
 *   php scripts/setup.php
 * On shared hosting, import schema.sql with phpMyAdmin instead.
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Run this from the command line.\n"); }
require __DIR__ . '/../config.php';

try {
    $server = new PDO('mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4', DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $server->exec('CREATE DATABASE IF NOT EXISTS `' . str_replace('`', '``', DB_NAME) . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

    $pdo = db_connect();
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents(__DIR__ . '/../schema.sql'));
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
        $pdo->exec($statement);
    }
    echo "Database '" . DB_NAME . "' is ready.\n";
    echo "Next: php scripts/create_user.php iven \"a-strong-password\"\n";
} catch (PDOException $e) {
    fwrite(STDERR, 'Setup failed: ' . $e->getMessage() . "\n");
    exit(1);
}
