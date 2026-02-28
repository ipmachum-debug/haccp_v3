ALTER TABLE `h_inventory_transactions` ADD `inventory_id` bigint;--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `unit_cost` decimal(10,2);--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `amount` decimal(15,2);--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `transaction_date` date;--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `source_id` bigint;--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `source_line_id` bigint;--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `action_type` varchar(50);