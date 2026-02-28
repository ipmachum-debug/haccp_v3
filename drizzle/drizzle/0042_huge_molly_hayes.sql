ALTER TABLE `h_user_widget_settings` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_alert_recipients` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_alert_rules` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_api_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_approval_history` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_approval_requests` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_approval_workflow_steps` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_approval_workflows` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_attendance_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_audit_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_backup_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_batch_approvals` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_batch_reports` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_bookmarks` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_calibration_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_ccp_deviations` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_ccp_inspection_alerts` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_ccp_monitoring` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_change_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_checklist_instances` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_checklist_responses` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_checklist_template_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_checklist_templates` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_cleaning_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_code_groups` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_codes` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_comments` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_complaints` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_continuous_improvement` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_corrective_actions` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_custom_field_values` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_custom_fields` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_customer_feedback` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_customers` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_daily_checklist_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_daily_checklists` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_daily_reports` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_dashboard_widgets` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_data_migrations` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_delegation_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_distribution_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_distributors` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_document_access_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_document_approvals` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_document_attachments` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_document_categories` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_document_versions` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_documents` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_email_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_emergency_contacts` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_emergency_drills` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_employee_certifications` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_employee_shifts` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_entity_tags` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_equipment` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_equipment_cleaning_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_equipment_maintenance` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_error_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_favorites` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_file_attachments` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_holidays` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_hygiene_checklist_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_hygiene_checklists` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_hygiene_incidents` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_hygiene_training_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inbound_headers` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inbound_lines` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_incidents` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inspection_plans` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inspection_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_integrations` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inventory_adjustments` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inventory_count_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inventory_counts` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inventory_lots` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_kpi_metrics` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_lab_test_requests` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_lab_test_results` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_leave_requests` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_login_history` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_material_inspections` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_monthly_reports` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_nonconformances` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_notification_settings` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_notifications` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_overtime_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_performance_reviews` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_pest_control_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_product_inspections` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_product_inventory` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_production_batches` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_production_material_usage` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_profitability_forecasts` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_purchase_order_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_purchase_orders` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_quality_objectives` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_recall_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_receiving_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_report_schedules` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_reports_templates` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_risk_assessments` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_sanitation_schedules` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_scheduled_tasks` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_sessions` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_shipping_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_signature_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_site_settings` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_sop_manuals` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_stock_alerts` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_stock_movements` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_supplier_audits` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_supplier_evaluations` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_suppliers` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_sync_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_system_health` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_system_settings` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_tags` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_task_history` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_temperature_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_training_assessments` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_training_materials` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_training_plans` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_training_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_user_preferences` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_verification_records` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_webhook_logs` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_webhooks` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_work_shifts` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_instance_item_history` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_instance_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_instances` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_template_items` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_templates` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_template_versions` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_corrective_action_attachments` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_corrective_action_requests` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_hazard_controls` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_training_courses` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_training_participants` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_training_reminders` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_training_schedules` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `health_certificates` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_approvals` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `checklist_schedules` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_document_workflow` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_high_amount_transactions` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `accounting_monthly_report` ADD `tenant_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `h_user_widget_settings` ADD CONSTRAINT `h_user_widget_settings_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_alert_recipients` ADD CONSTRAINT `h_alert_recipients_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_alert_rules` ADD CONSTRAINT `h_alert_rules_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_api_logs` ADD CONSTRAINT `h_api_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_approval_history` ADD CONSTRAINT `h_approval_history_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_approval_requests` ADD CONSTRAINT `h_approval_requests_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_approval_workflow_steps` ADD CONSTRAINT `h_approval_workflow_steps_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_approval_workflows` ADD CONSTRAINT `h_approval_workflows_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_attendance_records` ADD CONSTRAINT `h_attendance_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_audit_logs` ADD CONSTRAINT `h_audit_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_backup_logs` ADD CONSTRAINT `h_backup_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_batch_approvals` ADD CONSTRAINT `h_batch_approvals_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_batch_reports` ADD CONSTRAINT `h_batch_reports_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_bookmarks` ADD CONSTRAINT `h_bookmarks_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_calibration_records` ADD CONSTRAINT `h_calibration_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_ccp_deviations` ADD CONSTRAINT `h_ccp_deviations_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_ccp_inspection_alerts` ADD CONSTRAINT `h_ccp_inspection_alerts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_ccp_monitoring` ADD CONSTRAINT `h_ccp_monitoring_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_change_logs` ADD CONSTRAINT `h_change_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_checklist_instances` ADD CONSTRAINT `h_checklist_instances_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_checklist_responses` ADD CONSTRAINT `h_checklist_responses_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_checklist_template_items` ADD CONSTRAINT `h_checklist_template_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_checklist_templates` ADD CONSTRAINT `h_checklist_templates_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_cleaning_records` ADD CONSTRAINT `h_cleaning_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_code_groups` ADD CONSTRAINT `h_code_groups_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_codes` ADD CONSTRAINT `h_codes_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_comments` ADD CONSTRAINT `h_comments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_complaints` ADD CONSTRAINT `h_complaints_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_continuous_improvement` ADD CONSTRAINT `h_continuous_improvement_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_corrective_actions` ADD CONSTRAINT `h_corrective_actions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_custom_field_values` ADD CONSTRAINT `h_custom_field_values_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_custom_fields` ADD CONSTRAINT `h_custom_fields_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_customer_feedback` ADD CONSTRAINT `h_customer_feedback_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_customers` ADD CONSTRAINT `h_customers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_daily_checklist_items` ADD CONSTRAINT `h_daily_checklist_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_daily_checklists` ADD CONSTRAINT `h_daily_checklists_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_daily_reports` ADD CONSTRAINT `h_daily_reports_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_dashboard_widgets` ADD CONSTRAINT `h_dashboard_widgets_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_data_migrations` ADD CONSTRAINT `h_data_migrations_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_delegation_records` ADD CONSTRAINT `h_delegation_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_distribution_records` ADD CONSTRAINT `h_distribution_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_distributors` ADD CONSTRAINT `h_distributors_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_document_access_logs` ADD CONSTRAINT `h_document_access_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_document_approvals` ADD CONSTRAINT `h_document_approvals_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_document_attachments` ADD CONSTRAINT `h_document_attachments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_document_categories` ADD CONSTRAINT `h_document_categories_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_document_versions` ADD CONSTRAINT `h_document_versions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_documents` ADD CONSTRAINT `h_documents_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_email_logs` ADD CONSTRAINT `h_email_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_emergency_contacts` ADD CONSTRAINT `h_emergency_contacts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_emergency_drills` ADD CONSTRAINT `h_emergency_drills_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_employee_certifications` ADD CONSTRAINT `h_employee_certifications_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_employee_shifts` ADD CONSTRAINT `h_employee_shifts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_entity_tags` ADD CONSTRAINT `h_entity_tags_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_equipment` ADD CONSTRAINT `h_equipment_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_equipment_cleaning_logs` ADD CONSTRAINT `h_equipment_cleaning_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_equipment_maintenance` ADD CONSTRAINT `h_equipment_maintenance_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_error_logs` ADD CONSTRAINT `h_error_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_favorites` ADD CONSTRAINT `h_favorites_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_file_attachments` ADD CONSTRAINT `h_file_attachments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_holidays` ADD CONSTRAINT `h_holidays_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_hygiene_checklist_items` ADD CONSTRAINT `h_hygiene_checklist_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_hygiene_checklists` ADD CONSTRAINT `h_hygiene_checklists_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_hygiene_incidents` ADD CONSTRAINT `h_hygiene_incidents_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_hygiene_training_records` ADD CONSTRAINT `h_hygiene_training_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_inbound_headers` ADD CONSTRAINT `h_inbound_headers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_inbound_lines` ADD CONSTRAINT `h_inbound_lines_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_incidents` ADD CONSTRAINT `h_incidents_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_inspection_plans` ADD CONSTRAINT `h_inspection_plans_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_inspection_records` ADD CONSTRAINT `h_inspection_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_integrations` ADD CONSTRAINT `h_integrations_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_inventory_adjustments` ADD CONSTRAINT `h_inventory_adjustments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_inventory_count_items` ADD CONSTRAINT `h_inventory_count_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_inventory_counts` ADD CONSTRAINT `h_inventory_counts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_inventory_lots` ADD CONSTRAINT `h_inventory_lots_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_inventory_transactions` ADD CONSTRAINT `h_inventory_transactions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_kpi_metrics` ADD CONSTRAINT `h_kpi_metrics_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_lab_test_requests` ADD CONSTRAINT `h_lab_test_requests_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_lab_test_results` ADD CONSTRAINT `h_lab_test_results_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_leave_requests` ADD CONSTRAINT `h_leave_requests_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_login_history` ADD CONSTRAINT `h_login_history_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_material_inspections` ADD CONSTRAINT `h_material_inspections_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_monthly_reports` ADD CONSTRAINT `h_monthly_reports_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_nonconformances` ADD CONSTRAINT `h_nonconformances_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_notification_settings` ADD CONSTRAINT `h_notification_settings_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_notifications` ADD CONSTRAINT `h_notifications_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_overtime_records` ADD CONSTRAINT `h_overtime_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_performance_reviews` ADD CONSTRAINT `h_performance_reviews_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_pest_control_records` ADD CONSTRAINT `h_pest_control_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_product_inspections` ADD CONSTRAINT `h_product_inspections_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_product_inventory` ADD CONSTRAINT `h_product_inventory_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_production_batches` ADD CONSTRAINT `h_production_batches_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_production_material_usage` ADD CONSTRAINT `h_production_material_usage_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_profitability_forecasts` ADD CONSTRAINT `h_profitability_forecasts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_purchase_order_items` ADD CONSTRAINT `h_purchase_order_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_purchase_orders` ADD CONSTRAINT `h_purchase_orders_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_quality_objectives` ADD CONSTRAINT `h_quality_objectives_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_recall_records` ADD CONSTRAINT `h_recall_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_receiving_records` ADD CONSTRAINT `h_receiving_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_report_schedules` ADD CONSTRAINT `h_report_schedules_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_reports_templates` ADD CONSTRAINT `h_reports_templates_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_risk_assessments` ADD CONSTRAINT `h_risk_assessments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_sanitation_schedules` ADD CONSTRAINT `h_sanitation_schedules_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_scheduled_tasks` ADD CONSTRAINT `h_scheduled_tasks_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_sessions` ADD CONSTRAINT `h_sessions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_shipping_records` ADD CONSTRAINT `h_shipping_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_signature_records` ADD CONSTRAINT `h_signature_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_site_settings` ADD CONSTRAINT `h_site_settings_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_sop_manuals` ADD CONSTRAINT `h_sop_manuals_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_stock_alerts` ADD CONSTRAINT `h_stock_alerts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_stock_movements` ADD CONSTRAINT `h_stock_movements_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_supplier_audits` ADD CONSTRAINT `h_supplier_audits_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_supplier_evaluations` ADD CONSTRAINT `h_supplier_evaluations_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_suppliers` ADD CONSTRAINT `h_suppliers_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_sync_logs` ADD CONSTRAINT `h_sync_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_system_health` ADD CONSTRAINT `h_system_health_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_system_settings` ADD CONSTRAINT `h_system_settings_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_tags` ADD CONSTRAINT `h_tags_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_task_history` ADD CONSTRAINT `h_task_history_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_temperature_logs` ADD CONSTRAINT `h_temperature_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_training_assessments` ADD CONSTRAINT `h_training_assessments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_training_materials` ADD CONSTRAINT `h_training_materials_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_training_plans` ADD CONSTRAINT `h_training_plans_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_training_records` ADD CONSTRAINT `h_training_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_user_preferences` ADD CONSTRAINT `h_user_preferences_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_verification_records` ADD CONSTRAINT `h_verification_records_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_webhook_logs` ADD CONSTRAINT `h_webhook_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_webhooks` ADD CONSTRAINT `h_webhooks_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_work_shifts` ADD CONSTRAINT `h_work_shifts_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checklist_instance_item_history` ADD CONSTRAINT `checklist_instance_item_history_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checklist_instance_items` ADD CONSTRAINT `checklist_instance_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checklist_instances` ADD CONSTRAINT `checklist_instances_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checklist_template_items` ADD CONSTRAINT `checklist_template_items_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checklist_templates` ADD CONSTRAINT `checklist_templates_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checklist_template_versions` ADD CONSTRAINT `checklist_template_versions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_corrective_action_attachments` ADD CONSTRAINT `h_corrective_action_attachments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_corrective_action_requests` ADD CONSTRAINT `h_corrective_action_requests_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_hazard_controls` ADD CONSTRAINT `h_hazard_controls_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_training_courses` ADD CONSTRAINT `h_training_courses_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_training_participants` ADD CONSTRAINT `h_training_participants_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_training_reminders` ADD CONSTRAINT `h_training_reminders_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `h_training_schedules` ADD CONSTRAINT `h_training_schedules_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `health_certificates` ADD CONSTRAINT `health_certificates_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checklist_approvals` ADD CONSTRAINT `checklist_approvals_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checklist_schedules` ADD CONSTRAINT `checklist_schedules_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_document_workflow` ADD CONSTRAINT `accounting_document_workflow_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_documents` ADD CONSTRAINT `accounting_documents_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_high_amount_transactions` ADD CONSTRAINT `accounting_high_amount_transactions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounting_monthly_report` ADD CONSTRAINT `accounting_monthly_report_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;