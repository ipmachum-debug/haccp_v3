# 배치(Batch) 생산 시스템 정의서

> 최종 업데이트: 2026-04-10  
> 대상 코드: `server/services/batchOrchestrator.ts`, `server/services/ccp-batch.ts`, `server/db/ccpFormRecords.ts`, `server/db/batchFunctions.ts`, `server/lib/autoMaterialIssue.ts`, `server/lib/autoApprovalRequest.ts`, `server/routers/production/batch.router.ts`

---

## 목차

1. [배치 개요](#1-배치-개요)
2. [제품 ID 매핑 (h_products_v2 → h_products)](#2-제품-id-매핑)
3. [BOM (품목제조보고) 구조](#3-bom-품목제조보고-구조)
4. [설비 기준 (Equipment)](#4-설비-기준)
5. [공정 기준 (CCP Process Groups)](#5-공정-기준-ccp-process-groups)
6. [배치 생성 파이프라인](#6-배치-생성-파이프라인)
7. [배치수(Batch Count) 계산](#7-배치수batch-count-계산)
8. [원재료 투입 및 재고 차감](#8-원재료-투입-및-재고-차감)
9. [SKU 생산수량 및 재고 증가](#9-sku-생산수량-및-재고-증가)
10. [CCP 기록 자동 생성](#10-ccp-기록-자동-생성)
11. [제품 배열 및 시간 배분 (CCP-4P 금속검출)](#11-제품-배열-및-시간-배분)
12. [승인 워크플로](#12-승인-워크플로)
13. [배치 라이프사이클](#13-배치-라이프사이클)
14. [데이터베이스 스키마 요약](#14-데이터베이스-스키마-요약)

---

## 1. 배치 개요

**배치(Batch)** 는 특정 날짜에 특정 제품을 일정량 생산하는 단위입니다.

### 생성 방식
| 방식 | 함수 | 설명 |
|------|------|------|
| **단일 생성** | `batch.create` | 1개 제품 × 1배치 |
| **일괄 생성** | `batch.bulkCreateForDay` | N개 제품 × 1일 (일일 배치 그룹) |

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

일괄 생성 시 같은 날짜의 모든 배치는 동일한 `day_batch_group`을 공유합니다.

---

## 2. 제품 ID 매핑

시스템에는 두 개의 제품 테이블이 존재합니다:

| 테이블 | 용도 |
|--------|------|
| `h_products` | 배치/BOM/CCP 시스템 (내부 기준) |
| `h_products_v2` | UI 제품 목록 표시 (사용자 선택) |

### 변환 로직 (`resolveToHProductId`)
```
UI(h_products_v2.id) → 서버(h_products.id) 변환
```

1. `h_products`에서 해당 ID로 직접 조회
2. `h_products_v2`에서 해당 ID로 직접 조회
3. 양쪽 이름이 동일하면 → ID 일치, 변환 불필요
4. 이름이 다르면 → `h_products_v2`의 이름으로 `h_products`에서 검색
5. 매핑 실패 시 → 원래 ID 그대로 반환

**호출 시점**: `createSingleBatch` 진입 직후 (Step 0)

---

## 3. BOM (품목제조보고) 구조

BOM은 **제품의 원재료 배합비**를 정의합니다.

### 테이블 관계
```
h_mf_reports (품목제조보고 헤더)
  └── h_mf_report_versions (버전 관리, 승인 상태)
        └── h_mf_ingredients (원재료 라인)
              ├── material_id → item_master (원재료)
              └── process_group_id → ccp_process_groups (공정 그룹)
```

### 핵심 필드

#### h_mf_reports
| 필드 | 설명 |
|------|------|
| `product_id` | 제품 ID (h_products.id) |
| `tenant_id` | 테넌트 격리 |

#### h_mf_report_versions
| 필드 | 설명 |
|------|------|
| `version_no` | 버전 번호 |
| `approval_status` | `APPROVED` / `DRAFT` |
| `batch_target_kg` | **BOM 1배치 기준 중량 (kg)** — 배치수 계산의 핵심 |

#### h_mf_ingredients (원재료 라인)
| 필드 | 설명 |
|------|------|
| `material_id` | 원재료 ID |
| `quantity` | 법적 배합비 (%) |
| `corrected_quantity` | **보정 배합비 (%)** — 실제 투입 계산에 사용 |
| `is_deductible` | 재고 차감 대상 여부 (1=차감, 0=미차감) |
| `process_group_id` | 해당 원재료가 속한 CCP 공정 그룹 |

### 배합비 → 투입량 계산
```
투입량(kg) = (보정배합비% / 100) × 계획생산량(kg)
```
- `corrected_quantity` 우선 사용, 없으면 `quantity` 폴백
- 정제수(purified water)도 투입 계획에 포함 (원가 계산에서만 제외)

---

## 4. 설비 기준 (Equipment)

### equipments 테이블
| 필드 | 단위 | 설명 |
|------|------|------|
| `default_temperature` | ℃ | 설비 기준 온도 |
| `default_pressure` | MPa | 설비 기준 압력 |
| `default_time` | 분 | 설비 기본 가열(작업) 시간 |
| `batch_operation_time` | 분 | 유휴시간 포함 1배치 총 소요 시간 (사이클) |
| `edge_temperature` | ℃ | 가열 후 모서리부 품온 |
| `center_temperature` | ℃ | 가열 후 중심부 품온 |
| `fe_sensitivity` | mm | 금속검출기 Fe 감도 |
| `sts_sensitivity` | mm | 금속검출기 SUS 감도 |
| `work_start_time` | HH:mm | 설비 작업 시작 시간 |
| `work_end_time` | HH:mm | 설비 작업 종료 시간 |
| `lunch_start_time` | HH:mm | 점심시간 시작 |
| `lunch_end_time` | HH:mm | 점심시간 종료 |

### 공정그룹-설비 매핑 (`ccp_process_group_equipments`)
```
ccp_process_groups 1:N ccp_process_group_equipments N:1 equipments
```
`sort_order` 순으로 설비를 순차 할당합니다.

---

## 5. 공정 기준 (CCP Process Groups)

### CCP 타입
| CCP 타입 | 설명 | 공정 예시 |
|----------|------|-----------|
| **CCP-1B** | 가열(증숙) 공정 | 교반-가열공정, 증숙(설기류)공정, 증숙(약식류)공정 |
| **CCP-2B** | 가열(굽기) 공정 | 오븐-굽기공정 |
| **CCP-4P** | 금속검출 공정 | 금속검출공정 (항상 포함) |

### ccp_process_groups 핵심 필드
| 필드 | 설명 |
|------|------|
| `temperature_min/max` | 관리한계(CL) 온도 범위 (℃) |
| `time_min/max` | 관리한계(CL) 시간 범위 (분) |
| `pressure_min/max` | 관리한계(CL) 압력 범위 (MPa) |
| `equip_group_mode` | 설비 운용 모드: `sequential`(순차) / `concurrent`(동시) / `grouped`(그룹) |
| `equip_interval_min` | 설비 간 투입 간격 (분) |

### 제품-공정그룹 매핑 우선순위

`getProcessGroupsForProduct` 함수에서 결정:

```
① BOM 기반 (APPROVED 버전의 ingredient.process_group_id)
   → CCP-4P 제외, BOM에서 자동 추출

② 수동 매핑 (ccp_process_group_products 테이블)
   → BOM에 없는 그룹만 추가

③ CCP-4P (금속검출) → 항상 포함
   → BOM/수동에 관계없이 무조건 추가
```

**최종 순서**: BOM 그룹 → 수동 그룹 (BOM과 중복되지 않는 것만) → CCP-4P

---

## 6. 배치 생성 파이프라인

### 단일 배치 (`createSingleBatch`)

```
Step 0: 제품 ID 변환 (h_products_v2 → h_products)
Step 1: h_batches INSERT + h_batch_inputs 자동생성 (BOM 배합비 기반)
Step 2: 제품 정보 조회
Step 3: CCP 자동 생성
  ├── 3.0: autoCreateCcpInstancesForBatch (h_ccp_instances + h_ccp_rows)
  ├── 3.1: getOrCreateCcpFormRecord (h_ccp_form_records - 인쇄용)
  └── 3.2: syncCcpRowsToFormRows (h_ccp_form_rows - 인쇄용 행)
Step 4: SKU 생산수량 기록 (production_sku_output)
Step 5: 배치 스케줄 생성 (h_batch_schedules)
Step 6: 승인요청 자동 등록 (h_approval_requests)
  ├── 6.0: batch_completion 승인 (생산일지)
  └── 6.1: CCP-4P 금속검출 통합 승인
Step 7: 일일일지 + 주간/월간/연간 일지 자동 생성
Step 8: 감사 로그 (audit_logs)
```

### 일괄 배치 (`bulkCreateForDay`)

```
Step 1: 일일 배치 그룹 코드 생성 (DAY-YYYYMMDD-XXX)
Step 2: 품목별 createSingleBatch 순차 호출 (skipGroupActions=true)
Step 3: 그룹 레벨 후처리
  ├── 3.0: 일일일지 생성 (각 배치별)
  ├── 3.5: 주간/월간/연간 일지
  ├── 3.6: 그룹 승인요청 (batch_plan: 일일배치 전체)
  ├── 3.7: 개별 batch_production 승인 (배치별 CCP)
  └── 3.8: CCP-4P 금속검출 통합 승인요청
Step 4: 금속탐지 시간 배정 (allocateMetalPassLogsForDay)
Step 5: 공정 스케줄 생성 (createProcessScheduleForDay)
Step 6: 생산일지(production_daily) 자동 갱신
```

### `skipGroupActions` 플래그
| 값 | 승인요청 | 일일일지 | 주간/월간/연간 |
|----|---------|---------|--------------|
| `false` (단일) | 개별 배치에서 생성 | 개별 배치에서 생성 | 개별 배치에서 생성 |
| `true` (일괄) | 그룹 레벨에서 생성 | 그룹 레벨에서 생성 | 그룹 레벨에서 생성 |

---

## 7. 배치수(Batch Count) 계산

하나의 배치(생산 주문)에서 실제 설비를 몇 번 돌려야 하는지 계산합니다.

### 공식
```
배치수 = CEIL(계획생산량 / BOM 1배치 기준중량)

예: 계획 150kg, BOM 기준 50kg/배치 → 배치수 = 3
```

### BOM 1배치 기준중량 조회 우선순위
1. `h_mf_report_versions.batch_target_kg` (APPROVED 버전)
2. `h_recipe_headers.target_quantity` (폴백)
3. 기본값: 1

### 배치수가 영향을 미치는 곳
| 항목 | 영향 |
|------|------|
| `h_ccp_rows` | CCP-1B/2B: 배치수 = 행 수 (1배치 = 1설비 1운전) |
| `h_ccp_form_rows` | 인쇄용 기록지 행 수 (= 배치수) |
| `h_ccp_form_records.batch_count` | 기록지 헤더에 저장 |
| CCP-4P | **배치수 무시** — 항상 Fe 1행 + SUS 1행 |

---

## 8. 원재료 투입 및 재고 차감

### 투입 계획 자동 생성 (배치 생성 시)

`createBatch` → `h_batch_inputs` 자동 INSERT:

```
1. h_mf_reports에서 해당 제품의 품목제조보고 조회
2. 최신 APPROVED 버전 → h_mf_ingredients 조회
3. 각 원재료별:
   투입량 = (보정배합비% / 100) × 계획생산량(kg)
4. h_batch_inputs에 INSERT (material_id, planned_quantity, unit)
```

### 재고 차감 (`autoIssueMaterialsForBatch`)

배치 시작 시 호출:

```
1. h_batch_inputs에서 투입 계획 조회
2. 각 원재료별:
   ├── h_inventory에서 가용 재고 확인
   ├── 재고 충분 → FEFO 로트 할당 (fefoLotAllocation)
   │   ├── h_inventory_lots.available_quantity 차감
   │   ├── h_inventory_transactions에 'usage' 기록
   │   └── h_inventory.total_quantity / available_quantity 차감
   ├── 재고 부족 → 출고 기록만 생성 (재고 미차감)
   └── 재고 없음 → 출고 기록만 생성
3. h_batch_inputs.inventory_deducted = 1 업데이트
4. material_ledger_daily에 수불부 반영 (usage_qty 누적)
5. h_batches.planned_cost 업데이트 (총 원가)
```

### FEFO 로트 할당 규칙
- **FEFO** = First Expiry, First Out (유통기한 빠른 것부터 출고)
- 단가는 로트별 가중평균으로 계산
- 정제수(`purified water`): 투입 기록은 하되 원가 = 0원

---

## 9. SKU 생산수량 및 재고 증가

### SKU (Stock Keeping Unit)
```
h_products → product_skus (1:N)
```

| 필드 | 설명 |
|------|------|
| `sku_code` | SKU 코드 |
| `sku_name` | SKU명 (예: "꿀설기 500g×2팩") |
| `kg_per_sales_unit` | 판매단위당 kg |
| `net_weight_g` | 개당 순중량(g) |
| `pieces_per_pack` | 1팩 수량 |
| `packs_per_box` | 1박스 팩 수 |

### 생산수량 기록 (배치 생성 시)

`production_sku_output` INSERT:
```sql
INSERT INTO production_sku_output
  (tenant_id, batch_id, sku_id, quantity, defective_qty, total_kg, notes)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  quantity=VALUES(quantity),
  defective_qty=VALUES(defective_qty),
  total_kg=VALUES(total_kg)
```

**total_kg 계산**: `quantity × kg_per_sales_unit`

### 재고 증가 (배치 승인 완료 시)

`finalApproveRequest` → `postProductionComplete`:
```
배치 승인(approved) 시:
  1. actualQuantity > 0이면 재고 이동 트리거
  2. 완제품 재고 증가 (h_inventory)
  3. 회계연동 처리 (h_inventory_transactions)
```

---

## 10. CCP 기록 자동 생성

### 계층 구조
```
[공정그룹 결정] getProcessGroupsForProduct
    └── BOM + 수동매핑 + CCP-4P(항상)

[인스턴스 생성] autoCreateCcpInstancesForBatch
    └── 공정그룹별 h_ccp_instances INSERT
        └── 설비별 h_ccp_rows INSERT

[인쇄용 기록지] getOrCreateCcpFormRecord
    └── h_ccp_form_records INSERT (헤더)

[인쇄용 행 동기화] syncCcpRowsToFormRows
    └── h_ccp_rows → h_ccp_form_rows 변환
```

### CCP-1B / CCP-2B (가열 공정)

**h_ccp_instances**: 배치별 1개 (공정그룹당)

**h_ccp_rows**: 배치수 = 행 수 (1배치 = 1설비 1운전, 설비는 라운드로빈 순환)
```
예: 배치수=3, 설비 2대 → 3행 (설비 순환 할당)
  batch_no=1, equipment=교반기1  ← 설비1
  batch_no=2, equipment=교반기2  ← 설비2
  batch_no=3, equipment=교반기1  ← 다시 설비1 (round-robin)

예: 배치수=5, 설비 2대 → 5행
  batch_no=1, equipment=교반기1
  batch_no=2, equipment=교반기2
  batch_no=3, equipment=교반기1
  batch_no=4, equipment=교반기2
  batch_no=5, equipment=교반기1
```

**시간 계산 공식**:
```
heating_min    = ccp_process_groups.time_min (공정별 가열시간)
cycle_total    = equipments.batch_operation_time (설비 유휴포함 사이클)
eq_default_heat= equipments.default_time (설비 기본 가열시간)

duration_min   = cycle_total + (heating_min - eq_default_heat)

예) 교반기(사이클70분, 기본가열10분) + 교반-가열공정(가열10분)
    → 70 + (10 - 10) = 70분

예) 증숙기(사이클22분, 기본가열10분) + 증숙(약식류)공정(가열35분)
    → 22 + (35 - 10) = 47분
```

**압력 단위 변환**: 설비/공정 기준(MPa) → 저장(bar): × 10

**온도 우선순위**: 설비 기준 → 공정 한계기준(CL) 폴백

### CCP-4P (금속검출)

**h_ccp_instances**: 배치별 1개 (batch_count 무시)

**h_ccp_rows**: 항상 2행
```
sort_order=1: Fe (철) 기준 시편 검출 테스트
sort_order=2: SUS (스테인리스) 기준 시편 검출 테스트
```

**h_ccp_form_records**: **일(日)별 1개 통합 기록지**
- `product_name = '금속검출 통합'`
- `product_id = NULL`
- `planned_qty_kg` = 당일 전체 배치 합계
- `batch_count` = 당일 전체 배치 수
- 첫 번째 배치의 `batch_id`를 anchor로 사용

### 인쇄용 기록지 동기화 (syncCcpRowsToFormRows)

#### CCP-1B/2B 동기화
```
h_ccp_rows → h_ccp_form_rows 매핑:
  instance.batch_no     → form_row.batch_seq
  row.equipment_id/name → form_row.equipment_id/name
  row.temp_c            → form_row.heat_temp_c
  row.duration_min      → form_row.heat_time_min
  row.pressure_bar(÷10) → form_row.pressure_mpa
  equipment.edge_temp   → form_row.temp_edge_c
  equipment.center_temp → form_row.temp_center_c
```

**교차배치 설비 순환(Cross-batch Equipment Rotation)**:
```
같은 day_batch_group 내에서 같은 공정의 이전 배치들이 사용한 서브배치 수를
합산하여 현재 배치의 설비 시작 인덱스(offset)를 결정.

예: 설비 3대(A,B,C), 제품X(3배치) → 제품Y(2배치)
  제품X: batch1→설비A, batch2→설비B, batch3→설비C  (equipStartIndex=0)
  제품Y: batch1→설비A, batch2→설비B                 (equipStartIndex=3 → 3%3=0부터)

예: 설비 2대(A,B), 제품X(3배치) → 제품Y(2배치)
  제품X: batch1→설비A, batch2→설비B, batch3→설비A  (equipStartIndex=0)
  제품Y: batch1→설비B, batch2→설비A                 (equipStartIndex=3 → 3%2=1부터)
```

#### CCP-4P 동기화 (제품별 순차 시간 배분)
→ [11. 제품 배열 및 시간 배분](#11-제품-배열-및-시간-배분) 참조

---

## 11. 제품 배열 및 시간 배분

### CCP-4P 금속검출 일일 통합 시간 배분

하루에 여러 제품이 금속검출기 1대를 순차적으로 사용합니다.

#### 배분 원칙
```
작업시간: 설비 work_start_time ~ work_end_time (기본 07:00~18:00)
점심시간: lunch_start_time ~ lunch_end_time (기본 12:00~13:00)

가용 시간 = 총 작업시간 - 점심시간
각 제품의 배분 시간 = 가용시간 × (해당 제품 SKU 통과량 / 전체 통과량)
```

#### 데이터 구조
```
h_ccp_batch_process_runs (일일 공정 실행 기록)
  └── h_ccp_metal_sku_slots (SKU별 시간 슬롯)
  └── h_ccp_metal_sensitivity_checks (감도 체크 스케줄)
```

#### SKU 슬롯 결정 과정
```
1. 당일 전체 배치의 SKU 출력 정보 수집
2. 배치 순서(batch_order) → 제품 그룹 순서
3. 제품별 총 통과량(pass_qty) 기준 비례 배분
4. 제품 그룹 내에서 SKU별 세부 시간 할당
5. 점심시간 건너뛰기 (skipLunch)
6. 랜덤 오프셋 적용 (동일 시간에 시작하지 않도록)
```

#### 감도 체크 스케줄
| 체크 타입 | 시점 | 내용 |
|-----------|------|------|
| `START` | 품목 시작 시 | Fe/SUS 기준 시편 검출 테스트 |
| `PERIODIC` | 2시간 간격 | Fe/SUS 기준 시편 검출 테스트 |
| `END` | 품목 종료 시 | Fe/SUS 기준 시편 검출 테스트 |

#### 불변 조건 (INVARIANT)
```
★ 제품 간 시간 겹침 금지 (금속검출 혼입 방지)
  - 각 제품 그룹의 시작 >= 이전 그룹의 끝
  - 통과 시간이 감도체크 시간 ±4분 이내면 자동 조정
```

#### h_ccp_form_rows 생성
```
1. 감도 모니터링 행 (equipment_type='sensitivity')
   - 품목시작/2시간점검/품목종료 별 Fe/SUS 검출 결과
   
2. 통과 기록 행 (equipment_type='passage')
   - SKU별 통과 시작/종료 시간, 통과량, 검출량
```

---

## 12. 승인 워크플로

### 승인 상태 흐름
```
pending_review → pending_approval → approved
                                  → rejected
```

### 승인 요청 타입

| request_type | reference_type | 생성 시점 | 설명 |
|-------------|----------------|-----------|------|
| `batch_plan` | `batch_group` | 일괄 생성 후 (Step 3.6) | 일일 배치 그룹 전체 승인 |
| `batch_production` | `batch` | 일괄 생성 후 (Step 3.7) | 개별 배치 CCP 기록 승인 |
| `batch_completion` | `document_instance` | 단일 생성 (Step 6.0) | 생산 완료 후 생산일지 승인 |
| `ccp_form` | `ccp_form_record` | 일괄/단일 생성 (Step 3.8/6.1) | CCP-4P 금속검출 통합 승인 |

### 승인 흐름 상세

#### 1. 일일 배치 그룹 승인 (`batch_plan`)
```
생성: bulkCreateForDay Step 3.6
제목: "[일일배치] 2026-04-10 4품목 (DAY-20260410-001)"
내용: 작업일, 품목수, 제품명, 총계획수량, CCP건수, 배치코드
상태: pending_review
```

#### 2. 개별 배치 CCP 승인 (`batch_production`)
```
생성: bulkCreateForDay Step 3.7 (ccpCreated && ccpCount > 0인 배치만)
제목: "[자동] 배치 CCP 승인 - 00005-20260410-001 (꿀설기)"
내용: 제품명, 계획일, CCP건수, 배치코드, CCP공정명
상태: pending_review
```

#### 3. CCP-4P 금속검출 통합 승인 (`ccp_form`)
```
생성: bulkCreateForDay Step 3.8 또는 createSingleBatch Step 6.1
조건: 당일 CCP-4P form record에 approval_request_id가 없을 때만
제목: "[CCP-CCP-4P] 2026-04-10 금속검출 통합"
내용: 금속검출공정 CCP 기록지(일일통합), 제품명, 배치수
상태: pending_review

추가 동작:
  - h_ccp_form_records.status = 'submitted'
  - h_ccp_form_records.approval_request_id = 새 승인요청 ID
```

#### 4. 배치 완료 승인 (`batch_completion`)
```
생성: autoCreateApprovalRequest (배치 완료 시)
제목: "[생산일지] 꿀설기 - 배치 00005-20260410-001"
내용: 배치번호, 계획/실제수량, LOT번호
연동: document_instances에 생산일지 문서 등록

승인 완료 시 → postProductionComplete:
  - 완제품 재고 증가
  - 회계연동 처리
```

### 승인 처리 함수

| 함수 | 동작 |
|------|------|
| `reviewApprovalRequest` | pending_review → pending_approval (검토 완료) |
| `finalApproveRequest` | pending_approval → approved (최종 승인) + 재고 이동 |
| `bulkApproveDocuments` | 여러 승인요청 일괄 최종 승인 |

---

## 13. 배치 라이프사이클

### 상태 흐름
```
planned → in_progress → completed → approved → shipped → archived
              ↓                        ↓
           paused                   rejected
              ↓
           cancelled
              ↓
            failed
```

### 주요 상태 전이 이벤트

| 전이 | 트리거 | 자동 처리 |
|------|--------|-----------|
| `→ planned` | 배치 생성 | BOM 투입 계획, CCP 자동생성, 스케줄, 승인요청 |
| `→ in_progress` | 배치 시작 | 원재료 자동 출고 (autoIssueMaterialsForBatch) |
| `→ completed` | 배치 완료 | 재고 정산, 원가 확정, CCP 종결, PDF 생성, 감사로그 |
| `→ approved` | 최종 승인 | 완제품 재고 증가, 회계연동 |

---

## 14. 데이터베이스 스키마 요약

### 배치 핵심 테이블

```
h_batches                    -- 배치 헤더
h_batch_inputs               -- 원재료 투입 계획/실적
production_sku_output        -- SKU 생산수량
h_batch_schedules            -- 배치 스케줄
```

### BOM 테이블

```
h_mf_reports                 -- 품목제조보고 헤더
h_mf_report_versions         -- 버전 (batch_target_kg)
h_mf_ingredients             -- 원재료 라인 (배합비)
```

### CCP 테이블

```
ccp_process_groups           -- 공정 그룹 정의 (CL 기준값)
ccp_process_group_equipments -- 공정그룹-설비 매핑
ccp_process_group_products   -- 공정그룹-제품 수동 매핑
equipments                   -- 설비 마스터

h_ccp_instances              -- CCP 인스턴스 (배치×공정그룹)
h_ccp_rows                   -- CCP 측정 행 (인스턴스×설비×배치수)

h_ccp_form_records           -- 인쇄용 기록지 헤더
h_ccp_form_rows              -- 인쇄용 기록지 행

h_ccp_batch_process_runs     -- CCP-4P 일일 공정 실행
h_ccp_metal_sku_slots        -- CCP-4P SKU 시간 슬롯
h_ccp_metal_sensitivity_checks -- CCP-4P 감도 체크 스케줄
```

### 재고 테이블

```
h_inventory                  -- 재고 마스터
h_inventory_lots             -- 재고 로트 (FEFO)
h_inventory_transactions     -- 재고 트랜잭션 (입/출고)
material_ledger_daily        -- 수불부
```

### 승인 테이블

```
h_approval_requests          -- 승인 요청
document_instances           -- 문서 인스턴스 (생산일지)
document_types               -- 문서 타입 정의
```

---

## 부록: 전체 데이터 흐름 다이어그램

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
       ┌──────────────────────────────────┘
       │
       ▼
  ┌─────────────────────────────────────────────────────┐
  │  Step 0: resolveToHProductId (v2→v1 ID 변환)        │
  │  Step 1: createBatch                                │
  │    ├── h_batches INSERT                             │
  │    └── h_batch_inputs INSERT (BOM 배합비 기반)       │
  │  Step 2: getProductById                             │
  │  Step 3: autoCreateCcpInstancesForBatch             │
  │    ├── getProcessGroupsForProduct                   │
  │    │     └── BOM → 수동 → CCP-4P(항상)              │
  │    ├── h_ccp_instances INSERT (공정그룹별)            │
  │    ├── h_ccp_rows INSERT (설비×배치수)               │
  │    ├── getOrCreateCcpFormRecord                     │
  │    │     ├── CCP-1B/2B: 배치별 1개                  │
  │    │     └── CCP-4P: 일(日)별 1개 (통합)             │
  │    └── syncCcpRowsToFormRows                        │
  │          ├── CCP-1B/2B: 설비 기준값 → 인쇄용 행      │
  │          └── CCP-4P: 제품별 순차 시간 배분            │
  │  Step 4: production_sku_output INSERT               │
  │  Step 5: h_batch_schedules INSERT                   │
  └─────────────────────────────────────────────────────┘
       │
       ▼ (그룹 레벨 후처리)
  ┌─────────────────────────────────────────────────────┐
  │  Step 3.6: batch_plan 승인요청 (그룹 전체)           │
  │  Step 3.7: batch_production 승인요청 (배치별 CCP)    │
  │  Step 3.8: CCP-4P 금속검출 통합 승인요청              │
  │  Step 4:   금속탐지 시간 배정                         │
  │  Step 5:   공정 스케줄 생성                           │
  │  Step 6:   생산일지 자동 갱신                         │
  └─────────────────────────────────────────────────────┘
       │
       ▼ (배치 시작 시)
  ┌─────────────────────────────────────────────────────┐
  │  autoIssueMaterialsForBatch                         │
  │    ├── h_batch_inputs 투입 계획 조회                  │
  │    ├── FEFO 로트 할당 → 재고 차감                     │
  │    ├── h_inventory_transactions 출고 기록             │
  │    └── material_ledger_daily 수불부 반영              │
  └─────────────────────────────────────────────────────┘
       │
       ▼ (배치 완료 시)
  ┌─────────────────────────────────────────────────────┐
  │  completeBatch                                      │
  │    ├── 재고 정산, 원가 확정                           │
  │    ├── CCP 종결                                     │
  │    └── autoCreateApprovalRequest (batch_completion)  │
  └─────────────────────────────────────────────────────┘
       │
       ▼ (최종 승인 시)
  ┌─────────────────────────────────────────────────────┐
  │  finalApproveRequest                                │
  │    ├── approved 상태 변경                             │
  │    └── postProductionComplete                        │
  │          ├── 완제품 재고 증가                         │
  │          └── 회계연동 처리                            │
  └─────────────────────────────────────────────────────┘
```
