<?php
/**
 * Create or reset a sign-in.
 *   php scripts/create_user.php iven "a-strong-password"
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Run this from the command line.\n"); }
require __DIR__ . '/../config.php';

[$script, $username, $password] = array_pad($argv, 3, '');
if ($username === '' || strlen($password) < 8) {
    fwrite(STDERR, "Usage: php scripts/create_user.php <username> <password of 8+ characters>\n");
    exit(1);
}
try {
    $stmt = db_connect()->prepare(
        'INSERT INTO users (username, password_hash) VALUES (:u, :p)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)'
    );
    $stmt->execute([':u' => $username, ':p' => password_hash($password, PASSWORD_DEFAULT)]);
    echo "Sign-in '{$username}' saved.\n";
} catch (PDOException $e) {
    fwrite(STDERR, 'Failed: ' . $e->getMessage() . "\nHave you run scripts/setup.php?\n");
    exit(1);
}
