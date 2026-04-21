# server/ — 레이어 가이드

> 5계층 + shared-kernel 구조. 신규 파일 작성 전 `docs/architecture/` 반드시 확인.

## 레이어 구조

```
addon/         ← AI / HR 고급 / BI / IoT / 모바일 / 외부연동
  ↑
industry/      ← food / cosmetic / health / electronics / apparel / general
  ↑
core-mes/      ← BOM / Routing / WorkOrder / Production / Quality / LOT / Equipment
  ↑ (독립)
core-erp/      ← Purchase / Sales / Inventory / Accounting / Costing / Partner / Warehouse
  ↑
shared-kernel/ ← Item / UoM / LotId / PartnerRef / WarehouseRef / Currency / TenantRef
  ↑
platform/      ← Tenant / Auth / Permission / Billing / Audit / FeatureFlag / Notification / Workflow / EventBus
```

## 각 레이어 README

| 레이어 | 설명 |
|---|---|
| [`platform/`](./platform/README.md) | 인프라성 관심사 (업무 로직 없음) |
| [`shared-kernel/`](./shared-kernel/README.md) | core-erp / core-mes 가 공유하는 타입/상수 |
| [`core-erp/`](./core-erp/README.md) | 업종 무관 ERP (매입/매출/재고/회계/원가) |
| [`core-mes/`](./core-mes/README.md) | 업종 무관 MES (생산/품질/LOT/설비) |
| [`industry/`](./industry/README.md) | 업종 특화 (식품 HACCP, 화장품 GMP 등) |
| [`addon/`](./addon/README.md) | 선택적 애드온 (AI, BI, IoT 등) |

## 상태 (2026-04-21)

🚧 **뼈대만 존재**. 실제 코드는 아직 레거시 위치에 있으며 **Strangler Fig** 방식으로 점진 이주.

- 기존 코드: `server/routers/`, `server/db/`, `server/lib/` 등 (건드리지 말고 유지)
- 신규 파일: **반드시 이 새 구조로** 작성
- 이주: 기존 파일을 수정하게 될 때 함께 새 위치로 이동

## 기존 vs 신규 매핑 (요약)

| 기존 위치 | 신규 위치 |
|---|---|
| `routers/accounting/*` | `core-erp/accounting/` |
| `routers/haccp/haccpIntegration.*` (매입/매출) | `core-erp/purchase/`, `core-erp/sales/` |
| `routers/haccp/ccp*`, `checklist*` | `industry/food/` |
| `routers/inventory/*` | `core-erp/inventory/` |
| `routers/production/*` | `core-mes/production/` |
| `routers/auth*` | `platform/auth/` |
| `routers-ai.ts`, `db/rulesEngine.ts`, `db/aiContextLayer.ts` | `addon/ai/` |
| `routers/accounting/payroll*`, `hrManagement*` | `addon/hr-advanced/` |

각 레이어 README 의 "이주 소스" 섹션에 더 자세한 매핑 있음.

## 관련 문서

- `docs/architecture/README.md` — 아키텍처 문서 목차
- `docs/architecture/00-layers.md` — 계층 상세 정의
- `docs/architecture/01-dependency-rules.md` — 의존 방향 / 금지 규칙
- `docs/architecture/02-naming-conventions.md` — 테이블 / 파일 / 라우터 네이밍
- `docs/architecture/03-event-catalog.md` — 도메인 이벤트 목록
- `docs/architecture/04-policy-registry.md` — Feature / Capability / Package 정책
- `docs/architecture/ADR-001-shared-kernel.md` — Shared Kernel 도입 결정
- `docs/architecture/ADR-002-no-core-to-industry.md` — core → industry 금지 결정
