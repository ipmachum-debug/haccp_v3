-- 판매 확정·LOT 차감 실 MySQL 통합 테스트용 스키마 (+ 2026-10-16 accounting_sales.sku_id, h_stock_alerts, 매입·입고전표·거래처·도메인 이벤트·단가 이력·품목제조보고 원료·AR 원장·은행계좌·품목제조보고·배치·투입·SKU 생산실적·제품·발주서·회사) (운영 백업 2026-10-16 의 DDL 만 — 데이터 없음, FK 제거)

SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `accounting_sales`;

CREATE TABLE `accounting_sales` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `transaction_date` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `partner_id` bigint DEFAULT NULL,
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` bigint DEFAULT NULL,
  `material_id` bigint DEFAULT NULL,
  `sku_id` bigint DEFAULT NULL,
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

DROP TABLE IF EXISTS `h_stock_alerts`;

CREATE TABLE `h_stock_alerts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `site_id` bigint NOT NULL,
  `inventory_id` bigint DEFAULT NULL,
  `lot_id` bigint DEFAULT NULL,
  `alert_type` enum('low_stock','expiring_soon','expired','overstock') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `severity` enum('low','medium','high','critical') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `alert_date` timestamp NOT NULL DEFAULT (now()),
  `resolved` tinyint DEFAULT '0',
  `resolved_at` timestamp NULL DEFAULT NULL,
  `resolved_by` bigint DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `tenant_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `h_stock_alerts_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `accounting_purchases`;

CREATE TABLE `accounting_purchases` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `transaction_date` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `partner_id` bigint DEFAULT NULL,
  `item_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `material_id` bigint DEFAULT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `unit` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `total_amount` decimal(15,2) NOT NULL,
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `tax_rate` decimal(5,2) DEFAULT '10.00',
  `evidence_type` enum('tax_invoice','receipt','statement','none') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'none',
  `evidence_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_id` bigint DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','approved','paid','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `account_category_id` int DEFAULT NULL,
  `posted_at` timestamp NULL DEFAULT NULL,
  `posted_by` bigint DEFAULT NULL,
  `canceled_at` timestamp NULL DEFAULT NULL,
  `canceled_by` bigint DEFAULT NULL,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `transaction_date_idx` (`transaction_date`),
  KEY `partner_id_idx` (`partner_id`),
  KEY `source_idx` (`source_type`,`source_id`),
  KEY `idx_purchases_material_id` (`material_id`),
  KEY `tenant_id_idx` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_inbound_headers`;

CREATE TABLE `h_inbound_headers` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `inbound_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `site_id` bigint NOT NULL,
  `supplier_id` bigint DEFAULT NULL,
  `inbound_date` date NOT NULL,
  `status` enum('draft','confirmed','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `confirmed_by` bigint DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `h_inbound_headers_inbound_number_unique` (`inbound_number`),
  KEY `h_inbound_headers_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_inbound_lines`;

CREATE TABLE `h_inbound_lines` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `header_id` bigint NOT NULL,
  `line_number` int NOT NULL,
  `material_id` bigint NOT NULL,
  `purchase_quantity` decimal(10,3) NOT NULL,
  `purchase_unit` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `stock_quantity` decimal(10,3) NOT NULL,
  `stock_unit` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `total_price` decimal(12,2) NOT NULL,
  `lot_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `location` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `h_inbound_lines_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `partners`;

CREATE TABLE `partners` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `partner_type` enum('supplier','customer','subcontractor') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `biz_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supplier_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supplier_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `certifications` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `rating` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ceo_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_person` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biz_type` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biz_item` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fax` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(320) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `grade` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_terms_days` int DEFAULT NULL,
  `credit_limit` decimal(15,2) DEFAULT NULL,
  `default_discount_rate` decimal(5,2) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` int NOT NULL DEFAULT '1',
  `customer_type` enum('b2b','b2c_platform','b2c_direct') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'b2b' COMMENT '거래처 유형: b2b / b2c_platform (B2C 전자상거래) / b2c_direct',
  `metadata` json DEFAULT NULL COMMENT '거래처 자유 custom field (CRM Phase 1)',
  PRIMARY KEY (`id`),
  KEY `partners_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `domain_events`;

CREATE TABLE `domain_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `event_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `aggregate_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `aggregate_id` bigint NOT NULL,
  `payload` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` bigint DEFAULT NULL,
  `processed_at` timestamp NULL DEFAULT NULL,
  `processing_attempts` int NOT NULL DEFAULT '0',
  `last_error` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_domain_events_unprocessed` (`processed_at`,`processing_attempts`,`id`),
  KEY `idx_domain_events_tenant` (`tenant_id`,`created_at`),
  KEY `idx_domain_events_aggregate` (`aggregate_type`,`aggregate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_material_price_history`;

CREATE TABLE `h_material_price_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `material_id` bigint NOT NULL,
  `old_price` decimal(10,2) DEFAULT NULL,
  `new_price` decimal(10,2) NOT NULL,
  `changed_by` bigint DEFAULT NULL,
  `changed_at` timestamp NOT NULL DEFAULT (now()),
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `tenant_id` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `h_material_price_history_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_mf_ingredients`;

CREATE TABLE `h_mf_ingredients` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mf_report_version_id` bigint NOT NULL,
  `line_no` int NOT NULL,
  `material_id` bigint DEFAULT NULL,
  `intermediate_id` bigint DEFAULT NULL,
  `child_sku_id` bigint DEFAULT NULL,
  `piece_count` int DEFAULT NULL,
  `piece_weight_g` decimal(10,2) DEFAULT NULL,
  `quantity` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `corrected_quantity` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_deductible` tinyint NOT NULL DEFAULT '1',
  `material_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RAW',
  `flavor_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `process_group_id` int DEFAULT NULL,
  `adjusted_weight_kg` decimal(10,3) DEFAULT NULL,
  `is_additional` tinyint NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_mfi_child_sku` (`child_sku_id`),
  KEY `fk_mf_ingredients_version` (`mf_report_version_id`),
  KEY `fk_mf_ingredients_item` (`material_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `ar_ledger`;

CREATE TABLE `ar_ledger` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `customer_partner_id` bigint NOT NULL,
  `occurred_at` timestamp NOT NULL,
  `ar_entry_type` enum('debit','payment','credit','writeoff','adjust') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `due_date` date DEFAULT NULL,
  `ref_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ref_id` bigint DEFAULT NULL,
  `memo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accounting_account_id` bigint DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `tenant_id` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `ar_ledger_tenant_id_tenants_id_fk` (`tenant_id`),
  KEY `ar_ledger_customer_partner_id_partners_id_fk` (`customer_partner_id`),
  KEY `ar_ledger_created_by_users_id_fk` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `bank_accounts`;

CREATE TABLE `bank_accounts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `bank_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ì€í–‰ëª…',
  `account_no` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ê³„ì¢Œë²ˆí˜¸',
  `account_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ì˜ˆê¸ˆì£¼ëª…',
  `account_type` enum('checking','savings','investment','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'checking' COMMENT 'ê³„ì¢Œ ìœ í˜•',
  `balance` decimal(18,2) NOT NULL DEFAULT '0.00',
  `currency` varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'KRW' COMMENT 'í†µí™”',
  `default_accounting_account_id` bigint DEFAULT NULL COMMENT 'ê¸°ë³¸ ê³„ì • ê³¼ëª© ID',
  `is_active` enum('Y','N') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Y' COMMENT 'í™œì„±í™” ì—¬ë¶€',
  `is_primary` tinyint NOT NULL DEFAULT '0',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'ë©”ëª¨',
  `created_by` bigint DEFAULT NULL COMMENT 'ìƒì„±ìž ID',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `bank_accounts_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_mf_reports`;

CREATE TABLE `h_mf_reports` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `product_id` bigint NOT NULL,
  `report_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_date` date NOT NULL,
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `report_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BASIC',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_mfr_report_type` (`tenant_id`,`report_type`),
  KEY `fk_mf_reports_item` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_mf_report_versions`;

CREATE TABLE `h_mf_report_versions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mf_report_id` bigint NOT NULL,
  `version_no` int NOT NULL,
  `effective_from` date NOT NULL,
  `change_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `approval_status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `composition_total_rule` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '100%',
  `yield_basis` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'PER_BATCH_KG',
  `unit_weight_g` decimal(10,2) DEFAULT NULL,
  `batch_target_kg` decimal(10,2) DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `approved_by` bigint DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejected_by` bigint DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `tenant_id` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `h_mf_report_versions_tenant_id_tenants_id_fk` (`tenant_id`),
  KEY `fk_mf_versions_report` (`mf_report_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_batch_mass_basis`;

DROP TABLE IF EXISTS `h_batches`;

CREATE TABLE `h_batches` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `site_id` bigint NOT NULL,
  `batch_code` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `day_batch_group` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `batch_order` int DEFAULT NULL,
  `product_id` bigint NOT NULL,
  `recipe_id` bigint DEFAULT NULL,
  `planned_quantity` decimal(10,2) NOT NULL,
  `actual_quantity` decimal(10,2) DEFAULT NULL,
  `actual_yield` decimal(10,2) DEFAULT NULL,
  `loss_quantity` decimal(10,2) DEFAULT NULL,
  `material_cost` decimal(15,2) DEFAULT NULL,
  `labor_cost` decimal(15,2) DEFAULT NULL,
  `overhead_cost` decimal(15,2) DEFAULT NULL,
  `total_cost` decimal(15,2) DEFAULT NULL,
  `unit_cost` decimal(15,2) DEFAULT NULL,
  `planned_date` date NOT NULL,
  `start_time` timestamp NULL DEFAULT NULL,
  `end_time` timestamp NULL DEFAULT NULL,
  `status` enum('planned','in_progress','paused','completed','under_review','failed','cancelled','shipped','archived') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planned',
  `mode` enum('auto','manual') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'auto',
  `manual_start_time` timestamp NULL DEFAULT NULL,
  `manual_end_time` timestamp NULL DEFAULT NULL,
  `lot_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `revenue` decimal(15,2) DEFAULT NULL,
  `planned_cost` decimal(15,2) DEFAULT NULL,
  `actual_cost` decimal(15,2) DEFAULT NULL,
  `cost_finalized_at` timestamp NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `completion_idempotency_key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `completion_report_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `h_batches_batch_code_unique` (`batch_code`),
  UNIQUE KEY `h_batches_completion_idempotency_key_unique` (`completion_idempotency_key`),
  KEY `h_batches_tenant_id_tenants_id_fk` (`tenant_id`),
  KEY `fk_batches_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_batch_inputs`;

CREATE TABLE `h_batch_inputs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `batch_id` bigint NOT NULL,
  `material_id` bigint NOT NULL,
  `process_group_id` int DEFAULT NULL,
  `lot_id` bigint DEFAULT NULL,
  `planned_quantity` decimal(10,3) NOT NULL,
  `actual_quantity` decimal(10,3) DEFAULT NULL,
  `unit` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `input_time` timestamp NULL DEFAULT NULL,
  `input_by` bigint DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `unit_price` decimal(10,2) DEFAULT NULL,
  `total_price` decimal(10,2) DEFAULT NULL,
  `inventory_deducted` tinyint NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `tenant_id` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `h_batch_inputs_tenant_id_tenants_id_fk` (`tenant_id`),
  KEY `fk_batch_inputs_batch` (`batch_id`),
  KEY `fk_batch_inputs_material` (`material_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `production_sku_output`;
CREATE TABLE `production_sku_output` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `batch_id` bigint NOT NULL,
  `sku_id` bigint NOT NULL,
  `bundle_sku_id` bigint DEFAULT NULL,
  `quantity` int NOT NULL DEFAULT '0',
  `defective_qty` int DEFAULT '0',
  `total_kg` decimal(10,3) DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_pso_batch_id` (`batch_id`),
  KEY `idx_pso_sku_id` (`sku_id`),
  KEY `idx_pso_tenant_id` (`tenant_id`),
  KEY `idx_pso_bundle` (`bundle_sku_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `h_products_v2`;
CREATE TABLE `h_products_v2` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `product_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` int NOT NULL DEFAULT '1',
  `category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shelf_life_days` int DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `tenant_id` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `h_products_v2_product_code_unique` (`product_code`),
  KEY `h_products_v2_tenant_id_tenants_id_fk` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `purchase_orders`;
CREATE TABLE `purchase_orders` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `po_number` varchar(50) NOT NULL,
  `partner_id` bigint NOT NULL,
  `order_date` varchar(10) NOT NULL,
  `expected_delivery_date` varchar(10) DEFAULT NULL,
  `delivery_address` varchar(500) DEFAULT NULL,
  `total_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `tax_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `grand_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status` enum('draft','approved','partial_received','received','cancelled') NOT NULL DEFAULT 'draft',
  `approved_by` bigint DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `cancelled_by` bigint DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `cancel_reason` text,
  `notes` text,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_po_tenant_number` (`tenant_id`,`po_number`),
  KEY `idx_po_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `purchase_order_lines`;
CREATE TABLE `purchase_order_lines` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `po_id` bigint NOT NULL,
  `line_number` int NOT NULL,
  `material_id` bigint DEFAULT NULL,
  `item_name` varchar(255) NOT NULL,
  `item_code` varchar(100) DEFAULT NULL,
  `ordered_qty` decimal(10,3) NOT NULL,
  `received_qty` decimal(10,3) NOT NULL DEFAULT '0.000',
  `unit` varchar(20) NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `tax_amount` decimal(15,2) DEFAULT '0.00',
  `expected_delivery_date` varchar(10) DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_po_line` (`po_id`,`line_number`),
  KEY `idx_pol_tenant_po` (`tenant_id`,`po_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `tenants`;
CREATE TABLE `tenants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','suspended','trial','expired') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'trial',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `subscription_package` enum('starter','standard','enterprise','erp_basic') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'starter',
  `subscription_start_date` date DEFAULT NULL,
  `subscription_end_date` date DEFAULT NULL,
  `subscription_days` int DEFAULT '0',
  `grace_period_end_date` date DEFAULT NULL,
  `is_read_only` tinyint(1) DEFAULT '0',
  `industry_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'KSIC 업종코드 (ex: C10, C1011, C20)',
  `industry_category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '대분류 (food, cosmetics, supplement, pharma, general)',
  `billing_key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `card_company` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenants_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
