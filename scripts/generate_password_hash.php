<?php
/**
 * Make a password hash on your own computer, for pasting into phpMyAdmin:
 *   php scripts/generate_password_hash.php "a-strong-password"
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Run this from the command line.\n"); }
$password = $argv[1] ?? '';
if (strlen($password) < 8) { fwrite(STDERR, "Give a password of 8+ characters.\n"); exit(1); }
echo password_hash($password, PASSWORD_DEFAULT), "\n";
