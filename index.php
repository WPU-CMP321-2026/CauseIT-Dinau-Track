<?php
require 'auth.php';
header('Location: ' . (is_logged_in() ? 'Dinau.php' : 'login.php'));
exit;
