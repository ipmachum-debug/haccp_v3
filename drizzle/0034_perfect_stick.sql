ALTER TABLE `h_inventory` ADD `item_name` varchar(255);--> statement-breakpoint
ALTER TABLE `h_stock_alerts` ADD `message` text;--> statement-breakpoint
ALTER TABLE `h_stock_alerts` ADD `severity` enum('low','medium','high','critical') DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE `h_stock_alerts` ADD `created_at` timestamp DEFAULT (now()) NOT NULL;