# 11. 품목 정체성 정본 정책 (v3 개편 0단계)

> 작성: 2026-10-12. 상태: **DECISION PENDING → 머지 시 CANONICAL**.
> 근거: 운영 DB 덤프 `haccp_tenant_db-dump-2026-10-10_1908.sql.gz` (444 테이블) 실측 +
> 외부 정밀진단 2건 (2026-10-12 기술·데이터·사용성 정밀진단 / DB·구조 실측 분석).
> 이 문서가 07 · 09 · 최근 세션 제안 사이의 **정본 정책 3개 공존** 상태를 하나로 닫는다.

---

## 0. 왜 이 문서가 먼저인가

같은 프로젝트 안에 서로 반대인 정본 선언이 셋 있었다.

| 출처 | 선언 |
|---|---|
| `07-canonical-tables.md` (2026-05-08) | `item_master` 정본. `h_products_v2` / `h_materials` 는 폐기 대상 |
| `09-inventory-chokepoint-migration.md` (2026-07-02) | 재고 원장 `material_id` 는 `h_materials.id` 만. `item_master.id` 유입 금지 |
| 2026-10-11 세션 제안 | `h_products_v2` / `h_materials` / `h_mf_reports` 정본, `item_master` 읽기 전용 |

AI 세션마다 다른 문서를 보고 다른 방향으로 고쳐 왔고, 그 결과가 매주 나오는 "고아" 감사다.
**세 선언은 사실 모순이 아니라 층위가 다른 말**이었다. 아래 실측이 그걸 보여 준다.

## 1. 실측 — 데이터가 이미 정한 것

테넌트 2 (운영) 기준, 2026-10-10 스냅샷.

### 1-1. 수량을 다루는 테이블은 전부 "상세 테이블" id 를 쓴다

| 참조 컬럼 | 행수 | `h_products_v2` / `h_materials` 에 존재 | `item_master` 에 존재 |
|---|---:|---:|---:|
| `h_batches.product_id` | 885 | **885** | 818 (id 우연 일치, 의미 없음) |
| `h_batch_inputs.material_id` | 7,557 | **7,557** | 0 |
| `h_inventory_lots.material_id` | 519 | 512 | — |
| `h_inventory.material_id` | 100 | 99 | — |
| `h_inventory_transactions.material_id` | 8,455 | 8,320 | **135 (혼용)** |

### 1-2. BOM 은 전부 `item_master` id 를 쓴다

| 참조 컬럼 | 행수 | `item_master` 에 존재 | `h_products_v2` / `h_materials` 에 존재 |
|---|---:|---:|---:|
| `h_mf_reports.product_id` | 97 | **97** | 89 (8건은 id 가 달라 "고아" 로 오인됨) |
| `h_mf_ingredients.material_id` | 1,182 | **1,182** | 0 |
| `product_skus.item_id` | 169 | **169** | — |

### 1-3. 두 세계를 잇는 다리는 깨끗하다

| 다리 | 결과 |
|---|---|
| `item_master.legacy_product_id → h_products_v2` | 108 / 110 연결, dangling 0. 미연결 2건: 혼합약식(316), 찹쌀떡(318) |
| `item_master.legacy_material_id → h_materials` | 106 / 135 연결, dangling 0. 미연결 29건은 배치 투입 0건 (미사용 자재 + MERGED 잔재) |
| `h_mf_reports → item_master → legacy → h_products_v2` | **97 / 97** |
| `h_mf_ingredients → item_master → legacy → h_materials` | **1,182 / 1,182** |
| `h_batches → legacy_product_id 역방향` | **885 / 885** |

### 1-4. 테넌트 격리는 깨지지 않았다

batch↔product, batch_inputs↔batch, batch_inputs↔material, inv_tx↔lot, mf_reports↔item_master 전부 테넌트 불일치 **0**.
유일한 예외: `product_skus` 184~187 (테넌트 1 = 골든터틀 자체 계정) 이 테넌트 2 품목 265/266 을 가리킴. 고객 간 유출은 아니나 정정 대상.

### 1-5. id 공간이 겹치기 직전이다

`h_materials.id` 317~716, `item_master.id` 1~327. 겹치는 id 1건. **지금 사고가 없는 건 우연**이다.
`aiProductionParser.router.ts` 와 `scripts/check-table-drift.ts` 는 `item_master.id = h_products_v2.id` 를 전제한다 (818/885 가 우연히 같아서 드러나지 않았을 뿐).

## 2. 결정

### 2-1. 두 층위 모델 (07 과 09 를 동시에 만족)

```
item_master (정체성: "이 품목은 무엇인가")          ← BOM, SKU, 카탈로그, 화면 검색
   │ legacy_product_id            │ legacy_material_id
   ▼                               ▼
h_products_v2 (제품 상세)        h_materials (원재료 상세)   ← 배치, 투입, LOT, 재고, 원장 (수량 세계)
```

1. **정체성 정본 = `item_master`.** 품목의 존재·유형·코드·이름은 여기서 결정된다 (07 유지).
2. **수량 세계의 물리 키 = 상세 테이블 id.** `h_batches.product_id` 는 `h_products_v2.id`, `h_batch_inputs / h_inventory* .material_id` 는 `h_materials.id` (09 유지). 7,557 + 885 + 10,856 행이 이미 그렇다.
3. **BOM 은 정체성 세계에 둔다.** `h_mf_reports.product_id` 와 `h_mf_ingredients.material_id` 는 `item_master.id` 가 **맞는 값**이다. 8건·10개 "고아" 는 고아가 아니다.
4. **두 세계 사이 변환은 서비스 한 곳만 한다.** `ItemIdentityService` (품목 정체성 서비스) 가 `toProductionProductId`, `toInventoryMaterialId`, `toItemMasterId`, `getBom` 을 제공한다. 숫자 id 만 들고 여러 테이블에 JOIN 하는 코드는 금지. 현재의 `materialIdResolver` / `bomProductResolver` 는 이 서비스의 전신이며 그 안으로 흡수된다.
5. **2026-10-11 제안은 철회.** `h_products_v2 / h_materials` 를 정체성 정본으로 올리면 BOM 1,279행을 역변환해야 하고, 그럴 이유가 없다.

### 2-2. 금지

- `h_mf_reports.product_id` 를 `h_products_v2.id` 로 UPDATE 하지 않는다 (정상 데이터 8건이 고아가 된다).
- `item_master.id = h_products_v2.id` / `= h_materials.id` 를 전제하는 코드·스크립트를 새로 쓰지 않는다. 기존 2곳(`aiProductionParser`, `check-table-drift`)은 `legacy_*_id` 기준으로 고친다.
- v1·백업 테이블을 "이름이 v1 이라서" 지우지 않는다. 호출자 0 + 보존 확인 + 백업 후에만.
- 재고 집계를 LOT 합계로 **전수 자동 재계산하지 않는다** (§4 참고).

## 3. 순서 (앞 단계가 끝나야 뒤가 가능)

| 순서 | 작업 | 근거 (실측) | 주체 | 산출물 |
|---|---|---|---|---|
| 0 | 정본 정책 1개로 통일 — 이 문서. 07·09 에 배너, CLAUDE.md 포인터 | 정책 3개 공존 | Claude + CEO 승인 | 이 PR |
| 1 | 재고 불일치 **분류** (자동 보정 금지) | 100 자재 중 40 불일치 (available LOT 합 기준) / 47 (전체 LOT 합) | Genspark (SELECT) | 분류표 |
| 2 | 고아 격리 — 삭제 아님, 격리 테이블 이동 | batch_inputs 59 (2026-02-28 한 번의 실패 작업, 전부 미차감) · production_sku_output 97 · lots 7 · lots.inventory_id 166 (164건은 완제품 LOT, 구조 원인) | Genspark | 격리 로그 |
| 3 | `h_inventory_transactions.material_id` 혼용 135건 → `legacy_material_id` 로 `h_materials.id` 변환 | 2026-04-20~05-08 AUTO_ISSUE 128 + receipt 7. 다리 dangling 0 | Genspark (앱 로직/스크립트) | 변환 로그 |
| 4 | 업무 FK 13개 추가 — `scripts/migrations-manual/2026-10-12-step4-business-fks.sql` (사전검사 → ALTER 13 → 검증 → 롤백). 마스터·원장은 RESTRICT, 순수 자식은 CASCADE | 1~3단계 완료 보고 2026-10-12 11:40. 현재 업무 FK 28개 / 350 | Claude PR → Genspark 실행 | **PR 올림** |
| 5 | `ItemIdentityService` + 재고 쓰기 28곳 → 관문 1곳. `check-table-drift` / `aiProductionParser` 교정 | 이주대장 29건 대기 | Claude PR | 코드 |
| 6 | 빈·백업 테이블 정리 + Drizzle = DB — `12-schema-baseline-step6.md` 분류 확정 (A 백업 28 / B 빈·미참조 14 DROP, D·E 78 스키마 추가, F·G 36 생성/제거). 실행은 FK 일주일 관찰 후 | 스키마 358 vs DB 444 | Claude + Genspark | **분류 PR 올림**, 6-a SQL 준비 |
| 7 | 역할별 업무 화면 — `13-role-workflow-screens-step7.md` 설계 초안 (첫 화면·오늘의 생산·허브 8개·측정·7-a~7-e 롤아웃). 코드는 CEO 검토 후 | 메뉴 정의 117 (업종 복제 48, 중복 등록 9) | Claude PR | **설계 PR 올림** |

각 단계 통과 조건 (고정): 테넌트 미혼합 · LOT/생산 이력 유지 · 입출고 수량 일치 · 회계 분개 무차이 · HACCP 기록/승인 이력 보존.

## 3-1. 번호 종류를 코드에서 구분 (2026-10-20, 번호 체계 2단계 — 적용됨)

- 이름표 타입 `shared/identity/itemIds.ts`: `ItemMasterId` · `ProductionProductId` · `InventoryMaterialId`.
  실행 때는 그냥 숫자, 컴파일 때 종류가 다르면 막힌다. `as…()` 는 "이 숫자를 그 표에서 읽었다" 가 분명한 경계에서만 붙인다.
- `ItemIdentityService` 의 변환 함수는 이 타입을 받는다 (`selectBomVersion(ProductionProductId)`, `toProductionProductId(ItemMasterId)`,
  `inventoryMaterialIdOfItem(ItemMasterId)` 등). 잘못 넘기면 빌드 실패 — `server/lib/identity/itemIdKinds.typecheck.ts` 가 지킨다.
- **숫자 우연 일치·이름 매칭 경로 제거**: 생산 제품 → BOM 은 `legacy_product_id` FK 만(직접 일치·역방향 흡수 없음),
  보고서 → 생산 제품 SQL(`bomProductV2IdExpr`)도 FK 만, 원료 정체성 ↔ 재고는 `legacy_material_id` FK 만(이름 매칭 없음),
  BOM → 투입 재생성(`batchHydrator`)도 FK 만(연결 없으면 멈춤). 운영 사본 점검: 이 경로로만 이어지던 것은 연결 빠진 시험 품목뿐.
- **2b (적용 — 입고·조정·실사·차감 제외·포장 단위·LOT 조회·발주)**: API 가 원료 번호의 종류를 밝혀 받는다.
  - 입력 계약 `MaterialRef` = `{ itemMasterId }`(품목 선택창) 또는 `{ inventoryMaterialId }`(재고·LOT·실사 목록) 중 하나 → `inventoryMaterialIdOfRef`
    (품목 번호는 FK 만, 재고 번호는 이 회사 존재 확인만). 연결 없음·다른 회사·둘 다/없음은 **쓰기 전에** 거부.
  - 품목 목록(`material.list`)은 FK 로 연결된 `inventoryMaterialId` 를 함께 준다 — 화면은 LOT·재고 목록과 이 값으로만 맞춘다 (품목 번호와 직접 비교 금지).
  - 종류 표시가 없는 **저장 칸**(`purchase_order_lines.material_id`, `accounting_purchases.material_id` — 옛 줄 재고 번호/새 줄 품목 번호가 섞임)은
    `inventoryMaterialIdOfStoredMixed`: 품목 해석과 재고 해석이 같은 원료일 때만 쓰고, 다르면 모호로 거부. 옛 값은 고치지 않는다.
    새로 쓸 때는 `storableMaterialNumberOfItem` 이 다시 읽어도 같은 원료로 읽히는 숫자를 고른다 (품목 번호, 겹치면 FK 재고 번호, 둘 다 모호하면 거부).
  - 발주 반복 추천: 이력마다 위 규칙으로 품목 정체성을 정하고 키 = 정체성 + 구매 단위 (단위 환산해 합치지 않음), 단가는 건수 가중 평균, 모호한 이력은 '연결 안 됨' 으로 따로.
  - 남은 것: `toInventoryMaterialId(any…)` 는 생산 경로(투입 계획·자동 출고·시작 검사)에 남아 있다 — 다음 단계.
    다른 화면(재고 추이·발주 제안 이력·원가 절감·단가 이력·매입 수정 전표·중간재 구성)도 품목 번호를 재고 칸에 보낸다 — 다음 단계.
  - 섞인 저장 칸에 종류 표시 칸을 더하거나 값을 정리하는 일, 3단계(새 정체성 번호 범위 분리)·4단계(DB 제약)는 운영 DB 변경 — 승인 후.

## 4. 1단계 분류 기준 — 왜 "전면 재계산" 이 안 되는가

실측 40건 중:

| 유형 | 건수 | 예 | 처리 |
|---|---:|---|---|
| LOT 가 아예 없음 | 1 | 670 찰옥수수전분 [MERGED→664] 집계 1,508.9 / LOT 0 | 병합 잔재. 664 로 흡수 후 0 |
| 집계 > LOT 합 | 26 | 614 마카다미아 36.6 / 9.4, 618 밤다이스 137.3 / 107.3 | 기초재고 미이관·수기조정 의심. 실사값으로 |
| 집계 < LOT 합 | 14 | 679 고운콩앙금 1,500 / 3,700, 664 찰옥수수전분 1,887 / 2,355 | LOT 입고가 집계에 반영 안 됨. LOT 쪽이 맞을 가능성 |

`recomputeAggregateFromLots` 를 전수 실행하면 첫 유형은 0 이 되고 둘째 유형은 집계가 줄어든다. 어느 쪽이 맞는지는 실사 없이는 모른다. **분류 → 실사 → 유형별 처리** 순서를 지킨다.

음수 LOT · 음수 집계는 덤프 시점 0건 (PR #447 배포 전).

## 5. 함께 드러난 운영 부채 (이 정책과 별개로 처리)

| 항목 | 실측 | 처리 |
|---|---:|---|
| 완료 배치의 미차감 투입 (`inventory_deducted=0`) | **770** (2026-04~10, 월 15~266) | PR #447 이후 신규 0. 기존분은 실사 조정에서 흡수 |
| AUTO_ISSUE `reference_id` NULL | **2,873 / 5,318** (2026-04~09) | PR #443 이후 신규 0. 기존분 사후 매핑 (10/6~7 119건과 같은 방식) |
| `lot_id` NULL usage | 806 | 음수 허용 모드 이전의 "재고 부족 fallback". 보존, 참고용 |
| `product_skus` 테넌트 불일치 | 4 | 테넌트 1 테스트 데이터. 삭제 또는 테넌트 2 로 정정 |
| ZIP 에 `.env` + 백업 포함 | — | 자격증명 교체 (CLAUDE.md 보안 사후 작업과 동일) |

## 6. 재실행

`scripts/diag/identity-namespace-diag.sql` — 전부 SELECT. Genspark 가 운영 DB 에서 그대로 실행해 이 문서의 숫자를 갱신한다. 숫자가 바뀌면 이 문서의 §1 을 갱신하고 날짜를 적는다.

## 7. 문서 관계

- `07-canonical-tables.md` — 정체성 정본 = item_master. **유지**. 단 "h_products_v2 / h_materials 는 폐기 대상" 은 "상세 테이블로 존속" 으로 정정 (배너).
- `08-inventory-identity-diagnosis.md` — 병① 식별자 파편화, 병② 3자 불변식. 진단은 그대로 유효.
- `09-inventory-chokepoint-migration.md` — 원장 `material_id = h_materials.id`. **유지**. 이 문서 §2-1 2항과 같은 말.
- `10-finished-goods-identity-diagnosis.md` — 완제품 SKU·LOT 단위. 2단계(lots.inventory_id 166) 와 연결.
- `CLAUDE.md` — 아키텍처 규칙 섹션에서 이 문서를 가리킨다. 모든 AI 세션은 품목 id 를 다루기 전에 이 문서를 읽는다.
