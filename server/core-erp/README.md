# core-erp/ — ERP 핵심 레이어

> 매입/매출/재고/회계/원가 — **업종 무관한** ERP 공통 로직.

## 속하는 것

| 하위 도메인 | 책임 |
|---|---|
| `purchase/` | 매입 전표, 매입 반품, 매입 확정/취소 |
| `sales/` | 매출 전표, 견적, 매출 확정/취소 |
| `inventory/` | 재고 수불, LOT 할당, 재고 알림 |
| `accounting/` | 분개 / 원장 / 시산표 / 재무제표 / 마감 |
| `costing/` | 표준원가 / 실제원가 / 원가 배부 |
| `partner/` | 거래처 마스터, 신용관리 |
| `warehouse/` | 창고 마스터 |

## 속하지 않는 것 (절대 금지)

- ❌ 업종 특화 (HACCP, 화장품 GMP, 의류 SKU 색상/사이즈 등) → `industry/` 로
- ❌ `industry/` 또는 `addon/` import (ADR-002)
- ❌ `core-mes` import — 대신 `shared-kernel` 통해 공유
- ❌ `if (tenant.industry === 'food') { ... }` 분기

## 의존 규칙

```
core-erp → shared-kernel → platform
```

- `core-erp` 와 `core-mes` 는 **동등**. 서로 직접 import 금지. 공유할 게 있으면 `shared-kernel` 로.

## 이벤트 발행 책임

| 이벤트 | 시점 |
|---|---|
| `purchase.posted` | 매입 확정 시 |
| `sales.posted` | 매출 확정 시 (재고 차감 + 분개) |
| `inventory.adjusted` | 재고 조정 시 |
| `accounting.posted` | 분개 확정 시 |
| `accounting.period-closed` | 마감 시 |

→ `03-event-catalog.md` 의 core-erp 섹션 참조.

## 이주 소스 (기존 → 여기로)

| 기존 위치 | 이주 대상 |
|---|---|
| `server/routers/accounting/` | `core-erp/accounting/` |
| `server/routers/haccp/haccpIntegration.router.ts` (매입/매출 부분) | `core-erp/purchase/`, `core-erp/sales/` |
| `server/routers/inventory/` | `core-erp/inventory/` |
| `server/routers/master/partner*` | `core-erp/partner/` |
| `server/db/journalHelper.ts` | `core-erp/accounting/journal/` |
| `server/lib/purchasePost.ts` | `core-erp/purchase/post/` |

## 참고

- `docs/architecture/00-layers.md`
- `docs/architecture/ADR-002-no-core-to-industry.md`
- `docs/architecture/03-event-catalog.md`
