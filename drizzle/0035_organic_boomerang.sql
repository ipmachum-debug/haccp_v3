ALTER TABLE `accounting_purchases` ADD `inventory_id` bigint;--> statement-breakpoint
ALTER TABLE `accounting_purchases` ADD `expiry_date` date;--> statement-breakpoint
ALTER TABLE `accounting_purchases` ADD `supplier_id` bigint;--> statement-breakpoint
ALTER TABLE `accounting_purchases` ADD `posted_at` timestamp;--> statement-breakpoint
ALTER TABLE `accounting_purchases` ADD `posted_by` bigint;