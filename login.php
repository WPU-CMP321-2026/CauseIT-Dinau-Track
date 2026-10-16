<?php
require 'auth.php';
require 'config.php';
security_headers();
no_store_headers();

if (is_logged_in()) {
    header('Location: Dinau.php');
    exit;
}

$error = '';
$username = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $lockedUntil = (int) ($_SESSION['locked_until'] ?? 0);

    if (!csrf_check($_POST['csrf_token'] ?? null)) {
        $error = 'That took too long. Please try again.';
    } elseif ($lockedUntil > time()) {
        $error = 'Too many tries. Please wait a minute and try again.';
    } elseif ($username === '' || $password === '') {
        $error = 'Enter your username and password.';
    } else {
        try {
            $pdo = db_connect();
            $stmt = $pdo->prepare('SELECT id, username, password_hash FROM users WHERE username = :u');
            $stmt->execute([':u' => $username]);
            $user = $stmt->fetch();

            if ($user && password_verify($password, $user['password_hash'])) {
                session_regenerate_id(true);   // stops session fixation
                $_SESSION['user_id']  = (int) $user['id'];
                $_SESSION['username'] = $user['username'];
                unset($_SESSION['fails'], $_SESSION['locked_until']);
                header('Location: Dinau.php');
                exit;
            }

            usleep(400000);                    // slow down guessing
            $_SESSION['fails'] = (int) ($_SESSION['fails'] ?? 0) + 1;
            if ($_SESSION['fails'] >= 5) {
                $_SESSION['locked_until'] = time() + 60;
                $_SESSION['fails'] = 0;
            }
            $error = 'Wrong username or password.';
        } catch (PDOException $e) {
            $error = 'Cannot reach the database right now. Please try again.';
        }
    }
}
$e = fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1f2f66">
  <title>Sign in · Dinau Treck</title>
  <link rel="icon" type="image/svg+xml" href="assets/img/logo.svg">
  <link rel="stylesheet" href="assets/css/app.css?v=<?= filemtime(__DIR__ . '/assets/css/app.css') ?>">
</head>
<body class="login-body">
  <div class="bg-orbs" aria-hidden="true"><span></span><span></span><span></span></div>
  <main class="login-card">
    <img src="assets/img/logo.svg" alt="" class="login-logo" width="72" height="72">
    <h1>Dinau Treck</h1>
    <p class="login-sub">Sign in to see who owes you</p>

    <?php if (isset($_GET['bye'])): ?>
      <p class="alert alert-ok" role="status">You are signed out.</p>
    <?php endif; ?>
    <?php if ($error !== ''): ?>
      <p class="alert alert-error" role="alert"><?= $e($error) ?></p>
    <?php endif; ?>

    <form method="post" action="login.php">
      <input type="hidden" name="csrf_token" value="<?= $e(csrf_token()) ?>">

      <div class="field">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" value="<?= $e($username) ?>" required autofocus autocomplete="username" autocapitalize="none">
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password">
      </div>
      <button type="submit" class="btn btn-primary btn-block">Sign in</button>
    </form>
  </main>
</body>
</html>
