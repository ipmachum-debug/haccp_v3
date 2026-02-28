ALTER TABLE `bank_transactions` ADD `matched_partner_id` bigint;--> statement-breakpoint
ALTER TABLE `bank_transactions` ADD `matched_at` timestamp;--> statement-breakpoint
ALTER TABLE `bank_transactions` ADD CONSTRAINT `bank_transactions_matched_partner_id_partners_id_fk` FOREIGN KEY (`matched_partner_id`) REFERENCES `partners`(`id`) ON DELETE no action ON UPDATE no action;