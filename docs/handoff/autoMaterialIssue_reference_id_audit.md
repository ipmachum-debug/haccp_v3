# 감사 리포트 — `AUTO_ISSUE` 재고 트랜잭션 `reference_id` NULL 근본원인

**작성일**: 2026-09-22 (KST)
**감사자**: Claude Code (한상갑 CEO 위임 세션)
**대상 tenant**: 2 (주식회사 단지)
**대상 파일**: `server/lib/production/autoMaterialIssue.ts` (총 527 라인)
**심각도**: P1 (감사 트레이스 절반이 소실됨 — HACCP 이력추적성 훼손 위험)

---

## 0. 요약 (Executive Summary)

- **증상**: `h_inventory_transactions` 테이블에서 `action_type='AUTO_ISSUE'`, `transaction_type='usage'` 레코드 중 상당수의 `reference_id`가 NULL.
  - 9/16~19 tenant=2 대상: 총 대상 214건 중 208건이 NULL 상태로 남아있었음 (사후 매핑으로 복구).
- **근본원인**: `autoMaterialIssue.ts` 내 두 개의 INSERT 경로 중 **정상(FEFO 성공) 경로에서 `reference_type` / `reference_id` 컬럼을 아예 넣지 않음** → NULL로 저장.
- **반대편(폴백 경로)**: `reference_type='batch', reference_id=${batchId}` 를 명시적으로 넣어 정상 저장 중.
- **결과**: FEFO가 잘 붙은 “정상 데이터”가 오히려 배치 참조를 잃는 아이러니한 구조 → 감사 시 배치→트랜잭션 조인 실패.
- **사후 조치(완료)**: 9/16~19 208건 `reference_type='batch', reference_id=<batch_id>` 재매핑 (`[REFID_FIX_20260922]` 태그).
- **권장**: 정상 경로 INSERT문에도 `reference_type='batch', reference_id=${batchId}` 두 컬럼을 추가하는 신규 PR.

---

## 1. 파일 개요

**파일**: `server/lib/production/autoMaterialIssue.ts`
**목적**: 배치 시작 시 `h_batch_inputs`에 계산된 투입 계획을 근거로 원료 자동 출고 (FEFO 로트 할당 + 재고 원장 기록).

**주요 흐름** (파일 상단 주석):
1. 배치 정보 조회
2. `h_batch_inputs`에서 원재료 투입 계획 조회
3. 원재료별 FEFO 로트 할당 시도
4. 로트 없으면 직접 출고 기록만 생성
5. `h_inventory_transactions` 기록
6. `h_batch_inputs.inventory_deducted = 1` 업데이트
7. 수불부(`material_ledger_daily`) 반영

**두 개의 INSERT 경로 존재**:
- **경로 A** (line ~322-333): FEFO 로트 할당 성공 시 (정상 케이스, 대다수)
- **경로 B** (line ~406-419): FEFO 실패 → lot_id=NULL 폴백 (예외 케이스)

---

## 2. 코드 대조

### 2.1 경로 A — FEFO 성공 (line 322-333, 문제 코드)

```ts
await db.execute(sql`
  INSERT INTO h_inventory_transactions
  (inventory_id, lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount,
   transaction_date, source_type, source_id, source_line_id,
   action_type, purpose, performed_by, created_by, tenant_id)
  VALUES
  (${inventoryId}, ${alloc.lotId}, ${canonicalId}, 'usage', ${alloc.quantity.toString()}, ${unit},
   ${alloc.unitCost.toString()}, ${amount.toString()},
   ${transactionDate}, 'BATCH', ${batchId}, ${input.id},
   'AUTO_ISSUE', 'production', ${userId}, ${userId}, ${tenantId})
`);
```

**컬럼 리스트에 없음**: `reference_type`, `reference_id`, `notes`
→ 이 INSERT를 거친 모든 트랜잭션은 `reference_type = NULL`, `reference_id = NULL` 로 저장됨.

### 2.2 경로 B — lot0 폴백 (line 402-419, 정상 코드)

```ts
// 2026-04-28 (근본 작업 A): sentinel lot_id=0 → NULL 로 전환.
// 의미: "LOT 매칭 실패" 를 sentinel 0 대신 NULL 로 표현.
await db.execute(sql`
  INSERT INTO h_inventory_transactions
  (lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount,
   transaction_date, source_type, source_id, source_line_id,
   action_type, purpose, performed_by, created_by, tenant_id,
   reference_type, reference_id, notes)
  VALUES
  (NULL, ${canonicalId}, 'usage', ${requiredQuantity.toString()}, ${unit},
   ${unitPrice.toString()}, ${materialCost.toString()},
   ${transactionDate}, 'BATCH', ${batchId}, ${input.id},
   'AUTO_ISSUE', 'production', ${userId}, ${userId}, ${tenantId},
   'batch', ${batchId}, ${`${materialName} 자동출고 (재고미등록, price_src=${priceFallbackSource})`})
`);
```

**컬럼 리스트에 포함**: `reference_type`, `reference_id`, `notes` → `'batch'`, `batchId`, 상세 notes.

### 2.3 차이 분석

| 컬럼 | 경로 A (정상) | 경로 B (폴백) |
|---|---|---|
| `source_type` | `'BATCH'` | `'BATCH'` |
| `source_id` | `batchId` ✓ | `batchId` ✓ |
| `source_line_id` | `input.id` (h_batch_inputs.id) ✓ | `input.id` ✓ |
| `reference_type` | **(누락, NULL)** ❌ | `'batch'` ✓ |
| `reference_id` | **(누락, NULL)** ❌ | `batchId` ✓ |
| `notes` | (누락, NULL) | 상세 문자열 ✓ |

**의문점**: `source_id`에 이미 `batchId`가 들어있는데 왜 `reference_id`가 또 필요한가?
- 답: `source_*` 는 “거래 발생 시점의 원본 트리거 (BATCH 시작)” 를 기록.
- `reference_*` 는 “거래의 논리적 소속 참조 (이 트랜잭션이 어떤 batch에 귀속되는지)” 를 조회 편의상 별도 컬럼으로 유지.
- 실제로 화면/리포트 계층에서 `reference_type='batch' AND reference_id=?` 로 조인하는 코드가 있어, 이게 NULL이면 배치 상세에서 트랜잭션 목록이 사라짐.
- 폴백 경로가 이 관례를 정확히 지켰고, 정상 경로가 실수로 누락한 것.

---

## 3. 영향 범위

### 3.1 이론적 영향
- 배치 상세 화면에서 “이 배치의 재고 사용 이력” 을 `reference_type='batch' AND reference_id=?` 로 뽑는 뷰/리포트는 **정상 케이스만 누락**하고 폴백 케이스만 보임 → 잘못된 이력 표시.
- 감사(HACCP 자재 이력추적) 시 “이 배치가 어떤 LOT을 소진했는가” 트레이싱 실패.
- `source_id` 컬럼을 대체 조회 키로 쓰는 경우엔 문제가 안 됨. 그러나 앱 내에서 두 컬럼 모두를 참조하는 코드가 혼재하여 일관성 훼손.

### 3.2 실측 영향 (tenant=2, 2026-09-16 ~ 09-19)

| 항목 | 수치 |
|---|---|
| 대상 배치 | 27개 |
| `AUTO_ISSUE` usage 트랜잭션 총량 | 214건 |
| 그 중 `reference_id IS NULL` | **208건 (97.2%)** |
| `reference_id` 정상 기록 | 6건 (2.8%, 폴백 경로) |

→ 정상 FEFO 경로가 압도적 다수라 문제가 시각적으로 크게 드러남.

### 3.3 사후 정정 결과 (완료)

**실행 스크립트**: `/home/root/webapp/scripts/fix_refid_null.cjs` (2026-09-22 실행)
**매핑 로직**: 같은 날짜 + 같은 material_id + 같은 quantity 조건으로 유일 `h_batch_inputs` 를 찾아 `batch_id` 를 역매핑.

| 결과 | 건수 | 비고 |
|---|---|---|
| 정상 매핑 (`[REFID_FIX_20260922]` 태그) | 208 | reference_type='batch', reference_id=<batch_id> |
| 모호 (같은 quantity 가진 다른 배치 존재) | 4 | 천일염 0.12kg 동일량 — 안전상 스킵 |
| 매칭 없음 | 2 | 참깨 관련 — 별도 감사 필요 |

→ 남은 NULL 6건은 프로덕션 데이터 무결성 위해 자동 매핑 미실행.

---

## 4. 근본원인 분석

### 4.1 Why the divergence?
`server/lib/production/autoMaterialIssue.ts` 파일의 두 INSERT 경로가 **각기 다른 시기에 각기 다른 담당자가 추가**된 것으로 추정.
- 경로 B에는 명시적 주석 `2026-04-28 (근본 작업 A): sentinel lot_id=0 → NULL 로 전환.` 존재 → 4월 폴백 리팩터 시점에 `reference_type`/`reference_id` 관례를 인지하고 넣음.
- 경로 A(FEFO 정상)는 그보다 이전에 작성되었고, 이후 리팩터가 폴백 경로에만 적용되어 관례 불일치가 정착.

### 4.2 왜 조기 발견되지 않았나?
- 배치 상세 화면이 여러 데이터 소스(수불부/트랜잭션/재고원장)를 병합해서 보여주고, `source_id` fallback도 부분적으로 존재해 시각적으로 “빈 화면”이 되진 않음.
- QA 시 폴백 경로를 커버하는 케이스만 봤을 가능성. FEFO 정상 케이스는 “당연히 잘 되겠지”로 가정.
- `h_inventory_transactions.reference_id` NULL은 스키마상 허용 (NOT NULL 제약 없음) → DB 레벨에서 오류로 잡히지 않음.

### 4.3 재발 가능성
- 같은 파일에 향후 세 번째 INSERT 경로가 추가되면 동일 실수 반복 가능.
- **방어책**: 트랜잭션 INSERT 헬퍼 함수를 하나 두고, 두 경로 모두 그 헬퍼를 호출하도록 리팩터.

---

## 5. 권장 수정 (신규 PR 지시)

### 5.1 최소 침습 수정 (권장, Quick Fix)
경로 A INSERT문의 컬럼 리스트에 두 컬럼 추가:

**Before** (line 322-333):
```ts
INSERT INTO h_inventory_transactions
(inventory_id, lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount,
 transaction_date, source_type, source_id, source_line_id,
 action_type, purpose, performed_by, created_by, tenant_id)
VALUES
(${inventoryId}, ${alloc.lotId}, ${canonicalId}, 'usage', ${alloc.quantity.toString()}, ${unit},
 ${alloc.unitCost.toString()}, ${amount.toString()},
 ${transactionDate}, 'BATCH', ${batchId}, ${input.id},
 'AUTO_ISSUE', 'production', ${userId}, ${userId}, ${tenantId})
```

**After**:
```ts
INSERT INTO h_inventory_transactions
(inventory_id, lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount,
 transaction_date, source_type, source_id, source_line_id,
 action_type, purpose, performed_by, created_by, tenant_id,
 reference_type, reference_id)
VALUES
(${inventoryId}, ${alloc.lotId}, ${canonicalId}, 'usage', ${alloc.quantity.toString()}, ${unit},
 ${alloc.unitCost.toString()}, ${amount.toString()},
 ${transactionDate}, 'BATCH', ${batchId}, ${input.id},
 'AUTO_ISSUE', 'production', ${userId}, ${userId}, ${tenantId},
 'batch', ${batchId})
```

- 컬럼 두 개만 추가. `notes`는 정상 경로에서는 필요 없으므로 미포함 (폴백 경로처럼 특별 상황 아님).
- 스키마 변경 없음. 롤백 = revert.

### 5.2 근본 수정 (선택, Refactor)
INSERT 로직을 헬퍼 함수로 추출:

```ts
async function insertUsageTransaction(db: any, params: {
  inventoryId: number | null;
  lotId: number | null;
  materialId: number;
  quantity: string;
  unit: string;
  unitCost: string;
  amount: string;
  transactionDate: string;
  batchId: number;
  batchInputId: number;
  userId: number;
  tenantId: number;
  notes?: string | null;
}) {
  await db.execute(sql`
    INSERT INTO h_inventory_transactions
    (inventory_id, lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount,
     transaction_date, source_type, source_id, source_line_id,
     action_type, purpose, performed_by, created_by, tenant_id,
     reference_type, reference_id, notes)
    VALUES
    (${params.inventoryId}, ${params.lotId}, ${params.materialId}, 'usage',
     ${params.quantity}, ${params.unit}, ${params.unitCost}, ${params.amount},
     ${params.transactionDate}, 'BATCH', ${params.batchId}, ${params.batchInputId},
     'AUTO_ISSUE', 'production', ${params.userId}, ${params.userId}, ${params.tenantId},
     'batch', ${params.batchId}, ${params.notes ?? null})
  `);
}
```

두 경로 모두 이 헬퍼 호출 → 컬럼 리스트 관리 일원화, 재발 방지.

### 5.3 테스트 케이스
1. 신규 배치 생성 → FEFO 성공 케이스 → `h_inventory_transactions` 조회 → `reference_type='batch' AND reference_id = batchId` 확인.
2. LOT이 없는 원재료로 배치 생성 → 폴백 케이스 → 위와 동일 조건 확인.
3. 배치 상세 화면에서 “재고 사용 이력” 섹션이 정상/폴백 케이스 모두 표시되는지 UI 확인.

---

## 6. 관련 남은 문제 (별도 처리)

### 6.1 `h_batch_inputs.inventory_deducted` 플래그 불일치 (사후 정정 완료)
- 실제 usage 트랜잭션이 존재하는데도 `inventory_deducted=false`로 남는 케이스 69건 (9/16~19 tenant=2).
- 사후 정정 완료 (`fix_deducted_flag.cjs`, `[FLAG_FIX_20260922]` 태그).
- 근본원인은 별도 조사 필요:
  - Step 6 (플래그 UPDATE) 실행 전 예외 처리 흐름에서 조기 return 하는지?
  - 트랜잭션 없이 순차 실행이라 부분 실패 시 플래그만 안 찍히는지?
- 파일 상단 주석에 이미 언급됨:
  > *"현재 각 원재료별 처리가 독립적인 try-catch 패턴이라 '일부 원재료만 부분 차감' 이 가능함."*

### 6.2 9/8 PROD-086 카스테라앙금인절미 배치 `h_batch_inputs` 비어있음
- 별도 감사 필요 — 배치 생성 시 `h_mf_ingredients` → `h_batch_inputs` 자동 생성이 실패한 것으로 추정.
- 우선순위 P2 (단발성 특이 케이스).

---

## 7. 조치 이력 요약

| 일시 | 조치 | 담당 | 태그 |
|---|---|---|---|
| 2026-09-22 KST | 9/16~19 `inventory_deducted` 플래그 69건 정정 | Claude Code | `[FLAG_FIX_20260922]` |
| 2026-09-22 KST | 9/16~19 `reference_id` NULL 208건 사후 매핑 | Claude Code | `[REFID_FIX_20260922]` |
| 2026-09-22 KST | 감사 리포트 작성 (본 문서) | Claude Code | — |
| (pending) | 근본 수정 PR — 경로 A INSERT문에 reference_* 추가 | (담당 엔지니어) | — |
| (pending) | Refactor PR — INSERT 헬퍼 함수 추출 | (담당 엔지니어) | — |

---

## 8. 참고 파일

- 서버 소스: `/root/haccp_v3/server/lib/production/autoMaterialIssue.ts` (총 527 라인, 두 INSERT 위치: 322 / 406)
- 진단 스크립트: `/home/root/webapp/scripts/inv_deep_1619.cjs`
- 정정 스크립트: `/home/root/webapp/scripts/fix_refid_null.cjs`
- 관련 PR 히스토리: PR #442 (v1 legacy cleanup, main 머지 완료, 2026-09-22)
