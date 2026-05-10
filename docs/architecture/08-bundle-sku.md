# 08. SKU 번들 (혼합 제품) — Bundle / Kit / Assortment

> **2026-05-09 신설** — 다중 생산 SKU 를 1개 출고 SKU 로 묶는 패턴.

---

## 배경

### 사용 사례

같은 품목제조보고서를 따로 생산하지만 1개 SKU 로 출고해야 하는 경우:

```
[생산 단계]                              [출고 단계]

배치 A: 카스테라쑥앙금인절미 (33.3%)  ─┐
배치 B: 흑임자인절미 (33.3%)           ─┼→ SKU "혼합 인절미 세트"
배치 C: 콩고물인절미 (33.4%)           ─┘

각 배치는 자체:                           1 SKU 단일 라인:
- BOM (h_mf_ingredients)                 - 출고 → 부분 자동 분해
- CCP 기록                                - 매출 / 재고 / 판매
- 생산일지 (식약처 요건)
```

### 왜 별도 레이어가 필요한가

**HACCP/식약처 요건 분리**:
- 각 child 제품은 독립적인 BOM/CCP/생산일지를 유지해야 함
- 합쳐서 단일 BOM 으로 만들면 라벨 표시·원산지·알레르겐 추적 불가
- 회수 시뮬레이션 시 child LOT 단위로 추적해야 함

**판매/유통 단순화**:
- 영업/거래처는 "혼합 인절미" 라는 1 SKU 만 선택
- 가격/재고/매출이 단일 라인으로 관리됨
- 시스템 내부에서만 자동 분해 ↔ 합산

---

## 정책

### 비율 정책 — 고정 (확정 2026-05-09)

| 옵션 | 채택 | 사유 |
|---|---|---|
| **(A) 고정 비율** | ✅ | 라벨/원산지/알레르겐 일관성 — HACCP 표준 |
| (B) 가변 비율 | ❌ | 단가/원가 계산 복잡, 라벨 변경 위험 |

→ `sku_bundles.default_ratio` 가 매 출고마다 동일하게 적용됨.

### 자기 참조 / 다단 번들 금지 (Phase 1)

- parent SKU == child SKU 자체 참조 금지
- 번들의 child 가 또 번들인 다단 구조 금지 (Phase 2 검토)

### 합계 100% 검증

- `setBundleComposition` 시 child 비율 합계가 100.00 ± 0.01 이어야 저장 가능
- 정수 단위 입력 시 33.33 + 33.33 + 33.34 처럼 보정 필요

---

## 스키마

### 1. `sku_bundles`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | BIGINT PK | |
| tenant_id | INT | 테넌트 격리 |
| parent_sku_id | BIGINT | 출고용 SKU (`product_skus.id`) |
| child_sku_id | BIGINT | 생산용 child SKU (`product_skus.id`) |
| default_ratio | DECIMAL(5,2) | 표준 비율 (%) — 합계 100 |
| sort_order | INT | UI 표시 순서 |
| created_at, updated_at | TIMESTAMP | |

**제약**:
- UNIQUE `(tenant_id, parent_sku_id, child_sku_id)` — 중복 페어 금지
- INDEX `(parent_sku_id)`, `(child_sku_id)` — 양방향 룩업

### 2. `production_sku_output.bundle_sku_id`

- 신규 컬럼 (NULL 허용)
- 의미: 이 child SKU 의 생산이 어떤 parent 번들로 합쳐지는지
- NULL = 단일 SKU (기본)
- NOT NULL = 번들 child 로 분류 — inventory/sales 시 parent 라인 표시

자동 매칭 시점 (다음 PR — #281):
- batch 완료 → `production_sku_output` INSERT 시점
- `sku_bundles.parent_sku_id WHERE child_sku_id = NEW.sku_id` 룩업
- 매칭되면 `bundle_sku_id` 자동 채움

---

## 운영 흐름

### Phase 1 (PR #280) — 스키마 + CRUD

- ✅ `sku_bundles` 테이블 + `bundle_sku_id` 컬럼
- ✅ 마이그레이션 스크립트 (idempotent)
- ✅ tRPC 라우터: `skuBundle.{listByParent, setBundleComposition, removeBundle, parentsByChild}`
- ⏳ UI: 품목 마스터 → SKU 행에 "번들 구성" 버튼

### Phase 2 (PR #281 예정) — 배치 일괄 생성 + 자동 매칭

- 배치 생성 화면에 "번들 일괄 생성" 옵션
  - parent SKU 선택 → 생산량 입력 → child 비율대로 N 배치 자동 생성
  - 같은 `day_batch_group` 으로 묶음 (생산일지 1 페이지 출력)
- `production_sku_output` INSERT 시 자동 `bundle_sku_id` 매칭

### Phase 3 (PR #282 예정) — 재고/출고 자동 분해

- 재고 화면: parent SKU 라인 + child SKU 라인 동시 표시
  - parent 재고 = MIN(child 재고 × ratio 의 역수) — 가능한 번들 수
- 출고 시: parent 1개 출고 → child 비율대로 FEFO LOT 자동 차감
- 매출/세금계산서: parent SKU 라인으로 통일

### Phase 4 (PR #283 예정) — LOT/회수 추적

- LOT 마스터에 `bundle_lot_id` 추가 (parent LOT ↔ child LOT N:1)
- 회수 시뮬레이션: parent LOT 회수 → 모든 child LOT 자동 매핑

---

## 영향 받는 도메인

| 도메인 | Phase 1 | Phase 2~4 |
|---|---|---|
| 품목 마스터 (UI) | "번들 구성" 버튼 | 변경 없음 |
| 배치 생성 | 변경 없음 | "일괄 생성" 옵션 |
| 생산 일지 / CCP | **변경 없음** (각 child 자체 유지) | 변경 없음 |
| 재고 | 변경 없음 | parent + child 라인 동시 표시 |
| 출고 / 매출 | 변경 없음 | parent 단일 라인 + 자동 분해 |
| LOT 추적 / 회수 | 변경 없음 | parent ↔ child LOT 매핑 |

---

## 의문 (Phase 2+ 결정)

### Q1. parent SKU 의 LOT 번호 어떻게 부여?
- 옵션 a: 별도 LOT 번호 (혼합 시점에 신규 채번)
- 옵션 b: child LOT 들의 합집합 (예: `BLEND-{date}-{seq}` + child LOT 리스트)

### Q2. parent 재고 차감 시 child 재고가 부족하면?
- 옵션 a: 가장 부족한 child 기준으로 가능 수량 자동 제한 (FEFO)
- 옵션 b: 부족 알림 + 출고 차단

### Q3. child 단독 출고 가능?
- 옵션 a: 가능 — child 도 일반 SKU 처럼 출고 가능 (현재 동작)
- 옵션 b: 번들에 묶인 child 는 단독 출고 차단 (보수적)

→ Phase 2 시작 시 결정.

---

## 관련

- ADR-001 shared-kernel — SKU 가 shared-kernel 의 핵심 엔티티
- `drizzle/schema/skuBundles.ts` — 스키마 정의
- `server/routers/master/skuBundle.router.ts` — tRPC 라우터
- `scripts/migrate-sku-bundles.ts` — 마이그레이션
- PR #280 — Phase 1 (스키마 + 라우터 + 문서)
