-- Mormors Kunafa app schema (Path B - own backend, not WordPress)
-- Run this against a new empty database (e.g. mormors_kunafa).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Admin users (separate from WordPress)
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `display_name` varchar(255) NOT NULL DEFAULT '',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin settings (default prep time, etc.)
CREATE TABLE IF NOT EXISTS `admin_settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `default_preparation_time_minutes` int NOT NULL DEFAULT 30,
  `is_paused` tinyint(1) NOT NULL DEFAULT 0,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `admin_settings` (`default_preparation_time_minutes`, `is_paused`) VALUES (30, 0);

-- Products (prices stored in öre for precision)
CREATE TABLE IF NOT EXISTS `products` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `slug` varchar(255) NOT NULL,
  `description` text,
  `image_url` varchar(512) DEFAULT NULL,
  `price_ore` int NOT NULL DEFAULT 0,
  `stock_quantity` int DEFAULT NULL,
  `stock_status` varchar(20) NOT NULL DEFAULT 'instock',
  `sku` varchar(100) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `stock_status` (`stock_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders
CREATE TABLE IF NOT EXISTS `orders` (
  `id` varchar(36) NOT NULL,
  `order_number` varchar(32) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ny',
  `order_type` varchar(20) NOT NULL DEFAULT 'takeaway',
  `payment_method` varchar(20) NOT NULL DEFAULT 'cash',
  `payment_status` varchar(20) NOT NULL DEFAULT 'pending',
  `total_ore` int NOT NULL DEFAULT 0,
  `default_preparation_time_minutes` int NOT NULL DEFAULT 30,
  `estimated_ready_at` datetime DEFAULT NULL,
  `scheduled_at` datetime DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `customer_email` varchar(255) DEFAULT NULL,
  `customer_phone` varchar(64) NOT NULL,
  `delivery_info_json` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `cancellation_reason` text DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `refund_status` varchar(20) DEFAULT 'none',
  `internal_notes` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_number` (`order_number`),
  KEY `status` (`status`),
  KEY `created_at` (`created_at`),
  KEY `scheduled_at` (`scheduled_at`),
  KEY `cancelled_at` (`cancelled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order line items (price at time of order in öre)
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` varchar(36) NOT NULL,
  `order_id` varchar(36) NOT NULL,
  `product_id` varchar(36) DEFAULT NULL,
  `product_name_snapshot` varchar(255) NOT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `price_ore` int NOT NULL DEFAULT 0,
  `modifications_json` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  CONSTRAINT `order_items_order_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
