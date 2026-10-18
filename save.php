<?php
include 'db.php'; // include your connection file

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Collect form data safely
    $customer     = mysqli_real_escape_string($conn, $_POST['customer']);
    $borrowed     = mysqli_real_escape_string($conn, $_POST['borrowed']);
    $interestRate = mysqli_real_escape_string($conn, $_POST['interestRate']);
    $yetToRepay   = mysqli_real_escape_string($conn, $_POST['yetToRepay']);
    $interestPaid = mysqli_real_escape_string($conn, $_POST['interestPaid']);
    $dueDate      = mysqli_real_escape_string($conn, $_POST['dueDate']);

    // Build SQL query
    $sql = "INSERT INTO form (customer, borrowed, interestRate, yetToRepay, interestPaid, dueDate)
            VALUES ('$customer', '$borrowed', '$interestRate', '$yetToRepay', '$interestPaid', '$dueDate')";

    // Execute query
    if (mysqli_query($conn, $sql)) {
        // If request came from AJAX (Save button), return plain text
        if (!empty($_SERVER['HTTP_X_REQUESTED_WITH'])) {
            echo "Record saved successfully!";
        } else {
            // If request came from Submit button, show success + link
            echo "Record saved successfully! <br><a href='table.php'>View Records</a>";
        }
    } else {
        echo "Error: " . mysqli_error($conn);
    }
}
?>
