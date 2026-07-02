# 10 — 완제품(제품) 재고 정합 진단 (병③ 완제품 다중정본·단위분열)

> "생산후 제품재고 증가 불일치" 의 근본 원인. `08`(원재료 식별자·불변식), `09`(관문) 후속.
> 최초: 2026-07-02. 성격: 진단 + 방향 결정 문서.

## 한 줄 요약

**완제품 재고에는 "정본이 없다."** 서로 다른 4곳이 제품 현재고를 **각자 다른 소스·다른 단위**로
계산하고, 그것들을 하나로 맞추는 장치가 없다. 그래서 화면마다 숫자가 다르고 "자꾸 어긋난다".

## 도메인 모델 (사용자 확인)

실생산은 **SKU 단위로 실적 입력**(`production_sku_output.quantity` = 판매단위 개수, 예: box).
SKU 는 품목마스터(`item_master`)에 등록, 각 SKU 가 자기 단위를 가짐:
- `product_skus.sales_unit` (예: `box`, `kg`)
- `product_skus.kg_per_sales_unit` (환산계수, 예: 60g×30ea = 1.8kg/box)
- 연결: `product_skus.item_id → item_master.id`, `item_master.legacy_product_id → h_products_v2.id`

→ **완제품 재고의 운영 정본 단위 = SKU 판매단위.** kg 은 `kg_per_sales_unit` 로 환산되는 파생값.

## 병③ — 네 개의 "현재고" 정의가 공존 (전부 다름)

| # | 화면/용도 | 소스 | 단위 | 파일 |
|---|-----------|------|------|------|
| A | 제품별 재고 현황(메인) | Σ(완료배치 actual_quantity) − Σ(제품출고 quantity), **클라 계산** | **kg** | `client/.../inventory/ProductStockView.tsx:54-124,98,162` |
| B | 제품 출고/실사·진단 | `h_inventory_lots`(product_id/sku_id) `available_quantity` | **판매단위(box)** | `inventory.router.ts:798-891,1700`, `inventoryDiagnostics.ts:158` |
| C | (고아) 제품 집계 | `h_inventory(product_id).total_quantity` | **kg** | `batchLifecycle.ts:528-551` |
| D | 실사 스냅샷 합계 | Σ `available_quantity`(SKU LOT, **단위 혼합 그대로 합산**) | **혼합(버그)** | `inventory.router.ts:832-834` |

- **A ≠ B**: A 는 배치 kg, B 는 SKU LOT box. 단위부터 다름 → 항상 불일치.
- **C 는 고아**: `h_inventory(product_id)` 는 배치완료 때 **증가만** 하고 **어떤 판매/출고도 차감 안 함**,
  게다가 **아무 화면도 읽지 않음**. 즉 단조증가하는 죽은 카운터.
- **D 는 단위버그**: 한 제품의 여러 SKU LOT(box/pack/kg)를 그대로 SUM → 무의미한 숫자.

### 파생 단위버그 2건 (정합 시 반드시 동반 수정)
1. **실사 스냅샷 혼합합산** — `inventory.router.ts:832-834`: SKU LOT 을 `kg_per_sales_unit` 환산 없이 합산.
2. **번들 분해 단위 불일치** — `decomposeBundleOutbound.ts:167-194` 는 자식 SKU LOT 을 **kg** 로 차감하는데,
   `completeBatch:607-620` 는 같은 SKU LOT 을 **box(sales_unit)** 로 채운다 → 차감이 재고를 오염.

## 왜 재발했나 (제품측)

원재료측 병②(3자 불변식 미강제)와 **다른 병**이다. 제품측은:
- LOT 은 SKU(box) 로 쌓고, 집계는 kg 로 쌓고, 화면은 배치−출고(kg)로 또 따로 계산 → **정본 불일치**.
- 판매/출고가 집계를 안 건드림 → 집계와 실물이 시간이 갈수록 벌어짐.
- 네 숫자를 reconcile 하는 검증이 없음.

## 방향 결정 (권장)

**SKU LOT(`h_inventory_lots`, sku_id 별)을 완제품 재고의 단일 정본으로 채택.** 이미 모든 운영
경로(출고/판매/실사/진단)가 이걸 읽고 차감한다. 나머지는 여기에 맞춘다:

1. **고아 kg 카운터 은퇴** — `h_inventory(product_id)` 증분 유지 중단.
   kg 롤업이 필요하면 **파생 계산**: `Σ(sku_lot.available × kg_per_sales_unit)` (item_master.legacy_product_id 로 그룹).
   → 이 방향이면 P2b(#399, 최초생산 kg 행 INSERT)는 **죽은 행을 채우는 것**이라 **불필요/철회 대상**.
2. **메인 제품재고 화면(A) 을 정본(B)에서 읽게 통일** — 배치−출고 즉석계산 대신 SKU LOT.
   (사용자가 보는 숫자가 바뀌므로 승인 필요.)
3. **단위버그 2건 수정**(실사 혼합합산, 번들 kg/box).
4. **관문 확장** — 원재료 `recomputeAggregateFromLots` 의 **SKU 인식 버전** 도입(파생 kg 롤업/실사용),
   제품 출고·판매·번들을 관문 경유로 이주(09 대장에 편입).
5. **검증 루프** — `diagnose_finished_goods_integrity.sql` 주기 실행으로 A/B/C 괴리 상시 감시.

## 실측 결과 (2026-07-02, tenant2 — Genspark 실행)

| 지표 | 값 | 판독 |
|------|-----|------|
| Q5 C(제품 kg 집계) 행 수 | **0** | 고아 카운터가 아예 비어 있음 → #399 는 **없던 죽은 카운터를 새로 채우기 시작**하는 것 → 철회 확정 |
| Q5 B'(ΣLOT × kg_per_sales_unit) | **52,337 kg** | 실제 완제품 재고(정본) |
| Q4 sku_id NULL 제품 LOT | **140건 / 47,957 kg (91.6%)** | ★ 대부분 LOT 이 **kg fallback**(SKU 미태그) — "SKU box 정본" 이 아니라 **kg 환산 정본**이 실체 |
| Q2 LOT 단위 드리프트 | **0** | LOT.unit = SKU.sales_unit (태그된 것들은 이미 정합) |
| Q3 제품내 혼합단위 | **6 제품** | 소규모 — 실사 raw 합산(D 버그) 노출면만 |
| Q1 A vs B' | **A ≫ B' (거의 전제품)** | 메인화면(A=배치−출고)이 **출고를 못 빼 과대계상** → 사용자가 겪은 "제품재고 증가 불일치" 실체 |

**스키마 정정(실측)**: `h_product_outbound` 에는 `sku_id` **컬럼이 없다**. 실제: `batch_id, lot_id,
product_name(string), quantity, unit, lot_number`. 출고→제품 매핑은 `product_name` 문자열이 유일 경로
(`lot_id` 도 대부분 NULL). 앱 ProductStockView 도 product_name 으로 출고를 뺀다 — 이 매칭이 새거나
틀리면 A 가 과대계상된다.

**모델 정정**: LOT 의 91.6% 가 sku_id NULL(kg) 이므로 정본은 "SKU box" 가 아니라
**`Σ(LOT.available × kg_per_sales_unit)` (kg 환산, NULL 은 ×1)** — kg fallback LOT 과 SKU box LOT 을
한 단위로 통합한다. 아래 방향의 "정본(B)" 은 이 **kg 환산 정본**을 뜻한다.

## 다음 스텝 (실측 반영)
- **1(카운터 은퇴/#399 철회), 3(단위버그), 5(검증루프)**: 안전·저위험 → 우선 착수 가능.
- **2(메인화면 A→B 통일)**: 사용자 노출 재고가 **과대 → 정확(하향)** 으로 바뀜 → **사용자 승인 필수**.
- **4(관문 SKU/kg-equiv 버전)**: #398(원재료 관문) 배포 후 착수 — `recomputeFinishedGoodsFromLots`
  = `Σ(available × kg_per_sales_unit)` 로 파생 롤업 제공 + 제품 출고/판매/번들 관문 경유.
