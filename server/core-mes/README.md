# core-mes/ — MES 핵심 레이어

> 생산/품질/LOT/설비 — **업종 무관한** 제조 공통 로직.

## 속하는 것

| 하위 도메인 | 책임 |
|---|---|
| `bom/` | BOM (제품 구성) 관리 |
| `routing/` | 공정/작업 순서 정의 |
| `workorder/` | 작업지시 생성/착수/완료 |
| `production/` | 생산 실적 기록 |
| `quality/` | 검사 요청/합격/불합격 |
| `lot/` | LOT 생성 / 할당 / 소진 / 추적 |
| `equipment/` | 설비 마스터, 설비 로그 |

## 속하지 않는 것 (절대 금지)

- ❌ 업종 특화 (식품 CCP, 화장품 배치 기록서 등) → `industry/` 로
- ❌ `h_batches` 에 `ccp_status` 같은 식품 전용 컬럼 (ADR-002)
- ❌ `industry/` 또는 `addon/` import
- ❌ `core-erp` import — 공유는 `shared-kernel` 경유

## 의존 규칙

```
core-mes → shared-kernel → platform
```

- `core-erp` 와는 **동등/독립**. 재고는 `core-erp` 가 소유, LOT 생성은 `core-mes` 가 소유. 연결은 **이벤트** 로.

## 이벤트 발행 책임

| 이벤트 | 시점 |
|---|---|
| `workorder.created` / `.started` / `.completed` / `.cancelled` | 작업지시 상태 전이 |
| `production.material-consumed` | 원료 투입 시 |
| `lot.created` / `.allocated` / `.consumed` / `.expired` | LOT 상태 전이 |
| `quality.inspection-requested` / `.passed` / `.failed` | 검사 상태 전이 |

## 이벤트 구독

- `inventory.*` 구독해서 원료 재고 체크 (→ 직접 재고 차감 금지, `core-erp` 가 소유)

## 이주 소스 (기존 → 여기로)

| 기존 위치 | 이주 대상 |
|---|---|
| `server/routers/haccp/` (CCP 제외, 생산/검사/LOT 부분) | `core-mes/production/`, `core-mes/quality/`, `core-mes/lot/` |
| `server/routers/production/` | `core-mes/production/` |
| `drizzle/schema/hBatches.ts` (`ccpStatus` 제외) | `core-mes/production/` 의 생산 배치 |
| `server/routers/equipmentRouter.ts` | `core-mes/equipment/` |

## 참고

- `docs/architecture/00-layers.md`
- `docs/architecture/ADR-002-no-core-to-industry.md`
- `docs/architecture/03-event-catalog.md`
