# ADR-002: core 에서 industry 역참조 금지

- **일자**: 2026-04-21
- **상태**: Accepted

---

## 배경

현재 Millio AI 는 식품 HACCP 에 특화된 상태로 출발했음. 그 결과:

- `h_batches` 테이블에 `ccp_status` 컬럼 존재 (식품 전용 개념)
- `accounting_purchases.product_category` 가 식품 카테고리 가정
- `server/db/haccp/haccpIntegration.ts` 가 매입/매출 처리를 겸함 (업종 무관한데 `haccp/` 폴더에 있음)

향후 화장품 / 건기식 / 전기전자 업종 Pack 을 추가하면:
- 동일한 `h_batches` 에 `cosmetic_batch_no`, `electronics_serial` 컬럼 덕지덕지 추가될 위험
- 또는 `if (industry === 'food')` 분기가 core 코드 전반에 번져감

둘 다 **100만 줄에서 반드시 망함**.

---

## 결정

**core 레이어는 어떤 경우에도 industry 레이어를 참조할 수 없다.**

의존 방향:
```
addon → industry → core-mes ↔ core-erp → shared-kernel → platform
                                                      (shared-kernel 은 어느 것도 import 안 함)
```

### 구체적 금지 사항

1. **코드 import 금지**
   ```typescript
   // core-mes/production/ 안에서
   import { CcpPoint } from '../../industry/food/ccp';  // ❌
   ```

2. **DB 컬럼 오염 금지**
   ```sql
   -- core 테이블에 업종 전용 컬럼 추가 금지
   ALTER TABLE mes_production_results ADD COLUMN food_ccp_value DECIMAL(10,2);  -- ❌
   ALTER TABLE erp_inventory_lots ADD COLUMN cosmetic_formula_code VARCHAR(50); -- ❌
   ```

3. **분기 로직 금지**
   ```typescript
   // core-erp 안에서
   if (tenant.industry === 'food') { ... special food logic ... }  // ❌
   ```

### 허용되는 연결 방식

**A. 참조 테이블 (industry → core)**:
```sql
-- industry/food 소유
CREATE TABLE food_ccp_logs (
  id BIGINT PK,
  tenant_id INT,
  work_order_id BIGINT,  -- FK → mes_work_orders.id (core 참조 OK)
  ccp_point_code VARCHAR(50),
  measured_value DECIMAL(10,2),
  ...
);
```
→ `industry` 가 `core` 를 참조. 허용.

**B. 이벤트 구독 (industry 가 core 이벤트 받음)**:
```typescript
// server/industry/food/food-haccp.subscriber.ts
eventBus.subscribe('workorder.completed', async (event) => {
  // 업종별 사후 처리
  await createCcpLogIfFoodTenant(event);
});
```
→ core 는 이벤트만 발행. industry 가 구독. 허용.

**C. Extension Point (core 가 hook 정의)**:
```typescript
// core-mes/production/production.service.ts
export interface ProductionExtension {
  onBeforeComplete?(workOrderId: number, tenantId: number): Promise<void>;
}
// 구현은 industry 에서 register
```
→ core 는 interface 만 안다. industry 는 자신을 등록. 허용.

---

## 기존 코드 이주

### 현재 위반 사례

| 파일 | 위반 | 이주 |
|---|---|---|
| `server/routers/haccp/haccpIntegration.router.ts` | 매입/매출 (업종 무관) 인데 `haccp/` 폴더에 있음 | → `server/core-erp/purchase/`, `server/core-erp/sales/` |
| `drizzle/schema/hBatches.ts` 의 `ccpStatus` | 생산 공통에 식품 컬럼 | → `food_batch_ccp_status` 로 분리 |
| `server/db/haccp/haccpIntegration.ts` | 파일명은 HACCP 이지만 내용은 ERP | → 파일명 변경 또는 분해 |

### 이주 전략

**Strangler Fig**:
1. 새 구조로 신규 파일 작성
2. 기존 파일은 `@deprecated` 주석
3. 신규 요구사항 들어올 때만 기존 파일 건드림 (그때 이주)
4. 3-6 개월 내 점진 교체

**Big Bang Rewrite 금지**.

---

## 대가

### 장점
- 업종 추가가 **core 건드리지 않고** 가능
- 업종 Pack 독립 배포 / 독립 과금 가능
- core 테스트가 industry 독립적으로 돌아감

### 단점
- 초기 작성 시 "core 에 임시로 넣으면 빨리 끝날 텐데" 유혹 있음
- industry 가 core 이벤트를 구독하려면 이벤트 시스템 먼저 구축 필요

### 리스크 완화
- `dependency-cruiser` 로 CI 차단 (01-dependency-rules.md)
- PR 리뷰에서 "core → industry 의존 생기는가?" 체크리스트 필수
- industry 확장점이 필요한 경우 core 에 **interface / event 만** 추가 (구현은 industry 에서)

---

## 관련 문서

- `00-layers.md`
- `01-dependency-rules.md`
- `03-event-catalog.md` — industry 가 core 이벤트 구독하는 방식
