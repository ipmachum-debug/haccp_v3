# 배치(Batch) 생산 시스템 정의서

> 최종 업데이트: 2026-04-10 (코드 기준 검증 완료)
> 브랜치: claude/simplify-data-processing-qyvLD

---

## 1. 배치 개요

배치(Batch)는 특정 날짜에 특정 제품을 일정량 생산하는 단위입니다.

### 생성 방식

| 방식 | 함수 | 설명 |
|------|------|------|
| 단일 생성 | `batch.create` | 1개 제품 × 1배치 |
| 일괄 생성 | `batch.bulkCreateForDay` | N개 제품 × 1일 (일일 배치 그룹) |

### 배치 코드 체계

```
{product_code}-{YYYYMMDD}-{시퀀스(3자리)}
예: 00005-20260410-001
```

### 일일 배치 그룹 코드

```
DAY-{YYYYMMDD}-{시퀀스(3자리)}
예: DAY-20260410-001
```

---

## 2. 제품 ID 체계

### v1 퇴출 완료 — h_products_v2 단일 소스

| 테이블 | 상태 | 용도 |
|--------|------|------|
| `h_products` | **@deprecated** | 사용하지 않음 |
| `h_products_v2` | **현행** | 모든 product_id의 단일 소스 |
| `item_master` | **통합 마스터** | id = h_products_v2.id와 일치 |

**resolveToHProductId()**: deprecated (passthrough — 입력값 그대로 반환)

**마이그레이션**: `scripts/migrate-products-v1-to-v2.ts` 실행 필요
- h_batches, h_mf_reports, h_ccp_instances 등 9개 테이블의 product_id를 v1→v2로 변환

---

## 3. BOM (품목제조보고) 구조

### 테이블 관계

```
h_mf_reports (품목제조보고 헤더)
  └── h_mf_report_versions (버전 관리, 승인 상태)
        └── h_mf_ingredients (원재료 라인)
              ├── material_id → item_master (원재료)
              └── process_group_id → ccp_process_groups (공정 그룹)
```

### 핵심 필드

| 테이블 | 필드 | 설명 |
|--------|------|------|
| `h_mf_reports` | `product_id` | 제품 ID (h_products_v2.id) |
| `h_mf_report_versions` | `batch_target_kg` | BOM 1배치 기준 중량 (kg) |
| `h_mf_report_versions` | `approval_status` | `APPROVED` 버전만 사용 |
| `h_mf_ingredients` | `corrected_quantity` | 보정 배합비 (%) — 실제 투입 계산에 사용 |
| `h_mf_ingredients` | `is_deductible` | 재고 차감 대상 여부 (1=차감) |
| `h_mf_ingredients` | `process_group_id` | 해당 원재료가 속한 CCP 공정 그룹 |

### 투입량 계산

```
투입량(kg) = (보정배합비% / 100) × 계획생산량(kg)
```

> **h_recipes 폴백 제거**: BOM(h_mf_report_versions APPROVED)만 사용

---

## 4. 설비 기준 (Equipment)

### equipments 핵심 필드

| 필드 | 단위 | 설명 |
|------|------|------|
| `default_temperature` | ℃ | 설비 기준 온도 |
| `default_pressure` | MPa | 설비 기준 압력 |
| `default_time` | 분 | 설비 기본 가열시간 |
| `batch_operation_time` | 분 | 유휴시간 포함 1배치 총 소요시간 (사이클) |
| `work_start_time` | HH:mm | CCP-4P 작업 시작 시간 |
| `work_end_time` | HH:mm | CCP-4P 작업 종료 시간 |
| `lunch_start_time` | HH:mm | 점심시간 시작 |
| `lunch_end_time` | HH:mm | 점심시간 종료 |
| `fe_sensitivity` | mm | 금속검출기 Fe 감도 |
| `sts_sensitivity` | mm | 금속검출기 SUS 감도 |

### 공정그룹-설비 매핑

```
ccp_process_groups 1:N ccp_process_group_equipments N:1 equipments
```

`sort_order` 순으로 설비를 라운드로빈 할당합니다.

---

## 5. 공정 기준 (CCP Process Groups)

### CCP 타입

| CCP 타입 | 설명 | 공정 예시 |
|----------|------|-----------|
| CCP-1B | 가열(증숙) 공정 | 교반-가열, 증숙(설기류), 증숙(약식류) |
| CCP-2B | 가열(굽기) 공정 | 오븐-굽기 |
| CCP-4P | 금속검출 공정 | 금속검출 (항상 포함) |

### ccp_process_groups 핵심 필드

| 필드 | 설명 |
|------|------|
| `temperature_min/max` | 관리한계(CL) 온도 범위 (℃) |
| `time_min/max` | 관리한계(CL) 시간 범위 (분) |
| `pressure_min/max` | 관리한계(CL) 압력 범위 (MPa) |
| `equip_group_mode` | 설비 운용: `sequential`(순차) / `concurrent`(동시) / `grouped`(묶음순차) |
| `equip_interval_min` | 설비 간 투입 간격 (분) |
| `equip_batch_size` | 1배치에 동시 가동 설비 수 (1=순차, 3=3대 동시) |

### 제품-공정그룹 매핑 우선순위

```
① BOM 기반 (APPROVED 버전의 ingredient.process_group_id)
② 수동 매핑 (ccp_process_group_products 테이블, BOM에 없는 것만)
③ CCP-4P (금속검출) → 항상 포함
```

---

## 6. 배치 생성 파이프라인

### 단일 배치 (createSingleBatch)

```
Step 1: h_batches INSERT + h_batch_inputs 자동생성 (BOM 배합비 기반)
  → 원재료는 item_master에서 이름/단위 조회
Step 2: 제품 정보 조회 (h_products_v2 단일 소스)
Step 3: CCP 자동 생성
  ├── 3.0: autoCreateCcpInstancesForBatch
  │     ├── getProcessGroupsForProduct (BOM→수동→CCP-4P)
  │     ├── h_ccp_instances INSERT (공정그룹별)
  │     └── h_ccp_rows INSERT (라운드로빈 × equip_batch_size)
  ├── 3.1: getOrCreateCcpFormRecord (CCP-4P: FOR UPDATE 락)
  └── 3.2: syncCcpRowsToFormRows (seqIdx 기반 설비 순서)
Step 4: production_sku_output INSERT
Step 5: h_batch_schedules INSERT
Step 6: 승인요청 자동 등록
  ├── 6.0: batch_production 승인 (배치별 CCP)
  └── 6.1: CCP-4P 금속검출 통합 승인
Step 7: 일일일지 + 주간/월간/연간 일지 자동 생성
Step 8: 감사 로그
```

### 일괄 배치 (bulkCreateForDay)

```
Step 1: 일일 배치 그룹 코드 생성
Step 2: 품목별 createSingleBatch(skipGroupActions=true) 순차 호출
Step 3: 그룹 레벨 후처리
  ├── 3.6: batch_plan 승인요청 (그룹 전체)
  ├── 3.7: batch_production 승인요청 (배치별 CCP)
  └── 3.8: CCP-4P 금속검출 통합 승인요청
Step 4: 금속탐지 시간 배정 (allocateMetalPassLogsForDay)
Step 5: 공정 스케줄 생성
Step 6: 생산일지 자동 갱신
```

---

## 7. 배치수(Batch Count) 계산

```
배치수 = CEIL(계획생산량 / BOM 1배치 기준중량)
예: 계획 199kg, BOM 기준 100kg/배치 → 배치수 = 2
```

### BOM 1배치 기준중량 조회

- `h_mf_report_versions.batch_target_kg` (APPROVED 버전)
- **h_recipes 폴백 없음** (제거됨)
- 기본값: 없으면 batchCount = 1

---

## 8. 원재료 투입 및 재고 차감

### 투입 계획 (배치 생성 시)

```
BOM(APPROVED) → h_mf_ingredients 조회
→ 각 원재료: 투입량 = (보정배합비% / 100) × 계획생산량
→ h_batch_inputs INSERT (material_id = item_master.id)
```

### 재고 차감 (배치 시작 시 — status='in_progress')

```
autoIssueMaterialsForBatch 호출
→ h_batch_inputs 투입 계획 조회
→ 각 원재료: FEFO 로트 할당 (유통기한 빠른 것부터)
  ├── h_inventory_lots.available_quantity 차감
  ├── h_inventory_transactions에 'usage' 기록
  └── h_inventory.total_quantity 차감
→ h_batch_inputs.inventory_deducted = 1
→ material_ledger_daily 수불부 반영
```

### 원재료명 조회

- **item_master LEFT JOIN** (h_materials 사용 안 함)
- `getBatchMaterialInputs()`: `LEFT JOIN item_master im ON im.id = bi.material_id`

---

## 9. CCP 기록 자동 생성

### 계층 구조

```
[공정그룹 결정] getProcessGroupsForProduct
    └── BOM + 수동매핑 + CCP-4P(항상)

[인스턴스 생성] autoCreateCcpInstancesForBatch
    └── 공정그룹별 h_ccp_instances INSERT
        └── 설비별 h_ccp_rows INSERT (라운드로빈)

[인쇄용 기록지] getOrCreateCcpFormRecord
    └── h_ccp_form_records INSERT (CCP-4P: FOR UPDATE 락)

[인쇄용 행 동기화] syncCcpRowsToFormRows
    └── h_ccp_rows → h_ccp_form_rows (seqIdx 기반)
```

### CCP-1B / CCP-2B (가열 공정)

**h_ccp_instances**: 배치별 1개 (공정그룹당)

**h_ccp_rows**: 배치수 × equip_batch_size = 행 수 (라운드로빈 순환)

```
equip_batch_size=1 (순차):
  배치수=3, 설비 2대 → 3행
  batch_no=1 → 교반기1호기
  batch_no=2 → 교반기2호기
  batch_no=3 → 교반기1호기 (라운드로빈)

equip_batch_size=3 (묶음순차):
  배치수=2, 설비 6대 → 6행
  batch_no=1 → 증숙기1,2,3호기 (동시)
  batch_no=2 → 증숙기4,5,6호기 (동시)
```

### 시간 계산

```
heating_min    = ccp_process_groups.time_min
cycle_total    = equipments.batch_operation_time
eq_default_heat= equipments.default_time
duration_min   = cycle_total + (heating_min - eq_default_heat)

예) 교반기(사이클70분, 기본가열10분) + 가열공정(가열10분)
    → 70 + (10 - 10) = 70분
```

### 압력 단위 변환

설비/공정 기준(MPa) → 저장(bar): × 10

### CCP-4P (금속검출)

**h_ccp_instances**: 배치별 1개 생성
**h_ccp_rows**: 항상 2행 (Fe + SUS)
**h_ccp_form_records**: 일(日)별 1개 통합 기록지

```
product_name = '금속검출 통합'
product_id = NULL
planned_qty_kg = 당일 전체 배치 합계
batch_count = 당일 전체 배치 수
```

- **FOR UPDATE 락**: 동시 배치 생성 시 레이스컨디션 방지
- **조회 시**: MIN(id)로 일별 첫 인스턴스만 반환 (중복 방지)

---

## 10. CCP-4P 금속검출 시간 배분

### 배분 원칙

```
작업시간: 설비 work_start_time ~ work_end_time (커스텀 가능)
점심시간: lunch_start_time ~ lunch_end_time (커스텀 가능)
가용시간 = 총 작업시간 - 점심시간

각 제품의 배분 시간 = 가용시간 × (해당 제품 생산총량 / 전체 생산총량)
```

### 감도 테스트 스케줄

| 체크 타입 | 시점 | 내용 |
|-----------|------|------|
| `START` | 품목 시작 시 | Fe/SUS 기준 시편 검출 테스트 |
| `PERIODIC` | 2시간 연속 운전 시 | Fe/SUS 기준 시편 검출 테스트 |
| `END` | 품목 종료 시 | Fe/SUS 기준 시편 검출 테스트 |

### 불변 조건

```
★ 제품 간 시간 겹침 금지 (금속검출 혼입 방지)
★ 감도테스트와 통과시간 ±4분 이내면 자동 조정
```

---

## 11. 승인 워크플로

### 상태 흐름

```
pending_review → pending_approval → approved / rejected
```

### 승인 요청 타입

| request_type | reference_type | 생성 시점 | 설명 |
|-------------|----------------|-----------|------|
| `batch_plan` | `batch_group` | 일괄 생성 후 | 일일 배치 그룹 전체 승인 |
| `batch_production` | `batch` | 일괄/단일 생성 후 | 개별 배치 CCP 기록 승인 |
| `ccp_form` | `ccp_form_record` | 일괄/단일 생성 후 | CCP-4P 금속검출 통합 승인 |

---

## 12. 배치 라이프사이클

```
planned → in_progress → completed → approved → shipped → archived
              ↓                        ↓
           paused                   rejected
              ↓
           cancelled / failed
```

| 전이 | 트리거 | 자동 처리 |
|------|--------|-----------|
| → planned | 배치 생성 | BOM 투입계획, CCP 자동생성, 승인요청 |
| → in_progress | 배치 시작 | 원재료 자동 출고 (FEFO) |
| → completed | 배치 완료 | 재고 정산, 원가 확정, CCP 종결 |
| → approved | 최종 승인 | 완제품 재고 증가, 회계연동 |

### completeBatch 보안

```typescript
tenantId: number  // P0 보안: 필수 (선택 아님)
if (!tenantId) throw new Error("[P0 보안] tenantId는 필수");
```

---

## 13. 타임존 관리

### 원칙

- 서버: UTC
- DB: KST (+09:00) — connection.ts에서 `SET time_zone = '+09:00'`
- 클라이언트: KST (브라우저 로컬)

### 안전한 헬퍼 (server/utils/timezone.ts)

```typescript
todayKST()           // "YYYY-MM-DD" (KST)
toKSTDate(d)         // Date → "YYYY-MM-DD" (KST)
toKSTTimestamp(d)    // Date → "YYYY-MM-DD HH:MM:SS" (KST)
formatLocalDate(d)   // Date → "YYYY-MM-DD" (로컬)
```

### 금지 패턴

```typescript
// ❌ 위험: UTC 기준 (KST 00~09시 → 전날로 기록)
new Date().toISOString().slice(0, 10)

// ✅ 안전: KST 기준
todayKST()
```

---

## 14. 데이터베이스 스키마 요약

### 배치 핵심

```
h_batches                    -- 배치 헤더
h_batch_inputs               -- 원재료 투입 (material_id → item_master.id)
production_sku_output        -- SKU 생산수량
h_batch_schedules            -- 배치 스케줄
```

### BOM

```
h_mf_reports                 -- 품목제조보고 헤더 (product_id → h_products_v2.id)
h_mf_report_versions         -- 버전 (batch_target_kg, APPROVED)
h_mf_ingredients             -- 원재료 라인 (material_id → item_master.id)
```

### CCP

```
ccp_process_groups           -- 공정 그룹 (equip_batch_size, equip_group_mode)
ccp_process_group_equipments -- 공정그룹-설비 매핑 (sort_order)
equipments                   -- 설비 마스터

h_ccp_instances              -- CCP 인스턴스 (배치×공정그룹)
h_ccp_rows                   -- CCP 측정 행 (라운드로빈)

h_ccp_form_records           -- 인쇄용 기록지 헤더 (CCP-4P: FOR UPDATE)
h_ccp_form_rows              -- 인쇄용 기록지 행

h_ccp_batch_process_runs     -- CCP-4P 일일 공정 실행
h_ccp_metal_sku_slots        -- CCP-4P SKU 시간 슬롯
h_ccp_metal_sensitivity_checks -- CCP-4P 감도 체크
```

### 재고

```
h_inventory                  -- 재고 마스터
h_inventory_lots             -- 재고 로트 (FEFO)
h_inventory_transactions     -- 재고 트랜잭션
material_ledger_daily        -- 수불부
```

### 승인

```
h_approval_requests          -- 승인 요청
```

---

## 부록: 전체 데이터 흐름

```
[UI: 일괄배치 생성]
       │
       ▼
bulkCreateForDay
       │
       ├─── [품목 1] createSingleBatch ──┐
       ├─── [품목 2] createSingleBatch ──┤
       └─── [품목 N] createSingleBatch ──┤
                                          │
  ┌───────────────────────────────────────┘
  │
  ▼
  Step 1: createBatch
    ├── h_batches INSERT (product_id = h_products_v2.id)
    └── h_batch_inputs INSERT (material_id = item_master.id, BOM 기반)
  Step 2: getProductById (h_products_v2 단일)
  Step 3: autoCreateCcpInstancesForBatch
    ├── getProcessGroupsForProduct (BOM→수동→CCP-4P)
    ├── h_ccp_instances INSERT
    ├── h_ccp_rows INSERT (라운드로빈 × equip_batch_size)
    ├── getOrCreateCcpFormRecord (CCP-4P: FOR UPDATE)
    └── syncCcpRowsToFormRows (seqIdx 기반)
  Step 4: production_sku_output INSERT
  Step 5: h_batch_schedules INSERT
       │
       ▼ (그룹 후처리)
  Step 3.6: batch_plan 승인 (그룹 전체)
  Step 3.7: batch_production 승인 (배치별)
  Step 3.8: CCP-4P 금속검출 승인
  Step 4:   금속탐지 시간 비례배분
       │
       ▼ (배치 시작 시)
  autoIssueMaterialsForBatch
    ├── FEFO 로트 할당 → 재고 차감
    └── material_ledger_daily 수불부 반영
       │
       ▼ (배치 완료 시)
  completeBatch (tenantId 필수!)
    ├── 재고 정산, 원가 확정
    └── CCP 종결
       │
       ▼ (최종 승인 시)
  finalApproveRequest
    ├── 완제품 재고 증가
    └── 회계연동
```
