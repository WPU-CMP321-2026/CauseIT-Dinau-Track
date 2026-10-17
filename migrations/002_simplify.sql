-- NOTE: after this file, also run 003_limits_and_repayments.sql (it adds credit limits and part payments).
-- Run ONCE, only if you have data from the old version (customers /
-- transactions tables). Fresh installs: import schema.sql and skip this.
-- BACK UP the database first. This copies your old data into the new
-- `dinaus` table and leaves the old tables untouched, so nothing is lost.

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

-- Rejected requests were never real dinaus, so they are skipped.
-- Items on a goods dinau become the note (e.g. "Pie, Cordial").
INSERT INTO `dinaus` (`customer_name`, `amount`, `note`, `due_date`, `created_at`, `paid_at`)
SELECT LEFT(c.`name`, 100),
       t.`amount`,
       LEFT(COALESCE(
         (SELECT GROUP_CONCAT(ti.`product_name` ORDER BY ti.`id` SEPARATOR ', ')
            FROM `transaction_items` ti WHERE ti.`transaction_id` = t.`id`),
         t.`notes`), 200),
       t.`due_date`,
       t.`created_at`,
       CASE WHEN t.`amount_repaid` >= t.`amount` THEN COALESCE(t.`decided_at`, t.`created_at`) ELSE NULL END
FROM `transactions` t
JOIN `customers` c ON c.`id` = t.`customer_id`
WHERE t.`status` <> 'rejected'
ORDER BY t.`id`;

-- A partly repaid loan keeps only what is still owed.
UPDATE `dinaus` d
JOIN (
  SELECT c.`name`, t.`created_at`, t.`amount`, t.`amount_repaid`
  FROM `transactions` t JOIN `customers` c ON c.`id` = t.`customer_id`
  WHERE t.`status` <> 'rejected' AND t.`amount_repaid` > 0 AND t.`amount_repaid` < t.`amount`
) p ON p.`name` = d.`customer_name` AND p.`created_at` = d.`created_at` AND p.`amount` = d.`amount`
SET d.`amount` = p.`amount` - p.`amount_repaid`;

-- The new sign-in table has no roles. If your old `users` table has a `role`
-- column it is simply ignored; your existing login keeps working.
