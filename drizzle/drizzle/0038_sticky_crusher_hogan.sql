ALTER TABLE `material_inspection_records` ADD `appearance` varchar(200);--> statement-breakpoint
ALTER TABLE `material_inspection_records` ADD `odor` varchar(200);--> statement-breakpoint
ALTER TABLE `material_inspection_records` ADD `color` varchar(100);--> statement-breakpoint
ALTER TABLE `material_inspection_records` ADD `temperature` decimal(5,2);--> statement-breakpoint
ALTER TABLE `material_inspection_records` ADD `result` enum('pass','fail','conditional');