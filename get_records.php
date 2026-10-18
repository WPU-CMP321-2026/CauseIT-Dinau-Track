<?php
include 'db.php';
header('Content-Type: application/json');

$records = [];

$result = mysqli_query($conn, "SELECT customer, borrowed, interestRate, yetToRepay, interestPaid, dueDate FROM form ORDER BY id DESC");

if ($result) {
    while ($row = mysqli_fetch_assoc($result)) {
        $records[] = $row;
    }
    echo json_encode($records);
} else {
    http_response_code(500);
    echo json_encode(["error" => mysqli_error($conn)]);
}
?>
