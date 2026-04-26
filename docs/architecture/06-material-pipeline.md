# 06. 원재료 파이프라인 — H1~H9 검증 결과 + canonical PK 결정

- **일자**: 2026-04-26
- **상태**: Accepted (canonical 결정) / Open (마이그레이션 PR-K1~K5 진행 예정)
- **결정자**: (architecture review session)
- **선행 문서**: `00-layers.md`, `02-naming-conventions.md`, `BATCH_PIPELINE.md`

---

## 1. 배경

`material_id` 가 가리키는 PK 공간이 시스템 내부에서 **두 개로 갈라져** 있음이 확인됨.

| 사용처 | 실제 저장된 PK | 비고 |
|---|---|---|
| `h_mf_ingredients` (BOM) | `item_master.id` | 코드 의도 |
| `h_batch_inputs` (배치 투입계획) | `item_master.id` | BOM 에서 그대로 복사 (변환 없음) |
| `accounting_purchases` (매입) | `h_materials.id` | 구버전 매입 299건 전수 |
| `h_inventory_lots` (재고 LOT) | `h_materials.id` | 매입 → LOT 경로에서 그대로 들어감 |

→ **같은 컬럼명(`material_id`) 이 두 PK 공간을 동시에 가리키는 상태.**
→ 결과적으로 `LEFT JOIN h_materials` / `LEFT JOIN item_master` 어느 쪽을 써도 절반은 NULL 반환.

이 문서는 H1~H9 검증으로 그 원인 / 영향 범위 / 정본(canonical) 결정 / 이주 계획을 기록함.

---

## 2. 검증 결과 (H1~H9)

> ⚠️ H2 · H5 · H6 · H8 · H9 는 본 분석 세션에서 "예상대로 통과" 로만 표시되었고 본문 정의가 별도 문서에 있음. 추후 보강 필요. 본 문서에서는 모순/충격이 발견된 H1·H3·H4·H7 을 우선 기록.

### H1 + H3: material_id PK 공간 분기 (충격적 모순)

**가설**: 시스템 전체에서 `material_id` 는 단일 PK 공간을 사용한다.

**결과**: ❌ 기각.

- `h_inventory_lots.material_id` 는 `h_materials.id` 를 가리킴 (item_master 아님).
- `server/lib/accounting/purchasePost.ts:62-116` 코드는 1순위로 `item_master.id` 를 저장하도록 의도되어 있음.
- 그러나 실제 DB 매입 LOT **299건 전부 `h_materials.id`** 로 저장됨.
- → `accounting_purchases.material_id` 자체가 이미 구버전 시점부터 `h_materials.id` 였음.
- → 코드의 1순위 (`item_master.id`) 는 사실상 신규 매입에서만 작동.

**도출 사실**: 시스템 내 두 PK 공간이 공존.

```
BOM · batch          →  item_master.id
매입 · LOT · ledger  →  h_materials.id
```

### H4: autoIssueMaterialsForBatch 호출 일관성 (모순)

**가설**: 배치 완료 시점에 자동출고가 항상 호출된다.

**결과**: ❌ 기각. 같은 코드가 날짜에 따라 정반대로 동작.

| 날짜 | 배치 수 | status | inventory_deducted | tx_count | 판정 |
|---|---|---|---|---|---|
| 2026-04-09 (목) | 7 | completed | **0** | **0** | ❌ 자동출고 누락 |
| 2026-04-14 (월) | 4 | completed | 1 | 정상 | ✅ 정상 작동 |

- → `autoIssueMaterialsForBatch` 호출 자체가 일관되지 않음.
- → 호출되었더라도 `autoMaterialIssue.ts:105-108` 의 "batch_input 없음" 워닝 경로로 빠진 케이스 가능.
- → 4/22 의 84건은 사후 일괄 백필 스크립트가 4/16~17 batch 11개를 한꺼번에 차감한 결과 (planned_date 가 4/15~4/16 으로 표시되어 그래프 왜곡).

### H7: ledger 와 transaction 의 비대칭 (모순)

**가설**: `material_ledger_daily` 와 `inventory_transactions` 는 같은 경로로 INSERT 된다.

**결과**: ❌ 기각.

- `material_ledger_daily` 4/9 = 171 kg 가 기록됨.
- 그런데 같은 날 batch 의 `inventory_transactions.tx_count = 0`.
- `autoMaterialIssue.ts:259` 의 ledger INSERT 는 line 217 garbage 경로에서도 실행됨.
- → 그러면 garbage tx 도 있어야 하는데 4/9 는 없음.
- → 다른 batch 완료 함수 (예: `completeBatch`) 가 ledger 만 단독 INSERT 하는 별도 경로가 존재할 가능성.

### H2 / H5 / H6 / H8 / H9

본 분석 세션에서 "예상대로 통과" 로만 분류됨. 가설 본문은 별도 백업 문서에 위치 (TODO: 본 문서에 합칠 것).

---

## 3. 발견된 4개 데이터 흐름 단절

```
[BOM 마스터: h_mf_ingredients]
       │  material_id = item_master.id (확정 ✅)
       ▼
[batch 생성: batchCRUD.ts:170]
       │  batch_inputs.material_id = item_master.id (변환 없음)
       ▼
[자동출고: autoMaterialIssue.ts:99 LEFT JOIN h_materials]    ← 🔴 단절 #1
       │  m.material_name = NULL, m.unit_price = NULL
       │  (batch_input 의 PK 는 item_master 인데 h_materials 로 JOIN)
       ▼
[h_inventory SELECT: line 140]                               ← 🔴 단절 #2
       │  inventory = undefined → garbage 경로
       │  (h_inventory 마스터 테이블이 비어있음)
       ▼
[INSERT line 219]                                            ← 🔴 단절 #3
       │  lot_id = 0, notes = '원재료 #ID 자동출고'
       │  (실제 LOT 와 무관한 garbage transaction)
       ▼
[화면 함수: getInventoryTrend / getMaterialUsage]            ← 🔴 단절 #4
       │  PR #67 / #68 미적용
       │  transaction_date 백필로 그래프 왜곡
       ▼
[화면: 4/22 86건, 4/17 13건 등 잘못된 추이]
```

---

## 4. 결정 (ADR Decision)

### canonical PK = `h_materials.id`

**근거**:

1. **현실 우위** — 매입 LOT 299건이 이미 100% `h_materials.id` 를 사용 중. 영향 범위 최소.
2. **컬럼 적합성** — `h_materials` 가 `unit_price` 등 회계 연동 컬럼을 보유 (item_master 보다 도메인 적합).
3. **이주 비용** — `item_master.id` 를 정본으로 두는 역방향 이주는 LOT 299건 + 모든 매입 트랜잭션을 갱신해야 함 (위험 ↑).
4. **레이어 부합** — `h_materials` 는 HACCP/생산 도메인의 재료 마스터로 출발 (현 5계층 분류상 `industry/food` 에 가까움). 추후 `shared-kernel/item` 또는 `core-mes/material` 로 정식 이주 시에도 데이터는 그대로 유지 가능.

### 함의

- `h_mf_ingredients`, `h_batch_inputs` 의 `material_id` 도 **`h_materials.id` 로 통일** (PR-K3).
- `item_master` 는 **품목 마스터(통합)** 역할로 유지하되, `material_id` 의 정본은 아님.
- `BATCH_PIPELINE.md:223` 의 "h_materials 사용 안 함" 기술은 **본 결정으로 폐기** (해당 문서 갱신 필요).
- `schema_accounting_extended.ts:20` 의 "h_materials 연결 FK (단일 소스 오브 트루스)" 주석은 **본 결정으로 추인됨**.

---

## 5. 이주 계획 — PR-K1 ~ PR-K5

> Strangler Fig 점진 적용. Big Bang 금지 (CLAUDE.md 8 원칙 준수).

### 🔴 PR-K1 — 즉시 적용 (1~2 h, 위험도 낮음)

**파일**: `server/db/.../autoMaterialIssue.ts:99`

```typescript
// 변경 전
LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id

// 변경 후 (전환기 임시)
LEFT JOIN item_master m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
// m.material_name → m.item_name
// m.unit_price → m.default_unit_price
```

**효과**: batch 완료 시 `원재료 #198` → `찹쌀(국내산)` 으로 정상 표시. 단가도 정확.
**한계**: line 140 의 `h_inventory` 가 비어 있는 문제는 별도 (PR-K2).
**주의**: PR-K3 적용 후 다시 `h_materials` JOIN 으로 되돌릴 것 (canonical 통일 완료 시점).

### 🔴 PR-K2 — h_inventory 마스터 백필 (2~4 h)

**조치 1**: 매입 확정 시 `h_inventory` 마스터도 함께 INSERT 하도록 `purchasePost.ts` 수정.

**조치 2**: 기존 LOT 299건 백필 마이그레이션 스크립트.

```sql
INSERT INTO h_inventory (tenant_id, material_id, total_quantity, available_quantity, ...)
SELECT tenant_id, material_id, SUM(current_quantity), SUM(available_quantity), ...
FROM h_inventory_lots
WHERE material_id IS NOT NULL AND status = 'available'
GROUP BY tenant_id, material_id
ON DUPLICATE KEY UPDATE
  total_quantity = VALUES(total_quantity),
  available_quantity = VALUES(available_quantity);
```

**전제**: PR-K3 의 `material_id` 통일 완료. 그 전에는 LOT(`h_materials.id`) ↔ batch_input(`item_master.id`) 매칭 불가.

### 🟡 PR-K3 — material_id 통일 마이그레이션 (4~8 h, 중간 위험)

**방향**: `item_master.id` → `h_materials.id` 일괄 변환.

**스크립트**:
1. `item_master` 의 각 row 에 대해 `legacy_material_id` 또는 `item_name` 매칭으로 `h_materials.id` 를 찾는다.
2. `h_batch_inputs.material_id` 와 `h_mf_ingredients.material_id` 를 일괄 UPDATE.
3. `batchCRUD.ts:145` 의 `LEFT JOIN itemMaster` 를 `h_materials` 로 변경.
4. PR-K1 의 임시 JOIN (`item_master`) 도 `h_materials` 로 되돌림.

**리스크**: `h_mf_ingredients` 가 `item_master` 외래키를 가질 수 있음 → 사전 확인 필수.
**롤백**: 변환 전 `material_id_backup` 컬럼 추가 후 1주 보존.

### 🟢 PR-K4 — 화면 함수 일관성 (1~2 h)

**파일**: `getInventoryTrend`, `getMaterialUsage`

PR #67 / #68 와 동일한 필터 적용:

- `reference_type IS NULL OR reference_type <> 'SALE'`
- `(l.id IS NULL OR l.product_id IS NULL)`
- `COALESCE(t.transaction_date, t.created_at)` + KST 변환

**추가 검토**: 화면에서 `transaction_date` 가 `created_at` 보다 7일 이상 과거인 백필 데이터는 별도 마커/토스트로 표시.

### 🟢 PR-K5 (선택) — 4/9 미차감 batch 보정

4/9 의 batch 7건 (id 535~541) 이 `inventory_deducted = 0` 으로 남음.
PR-K1·K2 적용 후 `autoIssueMaterialsForBatch(batchId, userId)` 재호출로 정상 처리.

---

## 6. 대가 (Consequence)

### 장점

- `material_id` 가 가리키는 PK 가 단일화 → JOIN 누락 / NULL 반환 사라짐.
- 매입 → LOT → batch 출고 → 회계 연동이 한 PK 공간에서 완결됨.
- `h_materials` 가 `unit_price` 를 보유하므로 자동분개 (`postExpenseVoucher`) 와 자연스럽게 연결.

### 단점

- `item_master` 가 통합 마스터를 자처해 왔으나, `material_id` 정본 권한은 잃게 됨 → 역할 재정의 필요.
- 5계층 이주 시점 (`shared-kernel/item` 도입) 에 다시 검토 필요. 본 결정은 **현재 코드 상태에서의 최소 영향 정합화** 가 목적.

### 리스크 완화

- PR-K3 실행 전 백업 컬럼 (`material_id_backup`) 추가.
- PR-K1 → K2 → K3 → K4 순서 엄수. K3 없이 K2 만 하면 LOT/batch_input 매칭 실패.
- 운영 적용 후 1주간 `material_ledger_daily` vs `inventory_transactions` 일별 sum 비교 모니터링.

---

## 7. 사용자 검증 필요 항목

| # | 검증 항목 | 우선순위 |
|---|---|---|
| 1 | canonical = `h_materials.id` 결정 추인 | 🔴 즉시 |
| 2 | PR-K1 만 우선 머지 후 화면 변화 확인 vs PR-K1+K2 묶음 머지 | 🔴 즉시 |
| 3 | 4/9 미차감 batch 7건 처리 정책 — 자동 재처리 vs 수동 보정 | 🟡 K1 적용 후 |
| 4 | H2 · H5 · H6 · H8 · H9 의 가설 본문 본 문서에 합치기 | 🟢 후속 |
| 5 | `BATCH_PIPELINE.md:223` "h_materials 사용 안 함" 문구 수정 | 🟢 본 결정 추인 후 |

---

## 관련 문서

- `00-layers.md` — 5계층 구조
- `02-naming-conventions.md` — 테이블 / FK 네이밍
- `04-policy-registry.md` — 자동분개 / 재고 차감 정책
- `BATCH_PIPELINE.md` — 배치 생산 시스템 정의 (본 결정으로 일부 갱신 필요)
- `ADR-001-shared-kernel.md` — 추후 `shared-kernel/item` 도입 시 본 결정 재검토
