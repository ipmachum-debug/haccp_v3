/**
 * 운영 DB introspect 결과 (drizzle-kit introspect, 2026-10-12) — 앱이 쓰는데 Drizzle 스키마에 없던 24개 테이블
 *
 * 12-schema-baseline-step6.md D·E 그룹. 수작업 금지 원칙대로 introspect 출력을 그대로 가져왔고,
 * 다른 파일의 테이블을 가리키는 .references() 만 기존 export 이름으로 바꿨다.
 * 컬럼 키가 snake_case 인 것은 introspect 규약 — 이 파일의 테이블은 raw SQL 또는 snake 키 그대로 쓴다.
 * (drizzle-kit 0.31 버그: 빈 문자열 기본값이 .default(') 로 나오는 것 → .default('') 로 교정)
 * 외부 참조 제거: 없음
 */
import { bigint, date, decimal, index, int, json, mysqlEnum, mysqlTable, primaryKey, text, timestamp, tinyint, unique, varchar } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const ai_chat_history = mysqlTable("ai_chat_history", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	conversation_id: varchar({ length: 255 }).notNull(),
	user_id: varchar({ length: 100 }),
	role: varchar({ length: 50 }).notNull(),
	content: text().notNull(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
},
(table) => [
	index("idx_chat_tenant_conv").on(table.tenant_id, table.conversation_id),
	index("idx_chat_created").on(table.created_at),
	primaryKey({ columns: [table.id], name: "ai_chat_history_id"}),
]);

export const ai_parse_corrections = mysqlTable("ai_parse_corrections", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	input_alias: varchar({ length: 300 }),
	normalized_alias: varchar({ length: 300 }),
	product_id: int(),
	product_name: varchar({ length: 300 }),
	default_quantity_kg: decimal({ precision: 10, scale: 2 }),
	use_count: int().default(1),
	corrected_by: int(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("idx_parsecorr_tenant").on(table.tenant_id),
	primaryKey({ columns: [table.id], name: "ai_parse_corrections_id"}),
	unique("uk_parsecorr").on(table.tenant_id, table.normalized_alias),
]);

export const ai_parse_history = mysqlTable("ai_parse_history", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	input_text: text(),
	parse_method: varchar({ length: 100 }),
	confirmed_result: json(),
	correction_count: int().default(0),
	total_items: int().default(0),
	accuracy: decimal({ precision: 5, scale: 4 }),
	user_id: int(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
},
(table) => [
	index("idx_parsehist_tenant").on(table.tenant_id),
	index("idx_parsehist_created").on(table.created_at),
	primaryKey({ columns: [table.id], name: "ai_parse_history_id"}),
]);

export const attendance_records = mysqlTable("attendance_records", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	employee_id: bigint({ mode: "number" }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	work_date: date({ mode: 'string' }).notNull(),
	clock_in: varchar({ length: 8 }),
	clock_out: varchar({ length: 8 }),
	work_hours: decimal({ precision: 5, scale: 2 }).default('0.00'),
	status: mysqlEnum(['present','late','absent','half_day','holiday']).default('present'),
	notes: text(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
},
(table) => [
	index("idx_att_date").on(table.tenant_id, table.work_date),
	primaryKey({ columns: [table.id], name: "attendance_records_id"}),
	unique("uq_att").on(table.tenant_id, table.employee_id, table.work_date),
]);

export const budgets = mysqlTable("budgets", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	account_id: bigint({ mode: "number" }).notNull(),
	year: int().notNull(),
	m1: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m2: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m3: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m4: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m5: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m6: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m7: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m8: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m9: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m10: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m11: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	m12: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("idx_budget_tenant_year").on(table.tenant_id, table.year),
	primaryKey({ columns: [table.id], name: "budgets_id"}),
	unique("uq_budget").on(table.tenant_id, table.account_id, table.year),
]);

export const document_approval_history = mysqlTable("document_approval_history", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	document_instance_id: bigint({ mode: "number" }).notNull(),
	action: mysqlEnum(['created','submitted_for_review','reviewed','submitted_for_approval','approved','rejected','cancelled']).notNull(),
	actor_id: bigint({ mode: "number" }).notNull(),
	actor_role: mysqlEnum(['creator','reviewer','approver','admin']).notNull(),
	comments: text(),
	previous_status: varchar({ length: 50 }),
	new_status: varchar({ length: 50 }),
	created_at: timestamp({ fsp: 3, mode: 'string' }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
},
(table) => [
	index("idx_dah_tenant").on(table.tenant_id),
	index("idx_dah_document").on(table.document_instance_id),
	index("idx_dah_actor").on(table.actor_id),
	primaryKey({ columns: [table.id], name: "document_approval_history_id"}),
]);

export const document_auto_approval_settings = mysqlTable("document_auto_approval_settings", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	site_id: bigint({ mode: "number" }).notNull(),
	document_type_id: bigint({ mode: "number" }).notNull(),
	auto_approval_enabled: tinyint().default(0).notNull(),
	auto_approval_delay_minutes: int().default(0),
	conditions: json(),
	default_reviewer_id: bigint({ mode: "number" }),
	default_approver_id: bigint({ mode: "number" }),
	created_at: timestamp({ fsp: 3, mode: 'string' }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
	updated_at: timestamp({ fsp: 3, mode: 'string' }).default(sql`(CURRENT_TIMESTAMP(3))`).onUpdateNow().notNull(),
},
(table) => [
	index("idx_daas_tenant").on(table.tenant_id),
	index("idx_daas_site").on(table.site_id),
	index("idx_daas_document_type").on(table.document_type_id),
	primaryKey({ columns: [table.id], name: "document_auto_approval_settings_id"}),
	unique("uk_daas_site_type").on(table.tenant_id, table.site_id, table.document_type_id),
]);

export const document_batch_print_groups = mysqlTable("document_batch_print_groups", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	site_id: bigint({ mode: "number" }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	work_date: date({ mode: 'string' }).notNull(),
	group_name: varchar({ length: 200 }).notNull(),
	description: text(),
	total_documents: int().default(0).notNull(),
	printed_by: bigint({ mode: "number" }),
	printed_at: timestamp({ fsp: 3, mode: 'string' }),
	combined_pdf_url: varchar({ length: 500 }),
	pdf_generated_at: timestamp({ fsp: 3, mode: 'string' }),
	created_at: timestamp({ fsp: 3, mode: 'string' }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
	updated_at: timestamp({ fsp: 3, mode: 'string' }).default(sql`(CURRENT_TIMESTAMP(3))`).onUpdateNow().notNull(),
},
(table) => [
	index("idx_dbpg_tenant").on(table.tenant_id),
	index("idx_dbpg_site").on(table.site_id),
	index("idx_dbpg_work_date").on(table.work_date),
	primaryKey({ columns: [table.id], name: "document_batch_print_groups_id"}),
]);

export const document_batch_print_items = mysqlTable("document_batch_print_items", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	batch_print_group_id: bigint({ mode: "number" }).notNull(),
	document_instance_id: bigint({ mode: "number" }).notNull(),
	sort_order: int().default(0).notNull(),
	created_at: timestamp({ fsp: 3, mode: 'string' }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
},
(table) => [
	index("idx_dbpi_tenant").on(table.tenant_id),
	index("idx_dbpi_group").on(table.batch_print_group_id),
	index("idx_dbpi_document").on(table.document_instance_id),
	primaryKey({ columns: [table.id], name: "document_batch_print_items_id"}),
]);

export const document_instances = mysqlTable("document_instances", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	site_id: int(),
	document_type_id: int(),
	batch_id: bigint({ mode: "number" }),
	product_id: int(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	work_date: date({ mode: 'string' }),
	status: varchar({ length: 50 }).default('draft'),
	created_by: bigint({ mode: "number" }),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
	reviewer_id: bigint({ mode: "number" }),
	reviewed_at: timestamp({ mode: 'string' }),
	review_comments: text(),
	approver_id: bigint({ mode: "number" }),
	approved_at: timestamp({ mode: 'string' }),
	approval_comments: text(),
	rejected_by: bigint({ mode: "number" }),
	rejected_at: timestamp({ mode: 'string' }),
	is_auto_generated: tinyint().default(0),
	auto_approval_enabled: tinyint().default(0),
	document_data: json(),
	pdf_url: varchar({ length: 500 }),
	pdf_generated_at: timestamp({ mode: 'string' }),
	tenant_id: int(),
},
(table) => [
	index("idx_di_batch_id").on(table.batch_id),
	index("idx_di_tenant_id").on(table.tenant_id),
	index("idx_di_status").on(table.status),
	index("idx_di_work_date").on(table.work_date),
	index("idx_di_document_type_id").on(table.document_type_id),
	primaryKey({ columns: [table.id], name: "document_instances_id"}),
]);

export const document_types = mysqlTable("document_types", {
	id: int().autoincrement().notNull(),
	code: varchar({ length: 100 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	category: varchar({ length: 100 }),
	description: text(),
	is_active: tinyint().default(1),
	auto_generate_on_batch: tinyint().default(0),
	requires_approval: tinyint().default(0),
	approval_levels: int().default(3),
	tenant_id: int(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("idx_dt_tenant_id").on(table.tenant_id),
	index("idx_dt_code").on(table.code),
	index("idx_dt_active").on(table.is_active),
	primaryKey({ columns: [table.id], name: "document_types_id"}),
]);

export const fixed_asset_depreciation = mysqlTable("fixed_asset_depreciation", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	asset_id: bigint({ mode: "number" }).notNull(),
	year_month: varchar({ length: 7 }).notNull(),
	amount: decimal({ precision: 15, scale: 2 }).notNull(),
	accumulated_after: decimal({ precision: 15, scale: 2 }).notNull(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
},
(table) => [
	index("idx_fad_tenant").on(table.tenant_id),
	primaryKey({ columns: [table.id], name: "fixed_asset_depreciation_id"}),
	unique("uq_fad_asset_month").on(table.tenant_id, table.asset_id, table.year_month),
]);

export const fixed_assets = mysqlTable("fixed_assets", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	asset_code: varchar({ length: 50 }).notNull(),
	asset_name: varchar({ length: 200 }).notNull(),
	category: mysqlEnum(['building','machinery','vehicle','furniture','computer','other']).default('other').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	acquisition_date: date({ mode: 'string' }).notNull(),
	acquisition_cost: decimal({ precision: 15, scale: 2 }).notNull(),
	useful_life_months: int().default(60).notNull(),
	depreciation_method: mysqlEnum(['straight_line','declining_balance']).default('straight_line').notNull(),
	salvage_value: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	accumulated_depreciation: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	accounting_account_id: bigint({ mode: "number" }),
	location: varchar({ length: 200 }),
	notes: text(),
	status: mysqlEnum(['active','disposed']).default('active').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	disposal_date: date({ mode: 'string' }),
	disposal_amount: decimal({ precision: 15, scale: 2 }),
	registered_by: bigint({ mode: "number" }),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("idx_fa_tenant").on(table.tenant_id),
	index("idx_fa_status").on(table.tenant_id, table.status),
	primaryKey({ columns: [table.id], name: "fixed_assets_id"}),
	unique("uq_fa_code").on(table.tenant_id, table.asset_code),
]);

export const h_batch_pdf_logs = mysqlTable("h_batch_pdf_logs", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	batch_id: bigint({ mode: "number" }).notNull(),
	status: mysqlEnum(['success','failed']).notNull(),
	file_url: text(),
	error_message: text(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
},
(table) => [
	index("idx_bpl_batch_id").on(table.batch_id),
	index("idx_bpl_status").on(table.status),
	primaryKey({ columns: [table.id], name: "h_batch_pdf_logs_id"}),
]);

export const h_finished_product_inspection_items = mysqlTable("h_finished_product_inspection_items", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().default(1).notNull(),
	log_id: bigint({ mode: "number" }).notNull(),
	ship_date: varchar({ length: 20 }).default('').notNull(),
	product_name: varchar({ length: 200 }).default('').notNull(),
	lot_number: varchar({ length: 100 }).default(''),
	quantity: varchar({ length: 50 }).default(''),
	packaging_status: varchar({ length: 10 }).default('○'),
	label_status: varchar({ length: 10 }).default('○'),
	temperature: varchar({ length: 30 }).default(''),
	result: varchar({ length: 20 }).default('적합'),
	corrective_action: text(),
	note: text(),
	batch_id: bigint({ mode: "number" }),
	sort_order: int().default(0),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("idx_fpii_log").on(table.log_id),
	index("idx_fpii_tenant").on(table.tenant_id),
	primaryKey({ columns: [table.id], name: "h_finished_product_inspection_items_id"}),
]);

export const h_finished_product_inspection_logs = mysqlTable("h_finished_product_inspection_logs", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().default(1).notNull(),
	site_id: bigint({ mode: "number" }).notNull(),
	log_year: int().notNull(),
	log_month: int().notNull(),
	title: varchar({ length: 200 }).default(''),
	created_by: int(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("idx_fpil_tenant_ym").on(table.tenant_id, table.log_year, table.log_month),
	primaryKey({ columns: [table.id], name: "h_finished_product_inspection_logs_id"}),
]);

export const h_product_outbound = mysqlTable("h_product_outbound", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().default(1).notNull(),
	batch_id: bigint({ mode: "number" }),
	lot_id: bigint({ mode: "number" }),
	product_name: varchar({ length: 255 }).notNull(),
	quantity: decimal({ precision: 10, scale: 3 }).notNull(),
	unit: varchar({ length: 20 }).default('EA').notNull(),
	unit_price: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	total_amount: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	partner_id: bigint({ mode: "number" }),
	partner_name: varchar({ length: 255 }),
	release_date: varchar({ length: 10 }).notNull(),
	release_type: mysqlEnum(['sale','delivery','sample','return','other']).default('sale').notNull(),
	lot_number: varchar({ length: 100 }),
	notes: text(),
	status: mysqlEnum(['confirmed','cancelled']).default('confirmed').notNull(),
	created_by: bigint({ mode: "number" }).notNull(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("idx_tenant").on(table.tenant_id),
	index("idx_batch").on(table.batch_id),
	index("idx_lot").on(table.lot_id),
	index("idx_release_date").on(table.release_date),
	index("idx_partner").on(table.partner_id),
	index("idx_status").on(table.status),
	primaryKey({ columns: [table.id], name: "h_product_outbound_id"}),
]);

export const h_training_levels = mysqlTable("h_training_levels", {
	id: int().autoincrement().notNull(),
	user_id: int().notNull(),
	tenant_id: int().notNull(),
	score: int().default(0).notNull(),
	streak: int().default(0).notNull(),
	max_streak: int().default(0).notNull(),
	level: int().default(1).notNull(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "h_training_levels_id"}),
	unique("uq_user_tenant").on(table.user_id, table.tenant_id),
]);

export const h_training_monthly_reports = mysqlTable("h_training_monthly_reports", {
	id: int().autoincrement().notNull(),
	tenant_id: int().notNull(),
	year: int().notNull(),
	month: int().notNull(),
	title: varchar({ length: 200 }).notNull(),
	total_days: int().default(0).notNull(),
	total_users: int().default(0).notNull(),
	total_done: int().default(0).notNull(),
	overall_rate: int().default(0).notNull(),
	status: mysqlEnum(['draft','pending','reviewed','approved','rejected']).default('draft').notNull(),
	approval_id: int(),
	created_by: int().notNull(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "h_training_monthly_reports_id"}),
	unique("uq_tenant_year_month").on(table.tenant_id, table.year, table.month),
]);

export const h_visual_inspection_items = mysqlTable("h_visual_inspection_items", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().default(1).notNull(),
	log_id: bigint({ mode: "number" }).notNull(),
	receipt_date: varchar({ length: 20 }).default('').notNull(),
	product_name: varchar({ length: 200 }).default('').notNull(),
	import_cert_origin: varchar({ length: 100 }).default(''),
	test_report_avail: varchar({ length: 10 }).default('—'),
	expiry_date: varchar({ length: 30 }).default(''),
	manufacture_date: varchar({ length: 30 }).default(''),
	quality_retain_date: varchar({ length: 30 }).default(''),
	vehicle_temp: varchar({ length: 10 }).default('—'),
	vehicle_condition: varchar({ length: 10 }).default('—'),
	pallet_condition: varchar({ length: 10 }).default('—'),
	normal_approved: varchar({ length: 10 }).default('—'),
	foreign_matter: varchar({ length: 10 }).default('—'),
	label_allergen: varchar({ length: 10 }).default('—'),
	label_manager: varchar({ length: 10 }).default('—'),
	compliance: varchar({ length: 20 }).default('적합'),
	corrective_action: text(),
	note: text(),
	sort_order: int().default(0),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("idx_vii_log").on(table.log_id),
	index("idx_vii_tenant").on(table.tenant_id),
	primaryKey({ columns: [table.id], name: "h_visual_inspection_items_id"}),
]);

export const h_visual_inspection_logs = mysqlTable("h_visual_inspection_logs", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().default(1).notNull(),
	site_id: bigint({ mode: "number" }).notNull(),
	log_year: int().notNull(),
	log_month: int().notNull(),
	title: varchar({ length: 200 }).default(''),
	summary_json: text(),
	created_by: int(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("idx_vil_tenant_ym").on(table.tenant_id, table.log_year, table.log_month),
	primaryKey({ columns: [table.id], name: "h_visual_inspection_logs_id"}),
]);

export const leave_balances = mysqlTable("leave_balances", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	employee_id: bigint({ mode: "number" }).notNull(),
	year: int().notNull(),
	annual_total: int().default(15).notNull(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	primaryKey({ columns: [table.id], name: "leave_balances_id"}),
	unique("uq_lb").on(table.tenant_id, table.employee_id, table.year),
]);

export const leave_requests = mysqlTable("leave_requests", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	employee_id: bigint({ mode: "number" }).notNull(),
	leave_type: mysqlEnum(['annual','sick','personal','maternity','other']).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	start_date: date({ mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	end_date: date({ mode: 'string' }).notNull(),
	days: int().default(1).notNull(),
	reason: text(),
	status: mysqlEnum(['pending','approved','rejected','cancelled']).default('pending'),
	approved_by: bigint({ mode: "number" }),
	approved_at: timestamp({ mode: 'string' }),
	approval_comment: text(),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
},
(table) => [
	index("idx_leave_tenant").on(table.tenant_id, table.employee_id),
	index("idx_leave_date").on(table.tenant_id, table.start_date),
	primaryKey({ columns: [table.id], name: "leave_requests_id"}),
]);

export const payroll_records = mysqlTable("payroll_records", {
	id: bigint({ mode: "number" }).autoincrement().notNull(),
	tenant_id: int().notNull(),
	employee_id: bigint({ mode: "number" }).notNull(),
	year_month: varchar({ length: 7 }).notNull(),
	base_salary: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	overtime: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	bonus: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	allowances: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	gross_pay: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	national_pension: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	health_insurance: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	long_term_care: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	employment_insurance: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	income_tax: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	local_income_tax: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	total_deductions: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	net_pay: decimal({ precision: 15, scale: 2 }).default('0.00').notNull(),
	status: mysqlEnum(['draft','paid','cancelled']).default('draft').notNull(),
	paid_at: timestamp({ mode: 'string' }),
	created_by: bigint({ mode: "number" }),
	created_at: timestamp({ mode: 'string' }).defaultNow(),
	updated_at: timestamp({ mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("idx_payroll_tenant_month").on(table.tenant_id, table.year_month),
	primaryKey({ columns: [table.id], name: "payroll_records_id"}),
	unique("uq_payroll").on(table.tenant_id, table.employee_id, table.year_month),
]);
