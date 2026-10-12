# 12. 스키마 정본화 — 6단계 (Drizzle 스키마 = 운영 DB)

> 작성: 2026-10-12 (v2 — 1차 분류의 집계 오류 정정). 상태: **6-b/6-c PR 올림, 6-a 실행 대기**.
> 근거: 운영 DB 덤프 2026-10-10 (444 테이블) · `drizzle-kit introspect` 결과(2026-10-12, Genspark, 읽기 전용) · Drizzle 스키마 · 앱 코드 참조.
> 선행: `11-identity-policy-v3.md` §3 6단계.

## 0. 목표와 원칙 (CEO, 2026-10-12)

**6단계는 "테이블 삭제 프로젝트" 가 아니라 "스키마 정본화 프로젝트" 다.** 테이블 수를 줄이는 것은 목표가 아니다.
447개 테이블은 세 종류가 섞여 있다.

| 종류 | 처리 |
|---|---|
| ① 현재 운영에 필요한 테이블 | 스키마에 정확히 있어야 한다 |
| ② 향후 기능 확장을 위해 설계된 테이블 (지금은 비어 있음) | **유지**. 비어 있다는 이유로 지우지 않는다 |
| ③ 초기 개발 잔재 — 중복·백업·폐기 | 실제 사용·코드 참조·데이터 보유·의존성을 전부 확인한 뒤에만 정리 |

②를 ③으로 오판하면 다시 개발해야 하고, 반대로 "언젠가 쓸지도" 로 전부 두는 것도 답이 아니다.
가장 조심할 것은 **과거 데이터 보존** — 0~5단계에서 복구한 참조 관계를 스키마 정리로 다시 깨면 안 된다.
**완료 기준 = 코드·스키마·DB 의 구조 차이 전수 검사가 0 (§6).**

## 1. 1차 분류의 오류와 정정

1차(#460)는 Drizzle 테이블 선언을 `mysqlTable("…")` 큰따옴표만으로 세어 **스키마를 358개로 과소 집계**했다
(작은따옴표·줄바꿈 선언 누락). 그 결과 "앱이 쓰는데 스키마에 없음 78", "비어 있고 미참조 14", "스키마에만 있음 36" 이 나왔다.
따옴표·줄바꿈에 무관한 재집계 결과는 아래와 같다. **14개 "빈·미참조" 는 전부 ②(스키마에 있는 미래 기능 테이블) 였다 — 지우지 않는다.**

| 집계 | 1차 (오류) | 정정 |
|---|---:|---:|
| Drizzle 스키마 테이블 | 358 | **392** |
| DB-only (스키마에 없음) | 122 | **53** |
| 스키마-only (DB 에 없음) | 36 | **1** (`banners`) |

## 2. 정정된 분류 (덤프 444 테이블)

| 분류 | 수 | 종류 | 처리 |
|---|---:|---|---|
| A 백업·임시 (스키마 밖, 앱 참조 0, 전부 2026-04~07 일회성) | **28** (13,332행) | ③ | 아카이브(mysqldump 파일) 후 DROP — 6-a |
| B DB-only · 빈 · 미참조 | **0** | — | (1차의 14개는 전부 스키마에 있는 ② 였음) |
| C DB-only · 데이터 있음 · 미참조 | **1** | ③ | `phase2_lot0_matches_2026_04_28` (440행, 2026-04-28 매칭 작업 산출물) 아카이브 후 DROP — 6-a |
| D·E 앱이 쓰는데 **스키마에 없음** | **24** | ① | **introspect 그대로 스키마에 추가** — 6-b (이 PR) |
| F 스키마-only · 앱 참조 | **1** (`banners`) | ① | DB 에 생성 — 6-c (이 PR, SQL) |
| G 스키마-only · 미참조 (1차 25 + 미구축 billing 5 + 중복 tenants 1 + IoT 4 + doc_line_lots 1) | 36 → **0** | ③ | 스키마에서 제거 — 6-c (이 PR). 운영 DB 에 없었으므로 데이터 영향 0 |
| H 스키마에 있고 비어 있음 | **282** | ② | **유지** |

`_orphan_*_20261012` 격리 테이블(2단계)은 대상 아님 (30일 보존).

### D·E — 스키마에 추가한 24개 (`drizzle/schema/introspected_2026_10_12.ts`)
`ai_chat_history`, `ai_parse_corrections`, `ai_parse_history`, `attendance_records`, `budgets`, `document_approval_history`, `document_auto_approval_settings`, `document_batch_print_groups`, `document_batch_print_items`, `document_instances`, `document_types`, `fixed_asset_depreciation`, `fixed_assets`, `h_batch_pdf_logs`, `h_finished_product_inspection_items`, `h_finished_product_inspection_logs`, `h_product_outbound`, `h_training_levels`, `h_training_monthly_reports`, `h_visual_inspection_items`, `h_visual_inspection_logs`, `leave_balances`, `leave_requests`, `payroll_records`

introspect 출력(snake_case 컬럼 키)을 그대로 넣었다. 수작업 변환 금지. drizzle-kit 0.31 의 빈 문자열 기본값 버그(`.default(')`)만 `''` 로 교정.

### G — 스키마에서 제거한 것 (운영 DB 에 없던 선언)
- `schema_control_plane.ts` 전체: **중복 `tenants` 정의**(정본은 `schema_main_core.ts`) + 미구축 billing(plans/subscriptions/licenses/billing_accounts/invoices/payments) + tenant_domains/environments
- `schema_control_plane_domain.ts` 전체: 중복 `support_tickets`(정본 `support.ts`) + kpi/onboarding/notification/import_runs
- `schema_control_plane_ops.ts`: super_admin_* / tenant_settings / feature_flags / tenant_feature_flags / usage_counters_daily / quota_events / system_health_snapshots / tenant_health / backups / migrations / tenant_migration_runs / incidents / incident_updates / security_events 제거 → `audit_logs`, `banners` 만 남김
- `iotSchema.ts` + IoT 코드 4파일: CEO 결정 "지금 안 씀, 자동화 모듈 때 재개발". git 이력에 남음
- `doc_line_lots` + `saveLotAllocations`: 호출자 0 (#452 로 소멸)

**결제·구독**: 운영 중인 모델은 `tenants.subscription_package` + `package_features`(54) + `subscription_payments` + Toss 빌링키(`subscription.router`, 월정산 스케줄러)다. 제거한 billing 5개는 코드가 전혀 쓰지 않는 두 번째 설계였다. 서비스화는 **기존 모델을 완성**하는 별도 프로젝트로.

## 3. A — 백업·임시 테이블 (28)
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

## 4. 6-a 실행 — DROP 전 관문 4개 (CEO, 2026-10-12)

FK 로그 일주일 무사고는 **필요조건이지 충분조건이 아니다.** `scripts/migrations-manual/2026-10-12-step6-cleanup.sql` 은 아래 관문을 전부 통과해야 DROP 으로 간다.

| 관문 | 내용 | 방법 |
|---|---|---|
| G1 | 대상 29개의 **백업 행수 = 원본 행수** | §1 COUNT·CHECKSUM 기록 → 복원본과 테이블별 비교 |
| G2 | **복구 가능성** 검증 | 아카이브를 검증용 스키마(`haccp_step6_verify`)에 복원 → 행수·CHECKSUM 재비교 → 검증 스키마 삭제 |
| G3 | 운영 코드·SQL·cron·DB 객체에서 **참조 0** 재검사 | DB: 뷰·트리거·루틴·FK (§3-b). 코드·cron: `scripts/diag/table-ref-check.sh`. 덤프 10/10 기준 DB 객체 참조 0, 코드 참조는 일회성 출력물·스키마 스냅샷뿐 |
| G4 | DROP 후 **생산·재고·회계 회귀** | smoke + 배치 1건(생성→자동출고→완료→분개) + 매입 1건 + 매출 1건 + 실사 ±1 + 진단 §B·§C·§D 전후 동일 |

끝나면 introspect 재추출 → `schema-diff.ts` 0/0, `dump-schema-baseline.ts` 로 `drizzle/baseline/actual-schema.json` 재생성 → PR (CI `schema-reproducibility` 가 이 스냅샷을 본다).

## 5. 외부 진단이 짚은 후속 과제 (6-d 후보, 이 PR 범위 아님)
| 지적 | 상태 | 방향 |
|---|---|---|
| 테넌트 포함 복합 FK 0개 — FK 가 (tenant_id 일치) 까지는 보장 못 함 | 사실 | 부모에 `(tenant_id, id)` 유니크 추가 후 복합 FK 로 승격. 앱 레벨은 이미 `tenantRequiredProcedure` + JOIN 테넌트 조건. 실사 후 검토 |
| `tenant_id DEFAULT 1` 126개 / `DEFAULT 2` 6개(`material_ledger_daily` 포함) / `DEFAULT 0` 1개 | 사실 | 테넌트 누락 쓰기가 조용히 잘못된 테넌트로 가는 구조. DEFAULT 제거(NOT NULL, 기본값 없음) 로 **누락이 에러로 드러나게** — 쓰기 경로 전수 점검과 함께 |
| FK 없는 핵심 3곳: `h_ccp_form_records.batch_id`, `h_inventory_lots.inventory_id`, `material_ledger_daily.material_id` | 알려짐 (#458 보류 목록) | 각각 고아 45 격리 / 완제품 집계 행(10 문서) / 선택지 A 58건 처리 후 |
| `h_mf_ingredients.material_id → item_master` vs `h_batch_inputs.material_id → h_materials` | 의도된 두 층위 (11 문서 §2-1) | `ItemIdentityService` 경유 강제(depcruise error) 유지 |

## 6. 완료 기준 — 전수 diff (구조 정합성에 한함)
`scripts/diag/schema-diff.ts <introspect schema.ts>` 가 **DB-only 0 · 스키마-only 0** 을 출력하면 6단계 완료.
(A·C DROP 과 banners 생성이 끝난 뒤 Genspark 가 introspect 를 다시 떠서 돌린다. 이 결과가 6단계 완료의 근거다.)
그 뒤로는 DDL 을 Drizzle 마이그레이션으로만 한다 — 운영 DB 에 손으로 테이블을 만들면 diff 가 다시 벌어진다.

**DB-only 0 / 스키마-only 0 은 "구조" 가 맞는다는 뜻이지 고아 데이터가 생기지 않는다는 증거가 아니다.** 데이터 무결성은 §5 의 별도 트랙으로 계속 관리한다.
- 보류 FK 3곳 (`h_ccp_form_records.batch_id`, `h_inventory_lots.inventory_id`, `material_ledger_daily.material_id`) — 각 선행 작업 후 FK 추가, 그 전까지 `identity-namespace-diag.sql` §C 로 주기 점검
- 테넌트 간 참조 무결성 — 복합 FK 전까지 앱 레벨(`tenantRequiredProcedure` + 테넌트 조건 JOIN) + 진단 §D 주기 점검
- FK 위반 로그(`~/fk_violations.log`) 는 "쓰기 시점에 막힌 것" 만 보여준다. 이미 들어가 있는 불일치는 진단 SQL 로만 보인다
