CREATE TABLE `h_haccp_plan_verification` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`verification_number` varchar(50) NOT NULL,
	`verification_date` date NOT NULL,
	`verification_period` varchar(100),
	`verification_type` enum('annual','product_change','process_change','incident','regulation_change') NOT NULL,
	`site_id` bigint NOT NULL,
	`product_ids` text,
	`verification_leader` bigint NOT NULL,
	`verification_team` text,
	`verification_scope` text,
	`verification_method` text,
	`hazard_analysis_adequate` tinyint,
	`ccp_determination_adequate` tinyint,
	`critical_limits_adequate` tinyint,
	`monitoring_procedures_adequate` tinyint,
	`corrective_actions_adequate` tinyint,
	`record_keeping_adequate` tinyint,
	`overall_result` enum('adequate','needs_improvement','inadequate') NOT NULL,
	`findings` text,
	`recommendations` text,
	`improvement_actions` text,
	`action_due_date` date,
	`action_completed_date` date,
	`action_completed_by` bigint,
	`approved_by` bigint,
	`approved_date` date,
	`next_verification_date` date,
	`attachments` text,
	`notes` text,
	`created_by` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `h_haccp_plan_verification_id` PRIMARY KEY(`id`),
	CONSTRAINT `h_haccp_plan_verification_verification_number_unique` UNIQUE(`verification_number`)
);
--> statement-breakpoint
CREATE TABLE `h_haccp_plan_verification_checklist` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`verification_id` bigint NOT NULL,
	`category` varchar(100) NOT NULL,
	`check_item` text NOT NULL,
	`check_result` enum('pass','fail','na') NOT NULL,
	`evidence` text,
	`remarks` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `h_haccp_plan_verification_checklist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `h_internal_audit_attachments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`audit_id` bigint NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_url` varchar(500) NOT NULL,
	`file_type` varchar(50),
	`file_size` bigint,
	`description` text,
	`uploaded_by` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `h_internal_audit_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `h_internal_audit_checklist` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`audit_id` bigint NOT NULL,
	`category` varchar(100) NOT NULL,
	`sub_category` varchar(100),
	`check_item` text NOT NULL,
	`check_criteria` text,
	`check_result` enum('pass','fail','na'),
	`non_conformity_level` enum('critical','major','minor'),
	`findings` text,
	`evidence` text,
	`corrective_action_required` tinyint DEFAULT 0,
	`corrective_action_id` bigint,
	`remarks` text,
	`checked_by` bigint,
	`checked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `h_internal_audit_checklist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `h_internal_audit_findings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`audit_id` bigint NOT NULL,
	`checklist_item_id` bigint,
	`finding_number` varchar(50) NOT NULL,
	`finding_type` enum('non_conformity','observation','opportunity') NOT NULL,
	`severity` enum('critical','major','minor') NOT NULL,
	`category` varchar(100) NOT NULL,
	`description` text NOT NULL,
	`requirement` text,
	`evidence` text,
	`responsible_person` bigint,
	`responsible_department` varchar(100),
	`corrective_action_required` tinyint DEFAULT 1,
	`corrective_action_id` bigint,
	`corrective_action_due_date` date,
	`status` enum('open','in_progress','resolved','verified','closed') DEFAULT 'open',
	`resolved_date` date,
	`verified_by` bigint,
	`verified_date` date,
	`notes` text,
	`created_by` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `h_internal_audit_findings_id` PRIMARY KEY(`id`),
	CONSTRAINT `h_internal_audit_findings_finding_number_unique` UNIQUE(`finding_number`)
);
--> statement-breakpoint
CREATE TABLE `h_internal_audit_plans` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`plan_year` int NOT NULL,
	`plan_number` varchar(50) NOT NULL,
	`plan_name` varchar(200) NOT NULL,
	`audit_scope` text,
	`audit_frequency` varchar(100),
	`status` enum('draft','approved','in_progress','completed') DEFAULT 'draft',
	`approved_by` bigint,
	`approved_date` date,
	`notes` text,
	`created_by` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `h_internal_audit_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `h_internal_audit_plans_plan_number_unique` UNIQUE(`plan_number`)
);
--> statement-breakpoint
CREATE TABLE `h_internal_audits` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`plan_id` bigint,
	`audit_number` varchar(50) NOT NULL,
	`audit_name` varchar(200) NOT NULL,
	`audit_type` enum('scheduled','special','follow_up') NOT NULL,
	`scheduled_date` date NOT NULL,
	`actual_start_date` date,
	`actual_end_date` date,
	`site_id` bigint NOT NULL,
	`audit_scope` text,
	`audit_areas` text,
	`lead_auditor` bigint NOT NULL,
	`audit_team` text,
	`overall_rating` enum('excellent','good','acceptable','needs_improvement','unacceptable'),
	`total_check_items` int DEFAULT 0,
	`passed_items` int DEFAULT 0,
	`failed_items` int DEFAULT 0,
	`na_items` int DEFAULT 0,
	`compliance_rate` decimal(5,2),
	`executive_summary` text,
	`strengths` text,
	`weaknesses` text,
	`recommendations` text,
	`status` enum('scheduled','in_progress','completed','cancelled') DEFAULT 'scheduled',
	`report_issued` tinyint DEFAULT 0,
	`report_issued_date` date,
	`report_url` varchar(500),
	`notes` text,
	`created_by` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `h_internal_audits_id` PRIMARY KEY(`id`),
	CONSTRAINT `h_internal_audits_audit_number_unique` UNIQUE(`audit_number`)
);
--> statement-breakpoint
ALTER TABLE `h_haccp_plan_verification` ADD CONSTRAINT `h_haccp_plan_verification_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_haccp_plan_verification_checklist` ADD CONSTRAINT `h_haccp_plan_verification_checklist_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_internal_audit_attachments` ADD CONSTRAINT `h_internal_audit_attachments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_internal_audit_checklist` ADD CONSTRAINT `h_internal_audit_checklist_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_internal_audit_findings` ADD CONSTRAINT `h_internal_audit_findings_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_internal_audit_plans` ADD CONSTRAINT `h_internal_audit_plans_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_internal_audits` ADD CONSTRAINT `h_internal_audits_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_verification_date` ON `h_haccp_plan_verification` (`verification_date`);--> statement-breakpoint
CREATE INDEX `idx_site` ON `h_haccp_plan_verification` (`site_id`);--> statement-breakpoint
CREATE INDEX `idx_type` ON `h_haccp_plan_verification` (`verification_type`);--> statement-breakpoint
CREATE INDEX `idx_result` ON `h_haccp_plan_verification` (`overall_result`);--> statement-breakpoint
CREATE INDEX `idx_verification` ON `h_haccp_plan_verification_checklist` (`verification_id`);--> statement-breakpoint
CREATE INDEX `idx_audit` ON `h_internal_audit_attachments` (`audit_id`);--> statement-breakpoint
CREATE INDEX `idx_audit` ON `h_internal_audit_checklist` (`audit_id`);--> statement-breakpoint
CREATE INDEX `idx_category` ON `h_internal_audit_checklist` (`category`);--> statement-breakpoint
CREATE INDEX `idx_result` ON `h_internal_audit_checklist` (`check_result`);--> statement-breakpoint
CREATE INDEX `idx_audit` ON `h_internal_audit_findings` (`audit_id`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `h_internal_audit_findings` (`status`);--> statement-breakpoint
CREATE INDEX `idx_severity` ON `h_internal_audit_findings` (`severity`);--> statement-breakpoint
CREATE INDEX `idx_type` ON `h_internal_audit_findings` (`finding_type`);--> statement-breakpoint
CREATE INDEX `idx_year` ON `h_internal_audit_plans` (`plan_year`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `h_internal_audit_plans` (`status`);--> statement-breakpoint
CREATE INDEX `idx_plan` ON `h_internal_audits` (`plan_id`);--> statement-breakpoint
CREATE INDEX `idx_date` ON `h_internal_audits` (`scheduled_date`);--> statement-breakpoint
CREATE INDEX `idx_site` ON `h_internal_audits` (`site_id`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `h_internal_audits` (`status`);--> statement-breakpoint
CREATE INDEX `idx_type` ON `h_internal_audits` (`audit_type`);