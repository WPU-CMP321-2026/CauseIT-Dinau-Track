<?php
$servername = "127.0.0.1:3306";   // MySQL port
$username   = "root";
$password   = "";
$database   = "dinau-db";         // your actual database name

$conn = mysqli_connect($servername, $username, $password, $database);

if (!$conn) {
    die("Connection failed: " . mysqli_connect_error());
}
?>
