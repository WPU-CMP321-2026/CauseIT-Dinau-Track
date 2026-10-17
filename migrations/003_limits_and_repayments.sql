-- Run ONCE on a database that already has the previous version (dinaus with a
-- paid_at column). BACK UP the database first (phpMyAdmin > Export).
-- Fresh installs: import schema.sql and skip this file.
--
-- What it does:
--  1. adds the credit limit setting (K20.00 to start; change it on the screen),
--  2. adds repayments, so a customer can pay part of what they owe,
--  3. turns every dinau that was ticked "paid" into a full repayment, so nothing
--     changes in what anyone owes, then drops the old paid_at column.
-- Customers who already owe more than the limit keep their balance; the limit
-- only stops NEW dinaus.

CREATE TABLE IF NOT EXISTS `settings` (
  `name`  VARCHAR(40)  NOT NULL PRIMARY KEY,
  `value` VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `settings` (`name`, `value`) VALUES ('credit_limit', '20.00');

CREATE TABLE IF NOT EXISTS `customer_limits` (
  `customer_name` VARCHAR(100)  NOT NULL PRIMARY KEY,
  `credit_limit`  DECIMAL(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `repayments` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `customer_name` VARCHAR(100)  NOT NULL,
  `amount`        DECIMAL(10,2) NOT NULL,
  `created_at`    DATETIME      NOT NULL,
  `deleted_at`    DATETIME      NULL,
  KEY `idx_repay_name` (`customer_name`, `deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `repayment_allocations` (
  `repayment_id` INT UNSIGNED  NOT NULL,
  `dinau_id`     INT UNSIGNED  NOT NULL,
  `amount`       DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`repayment_id`, `dinau_id`),
  KEY `idx_alloc_dinau` (`dinau_id`),
  CONSTRAINT `fk_alloc_repayment` FOREIGN KEY (`repayment_id`) REFERENCES `repayments` (`id`),
  CONSTRAINT `fk_alloc_dinau`     FOREIGN KEY (`dinau_id`)     REFERENCES `dinaus` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each dinau that was marked paid becomes one full repayment, dated when it was
-- ticked. The repayment re-uses the dinau's own id, so every row pairs up exactly.
INSERT INTO `repayments` (`id`, `customer_name`, `amount`, `created_at`)
SELECT `id`, `customer_name`, `amount`, `paid_at` FROM `dinaus`
WHERE `paid_at` IS NOT NULL AND `deleted_at` IS NULL;

INSERT INTO `repayment_allocations` (`repayment_id`, `dinau_id`, `amount`)
SELECT `id`, `id`, `amount` FROM `dinaus`
WHERE `paid_at` IS NOT NULL AND `deleted_at` IS NULL;

-- Swap the old indexes for one that suits the new queries, and drop paid_at.
ALTER TABLE `dinaus`
  DROP INDEX `idx_dinaus_open`,
  DROP INDEX `idx_dinaus_name`,
  DROP COLUMN `paid_at`,
  ADD KEY `idx_dinaus_name` (`customer_name`, `deleted_at`);
