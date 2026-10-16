-- Dinau Treck schema. Import into an already-selected (empty) database with
-- phpMyAdmin. It does not CREATE DATABASE or USE, so it works with the
-- host-generated database name.

CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `username`      VARCHAR(64)  NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per dinau. The customer is just a name typed in by Iven; there is
-- no customer list to maintain. paid_at is NULL while the dinau is unpaid.
-- deleted_at is a soft delete so "Undo" can bring a removed dinau back.
CREATE TABLE IF NOT EXISTS `dinaus` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `customer_name` VARCHAR(100)  NOT NULL,
  `amount`        DECIMAL(10,2) NOT NULL,
  `note`          VARCHAR(200)  NULL,
  `due_date`      DATE          NULL,
  `created_at`    DATETIME      NOT NULL,
  `paid_at`       DATETIME      NULL,
  `deleted_at`    DATETIME      NULL,
  KEY `idx_dinaus_name` (`customer_name`),
  KEY `idx_dinaus_open` (`deleted_at`, `paid_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
