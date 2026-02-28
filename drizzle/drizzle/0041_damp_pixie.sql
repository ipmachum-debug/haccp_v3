DROP TABLE `bank_transaction_matching_rules`;--> statement-breakpoint
ALTER TABLE `hygiene_inspection_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `hygiene_inspection_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `material_inspection_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_inspection_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `shipping_inspection_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `recipe_lines` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `recipe_versions` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `calibration_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `pest_control_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `hygiene_inspection_items` ADD CONSTRAINT `hygiene_inspection_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hygiene_inspection_records` ADD CONSTRAINT `hygiene_inspection_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `material_inspection_items` ADD CONSTRAINT `material_inspection_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipping_inspection_items` ADD CONSTRAINT `shipping_inspection_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipping_inspection_records` ADD CONSTRAINT `shipping_inspection_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_lines` ADD CONSTRAINT `recipe_lines_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_versions` ADD CONSTRAINT `recipe_versions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calibration_records` ADD CONSTRAINT `calibration_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pest_control_items` ADD CONSTRAINT `pest_control_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;
