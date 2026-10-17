-- Dinau Treck schema. Import into an already-selected (empty) database with
-- phpMyAdmin. It does not CREATE DATABASE or USE, so it works with the
-- host-generated database name.
-- Upgrading an existing database? Run migrations/003_limits_and_repayments.sql instead.

CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `username`      VARCHAR(64)  NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Named settings. credit_limit = the most any one customer may owe at once.
-- No row (or an empty value) means "no limit". Iven changes it on the screen.
CREATE TABLE IF NOT EXISTS `settings` (
  `name`  VARCHAR(40)  NOT NULL PRIMARY KEY,
  `value` VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `settings` (`name`, `value`) VALUES ('credit_limit', '20.00');

-- A limit for one particular customer. It replaces the setting above for them.
-- (A customer with no row here uses the setting.)
CREATE TABLE IF NOT EXISTS `customer_limits` (
  `customer_name` VARCHAR(100)  NOT NULL PRIMARY KEY,
  `credit_limit`  DECIMAL(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per dinau. The customer is just a name typed in by Iven; there is
-- no customer list to maintain. How much is still owed on a dinau is its amount
-- minus the repayments allocated to it (see repayment_allocations).
-- deleted_at is a soft delete so "Undo" can bring a removed dinau back.
CREATE TABLE IF NOT EXISTS `dinaus` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `customer_name` VARCHAR(100)  NOT NULL,
  `amount`        DECIMAL(10,2) NOT NULL,
  `note`          VARCHAR(200)  NULL,
  `due_date`      DATE          NULL,
  `created_at`    DATETIME      NOT NULL,
  `deleted_at`    DATETIME      NULL,
  KEY `idx_dinaus_name` (`customer_name`, `deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A repayment: money a customer pays back, in full or in part, with its date.
CREATE TABLE IF NOT EXISTS `repayments` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `customer_name` VARCHAR(100)  NOT NULL,
  `amount`        DECIMAL(10,2) NOT NULL,
  `created_at`    DATETIME      NOT NULL,
  `deleted_at`    DATETIME      NULL,
  KEY `idx_repay_name` (`customer_name`, `deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which dinau(s) a repayment settled. A part payment goes to the customer's
-- oldest unpaid dinau first, then the next, and so on.
CREATE TABLE IF NOT EXISTS `repayment_allocations` (
  `repayment_id` INT UNSIGNED  NOT NULL,
  `dinau_id`     INT UNSIGNED  NOT NULL,
  `amount`       DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`repayment_id`, `dinau_id`),
  KEY `idx_alloc_dinau` (`dinau_id`),
  CONSTRAINT `fk_alloc_repayment` FOREIGN KEY (`repayment_id`) REFERENCES `repayments` (`id`),
  CONSTRAINT `fk_alloc_dinau`     FOREIGN KEY (`dinau_id`)     REFERENCES `dinaus` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
