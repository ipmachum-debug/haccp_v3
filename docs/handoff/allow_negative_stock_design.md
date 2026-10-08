# 설계 변경 지시서 — 재고 음수 허용 모드

**작성일**: 2026-10-07
**결정자**: 한상갑 CEO
**결정**: "음수 체크 없이 다음 입고부터 정리" — 식품제조업 운영 현실에 맞게 재고 부족 가드 완화

---

## 0. 결정 배경 (CEO 요약)

> "그냥 음수를 체크하지 않고, 다음 입고부터 정리하는게 어떻겟니? 어차피 한번씩 조정하니까"

### 왜 이게 맞는가
- 식품제조업 현장은 **입고 등록이 실제 사용보다 늦게 들어오는** 게 일상 (전표/영수증 모아서 주말/월말 일괄 입력)
- 지금처럼 "재고 부족 → LOT 차감 skip → inventory_deducted=0, lot_id=NULL usage" 로 분기하면:
  - **DB에 두 종류의 usage 가 섞여** (lot 있음 / lot 없음) → 수불부 복잡해짐
  - 입고 후 재차감 처리를 사람이 해줘야 함 (실제로 안 함)
  - 결과: `inventory_deducted=0` 가 영구히 남아 "미처리" 리스트 쌓임
- 운영 흐름상 "**월말 조정 때 입고 역산으로 맞춤**" 이 이미 돌아가고 있는 프로세스
- 따라서 **음수 허용 + 입고 때 음수 상쇄** 가 자연스러운 모델

---

## 1. 현재 로직 (변경 전)

**파일**: `server/lib/production/autoMaterialIssue.ts` line 277~385
**파일**: `server/lib/inventory/fefoLotAllocation.ts` line 55~57, 148~158

### 1.1 autoMaterialIssue.ts 분기

```ts
if (availableQty >= requiredQuantity) {
  // 정상 경로: FEFO 할당 → LOT 차감 → actuallyDeducted = true
  const allocations = await allocateLotsFEFO(...);
  // ... LOT 차감 ...
  actuallyDeducted = true;
} else {
  // 재고 부족: LOT 차감 skip
  result.warnings.push(`${materialName}: 재고 부족 (가용: ${availableQty}, 필요: ${requiredQuantity}). 출고 기록만 생성합니다.`);
}

// 그 후:
if (lotAllocations.length === 0) {
  // 폴백 INSERT (lot_id=NULL)
  await db.execute(sql`INSERT INTO h_inventory_transactions (lot_id, ...) VALUES (NULL, ...)`);
}

// 플래그 UPDATE
SET inventory_deducted = ${actuallyDeducted ? 1 : 0}
```

### 1.2 fefoLotAllocation.ts 가드

```ts
// Line 55~57: availableQuantity > 0 LOT만 조회
.where(and(..., gte(hInventoryLots.availableQuantity, 0.001 as any)))

// Line 148~158: 재고 부족이면 throw
if (remaining > 0.001) {
  throw new Error(`재고 부족: 요청 ${requestedQuantity}, 가용 ${totalAvailable}`);
}
```

### 1.3 UPDATE 쿼리의 GREATEST(..., 0) 가드

**autoMaterialIssue.ts line ~340 영역** (실제 LOT 차감하는 UPDATE):
```ts
await db.execute(sql`
  UPDATE h_inventory_lots
  SET available_quantity = GREATEST(available_quantity - ${alloc.quantity}, 0)
  WHERE id = ${alloc.lotId} AND tenant_id = ${tenantId}
`);
```

→ **`GREATEST(..., 0)` 가 음수를 0으로 clamp 함**. 이게 "음수 금지" 의 마지막 라인.

---

## 2. 변경 방향 (3단계)

### Step 1. FEFO 할당 함수에 "음수 허용" 분기 추가

**파일**: `server/lib/inventory/fefoLotAllocation.ts`

#### 변경 1-A: 함수 시그니처에 옵션 추가
```ts
export async function allocateLotsFEFO(
  inventoryId: number,
  requestedQuantity: number,
  unit: string,
  tenantId: number,
  materialId?: number,
  conn?: PoolConnection,
  options?: { allowNegative?: boolean }, // ★ 추가
)
```

#### 변경 1-B: 재고 부족 throw 제거 (음수 허용 시)
```ts
// Line 148~158 변경
if (remaining > 0.001) {
  const totalAvailable = availableLots.reduce((sum, lot) => sum + Number(lot.availableQuantity), 0);
  
  if (options?.allowNegative) {
    // ★ 음수 허용 모드: 마지막 LOT 에 부족분 몰아서 음수로 차감
    console.warn(
      `[allow_negative] fefo_short material=${materialId ?? "n/a"} inventory=${inventoryId} ` +
      `requested=${requestedQuantity}${unit} available=${totalAvailable.toFixed(3)}${unit} ` +
      `→ 음수 ${(remaining).toFixed(3)}${unit} 로 차감`
    );
    
    // 마지막 LOT (가장 늦게 만료) 에 부족분 추가 (음수 발생)
    if (availableLots.length > 0) {
      const lastLot = availableLots[availableLots.length - 1];
      const lastAlloc = allocations[allocations.length - 1];
      if (lastAlloc && lastAlloc.lotId === lastLot.id) {
        lastAlloc.quantity += remaining;
      } else {
        allocations.push({
          lotId: lastLot.id,
          quantity: remaining,
          unitCost: Number(lastLot.unitPrice || 0),
          expiryDate: lastLot.expiryDate ? lastLot.expiryDate.toString() : null,
        });
      }
    } else {
      // LOT 자체가 없는 경우: material_id 기반으로 "가상 LOT" 생성 필요한지는 
      // 상위 레이어(autoMaterialIssue) 가 판단. 여기서는 빈 배열 반환.
      // → 상위에서 lot_id=NULL fallback 유지
    }
  } else {
    // 기존 동작 (음수 금지, throw)
    throw new Error(`재고 부족: 요청 ${requestedQuantity}${unit}, 가용 ${totalAvailable.toFixed(3)}${unit}`);
  }
}
```

#### 변경 1-C: available_quantity > 0 필터 제거 (음수 LOT 도 조회)
```ts
// 음수 허용 모드에서는 availableQuantity 조건 없이 전체 LOT 조회
// (음수 LOT 이 다음 입고 때 상쇄되어야 하므로 보여야 함)
.where(
  and(
    eq(hInventoryLots.inventoryId, inventoryId),
    eq(hInventoryLots.tenantId, tenantId),
    options?.allowNegative ? sql`1=1` : gte(hInventoryLots.availableQuantity, 0.001 as any),
  ),
)
```

### Step 2. autoMaterialIssue.ts 변경

#### 변경 2-A: 재고 부족 체크 제거 + 항상 FEFO 호출
```ts
// Line 277~385 리팩터
if (inventory) {
  const inventoryId = Number(inventory.id);
  // ★ 음수 허용 모드이므로 availableQty 체크 없이 바로 FEFO 호출
  try {
    const { allocateLotsFEFO } = await import("../inventory/fefoLotAllocation");
    const allocations = await allocateLotsFEFO(
      inventoryId, requiredQuantity, unit, tenantId, canonicalId, undefined,
      { allowNegative: true }, // ★
    );
    
    let totalAllocated = 0;
    for (const alloc of allocations) {
      // ... (기존 INSERT + UPDATE 로직 그대로) ...
      // 단, UPDATE 에서 GREATEST(..., 0) 제거:
      await db.execute(sql`
        UPDATE h_inventory_lots
        SET available_quantity = available_quantity - ${alloc.quantity}
        WHERE id = ${alloc.lotId} AND tenant_id = ${tenantId}
      `);
      // (GREATEST 제거 → 음수 저장 허용)
    }
    actuallyDeducted = true;
  } catch (fefoErr: any) {
    // 음수 허용 모드에서는 FEFO 가 던지는 유일한 에러는 "LOT 자체가 하나도 없음"
    console.warn(`[auto_issue] fefo_no_lots material=${canonicalId} → lot_id=NULL fallback`);
    result.warnings.push(`${materialName}: LOT 레코드 없음. 출고 기록만 생성 (다음 입고 시 상쇄 필요).`);
  }
} else {
  // 재고 레코드가 없는 경우 - 기존 동작 유지
  result.warnings.push(`${materialName}: 재고 레코드 없음. 출고 기록만 생성합니다.`);
}
```

#### 변경 2-B: `h_inventory.available_quantity` UPDATE 에서도 음수 허용
`autoMaterialIssue.ts` 내 `h_inventory` UPDATE 쿼리에서 `GREATEST(..., 0)` 제거 (만약 있다면).

### Step 3. 입고 시 "음수 재고 자동 상쇄" 로직 추가

**파일**: `server/lib/inventory/receiveMaterial.ts` (또는 입고 처리 메인 파일)

입고 트랜잭션 생성 후:
```ts
// 입고 완료 후, 해당 material 의 음수 LOT 자동 상쇄
async function reconcileNegativeLots(materialId: number, tenantId: number, conn: PoolConnection) {
  // 1) 같은 material_id 의 음수 available_quantity 가진 LOT 조회
  const [negativeLots] = await conn.query(sql`
    SELECT id, available_quantity, lot_number
    FROM h_inventory_lots
    WHERE material_id = ? AND tenant_id = ? 
      AND available_quantity < 0
    ORDER BY expiry_date ASC, id ASC
  `, [materialId, tenantId]);
  
  if (negativeLots.length === 0) return;
  
  // 2) 양수 가용 재고 (= 방금 입고된 LOT 포함) 조회
  const [positiveLots] = await conn.query(sql`
    SELECT id, available_quantity, lot_number, expiry_date
    FROM h_inventory_lots
    WHERE material_id = ? AND tenant_id = ?
      AND available_quantity > 0
    ORDER BY expiry_date ASC, id ASC
  `, [materialId, tenantId]);
  
  // 3) 음수를 양수로 흡수 (FEFO 순)
  let posIdx = 0;
  for (const neg of negativeLots) {
    let shortage = Math.abs(neg.available_quantity); // 메꿔야 할 양
    
    while (shortage > 0 && posIdx < positiveLots.length) {
      const pos = positiveLots[posIdx];
      const takeAmount = Math.min(shortage, pos.available_quantity);
      
      // 양수 LOT 에서 빼고
      await conn.execute(sql`
        UPDATE h_inventory_lots SET available_quantity = available_quantity - ?
        WHERE id = ? AND tenant_id = ?
      `, [takeAmount, pos.id, tenantId]);
      
      // 음수 LOT 에 더함
      await conn.execute(sql`
        UPDATE h_inventory_lots SET available_quantity = available_quantity + ?
        WHERE id = ? AND tenant_id = ?
      `, [takeAmount, neg.id, tenantId]);
      
      // 재고 조정 트랜잭션 기록 (감사 트레일)
      await conn.execute(sql`
        INSERT INTO h_inventory_transactions
        (lot_id, material_id, transaction_type, quantity, unit, 
         transaction_date, action_type, purpose, notes, tenant_id)
        VALUES (?, ?, 'adjust', ?, ?, NOW(), 'NEGATIVE_RECONCILE', 'inventory',
         ?, ?)
      `, [
        pos.id, materialId, takeAmount, pos.unit,
        `[NEG_RECONCILE] 음수 LOT#${neg.id} (${neg.lot_number}) 상쇄: ${takeAmount}${pos.unit} ← LOT#${pos.id} (${pos.lot_number})`,
        tenantId,
      ]);
      
      pos.available_quantity -= takeAmount;
      shortage -= takeAmount;
      
      if (pos.available_quantity <= 0.001) posIdx++;
    }
    
    if (shortage > 0.001) {
      console.warn(
        `[neg_reconcile] partial material=${materialId} LOT#${neg.id} ` +
        `remaining=${shortage.toFixed(3)} (양수 LOT 부족, 다음 입고 대기)`
      );
    }
  }
}
```

**호출 지점**: 모든 입고 트랜잭션 생성 직후 (receiveMaterial, 매입 승인 confirm, 수동 조정 등).

---

## 3. 사이드 이펙트 분석

### 3.1 긍정
- `inventory_deducted` 플래그가 **항상 1** (실제로 음수든 양수든 LOT 차감 성공)
- lot_id=NULL fallback usage **대폭 감소** (LOT 레코드 자체가 없을 때만 발생)
- 수불부 일관성 향상 (모든 usage 가 LOT 참조 가짐)
- 입고 처리 때 "음수 자동 상쇄" → 사람이 재차감 안 눌러도 됨

### 3.2 주의
- `h_inventory_lots.available_quantity` 가 음수 가능 → **UI 재고 조회 화면이 음수를 어떻게 표시할지** 결정 필요
  - 권장: 음수는 빨간색 + "입고 대기 X.X" 표기
  - 또는: 0으로 clamp + 별도 "미반영 사용량" 컬럼
- h_inventory.available_quantity (마스터) 도 음수 허용할지 결정 필요
- 재고 조회 쿼리 중 `WHERE available_quantity > 0` 조건이 있는 곳 전수 점검 필요 (음수 LOT 도 포함되어야 FEFO 할당, 음수 집계 가능)

### 3.3 성능
- 입고 때마다 `reconcileNegativeLots` 호출 → 추가 쿼리 몇 번
- 트랜잭션 안에서 처리하므로 원자성 보장
- 음수 LOT 이 없는 경우 즉시 return (오버헤드 거의 0)

---

## 4. 테스트 시나리오

### 4.1 단위 테스트
```ts
describe('allocateLotsFEFO allowNegative mode', () => {
  it('음수 허용 모드: 재고 부족해도 throw 안 함', async () => {
    // setup: LOT 하나 가용 10kg
    const result = await allocateLotsFEFO(invId, 15, 'kg', 2, matId, undefined, { allowNegative: true });
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(15); // 10 + 5(음수)
  });

  it('음수 허용 OFF: 재고 부족이면 throw', async () => {
    await expect(
      allocateLotsFEFO(invId, 15, 'kg', 2, matId, undefined, { allowNegative: false })
    ).rejects.toThrow('재고 부족');
  });
});

describe('reconcileNegativeLots', () => {
  it('입고 후 음수 LOT 자동 상쇄', async () => {
    // setup: LOT A = -5kg, LOT B = 10kg 신규 입고
    await reconcileNegativeLots(matId, 2, conn);
    // 결과: LOT A = 0kg, LOT B = 5kg, adjust 트랜잭션 1건
    const a = await getLot(aId);
    expect(a.available_quantity).toBe(0);
  });
});
```

### 4.2 통합 테스트
1. 재고 0 kg 인 재료로 배치 생성 → `inventory_deducted=1`, LOT 음수 저장 확인
2. 그 재료 10 kg 입고 → 음수 상쇄 자동 실행, LOT 양수 복구 확인
3. 수불부 조회 → `AUTO_ISSUE` + `NEGATIVE_RECONCILE` 두 종류 트랜잭션 모두 보이는지 확인

---

## 5. 롤백 계획

- `options?.allowNegative` 가 `false` (기본값) 면 기존 동작 완전 동일
- `autoMaterialIssue.ts` 호출부에서 `allowNegative: true` 를 `false` 로 바꾸면 즉시 원복
- `reconcileNegativeLots` 는 음수 LOT 이 없으면 no-op → 롤백 영향 없음

---

## 6. 머지 순서 (CEO 확정 순서에 맞춰)

```
1. PR #442 (완료)
2. PR #443 (reference_id FEFO 경로 수정) ← 머지 필요
3. 형이 올릴 "BOM 조회 이중 네임스페이스 헬퍼" PR
4. 본 지시서 기반 "음수 허용 모드" PR (fefoLotAllocation + autoMaterialIssue + receiveMaterial)
5. PR #445 (daily_log 측정 관문)
```

**4번과 5번 순서가 중요**:
- 4번 머지 → 신규 배치에서 재고 부족 시 음수로 차감 (더 이상 `inventory_deducted=0` 안 생김)
- 5번은 그 다음에 머지 (관문 추가해도 안전)

---

## 7. 10/6~10/7 이미 발생한 15건 처리

이 PR 머지 후:
1. 멥쌀, 정제수, 냉동쑥 등 10종 입고 처리 (CEO 수량 확인 필요)
2. 입고 trigger 자동으로 음수 상쇄 → 끝
3. 또는 수동 트리거: `node scripts/reconcile_negative_lots.cjs --material=615,638,596,...`

**지금 10/6~10/7 상황**:
- `inventory_deducted=0` 15건 → 원인은 "재고 없어서 못 뺌"
- 하지만 lot_id=NULL usage 는 이미 생성됨 → 수불부에는 이미 "쓴 걸로" 기록됨
- **해결**: 입고 후, 기존 lot_id=NULL fallback usage 를 lot_id=실제LOT 로 재매핑하는 보정 스크립트 필요
  - 또는: fallback usage 는 그대로 두고, 새 입고 LOT 에서 "음수 소급 조정" 트랜잭션으로 균형 맞추기
  - 어느 쪽이 수불부 가독성에 좋을지 CEO 확인

---

## 8. 결정 체크리스트

- [ ] UI 에서 음수 LOT 를 "빨간색" 으로 표시할지 (별도 UI PR)
- [ ] `h_inventory.available_quantity` 마스터도 음수 허용할지 (권장: 예)
- [ ] 음수 상쇄 트랜잭션의 `action_type` 네이밍: `NEGATIVE_RECONCILE` vs `BACKFILL_ADJUST` vs 기타
- [ ] 입고 트리거 외에 야간 cron 보강 필요한지 (안전망)
- [ ] 10/6~10/7 기존 15건 사후 처리 방식 (lot_id 재매핑 vs 새 상쇄 트랜잭션)
