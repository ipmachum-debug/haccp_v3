# 12. 스키마 baseline — 6단계 (빈 테이블·백업 테이블 정리 + Drizzle = DB)

> 작성: 2026-10-12. 상태: **분류 확정, 실행 대기** (FK 4단계 일주일 관찰 뒤 실행 권장).
> 근거: 운영 DB 덤프 2026-10-10 (444 테이블) × Drizzle 스키마 (358 테이블) × 앱 코드 참조 (server/client/shared, 테스트·일회성 스크립트 제외).
> 선행: `11-identity-policy-v3.md` §3 6단계.

## 0. 한 줄 결론

DB 와 Drizzle 스키마가 서로 다른 테이블 목록을 갖고 있다 (DB-only 122, 스키마-only 36).
**스키마가 진실이 아니다.** 6단계는 (a) 백업·죽은 테이블을 치우고 (b) 코드가 실제로 쓰는 테이블을 스키마에 넣고
(c) 코드가 쓰는데 DB 에 없는 테이블을 만들어서, 그 뒤로는 `drizzle-kit` 이 DB 와 1:1 이 되게 하는 작업이다.

## 1. 분류 (덤프 실측)

| 분류 | 테이블 수 | 처리 |
|---|---:|---|
| A. 백업·임시 테이블 (스키마 밖, 앱 참조 0) | **28** (13,332행) | 아카이브(mysqldump 파일) 후 DROP |
| B. DB-only · 비어 있음 · 앱 참조 0 | **14** | DROP (실행 시점 0행 재확인) |
| C. DB-only · 데이터 있음 · 앱 참조 0 | **2** | `phase2_lot0_matches` 아카이브 후 DROP, `sku_aliases`(1행) 용도 확인 후 |
| D. DB-only · 앱이 쓰는데 스키마에 없음 (데이터 있음) | **28** | **Drizzle 스키마에 추가** (introspect) — 6-b |
| E. DB-only · 앱이 쓰는데 스키마에 없음 (비어 있음) | **50** | 스키마에 추가 — 6-b (기능 미사용이지만 코드가 쓴다) |
| F. 스키마-only · 앱이 참조 | **11** | **DB 에 생성** — 지금 호출되면 500. 우선 확인 — 6-c |
| G. 스키마-only · 앱 참조 0 | **25** | Drizzle 스키마에서 제거 (platform 설계 잔재) — 6-c |
| H. 스키마에 있고 비어 있음 | 230 | 유지 (기능 미사용) |

`_orphan_*_20261012` 격리 테이블(2단계)은 30일 보존 후 별도 결정 — 이 문서 대상 아님.

## 2. A — 백업·임시 테이블 (28)
| 테이블 | 행수 |
|---|---|
| _backup_h_batch_inputs_step16 | 860 |
| _backup_item_master_step15 | 15 |
| _bak_batch_actual_qty_20260510 | 63 |
| _bak_batch_inputs_20260509 | 283 |
| _bak_ledger_daily_20260509 | 1906 |
| _bak_ledger_monthly_20260509 | 3419 |
| _bak_macadamia_product_name_20260510 | 6 |
| _bak_orphan_daily_log_ar_20260510 | 4 |
| backup_accounting_purchases_154_20260630_100739 | 1 |
| backup_accounting_purchases_3_26_add_20260630_101404 | 6 |
| backup_accounting_purchases_dongah_correction_20260701 | 42 |
| backup_calibration_equipment_20260702 | 1 |
| backup_calibration_records_20260702 | 0 |
| backup_h_inventory_20260630_095410_v5apply | 1 |
| backup_h_inventory_lots_20260630_095410_v5apply | 8 |
| backup_purchase_125_delete_20260630_101928 | 1 |
| backup_tx_9931_20260630_101404 | 1 |
| h_inventory_lots_backup_pid_fix_20260425 | 82 |
| k3_mapping_backup_2026_04_26 | 1305 |
| k5_backfill_backup_2026_04_26 | 0 |
| lot_id_nullable_backup_2026_04_28 | 4 |
| phase2_lot0_backup_2026_04_28 | 440 |
| w2_lot_unit_backup_2026_04_26_il | 13 |
| w2_lot_unit_backup_2026_04_26_lots | 13 |
| w2_lot_unit_backup_2026_04_26_tx | 18 |
| w3_backfill_source_type_backup_2026_04_26 | 837 |
| w3_tx_backup_2026_04_26 | 4000 |
| w4_backup_lot_750_removal_2026_06_25 | 3 |

전부 2026-04~07 일회성 작업의 백업이다. 복구가 필요했던 적 없음. 한 파일로 아카이브(`§1` 명령) 후 DROP.

## 3. B — 비어 있고 아무도 안 쓰는 테이블 (14)
`accounting_purchase_items`, `accounting_sale_items`, `checklist_approvals`, `checklist_instance_item_history`, `checklist_schedules`, `checklist_template_versions`, `communication_log_files`, `h_cosmetic_formula_ingredient`, `h_quality_risk_assessments`, `hazard_analysis`, `metal_detection_standards`, `product_ccp_specs`, `product_specifications`, `verification_records`

실행 시점에 `COUNT(*)=0` 을 다시 확인하고 DROP.

## 4. C — 데이터는 있는데 아무도 안 쓰는 테이블 (2)
| 테이블 | 행수 |
|---|---|
| phase2_lot0_matches_2026_04_28 | 440 |
| sku_aliases | 1 |

## 5. D·E — 앱은 쓰는데 Drizzle 스키마에 없는 테이블 (78) → 6-b
**데이터 있음 (28)**
| 테이블 | 행수 |
|---|---|
| account_categories | 27 |
| ai_alerts | 2301 |
| ai_audit_logs | 16 |
| ai_chat_history | 72 |
| ai_parse_corrections | 396 |
| ai_parse_history | 120 |
| attendance_records | 582 |
| b2c_sellers | 4 |
| bundle_lots | 222 |
| ccp_process_group_equipments | 17 |
| ccp_process_group_products | 154 |
| ccp_process_groups | 5 |
| ccp_time_profiles | 4 |
| communication_log_acks | 183 |
| communication_log_comments | 30 |
| communication_log_notifications | 40 |
| document_types | 2220 |
| h_finished_product_inspection_items | 2153 |
| h_finished_product_inspection_logs | 22 |
| h_training_levels | 9 |
| h_visual_inspection_items | 585 |
| h_visual_inspection_logs | 21 |
| leave_balances | 15 |
| leave_requests | 32 |
| partner_activities | 426 |
| partner_scores | 12112 |
| partner_tags | 124 |
| sku_bundles | 17 |

**비어 있음 (50)**: `ai_batch_summaries`, `ai_knowledge_chunks`, `ai_knowledge_documents`, `ai_rules`, `ai_standards`, `b2c_sales_entries`, `budgets`, `capabilities`, `ccp_limits`, `ccp_monitoring_records`, `ccp_product_time_profile_map`, `checklist_instance_items`, `checklist_instances`, `checklist_template_items`, `checklist_templates`, `document_approval_history`, `document_auto_approval_settings`, `document_batch_print_groups`, `document_batch_print_items`, `document_instances`, `fixed_asset_depreciation`, `fixed_assets`, `h_allergen_assessments`, `h_audits`, `h_batch_pdf_logs`, `h_calibrations`, `h_change_controls`, `h_corrective_actions`, `h_cosmetic_bmr`, `h_cosmetic_bmr_ingredient`, `h_cosmetic_bmr_ipc`, `h_cosmetic_formula`, `h_cosmetic_label`, `h_cosmetic_release`, `h_cosmetic_stability_observation`, `h_cosmetic_stability_test`, `h_environmental_monitoring`, `h_food_defense_assessments`, `h_food_fraud_assessments`, `h_food_safety_culture_assessments`, `h_nonconformings`, `h_product_outbound`, `h_quality_suppliers`, `h_training_monthly_reports`, `h_trainings`, `metal_detection_tests`, `partner_documents`, `payroll_records`, `role_capabilities`, `user_capability_grants`

처리: `drizzle-kit introspect` 로 DB 에서 끌어와 `drizzle/schema/` 에 넣는다. 이 78개가 스키마에 들어가야 "스키마 = DB" 가 성립하고 FK·마이그레이션을 Drizzle 로 관리할 수 있다. 수작업 금지.

## 6. F·G — Drizzle 스키마에만 있는 테이블 (36) → 6-c
**앱이 참조 (11) — 운영에 없음, 호출되면 500**: `backups`, `banners`, `doc_line_lots`, `invoices`, `iot_devices`, `iot_events`, `iot_rules`, `iot_sensor_data`, `migrations`, `payments`, `plans`
- `doc_line_lots`: `saveLotAllocations` 가 쓰지만 호출자 0 (원재료 출고 전표 삭제 #452 로 소멸) → 함수와 함께 제거 후보
- `banners`, `iot_*`, `invoices` / `payments` / `plans`, `backups`, `migrations`: 운영 화면에서 해당 메뉴를 열어 500 인지 확인 → 쓰면 생성, 안 쓰면 코드 제거

**앱 참조 0 (25) — 스키마에서 제거**: `billing_accounts`, `data_import_runs`, `feature_flags`, `incident_updates`, `incidents`, `licenses`, `quota_events`, `security_events`, `subscriptions`, `super_admin_roles`, `super_admin_sessions`, `super_admin_user_roles`, `super_admin_users`, `support_ticket_comments`, `system_health_snapshots`, `tenant_domains`, `tenant_environments`, `tenant_feature_flags`, `tenant_health`, `tenant_kpi_daily`, `tenant_migration_runs`, `tenant_notification_settings`, `tenant_onboarding`, `tenant_settings`, `usage_counters_daily`

## 7. 실행 순서
1. (지금) 이 문서 머지 — 분류 확정.
2. FK(#458) 일주일 관찰 종료 후 `scripts/migrations-manual/2026-10-12-step6-cleanup.sql` §1 아카이브 → §2 사전검사 → §3 DROP (A·B·C). Genspark.
3. 6-b: introspect PR (D·E 78개 스키마 추가). Claude.
4. 6-c: F 확인 결과에 따라 생성/제거, G 스키마 제거. Claude.
5. 끝나면 `drizzle-kit check` 가 0 diff → 이후 DDL 은 Drizzle 마이그레이션으로만.
