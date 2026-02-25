ALTER TABLE `h_inventory_transactions` MODIFY COLUMN `transaction_type` enum('receipt','usage','adjustment','transfer','disposal','return','inbound','outbound') NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `source_type` varchar(50);--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `purpose` varchar(100);--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `performed_by` bigint;--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;