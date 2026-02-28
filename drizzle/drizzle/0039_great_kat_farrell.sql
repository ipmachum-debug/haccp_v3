CREATE TABLE `tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`status` enum('active','suspended','trial','expired') NOT NULL DEFAULT 'trial',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `h_ccp_monitoring` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`ccp_point` varchar(255) NOT NULL,
	`monitoring_date` date NOT NULL,
	`monitoring_time` varchar(10) NOT NULL,
	`measured_value` varchar(100) NOT NULL,
	`critical_limit` varchar(100) NOT NULL,
	`status` enum('normal','warning','critical') NOT NULL DEFAULT 'normal',
	`monitored_by` bigint NOT NULL,
	`notes` text,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `h_ccp_monitoring_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `h_product_inventory` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`product_id` bigint NOT NULL,
	`quantity` varchar(50) NOT NULL,
	`available_quantity` varchar(50) NOT NULL,
	`unit` varchar(20) NOT NULL,
	`location` varchar(100),
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `h_product_inventory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `h_production_batches` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`batch_number` varchar(50) NOT NULL,
	`product_id` bigint NOT NULL,
	`planned_quantity` varchar(50) NOT NULL,
	`actual_quantity` varchar(50),
	`production_date` date NOT NULL,
	`expiry_date` date,
	`status` enum('planned','in_progress','completed','cancelled') NOT NULL DEFAULT 'planned',
	`created_by` bigint NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `h_production_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `h_production_batches_batch_number_unique` UNIQUE(`batch_number`)
);
--> statement-breakpoint
CREATE TABLE `h_production_material_usage` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`batch_id` bigint NOT NULL,
	`material_id` bigint NOT NULL,
	`lot_number` varchar(50) NOT NULL,
	`planned_quantity` varchar(50) NOT NULL,
	`actual_quantity` varchar(50),
	`unit` varchar(20) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()),
	CONSTRAINT `h_production_material_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `partners` MODIFY COLUMN `biz_no` varchar(20);--> statement-breakpoint
ALTER TABLE `h_material_inspections` ADD `appearance` varchar(200);--> statement-breakpoint
ALTER TABLE `h_material_inspections` ADD `odor` varchar(200);--> statement-breakpoint
ALTER TABLE `h_material_inspections` ADD `color` varchar(100);--> statement-breakpoint
ALTER TABLE `h_material_inspections` ADD `temperature` decimal(5,2);--> statement-breakpoint
ALTER TABLE `h_material_inspections` ADD `result` enum('pass','fail','conditional');--> statement-breakpoint
ALTER TABLE `h_materials` ADD `default_packaging_size` decimal(15,2);--> statement-breakpoint
ALTER TABLE `users` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inventory` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `material_inspection_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `lot_trace_history` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_hazard_analysis` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_backups` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_scheduler_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `equipments` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_mixed_material_components` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `calibration_equipment` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `hygiene_checklists` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `pest_control_checklists` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_document_approval_settings` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_purchases` ADD `account_category_id` int;--> statement-breakpoint
ALTER TABLE `accounting_purchase_items` ADD `packaging_size` decimal(15,2);--> statement-breakpoint
ALTER TABLE `accounting_sale_items` ADD `packaging_size` decimal(15,2);--> statement-breakpoint
ALTER TABLE `accounting_monthly_summary` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_accounts` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_inventory` ADD CONSTRAINT `h_inventory_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_inspection_records` ADD CONSTRAINT `material_inspection_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lot_trace_history` ADD CONSTRAINT `lot_trace_history_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_hazard_analysis` ADD CONSTRAINT `h_hazard_analysis_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_backups` ADD CONSTRAINT `h_backups_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_scheduler_logs` ADD CONSTRAINT `h_scheduler_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equipments` ADD CONSTRAINT `equipments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_mixed_material_components` ADD CONSTRAINT `h_mixed_material_components_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_equipment` ADD CONSTRAINT `calibration_equipment_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hygiene_checklists` ADD CONSTRAINT `hygiene_checklists_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pest_control_checklists` ADD CONSTRAINT `pest_control_checklists_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_document_approval_settings` ADD CONSTRAINT `h_document_approval_settings_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `companies` ADD CONSTRAINT `companies_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_monthly_summary` ADD CONSTRAINT `accounting_monthly_summary_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_accounts` ADD CONSTRAINT `accounting_accounts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_purchases` DROP COLUMN `category`;--> statement-breakpoint
ALTER TABLE `accounting_purchases` DROP COLUMN `inventory_id`;--> statement-breakpoint
ALTER TABLE `accounting_purchases` DROP COLUMN `expiry_date`;--> statement-breakpoint
ALTER TABLE `accounting_purchases` DROP COLUMN `supplier_id`;--> statement-breakpoint
ALTER TABLE `accounting_purchases` DROP COLUMN `posted_at`;--> statement-breakpoint
ALTER TABLE `accounting_purchases` DROP COLUMN `posted_by`;--> statement-breakpoint
ALTER TABLE `accounting_sales` DROP COLUMN `category`;