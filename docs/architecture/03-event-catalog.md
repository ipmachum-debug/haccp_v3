# 03. 표준 도메인 이벤트 카탈로그

> 100만 줄이 되어도 모듈 간 결합을 줄이려면 **직접 호출 대신 이벤트** 로 연결.

---

## 아키텍처

```
[도메인 쓰기 작업]
      ↓
  트랜잭션 내부에서 domain_events 테이블에 INSERT (outbox 패턴)
      ↓
  트랜잭션 커밋
      ↓
[Worker (setInterval 또는 큐)]
  - UNPROCESSED 이벤트 읽음
  - 구독자(handler)에게 전달
  - 성공 시 processed_at 기록
      ↓
[구독자]
  - 자신 도메인 테이블에 반영 (예: 재고 차감, 회계 분개)
```

**현재 상태**: 미구현. `server/platform/event-bus/` 로 신규 구축.

---

## domain_events 스키마 (초안)

```sql
CREATE TABLE domain_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  event_type VARCHAR(100) NOT NULL,     -- 'purchase.posted'
  aggregate_type VARCHAR(50) NOT NULL,  -- 'Purchase'
  aggregate_id BIGINT NOT NULL,
  payload JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INT,
  processed_at TIMESTAMP NULL,
  processing_attempts INT DEFAULT 0,
  last_error TEXT NULL,
  INDEX idx_unprocessed (processed_at, event_type),
  INDEX idx_tenant_aggregate (tenant_id, aggregate_type, aggregate_id)
);
```

---

## 표준 이벤트 목록

### core-erp / purchase

| 이벤트 | 트리거 | payload (주요) |
|---|---|---|
| `purchase.created` | 매입 전표 생성 | `{ purchaseId, partnerId, itemId, quantity, amount }` |
| `purchase.posted` | 매입 확정 | `{ purchaseId, lotId?, accountingJournalId }` |
| `purchase.cancelled` | 매입 취소 | `{ purchaseId, reason }` |
| `purchase.returned` | 매입 반품 | `{ originalPurchaseId, returnQuantity, returnAmount }` |

### core-erp / sales

| 이벤트 | 트리거 | payload |
|---|---|---|
| `sales.created` | 매출 생성 | `{ saleId, partnerId, itemId, quantity, amount }` |
| `sales.posted` | 매출 확정 (재고 차감 + 분개) | `{ saleId, lotAllocations, accountingJournalId }` |
| `sales.cancelled` | 매출 취소 | `{ saleId, reason }` |

### core-erp / inventory

| 이벤트 | 트리거 | payload |
|---|---|---|
| `inventory.adjusted` | 재고 조정 | `{ itemId, lotId, deltaQuantity, reason }` |
| `inventory.moved` | 창고 이동 | `{ itemId, lotId, fromWh, toWh, quantity }` |
| `inventory.low-stock-alert` | 재고 부족 감지 | `{ itemId, current, threshold }` |

### core-erp / accounting

| 이벤트 | 트리거 | payload |
|---|---|---|
| `accounting.posted` | 분개 확정 | `{ journalId, entries: [{account, debit, credit}] }` |
| `accounting.reversed` | 역분개 | `{ originalJournalId, reverseJournalId }` |
| `accounting.period-closed` | 마감 | `{ period: '2026-04', closedBy }` |

### core-mes / production

| 이벤트 | 트리거 | payload |
|---|---|---|
| `workorder.created` | 작업지시 생성 | `{ workOrderId, bomId, targetQuantity }` |
| `workorder.started` | 생산 시작 | `{ workOrderId, startedAt }` |
| `workorder.completed` | 생산 완료 | `{ workOrderId, producedLotId, actualQuantity }` |
| `workorder.cancelled` | 작업지시 취소 | `{ workOrderId, reason }` |
| `production.material-consumed` | 원료 소진 | `{ workOrderId, itemId, lotId, quantity }` |

### core-mes / lot

| 이벤트 | 트리거 | payload |
|---|---|---|
| `lot.created` | LOT 생성 | `{ lotId, itemId, quantity, expiryDate }` |
| `lot.allocated` | LOT 예약 (출고 전) | `{ lotId, quantity, reservedBy }` |
| `lot.consumed` | LOT 소진 | `{ lotId, quantity, reason }` |
| `lot.expired` | 유통기한 만료 | `{ lotId, expiredAt }` |

### core-mes / quality

| 이벤트 | 트리거 | payload |
|---|---|---|
| `quality.inspection-requested` | 검사 요청 | `{ inspectionId, lotId, inspectionType }` |
| `quality.inspection-passed` | 검사 합격 | `{ inspectionId, lotId }` |
| `quality.inspection-failed` | 검사 불합격 | `{ inspectionId, lotId, defects }` |

### platform / workflow

| 이벤트 | 트리거 | payload |
|---|---|---|
| `approval.requested` | 승인 요청 | `{ approvalId, documentType, documentId, requestedBy }` |
| `approval.approved` | 승인 완료 | `{ approvalId, approvedBy, approvedAt }` |
| `approval.rejected` | 반려 | `{ approvalId, rejectedBy, reason }` |

### platform / billing

| 이벤트 | 트리거 | payload |
|---|---|---|
| `subscription.created` | 구독 시작 | `{ tenantId, planCode, startedAt }` |
| `subscription.upgraded` | 플랜 업그레이드 | `{ tenantId, oldPlan, newPlan }` |
| `subscription.downgraded` | 다운그레이드 | `{ tenantId, oldPlan, newPlan, effectiveAt }` |
| `subscription.expired` | 만료 | `{ tenantId, planCode }` |
| `subscription.trial-started` | 체험 시작 | `{ tenantId, featureCodes, expiresAt }` |

### industry / food

| 이벤트 | 트리거 | payload |
|---|---|---|
| `food.ccp-deviation` | CCP 기준 이탈 | `{ ccpId, batchId, measuredValue, standard }` |
| `food.recall-initiated` | 리콜 발동 | `{ recallId, affectedLotIds }` |

### addon / ai

| 이벤트 | 트리거 | payload |
|---|---|---|
| `ai.rule-triggered` | AI 규칙 발동 | `{ ruleId, severity, affectedEntities }` |
| `ai.prediction-generated` | 예측 생성 | `{ predictionType, targetEntity, confidence }` |

---

## 구독 패턴

**등록**:
```typescript
// server/core-erp/accounting/accounting.subscriber.ts
eventBus.subscribe('purchase.posted', async (event) => {
  await postPurchaseJournal(event.payload.purchaseId, event.tenant_id);
});

eventBus.subscribe('sales.posted', async (event) => {
  await postSaleJournal(event.payload.saleId, event.tenant_id);
});
```

**중요 원칙**:
- 이벤트 핸들러는 **idempotent** (같은 이벤트 두 번 처리해도 같은 결과)
- 실패 시 재시도 가능하도록 `processing_attempts` 증가
- 5회 실패하면 dead letter 로 분리

---

## 이주 전략

현재 코드의 직접 호출 구조:
```
createPurchase() → onPurchaseCreated() → 재고 LOT 생성 + 검사 생성 + 분개
```

이주 후:
```
createPurchase() → domain_events.INSERT('purchase.posted', ...)
                   ↓ (worker)
         inventory.subscriber: LOT 생성
         quality.subscriber: 검사 생성
         accounting.subscriber: 분개
```

**단계별 전환**:
1. Phase 1: `domain_events` 테이블 + worker + 이벤트 발행만 추가 (기존 직접 호출 유지)
2. Phase 2: 신규 구독자 1개부터 동작 확인 (accounting)
3. Phase 3: 기존 직접 호출 제거
