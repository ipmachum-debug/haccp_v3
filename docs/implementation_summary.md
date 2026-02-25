# 재고-회계 통합 시스템 구현 완료 요약

## 📋 구현 개요

**목표**: 재고-회계 통합 시스템을 완벽하게 구현하여 단일 진실(SoT) 원칙에 따라 원장 중심 아키텍처를 구축

**구현 기간**: 2025-01-31

**핵심 원칙**:
1. **단일 진실(SoT)**: 재고 원장 + 회계 원장이 진실
2. **멱등성**: DB UNIQUE 제약으로 중복 방지
3. **상태머신**: DRAFT → POSTED → CANCELED
4. **역거래 패턴**: 삭제 대신 취소 문서 생성
5. **원가 흐름**: 원재료 → WIP → 제품 → COGS

---

## ✅ 구현 완료 항목

### Phase 1: 데이터베이스 스키마 재설계

#### 1.1 accounting_transactions 테이블 생성
```sql
CREATE TABLE accounting_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transaction_date DATE NOT NULL,
  account_code VARCHAR(20) NOT NULL,
  debit_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  credit_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  description TEXT,
  source_type VARCHAR(50),
  source_id VARCHAR(100),
  source_line_id VARCHAR(100),
  action_type VARCHAR(20),
  reversal_of_id INT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_accounting_tx (source_type, source_id, source_line_id, action_type, account_code)
);
```

**핵심 포인트**:
- `source_type`: PURCHASE, OUTBOUND, PRODUCTION, SALE
- `action_type`: POST, REVERSAL
- `UNIQUE KEY`: 멱등성 보장 (중복 방지)
- `reversal_of_id`: 역거래 시 원본 거래 ID 참조

#### 1.2 h_inventory_transactions 테이블 변경 (개념적)
```sql
ALTER TABLE h_inventory_transactions ADD COLUMN source_type VARCHAR(50);
ALTER TABLE h_inventory_transactions ADD COLUMN source_id VARCHAR(100);
ALTER TABLE h_inventory_transactions ADD COLUMN source_line_id VARCHAR(100);
ALTER TABLE h_inventory_transactions ADD COLUMN action_type VARCHAR(20);
ALTER TABLE h_inventory_transactions ADD COLUMN purpose VARCHAR(50);
ALTER TABLE h_inventory_transactions ADD COLUMN unit_cost DECIMAL(15,2);
ALTER TABLE h_inventory_transactions ADD COLUMN amount DECIMAL(15,2);
ALTER TABLE h_inventory_transactions ADD COLUMN reversal_of_id INT;

ALTER TABLE h_inventory_transactions ADD UNIQUE KEY unique_inventory_tx 
  (source_type, source_id, source_line_id, action_type, lot_id);
```

#### 1.3 doc_line_lots 테이블 생성 (개념적)
```sql
CREATE TABLE doc_line_lots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_type VARCHAR(50) NOT NULL,
  doc_id INT NOT NULL,
  line_id INT NOT NULL,
  lot_id INT NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  unit_cost DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### Phase 2: FEFO 로트 할당 함수 구현

**파일**: `/home/ubuntu/haccp_v3/server/lib/fefoLotAllocation.ts`

**핵심 함수**:
1. `allocateLotsFEFO()`: 유통기한 빠른 순으로 LOT 자동 할당
2. `saveLotAllocations()`: 할당 결과를 doc_line_lots 테이블에 저장

**로직**:
```typescript
// 1. 유통기한 빠른 순으로 LOT 조회 (FEFO)
const lots = await db
  .select()
  .from(hInventoryLots)
  .where(eq(hInventoryLots.inventoryId, inventoryId))
  .orderBy(asc(hInventoryLots.expirationDate));

// 2. 수량 할당
for (const lot of lots) {
  if (remainingQuantity <= 0) break;
  const allocatedQuantity = Math.min(remainingQuantity, availableQuantity);
  allocations.push({ lotId: lot.id, quantity: allocatedQuantity, unitCost: lot.unitCost });
  remainingQuantity -= allocatedQuantity;
}
```

---

### Phase 3: 매입 POST/CANCEL 로직 구현

**파일**: 
- `/home/ubuntu/haccp_v3/server/lib/purchasePost.ts`
- `/home/ubuntu/haccp_v3/server/lib/purchaseCancel.ts`

#### 3.1 매입 POST 로직

**워크플로우**:
1. 상태 검증 (DRAFT만 POST 가능)
2. LOT 자동 생성
3. 재고 원장 생성 (h_inventory_transactions - receipt)
4. 회계 원장 생성 (accounting_transactions)
   - 차변: 원재료 (1120)
   - 대변: 매입채무 (2110)
5. 상태 전환 (DRAFT → POSTED)

**멱등성 보장**:
```typescript
try {
  await db.insert(hInventoryTransactions).values({ ... });
} catch (error: any) {
  if (error.code === "ER_DUP_ENTRY") {
    throw new Error("이미 확정된 매입 문서입니다 (재고 원장 중복)");
  }
  throw error;
}
```

#### 3.2 매입 CANCEL 로직

**워크플로우**:
1. 상태 검증 (POSTED만 CANCEL 가능)
2. 원본 재고 원장 조회
3. 재고 역거래 생성 (음수 수량)
4. 회계 역거래 생성 (DR/CR 반대)
5. 상태 전환 (POSTED → CANCELED)

**역거래 패턴**:
```typescript
await db.insert(hInventoryTransactions).values({
  quantity: (-parseFloat(originalTx.quantity)).toString(), // 부호 반대
  actionType: "REVERSAL",
  reversalOfId: originalTx.id,
  ...
});
```

---

### Phase 4: 원재료 출고 POST/CANCEL 로직 구현

**파일**:
- `/home/ubuntu/haccp_v3/server/lib/materialOutboundPost.ts`
- `/home/ubuntu/haccp_v3/server/lib/materialOutboundCancel.ts`

#### 4.1 원재료 출고 POST 로직

**워크플로우**:
1. 출고 문서 상태 검증 (DRAFT만 POST 가능)
2. FEFO 로트 할당
3. 재고 원장 생성 (h_inventory_transactions - usage)
4. 회계 원장 생성 (accounting_transactions)
   - 차변: WIP (1130 - 재공품)
   - 대변: 원재료 (1120 - 원재료재고)
5. 출고 문서 상태 전환 (DRAFT → POSTED)

**원가 흐름**: 원재료 → WIP (재공품)

---

### Phase 5: 생산 완료 POST/CANCEL 로직 구현

**파일**:
- `/home/ubuntu/haccp_v3/server/lib/productionCompletePost.ts`
- `/home/ubuntu/haccp_v3/server/lib/productionCompleteCancel.ts`

#### 5.1 생산 완료 POST 로직

**워크플로우**:
1. 배치 상태 검증 (in_progress만 POST 가능)
2. 원가 산식 계산 (재료비 + 인건비 + 경비)
3. 수율 처리 (planned_yield vs actual_yield, loss 계산)
4. 재고 원장 생성 (h_inventory_transactions - receipt)
5. 회계 원장 생성 (accounting_transactions)
   - 차변: 제품재고 (1140 - 제품재고)
   - 대변: WIP (1130 - 재공품)
6. 배치 상태 전환 (in_progress → completed)

**원가 흐름**: WIP (재공품) → 제품재고

**원가 산식**:
```typescript
const materialCost = parseFloat(batch.materialCost || "0");
const laborCost = parseFloat(batch.laborCost || "0");
const overheadCost = parseFloat(batch.overheadCost || "0");
const totalCost = materialCost + laborCost + overheadCost;
const unitCost = totalCost / actualQuantity;
```

**수율 처리**:
```typescript
const actualYield = (actualQuantity / plannedQuantity) * 100;
const lossQuantity = plannedQuantity - actualQuantity;
```

---

### Phase 6: 제품 출고/판매 POST/CANCEL 로직 구현

**파일**:
- `/home/ubuntu/haccp_v3/server/lib/productSalePost.ts`
- `/home/ubuntu/haccp_v3/server/lib/productSaleCancel.ts`

#### 6.1 제품 출고/판매 POST 로직

**워크플로우**:
1. 판매 문서 상태 검증 (DRAFT만 POST 가능)
2. FEFO 로트 할당
3. 재고 원장 생성 (h_inventory_transactions - outbound)
4. 회계 원장 생성 (accounting_transactions)
   - **(A) 매출 인식**:
     - 차변: 매출채권 (1310)
     - 대변: 매출 (4110 - 제품매출)
   - **(B) 매출원가 인식**:
     - 차변: 매출원가 (5110 - 제품매출원가)
     - 대변: 제품재고 (1140 - 제품재고)
5. 판매 문서 상태 전환 (DRAFT → POSTED)

**핵심 포인트**: 매출 인식 + 매출원가 동시 처리

```typescript
// (A) 매출 인식
await db.insert(accountingTransactions).values({
  accountCode: "1310", // 매출채권
  debitAmount: totalAmount.toFixed(2),
  ...
});
await db.insert(accountingTransactions).values({
  accountCode: "4110", // 제품매출
  creditAmount: totalAmount.toFixed(2),
  ...
});

// (B) 매출원가 인식
await db.insert(accountingTransactions).values({
  accountCode: "5110", // 제품매출원가
  debitAmount: totalCost.toFixed(2),
  ...
});
await db.insert(accountingTransactions).values({
  accountCode: "1140", // 제품재고
  creditAmount: totalCost.toFixed(2),
  ...
});
```

---

## 📊 원가 흐름 전체 구조

```
[매입] → 원재료재고 (1120)
           ↓
[원재료 출고] → WIP (1130 - 재공품)
           ↓
[생산 완료] → 제품재고 (1140)
           ↓
[제품 출고/판매] → 매출원가 (5110 - COGS)
```

---

## 🔒 멱등성 보장 메커니즘

### DB UNIQUE 제약
```sql
-- 재고 원장
UNIQUE KEY unique_inventory_tx (source_type, source_id, source_line_id, action_type, lot_id)

-- 회계 원장
UNIQUE KEY unique_accounting_tx (source_type, source_id, source_line_id, action_type, account_code)
```

### 멱등성 키 구성
- `source_type`: PURCHASE, OUTBOUND, PRODUCTION, SALE
- `source_id`: PURCHASE-123, OUTBOUND-456, BATCH-789, SALE-101
- `source_line_id`: PURCHASE-123-1, OUTBOUND-456-2, ...
- `action_type`: POST, REVERSAL

**효과**: 동일한 문서를 여러 번 POST해도 DB 제약으로 중복 방지

---

## 🔄 상태머신

```
DRAFT (작성 중)
  ↓ [POST]
POSTED (확정, 회계/재고 반영)
  ↓ [CANCEL]
CANCELED (취소, 역거래 생성)
```

**규칙**:
- DRAFT만 POST 가능
- POSTED만 CANCEL 가능
- CANCELED는 최종 상태 (더 이상 변경 불가)

---

## 🔙 역거래 패턴

**원칙**: 삭제 대신 취소 문서 생성

**구현**:
1. 원본 거래 조회
2. 부호 반대로 역거래 생성
3. `reversalOfId`로 원본 거래 참조
4. `actionType: "REVERSAL"`로 구분

**예시**:
```typescript
// 원본 거래
{ quantity: 100, debitAmount: 1000, creditAmount: 0 }

// 역거래
{ quantity: -100, debitAmount: 0, creditAmount: 1000, reversalOfId: 원본ID }
```

---

## 📁 구현 파일 목록

### 스키마
- `/home/ubuntu/haccp_v3/drizzle/schema_inventory_accounting.ts`

### 라이브러리
- `/home/ubuntu/haccp_v3/server/lib/fefoLotAllocation.ts`
- `/home/ubuntu/haccp_v3/server/lib/purchasePost.ts`
- `/home/ubuntu/haccp_v3/server/lib/purchaseCancel.ts`
- `/home/ubuntu/haccp_v3/server/lib/materialOutboundPost.ts`
- `/home/ubuntu/haccp_v3/server/lib/materialOutboundCancel.ts`
- `/home/ubuntu/haccp_v3/server/lib/productionCompletePost.ts`
- `/home/ubuntu/haccp_v3/server/lib/productionCompleteCancel.ts`
- `/home/ubuntu/haccp_v3/server/lib/productSalePost.ts`
- `/home/ubuntu/haccp_v3/server/lib/productSaleCancel.ts`

### 문서
- `/home/ubuntu/haccp_v3/docs/NEXT_SESSION_GUIDE.md`
- `/home/ubuntu/haccp_v3/docs/implementation_summary.md` (본 문서)

---

## 🎯 다음 단계

### 1. tRPC 라우터 통합
- 각 POST/CANCEL 함수를 tRPC 라우터에 연결
- 프론트엔드에서 호출 가능하도록 API 노출

### 2. 프론트엔드 UI 구현
- 매입 입력 화면 (DRAFT 생성 → POST)
- 원재료 출고 화면 (DRAFT 생성 → POST)
- 생산 완료 화면 (배치 완료 → POST)
- 제품 출고/판매 화면 (DRAFT 생성 → POST)

### 3. 통합 테스트
- 전체 워크플로우 테스트 (매입 → 출고 → 생산 → 판매)
- 멱등성 테스트 (중복 POST 시도)
- 역거래 테스트 (CANCEL 후 원장 확인)

### 4. 리포트 기능
- 재고 원장 조회
- 회계 원장 조회
- 원가 흐름 리포트

---

## ✅ 완료 체크리스트

- [x] accounting_transactions 테이블 생성
- [x] FEFO 로트 할당 함수 구현
- [x] 매입 POST/CANCEL 로직 구현
- [x] 원재료 출고 POST/CANCEL 로직 구현
- [x] 생산 완료 POST/CANCEL 로직 구현
- [x] 제품 출고/판매 POST/CANCEL 로직 구현
- [ ] tRPC 라우터 통합
- [ ] 프론트엔드 UI 구현
- [ ] 통합 테스트
- [ ] 리포트 기능 구현

---

**작성일**: 2025-01-31
**작성자**: Manus AI Agent
