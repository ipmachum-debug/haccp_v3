-- 판매 확정·LOT 차감 실 MySQL 통합 테스트용 스키마 (운영 백업 2026-10-16 의 DDL 만 — 데이터 없음, FK 제거)

SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `accounting_sales`;

CREATE TABLE `accounting_sales` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `transaction_date` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `partner_id` bigint DEFAULT NULL,
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` bigint DEFAULT NULL,
  `material_id` bigint DEFAULT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `total_amount` decimal(15,2) NOT NULL,
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `tax_rate` decimal(5,2) DEFAULT '10.00',
  `evidence_type` enum('tax_invoice','receipt','statement','none') COLLATE utf8mb4_unicode_ci DEFAULT 'none',
  `evidence_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_id` bigint DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','approved','received','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `posted_at` timestamp NULL DEFAULT NULL,
  `posted_by` bigint DEFAULT NULL,
  `canceled_at` timestamp NULL DEFAULT NULL,
  `canceled_by` bigint DEFAULT NULL,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` int NOT NULL DEFAULT '1',
  `accounting_excluded` tinyint NOT NULL DEFAULT '0' COMMENT '회계 연동 제외 여부 (B2C 플랫폼 매출 — 재고만 차감, 분개 skip)',
  PRIMARY KEY (`id`),
  KEY `transaction_date_idx` (`transaction_date`),
  KEY `partner_id_idx` (`partner_id`),
  KEY `source_idx` (`source_type`,`source_id`),
  KEY `idx_sales_product_id` (`product_id`),
  KEY `tenant_id_idx` (`tenant_id`),
  KEY `idx_sales_material_id` (`material_id`),
  KEY `idx_accounting_sales_accounting_excluded` (`tenant_id`,`accounting_excluded`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_inventory_lots`;

CREATE TABLE `h_inventory_lots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `inventory_id` bigint DEFAULT NULL,
  `lot_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch_id` bigint DEFAULT NULL,
  `material_id` bigint DEFAULT NULL,
  `product_id` bigint DEFAULT NULL,
  `sku_id` bigint DEFAULT NULL,
  `sku_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `current_quantity` decimal(10,3) DEFAULT NULL,
  `available_quantity` decimal(10,3) NOT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_price` decimal(10,2) DEFAULT NULL,
  `production_date` date DEFAULT NULL,
  `receipt_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `supplier_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `manufacturer_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('available','reserved','used','expired','disposed') COLLATE utf8mb4_unicode_ci DEFAULT 'available',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `h_inventory_lots_lot_number_unique` (`lot_number`),
  KEY `h_inventory_lots_tenant_id_tenants_id_fk` (`tenant_id`),
  KEY `fk_lots_material` (`material_id`),
  KEY `fk_lots_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_inventory_transactions`;

CREATE TABLE `h_inventory_transactions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `lot_id` bigint DEFAULT NULL,
  `inventory_id` bigint DEFAULT NULL,
  `material_id` bigint DEFAULT NULL,
  `transaction_type` enum('receipt','usage','adjustment','transfer','disposal','return','inbound','outbound') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_cost` decimal(10,2) DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT NULL,
  `transaction_date` date DEFAULT NULL,
  `reference_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` bigint DEFAULT NULL,
  `source_id` bigint DEFAULT NULL,
  `source_line_id` bigint DEFAULT NULL,
  `action_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purpose` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performed_by` bigint DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tx_tenant_material_date` (`tenant_id`,`material_id`,`transaction_date`),
  KEY `fk_tx_lot` (`lot_id`),
  KEY `fk_tx_material` (`material_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `expense_journal_entries`;

CREATE TABLE `expense_journal_entries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `voucher_id` bigint DEFAULT NULL,
  `entry_date` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '분개일자 (YYYY-MM-DD)',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_debit` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT '차변 합계',
  `total_credit` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT '대변 합계',
  `posted_by` bigint NOT NULL,
  `posted_at` timestamp NOT NULL DEFAULT (now()),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `expense_journal_entries_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='분개 헤더';

DROP TABLE IF EXISTS `expense_journal_lines`;

CREATE TABLE `expense_journal_lines` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `journal_entry_id` bigint NOT NULL,
  `account_id` bigint NOT NULL,
  `account_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `debit_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `credit_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `bank_account_id` bigint DEFAULT NULL,
  `partner_id` bigint DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `expense_journal_lines_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='분개 라인 (차변/대변)';

DROP TABLE IF EXISTS `accounting_accounts`;

CREATE TABLE `accounting_accounts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `category` enum('assets','liabilities','equity','revenue','expenses') COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `system_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` bigint DEFAULT NULL,
  `account_category_id` bigint DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` enum('Y','N') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Y',
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_system_code` (`tenant_id`,`system_code`),
  KEY `idx_tenant_category` (`tenant_id`,`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `item_master`;

CREATE TABLE `item_master` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `item_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_type` enum('raw_material','own_product','external_product','subsidiary') COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `base_unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'kg',
  `supplier_id` bigint DEFAULT NULL,
  `purchase_unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purchase_conversion_rate` decimal(10,4) DEFAULT '1.0000',
  `product_report_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shelf_life_days` int DEFAULT NULL,
  `oem_supplier_id` bigint DEFAULT NULL,
  `default_unit_price` decimal(15,2) DEFAULT '0.00',
  `legacy_product_id` bigint DEFAULT NULL,
  `legacy_material_id` bigint DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_item_code_tenant` (`item_code`,`tenant_id`),
  KEY `idx_item_type` (`item_type`),
  KEY `idx_legacy_product` (`legacy_product_id`),
  KEY `idx_legacy_material` (`legacy_material_id`),
  KEY `idx_im_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `product_skus`;

CREATE TABLE `product_skus` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `item_id` bigint NOT NULL,
  `sku_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sku_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `net_weight_g` decimal(10,2) DEFAULT NULL,
  `pieces_per_pack` int DEFAULT '1',
  `packs_per_box` int DEFAULT '1',
  `sales_unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'box',
  `kg_per_sales_unit` decimal(10,4) NOT NULL,
  `unit_price` decimal(15,2) DEFAULT '0.00',
  `barcode` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `is_default` tinyint NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sku_code_tenant` (`sku_code`,`tenant_id`),
  KEY `idx_sku_item_id` (`item_id`),
  KEY `idx_sku_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `sku_bundles`;

CREATE TABLE `sku_bundles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `parent_sku_id` bigint NOT NULL,
  `child_sku_id` bigint NOT NULL,
  `default_ratio` decimal(5,2) NOT NULL,
  `child_pieces` int DEFAULT NULL,
  `child_piece_weight_g` decimal(10,2) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bundle_pair` (`tenant_id`,`parent_sku_id`,`child_sku_id`),
  KEY `idx_bundle_parent` (`parent_sku_id`),
  KEY `idx_bundle_child` (`child_sku_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SKU 번들 정의 (혼합 제품 — 다중 생산 SKU 를 1개 출고 SKU 로 묶음)';

DROP TABLE IF EXISTS `h_product_outbound`;

CREATE TABLE `h_product_outbound` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `batch_id` bigint DEFAULT NULL,
  `lot_id` bigint DEFAULT NULL,
  `product_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EA',
  `unit_price` decimal(15,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `partner_id` bigint DEFAULT NULL,
  `partner_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `release_date` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `release_type` enum('sale','delivery','sample','return','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sale',
  `lot_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `status` enum('confirmed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'confirmed',
  `created_by` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_batch` (`batch_id`),
  KEY `idx_lot` (`lot_id`),
  KEY `idx_release_date` (`release_date`),
  KEY `idx_partner` (`partner_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_products_v2`;

CREATE TABLE `h_products_v2` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `product_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` int NOT NULL DEFAULT '1',
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shelf_life_days` int DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `tenant_id` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `h_products_v2_product_code_unique` (`product_code`),
  KEY `h_products_v2_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_materials`;

CREATE TABLE `h_materials` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `material_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `material_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RAW',
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category_id` bigint DEFAULT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supplier_id` bigint DEFAULT NULL,
  `shelf_life_days` int DEFAULT NULL,
  `expiry_warning_days` int DEFAULT '7',
  `safety_stock_level` decimal(10,3) DEFAULT '0.000',
  `unit_price` decimal(10,2) DEFAULT '0.00',
  `price_auto_update` tinyint(1) NOT NULL DEFAULT '1' COMMENT '입고 시 현재 단가 자동 갱신 (0=수동 고정)',
  `purchase_unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `conversion_rate` decimal(10,4) DEFAULT '1.0000',
  `default_packaging_size` decimal(15,2) DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `h_materials_material_code_unique` (`material_code`),
  KEY `h_materials_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `material_ledger_daily`;

CREATE TABLE `material_ledger_daily` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '2',
  `material_id` bigint NOT NULL,
  `ledger_date` varchar(10) NOT NULL,
  `receiving_qty` decimal(12,3) DEFAULT '0.000',
  `usage_qty` decimal(12,3) DEFAULT '0.000',
  `adjustment_qty` decimal(12,3) DEFAULT '0.000',
  `running_stock` decimal(12,3) DEFAULT '0.000',
  `notes` text,
  `source` varchar(50) DEFAULT 'auto',
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mld_tenant_material_date` (`tenant_id`,`material_id`,`ledger_date`),
  KEY `idx_tenant_date` (`tenant_id`,`ledger_date`),
  KEY `idx_material_date` (`material_id`,`ledger_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `bundle_lots`;

CREATE TABLE `bundle_lots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `parent_lot_id` bigint NOT NULL,
  `child_lot_id` bigint NOT NULL,
  `deducted_qty_kg` decimal(12,3) NOT NULL,
  `mapped_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_bundle_lots_parent` (`parent_lot_id`),
  KEY `idx_bundle_lots_child` (`child_lot_id`),
  KEY `idx_bundle_lots_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SKU 번들 LOT 매핑 (parent LOT ↔ child LOT N:1, 회수 시뮬레이션)';


DROP TABLE IF EXISTS `h_inventory`;
CREATE TABLE `h_inventory` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `site_id` bigint DEFAULT NULL,
  `material_id` bigint DEFAULT NULL,
  `product_id` bigint DEFAULT NULL,
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_quantity` decimal(10,3) NOT NULL,
  `available_quantity` decimal(10,3) NOT NULL,
  `reserved_quantity` decimal(10,3) DEFAULT '0.000',
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `min_stock_level` decimal(10,3) DEFAULT NULL,
  `max_stock_level` decimal(10,3) DEFAULT NULL,
  `reorder_point` decimal(10,3) DEFAULT NULL,
  `last_updated` timestamp NULL DEFAULT (now()),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_inv_material` (`tenant_id`,`material_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
