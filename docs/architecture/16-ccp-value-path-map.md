# 16. CCP 값 읽기·쓰기 경로 지도 (PR-A1)

> 작성 2026-10-18 · 기준 커밋 `44b36fe5` (#589 머지 후) · 데이터 기준 백업 `v0.8.453` (2026-10-18 11:22 KST)
> 목적: CCP 자동입력·일괄생성 개편(설계안 v0.8.453 / v2) 전에, **어떤 값이 어디서 와서 어디에 저장되고 무엇이 인쇄되는지** 를 한 장으로 고정한다.
> 이 문서는 현재 상태의 기록이다. 정답 설계가 아니라 고칠 대상의 목록이다.

## 0. 값의 네 종류 (판정 기준)

| 종류 | 뜻 | 소유자 |
|---|---|---|
| **한계기준(CL)** | 승인된 기준. 적합·이탈 판정에만 쓴다 | `ccp_process_groups` 온도·시간·압력 범위, 금속검출은 설비 감도 |
| **운영조건** | 평소 운전값. 반복 입력을 줄이는 기본값 | `ccp_time_profiles`(가열 운전시간), `equipments`(설정온도·압력·사이클·작업시간), `ccp_process_groups.equip_*`(시작 방식·간격·묶음) |
| **배치계획** | 오늘 입력으로 계산한 설비·회차·예정시각·예정 투입량 | 배치 생성 때 계산 → `h_ccp_rows` / `h_ccp_form_rows` |
| **실제 기록** | 관찰·측정한 값, 실제 시각, 확인 주체 | `h_ccp_form_rows` (작업자 수정) |

**현재의 핵심 문제:** 계획값과 운영값이 실제 기록 칸(`heat_temp_c`, `temp_edge_c`, `temp_center_c`, `result='적합'`)에 미리 들어가고, 무엇이 확인된 값인지 구별하는 필드가 없다.

## 1. 배치 생성 → CCP 데이터

### 1.1 진입점

| 진입점 | 순서 |
|---|---|
| 단건 `batch.create` (`server/routers/production/batch.crud.router.ts:18`) | 매핑 검증 → `createBatch` → `autoCreateCcpInstancesForBatch` → **기록지 raw INSERT**(192–207, getOrCreate 아님) → `syncCcpRowsToFormRows` → 승인요청 → **SKU 실적 저장(330–367, 동기화 뒤)** |
| `createSingleBatch` (`server/services/batchOrchestrator.ts:78`) | 검증 → `createBatch`(mode 포함, #585) → `autoCreateCcpInstancesForBatch` → 그룹마다 `getOrCreateCcpFormRecord` → `syncCcpRowsToFormRows` → **SKU 실적(248–297, 동기화 뒤)** → 1B/2B **무조건 submitted**(441–461) |
| 일괄 `bulkCreateForDay` (`batch.crud.router.ts:454`) | 품목마다 `createSingleBatch(skipGroupActions)` → 4P 제출·승인요청 → `allocateMetalPassLogsForDay(skuOutputs: [])` |
| AI 다중 | 별도 경로 없음 — `bulkCreateForDay` 호출 (`client/src/pages/agent/ProductionAgent.tsx:186`) |
| 수동 '기록지 생성' | `ccpForm.getOrCreate` → `getOrCreateCcpFormRecord` — **행 동기화 없음**, `batchCount > 1` 일 때만 화면이 resync |

### 1.2 쓰는 값과 출처

**`h_ccp_rows`** (`server/services/ccp-batch.ts:283–397`)

| 칸 | 출처 | 종류 |
|---|---|---|
| 회차 수 | `ceil(계획량 / 최신 승인 BOM batch_target_kg)` (463) — 공정 선택은 `selectBomVersion`(158), **기준량은 '최신 승인' 버전** 으로 규칙이 다름 | 계획 |
| `temp_c` | 설비 `default_temperature` → 공정 `temperature_min`(**CL 하한 폴백**) | 운영(설정) |
| `pressure_bar` | 설비 `default_pressure`×10 → 공정 `pressure_min`×10(**CL 하한 폴백**) | 운영(설정) |
| `heating_min` | `ccp_time_profiles`(활성 1개) → 설비 `default_time` → 비움 (#589) | 운영 |
| `duration_min` | 사이클 + (가열 − 설비 기본 가열) | 계획(점유) |
| `result` | `'PASS'` 고정 | **미확인 기본값** |

**`h_ccp_form_records`** — 두 생성 경로가 다르게 쓴다:

| 칸 | `getOrCreate` | 단건 raw INSERT |
|---|---|---|
| `equip_group_mode/interval` | 공정그룹 (#587) | 공정그룹 |
| `cl_*` (시간·온도·압력) | 공정그룹 스냅샷 | 공정그룹 스냅샷 |
| `cl_product_temp_lo` | 1B 만 공정 `temperature_min` | **안 씀** |
| `cl_fe_mm/cl_sus_mm/cl_metal_sensitivity` | 금속검출기 설비 감도 (#586) | **안 씀 → DB 기본값 2.0/3.0/130** (`drizzle/schema/schema_main_ccp.ts:165–167`) |
| 중복 판정 | **`batch_id + ccp_type`** (`ccpFormRecordsCRUD.ts:113–123`, `batch.crud.router.ts:175`) | 같음 |

**`h_ccp_form_rows` 1B/2B** (`server/db/haccp/ccpFormSettings.ts:1351–1506`, 빠진 `batch_seq` 만 INSERT)

| 칸 | 출처 | 종류 |
|---|---|---|
| `input_qty_kg` | 원물·공정 스냅샷 → BOM 공정 kg(정제수 포함, #586) → 계획량÷회차, `splitCcpInputQty` 로 회차 배분 (#585) | 계획 |
| `measurement_time` | 배치 시작(없으면 **"09:00"**) 또는 설비 작업시작 + **난수 0~10분** + 배치 간 오프셋(사이클 기본 **70**) + 회차·간격 | **계획(예정시각)인데 실측 칸** |
| `heat_time_min` | `heating_min ?? duration_min` — 가열이 비면 **점유시간이 가열시간으로 인쇄** | 운영 |
| `heat_temp_c` | `temp_c`(설정) | **설정값이 측정 칸** |
| `pressure_mpa` | `pressure_bar / 10` | 운영 |
| `temp_edge_c/temp_center_c` | 설비 `edge_temperature/center_temperature` | **설정값이 측정 칸** |
| `result` | `'적합'` | **미확인 기본값** |

### 1.3 아직 남은 코드 기본값

`"09:00"`(ccpFormSettings:221, batch.crud:474) · 4P 작업 09:00/16:30/12:00/13:00(ccpFormSettings:824, metalPassAllocator:236) · Fe/SUS **2.0/3.0**(metalPassAllocator:240, 264, DB 기본값) · 감도 **130**(DB 기본값) · 난수 0~10분 · 감도점검 **2시간** 주기(ccpFormSettings:1140, 1206) · 사이클 **70** · 슬롯 최소 5/3분 · 통과량 폴백 `round(kg)`.

## 2. 금속검출(CCP-4P) — 두 저장소

| 저장소 | 쓰는 곳 | 읽는 곳 | 백업 실데이터 |
|---|---|---|---|
| `h_ccp_form_rows` (`equipment_type` = sensitivity / passage) | 동기화가 감도행을 **O/O/X/O/O·적합으로 미리 채움** (ccpFormSettings:1235–1259), 통과행 `detected_qty=0`·적합 (1327–1344). 작업자 수정은 `ccpForm.saveRow` | 화면 `CcpMonitoringForms`, **인쇄** (`CcpRenderers.tsx:481–651`) | 사실상 유일한 기록 |
| `h_ccp_batch_process_runs` / `h_ccp_metal_sku_slots` / `h_ccp_metal_sensitivity_checks` | 동기화(ccpFormSettings:1066–1177, runs 만 DELETE 후 재생성) · 할당기(`metalPassAllocator.ts:440–581`) | **`metalDetection.*` 라우터만 — 클라이언트 호출 0건** | runs 373 · slots 5,593 **전부 PLANNED, 실제량 0건** · checks 8,681 **전부 PENDING, 확인 0건** |

- 두 저장소는 **서로 동기화되지 않는다.** 작업자가 감도 결과를 입력하면 form row 만 바뀐다.
- 동기화가 runs 를 지우고 slots/checks 는 지우지 않는다 → 고아 행 가능성 (FK cascade 확인 안 됨). 일괄 경로에서 같은 날 run 이 둘 생길 수 있다. 백업에서 수량이 빈 중복 슬롯(5698·5699) 확인.
- 4P 재생성 생략 판정이 **제품 이름 비교** (ccpFormSettings:361–406) → 같은 날 같은 제품 두 번째 배치의 통과행이 안 생김.
- 4P 인쇄의 **모니터링 방법·개선조치는 코드 고정 문구** (CcpRenderers:568, 661) — #586 에서 1B/2B 만 고침.

### 2.1 통과량 단위 (섞여 있음)

- `production_sku_output.quantity` 는 SKU `sales_unit` 단위 (기본 `box`), `total_kg = 수량 × kg_per_sales_unit`.
- form row `pass_qty` = SKU 수량 합(**판매단위**) → 없으면 `round(kg)`(**kg**). 인쇄 제목은 **"통과량(개)"**.
- 백업 10/14: 왕찹쌀떡 263 = **팩**(1.8kg/팩) · 대추고약식 41 = **kg**. 같은 칸, 다른 단위.
- 두 생성 경로 모두 SKU 실적을 **CCP 동기화 뒤에** 저장 → 새 배치는 kg 폴백으로 들어감.

## 3. 수정·제출·승인

| 동작 | 경로 | 문제 |
|---|---|---|
| 행 수정 | `ccpForm.saveRow` → `upsertCcpFormRow` (`ccpFormRowsOps.ts:63`) | **기록지 상태 검사 없음** — 제출·승인된 기록도 수정 가능 |
| 행 수정의 역동기화 | `syncFormRowToCcpRow` (ccpFormRowsOps:113) → `h_ccp_rows` | 인스턴스를 `ccp_type` 만으로 고름(공정 무시) · 가열시간을 `duration_min` 에 씀 · **MPa 를 ×10 없이 `pressure_bar` 에** |
| `h_ccp_rows` 인라인 수정 | `ccp.updateRow` → `updateCcpRow` | form row 로 전파 안 됨 · ~~회사 조건 없음~~ → **#590 수정** |
| 제출 | `ccpForm.submit` → `submitCcpFormRecord` (ccpFormSettings:91–145): `submitted_at`, `writer_id` 덮어씀 | **`submitted_by` 없음** · AUTO 여부와 무관하게 `createSingleBatch` 가 1B/2B 를 자동 submitted · 4P 도 자동 제출 |
| 승인·반려 | `applyCcpFormDecision` (`ccpStatusSync.ts:124`) — `approver_id/approved_at`, 인쇄 문구 고정 (#588) | 관문(`batchApprovalOverview.ts:186–192`)은 draft·반려·행 없음·이탈만 봄 |

**누가 확인했나:** 기록지에는 `writer_id`(제출 때 덮어씀)·`submitted_at`·`approver_id`·`approved_at` 뿐. 행 단위 편집자 없음. form row 의 `action_by/confirmed_by` 는 개선조치용 자유 문자열.

## 4. 단위

| 칸 | 단위 | 비고 |
|---|---|---|
| `equipments.default_pressure`, `ccp_process_groups.pressure_min`, `cl_pressure_mpa_lo`, `h_ccp_form_rows.pressure_mpa` | MPa | `pressure_min` 은 소수 2자리 — 0.115 저장 불가 |
| `h_ccp_rows.pressure_bar` | bar | 생성 ×10, 동기화 ÷10, **역동기화는 ×10 없이 MPa 그대로 (확인된 불일치)** |
| `temp_c`→`heat_temp_c`, `temp_edge_c`, `temp_center_c` | ℃ | 값은 설비 **설정값**인데 **측정 칸**에 저장 |
| form row `pass_qty`, slot `planned_pass_qty` | 판매단위 또는 kg | §2.1 |

## 5. 인쇄 (`client/src/components/print/CcpRenderers.tsx`)

- 데이터: 배치 요청 → `getCcpFormRecordsWithRowsByBatch`, 단건 → `getCcpFormRecordById`. 둘 다 `enrichWithGroupText` → 승인 고정 문구(`print_snapshot`) 우선, 없으면 공정그룹 최신.
- 1B 행: 품명·측정시각·설비·`heat_time_min`·`pressure_mpa`·`input_qty_kg`·`temp_edge_c`·`temp_center_c`·판정 (`heat_temp_c` 는 1B 에 안 찍힘).
- 2B 행: 측정시각·`heat_time_min`·`heat_temp_c`(판넬온도)·`input_qty_kg`·판정.
- 4P: 감도 기준 `cl_metal_sensitivity/cl_fe_mm/cl_sus_mm`, 감도행·통과행 모두 form rows. 이탈표 '발생일시' 는 4P 행에 없는 `measurement_time` 을 읽음.
- 인쇄 고정(`print_snapshot`)은 문구·한계기준표만 — 헤더 CL 값과 행 값은 고정 대상이 아님(행 수정 잠금은 §3 의 상태 검사로 해결해야 함).

## 6. 확인된 결함과 처리 상태

| # | 결함 | 영향 (백업 실측) | 상태 |
|---|---|---|---|
| 1 | 회사 조건 없는 CCP 행·인스턴스 수정·조회 | 다른 회사 데이터 수정 가능 | ✅ 회사 조건 추가 |
| 2 | 한 배치에 CCP-1B 공정이 둘이면 기록지 하나만 (중복 판정 `batch_id + ccp_type`) | 단지 34건 (증숙 약식류 31 · 오븐 2 · 증숙 설기류 1 — 10/14 #1113) | ✅ 새 배치는 공정별 생성. 과거분은 `scripts/report-missing-ccp-forms.ts` 로 목록만 — **자동 소급 생성 안 함** (측정 안 한 값이 적합으로 채워진 기록이 됨) |
| 3 | 4P 저장소 이중화, 새 표는 계획만·확인 0건 | 8,681 PENDING / 5,593 PLANNED | ✅ 정본 = 기록지 행, 계획 전용 표 쓰기 중단 (`server/lib/haccp/metalRecordSource.ts`) |
| 4 | 통과량 단위 혼재 (팩/kg 를 "개") | 10/14 263팩·41kg | ✅ 통과량 = 생산량, 행에 `pass_unit` 저장, 화면·인쇄 단위 표기, SKU 실적 저장 뒤 재동기화 |
| 5 | 역동기화 MPa→bar ×10 누락, 가열→`duration_min`, 공정 무시 | 수정한 행의 `h_ccp_rows` 압력 1/10 | ✅ |
| 6 | 제출·승인된 기록 행 수정 가능 | 기록 보존 위반 | ✅ 승인된 기록지 행 수정 거부, 제출 뒤 수정은 확인 무효 |
| 7 | 단건 생성이 금속 기준 안 써서 DB 기본값(2.0/3.0/130) | 회사 전용 값 잔존 | ✅ 회사 금속검출기 설정 (DB 컬럼 기본값 자체는 남음 — DDL 별도) |
| 8 | 4P 인쇄 모니터링·개선조치 고정 문구 | 다른 회사 양식에 단지 문구 | ✅ 공정그룹 문구 |
| 9 | 4P 생략 판정이 제품 이름 비교 | 같은 제품 2배치째 통과행 누락 | ✅ 통과 기록 (품목, 수량, 단위) 목록 비교 — 수·합계만 보면 kg 2 → 상자 2 를 놓침 (#590 R590-05, `server/lib/haccp/passageSignature.ts`) |
| 10 | `heat_time_min = heating ?? duration` | 가열 없으면 점유시간 인쇄 | ✅ 가열 운전시간만 |
| 11 | 회차 기준량은 '최신 승인' BOM, 공정은 `selectBomVersion` | 버전 다르면 불일치 | ⏳ PR-B (계획 함수 분리 때) |
| 12 | 계획값·설정값이 실측 칸에 저장, 확인 주체 없음 | 전 기록 | ✅ 부분 — '제출 = 시트 확인' (확인자·시각·버전, 서버 차단). 계획/실측 칸 분리는 PR-B |
| 13 | 4P 재생성이 작업자 입력 행까지 전체 삭제 | 입력한 감도·통과 결과 유실 | ✅ 작업자 입력·확인·승인된 기록지는 재생성 안 함 (당일 추가 배치는 기록지에 직접 추가) |
| 14 | 압력 칸 소수 2자리 (0.115 저장 불가) | — | ✅ decimal(6,3) (운영 실측 decimal(5,3) — 소수 3자리는 같음) |

#### #590 배포 후 검증 (Codex 2026-10-18) 후속

| # | 결함 | 처리 |
|---|------|------|
| R590-01 | 확인 제출 버튼이 Date 를 보내 늘 입력 검증에서 막힘 | ✅ 작업일은 서버가 기록지에서 읽음 (화면 값 안 씀) |
| R590-02 | 승인관리 바로 승인이 확인 관문을 거치지 않고 요청만 승인 | ✅ CCP 기록지 단독 요청은 개별·일괄·바로·최종·approveRequest 모두 `approveCcpFormRecord` (확인 관문 → 기록지 승인 → 승인됐는지 다시 읽음) 를 요청 승인 **전에** 부름. 반려는 `rejectCcpFormRecord` |
| R590-03 | 필수 실측값·감도 결과가 비어도 확인됨 | ✅ 기준이 정해진 항목은 값 필수 — 1B 중심·모서리 품온(품온 기준), 압력(압력 기준), 2B 가열온도(온도 기준), 4P 감도 다섯 칸. 0 은 값, NULL 은 없음 |
| R590-04 | 부적합인데 이탈내용만 있고 개선조치 없음 | ✅ 둘 다 필수 (이탈 체크도 같음) |
| R590-05 | 수량 같으면 단위 바뀐 SKU 실적을 재동기화 안 함 | ✅ 위 9번 |
| UX | 공정 두 개 카드 제목 같음 · 입력 검증 JSON 원문 · 미확인/검토중 구분 · 금속 설비 화면 고정 CL · 배치수 설명 방향 | ✅ 공정그룹 이름 제목 · 업무 문장 (`toValidationMessage`) · 목록·승인관리 '미확인' 배지 · 설비 Fe·SUS 값 그대로(비면 미설정) · 계획 ÷ BOM 배치량 올림 |

### 제출 = 시트 확인 (CEO 결정 2026-10-18)

- 미리 채운 적합값은 사람이 제출하기 전까지 미확정 초안.
- 사람이 누른 제출만 확인 이력 — `confirmed_by` · `confirmed_at`(서버 시각) · `confirmed_rows_version`. 자동 제출은 확인 아님.
- 서버 차단: 필수값 누락 · 한계기준 이탈인데 적합 · 부적합인데 이탈내용·개선조치 없음 · 아직 오지 않은 점검/미래 작업일 · 감도 결과≠기준인데 적합.
- 진행 저장 허용, 최종 제출만 차단. 제출 뒤 행이 바뀌면(`rows_version`) 확인 무효 → 다시 제출.
- 승인(배치 관문·기록지 단독)은 유효한 확인을 요구. 승인된 기록지 행은 수정 불가 (반려 후 수정).
- 구현: `server/lib/haccp/ccpSheetConfirm.ts`.

## 7. 확인하지 못한 것

- 금속검출 하위 표의 DB FK/cascade 존재 여부 (Drizzle·스키마 파일에는 없음).
- 운영 DB 의 실제 컬럼 기본값이 Drizzle(130/2.0/3.0)과 같은지.
- 모든 회사가 `equipments.default_pressure` 를 MPa 로 입력했는지.
