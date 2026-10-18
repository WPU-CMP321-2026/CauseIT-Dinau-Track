-- Database schema for Dinau Treck
-- Run this against your MySQL server (e.g. via phpMyAdmin or the mysql CLI)
-- to create the database and table that db.php / save.php / get_records.php expect.

CREATE DATABASE IF NOT EXISTS `dinau-db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `dinau-db`;

CREATE TABLE IF NOT EXISTS `form` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `customer`      VARCHAR(255)   NOT NULL,
  `borrowed`      DECIMAL(12,2)  NOT NULL,
  `interestRate`  DECIMAL(5,2)   NOT NULL DEFAULT 0,
  `yetToRepay`    DECIMAL(12,2)  NOT NULL DEFAULT 0,
  `interestPaid`  DECIMAL(12,2)  NOT NULL DEFAULT 0,
  `dueDate`       DATE           NOT NULL,
  `created_at`    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
