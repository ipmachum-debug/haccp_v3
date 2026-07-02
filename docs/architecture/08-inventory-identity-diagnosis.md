# 재고·원재료·제품 정합성 근본 진단 (Inventory / Material / Product Identity Diagnosis)

> 작성: 2026-07 · 5축 read-only 전수조사 종합
> 목적: "재고 일관성이 자꾸 깨진다"는 반복 문제의 **구조적 근본 원인** 규명 + 단계별 수정 전략.
> 성격: 진단 문서 (수정 아님). 실제 코드 수정은 P1~ 단계에서 승인 후 진행.

---

## 두 개의 근본 병(disease)

### 병 ① — 식별자 파편화 (다중 id 공간을 "이름"으로 임시 봉합)

원재료·제품이 여러 id 공간에 동시에 존재하고, 그 경계를 **신뢰할 FK가 아니라 이름 문자열 매칭**으로 넘나든다.

| 개념 | 재고/생산 정본 | BOM/마스터 정본 | import 전용 | 다리(FK, 존재하나 미사용) |
|------|----------------|------------------|-------------|---------------------------|
| 원재료 | `h_materials.id` | `item_master.id` | `h_item_master.id` | `item_master.legacy_material_id → h_materials.id` |
| 제품 | `h_products_v2.id` | `item_master.id` | — | `item_master.legacy_product_id → h_products_v2.id` |

- 두 개의 상반된 생성 경로가 공존:
  - **Path A** (원재료 먼저, `material.router.ts` create): `item_master.id ≠ h_materials.id`, `legacy_material_id`로 연결.
  - **Path B** (item_master 먼저, `itemMaster.router.ts` + `itemMasterSync.syncItemMasterToMaterial`): `item_master.id == h_materials.id` 이지만 **`legacy_material_id = NULL`**.
- 변환 브릿지가 이름 매칭: `materialIdResolver.ts:100-131`, `batchCRUD.ts:208`, `batch.ts:113` 모두 `TRIM(material_name) = TRIM(item_name)`.
  - 이름이 조금만 달라도("멥쌀" vs "멥쌀(20kg)", 공백/전각/버전차) → 매칭 실패 → 다른 id 공간 그대로 유지.
  - **신뢰할 FK(`legacy_material_id`)가 존재하는데 어디서도 변환에 쓰지 않음.**

### 병 ② — 3자 불변식 미강제 (재고 이동 write 경로가 제각각)

재고 이동은 항상 세 가지를 함께 갱신해야 한다:
1. `h_inventory_lots` (LOT별 수량)
2. `h_inventory_transactions` (부호 있는 불변 원장 행)
3. `h_inventory` (자재별 집계)

그러나 write 경로 ~20개 전수조사 결과, **다수가 일부 leg만 갱신**한다 (아래 표).

---

## 파이프라인 파손 지도 (입고 → 재고 → 소모 → 차감 → 생산 → 제품재고)

### 입고
- `createPurchase` (`server/db/haccp/haccpIntegration.ts:12`): 자재 해결을 **`legacy_material_id`로만** (`:41`) → Path B 자재(`legacy_material_id NULL`) 는 LOT/재고 **스킵**. (3자 자체는 PR #387로 채움.)
- `purchaseCancel` (`server/lib/accounting/purchaseCancel.ts:130`): LOT+tx만, **집계 누락** → 취소 후 집계 부풀음.
- `purchaseReturn` (`server/routers/accounting/purchaseReturn.router.ts:56`): 집계 누락 + 단일 LOT만.

### 소모 (BOM → batch_inputs)
- BOM 라인 = `h_mf_ingredients.material_id` = **`item_master.id`** (`batchCRUD.ts:175`), 단 엑셀 import는 `h_item_master.id` (`excelImport.router.ts:381`).
- 배치 생성이 `item_master.id → h_materials.id` 를 **이름 매칭**으로 변환, 실패 시 `item_master.id` 유지 (`batchCRUD.ts:220`, `batch.ts:121`).
- 엑셀 import: `h_item_master.id` 그대로 + `inventory_deducted=1` 선기입 (`excelImport.router.ts:526`).

### 차감 (FEFO)
- `createBatchInput` (`server/db/system/simplifiedDataProcessor.ts:581`): **usage 트랜잭션 없음** + 부족 시 **silent skip**(throw 없음, `:609-622`) + 집계는 `params.qty` **전량 차감**(`:625-633`) + `inventory_deducted=1` 하드코딩(`:596`).
- `autoMaterialIssue` (`server/lib/production/autoMaterialIssue.ts`): 이름 재매칭 실패 → `canonicalId=rawId`(item_master.id) → `h_inventory WHERE material_id=<item_master.id>` = 0건 → **no_master 단락**(`:378-386`), LOT 미차감, 단가는 COALESCE 폴백으로 채워져 **원가 유령**.
- `materialOutboundPost` (`server/lib/inventory/materialOutboundPost.ts:41`): **tx만**, LOT·집계 안 건드림 → 같은 재고 **무한 재할당**.

### 생산 → 제품재고
- `completeBatch` (`server/db/production/batchLifecycle.ts:517-539`): `h_inventory` **else-INSERT 없음** → 첫 생산 제품 재고 안 늘어남. 집계는 **kg**, LOT은 **판매단위(box)** → 집계≠LOT합. 생산 tx에 `product_id` 없음 → 트랜잭션 리포트 0.
- 정식 경로(`productionCompletePost(V2).ts`)는 **연결 안 된 dead code**.

### 제품명 표시
- 배치/생산 화면 = `h_products_v2`만 (Pattern A). BOM/리포트 = `COALESCE(v2 → item_master)` (Pattern B). 두 테이블 id/이름 어긋나면 같은 제품이 화면마다 다른 이름 (`mfReportCRUD.ts:89-97`, `batchCRUD.ts:334-337`).

### 3자 불변식 위반 요약 (write 경로별)

| 경로 | LOT | 원장(tx) | 집계 | 갭 |
|------|-----|----------|------|-----|
| `createBatchInput` (소모) | ✅ | ❌ | ✅(전량) | usage tx 없음, silent skip, 집계 과차감 |
| 엑셀 BOM 소모 | ❌ | ❌ | ❌ | deducted=1만, 이동 0 |
| `materialOutboundPost` | ❌ | ✅ | ❌ | 무한 재할당 |
| `purchaseCancel` / `purchaseReturn` | ✅ | ✅ | ❌ | 취소 후 집계 부풀음 |
| `addMaterialInputToBatch` / `releaseStock` / `adjustStock` | ✅ | ✅ | ❌ | 집계 누락 |
| `deleteMaterialInput` | ✅(복구) | ❌ | ❌ | 역분개·집계 복구 없음 |
| `adjustInventory` | ⚠️ quantity만 | ✅ | ✅ | available 미갱신 → FEFO 못 봄 |
| `completeBatch` (소모) | ⚠️ 단일 LOT | ✅ | ✅(전량) | 부분커버 divergence |

(정상: `createInboundReceipt`, `createOutboundRecord`, `deductLotQuantity`, `autoMaterialIssueV2`(happy path) — 이들은 FOR UPDATE + 3자 완비.)

---

## 왜 자꾸 재발하는가

과거 수정은 **개별 경로 패치**나 **이름 매칭 손질**(증상)에 그쳤고, 두 근본 병(① 이름으로 id 잇기, ② 불변식 미강제)은 그대로였다. → 새 데이터·새 경로에서 계속 재발. (PR #387은 입고 한 경로의 3자를 채운 국소 치료.)

---

## 수정 전략 (Strangler Fig, 다중 PR — 증상 아닌 구조)

| 단계 | 내용 | 위험 | 효과 |
|------|------|------|------|
| **P0. 가시화** (본 문서 + `scripts/sql/diagnose_inventory_integrity.sql`) | 정합성 계량: FK NULL·id≠·이름불일치 자재 / 집계≠Σlots / deducted=1 without usage tx | 무해(읽기) | 현 파손을 숫자로, 수정 검증 기준선 |
| **P1. 다리를 FK로** ⭐ | `materialIdResolver` 이름매칭 → `legacy_material_id` FK 조회로 교체. 제품명 단일 resolver. import `inventory_deducted=1` 선기입 제거. (P0가 FK NULL 다수면 FK 백필 동반) | 중(도메인) | 차감 단락·이름 불일치 근본 차단 |
| **P2. 불변식 단일화** | 재고 이동 `applyInventoryMovement()` 단일 함수로 통일(항상 3자, 부족 시 throw). 20개 경로 이 함수 경유 | 중~고 | drift 원천 봉쇄 |
| **P3. 과거 데이터 재조정** | 집계=Σlots 재계산, orphan usage tx 소급 (#390·#361 확장) | 중(데이터/Genspark) | 잔존 drift 청산 |
| **P4. id 공간 통합(장기)** | `item_master.id == h_materials.id/h_products_v2.id` 를 제약으로 강제 or 단일 정본 수렴 | 고 | 병 ① 종식 |

**착수 순서**: P0(계량) → 결과 보고 → P1(FK 교체 + 필요 시 FK 백필) → P2 → P3.
각 단계는 P0가 만든 숫자가 **줄어드는지로 검증**한다.
