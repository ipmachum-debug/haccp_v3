# industry/ — 업종 특화 레이어

> 식품 HACCP / 화장품 GMP / 전기전자 시리얼 등 **업종 고유 개념**.

## 속하는 것

| 하위 도메인 | 업종 | 대표 개념 |
|---|---|---|
| `food/` | 식품 | HACCP, CCP, 온도 기록, 기준서, 리콜 |
| `cosmetic/` | 화장품 | GMP, 배치 기록서, 처방 |
| `health/` | 건기식 | 기능성 원료, 함량 검증 |
| `electronics/` | 전기전자 | 시리얼 번호, 부품 ESD |
| `apparel/` | 의류 | 색상/사이즈 SKU 매트릭스 |
| `general-manufacturing/` | 일반 제조 | 기타 (core 만으로 충분한 업종) |

## 핵심 원칙 (ADR-002)

1. **core → industry 참조 금지** — core 가 `if (industry === 'food')` 하면 안 됨
2. **DB 격리** — 업종 테이블은 `food_*`, `cosmetic_*` prefix. core 테이블에 업종 컬럼 추가 금지
3. **연결은 이벤트 또는 FK** — industry 가 core 이벤트를 구독하거나, industry 테이블이 core 테이블을 FK 로 참조

## 허용되는 연결 방식

### A. 참조 테이블 (industry → core)
```sql
-- industry/food 소유
CREATE TABLE food_ccp_logs (
  id BIGINT PK,
  tenant_id INT,
  work_order_id BIGINT,  -- FK → mes_work_orders.id (core 참조 OK)
  ccp_point_code VARCHAR(50),
  ...
);
```

### B. 이벤트 구독 (industry 가 core 이벤트 받음)
```typescript
// server/industry/food/food-haccp.subscriber.ts
eventBus.subscribe('workorder.completed', async (event) => {
  await createCcpLogIfFoodTenant(event);
});
```

### C. Extension Point (core 가 interface, industry 가 구현)
```typescript
// core-mes/production/ 에 interface 만 정의
// industry/food/ 에서 구현체 register
```

## 절대 금지

- ❌ `industry/food` 에서 `industry/cosmetic` import (업종 간 수평 금지)
- ❌ `industry/*` 에서 `addon/*` import
- ❌ core 레이어가 `industry/*` 를 import (ADR-002)

## 의존 규칙

```
industry → core-erp, core-mes → shared-kernel → platform
```

## 이주 소스 (기존 → 여기로)

| 기존 위치 | 이주 대상 |
|---|---|
| `server/routers/haccp/ccp*` | `industry/food/ccp/` |
| `server/routers/haccp/checklist*` | `industry/food/checklist/` |
| `server/routers/haccp/standards*` | `industry/food/standards/` |
| `drizzle/schema/hBatches.ts` 의 `ccpStatus` | `industry/food/` 의 `food_batch_ccp_status` 로 분리 |

## 참고

- `docs/architecture/ADR-002-no-core-to-industry.md`
- `docs/architecture/00-layers.md`
