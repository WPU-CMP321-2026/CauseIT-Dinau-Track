<?php
require 'auth.php';
logout();
header('Location: login.php?bye=1');
exit;
