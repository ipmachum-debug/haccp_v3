# 단일 트랜잭션 엔진 설계 (F-2)

> 작성: 2026-04-28
> 트리거: 특허 명세서 [0014] 해결수단 2 + lot_id=0 누적 사고의 진정한 근본 원인
> 관련: PR #103 (Phase 1 trace) / PR #109 (Phase 2 백필) / PR #111 (sentinel→NULL) — 이 PR 들이 증상 대응이었다면, 본 설계는 근본 차단

---

## 🎯 문제 진술

### 특허 [0014] 의 invariant

> 거래 이벤트 (매입 / 매출 / 생산 배치 원재료 투입 등) 의 확정 (POST) 명령이 수신되면, **단일 데이터베이스 트랜잭션 내에서** 다음 세 처리를 원자적으로 수행한다.
>
> (i) **규정 추적 처리**: LOT 번호 생성 / 배정, 소비기한 등록, CCP 연계 정보 기록, FEFO 자동 차감
> (ii) **재고 수불 처리**: 입고 / 출고 수불부 기록, LOT 단위 재고 변동 반영, 안전재고 임박 알림
> (iii) **회계 분개 처리**: 거래 유형별 복식부기 분개
>
> 위 (i)~(iii) 중 어느 하나라도 실패할 경우, 전체 트랜잭션이 롤백되어 세 영역의 정합성이 항상 보장된다.

### 현재 코드의 위배 사례

#### 1. `autoMaterialIssue.ts` — 부분 차감 가능

```ts
for (const input of batchInputs) {
  try {
    // FEFO 할당 → LOT 차감 → 거래 기록 → inventory 차감 → 수불부
    // 각 원재료별로 try/catch — 4번째 원재료 실패 시 1~3은 이미 commit
  } catch (matError: any) {
    result.errors.push(...);
    // 다음 원재료로 계속 — 부분 차감 발생
  }
}
```

**위배**: 한 배치의 원재료 5종 중 3종만 차감되고 2종 실패. 회계 분개도 그 3종만 발생. **"하나라도 실패하면 전체 롤백" 위배**.

이 패턴이 lot_id=0 케이스의 진짜 근본 — `allocateLotsFEFO` throw 시 catch 후 lot_id=NULL INSERT 로 진행 (PR #111 후).

#### 2. `purchasePost.ts` / `productSalePost.ts` — 부분 적용

```ts
return await withTransaction(async (conn) => {
  // ✅ LOT + 재고 + 회계 같은 트랜잭션
});
```

**OK** — 이미 적용됨. 단 모든 거래 유형이 이 패턴은 아님.

#### 3. `expense.ts`, `bankTransaction.service.ts` 등

분개만 있고 LOT/재고 무관 → 단일 트랜잭션 필요 케이스 외.

---

## 🏗 설계: TransactionContext + 도메인 이벤트

### 목표

1. **모든 거래 POST/CANCEL** 에 단일 트랜잭션 강제
2. **(i) 규정 / (ii) 재고 / (iii) 회계** 처리를 **도메인 이벤트** 로 분리
3. **하나라도 실패 → 전체 롤백** 자동 보장
4. **점진 이주** (Strangler Fig) — 기존 `withTransaction` 사용처 그대로 + 신규 패턴 점진 도입

### 핵심 추상화

```ts
// server/lib/_core/transactionContext.ts (신규)

import type { PoolConnection } from "mysql2/promise";

export interface TransactionContext {
  /** 트랜잭션 connection (FOR UPDATE / commit / rollback 모두 이 위에서 작동) */
  conn: PoolConnection;

  /** 멀티테넌트 격리 */
  tenantId: number;

  /** 거래 ID (idempotency 키) */
  sourceType: "PURCHASE" | "SALE" | "BATCH" | "EXPENSE" | "BANK" | ...;
  sourceId: number;

  /** 발행할 도메인 이벤트 (트랜잭션 commit 후 outbox 로 publish) */
  emit(event: DomainEvent): void;

  /** 트랜잭션 안에서 실행될 hook 등록 (commit 직전) */
  beforeCommit(fn: () => Promise<void>): void;
}

export type DomainEvent =
  | { type: "lot.allocated"; lotId: number; quantity: number; sourceId: number }
  | { type: "lot.consumed"; lotId: number; quantity: number; sourceId: number }
  | { type: "inventory.changed"; materialId: number; delta: number; sourceId: number }
  | { type: "journal.posted"; entryId: number; sourceType: string; sourceId: number }
  | { type: "ccp.deviation"; ccpId: number; lotId: number; severity: "minor" | "major" };
```

### 신규 헬퍼: `postWithinTransaction`

```ts
// server/lib/_core/transactionContext.ts

export async function postWithinTransaction<T>(
  params: {
    sourceType: string;
    sourceId: number;
    tenantId: number;
    actions: Array<(ctx: TransactionContext) => Promise<void>>;
  },
): Promise<{ result: T; events: DomainEvent[] }> {
  return await withTransaction(async (conn) => {
    const events: DomainEvent[] = [];
    const beforeCommitHooks: Array<() => Promise<void>> = [];

    const ctx: TransactionContext = {
      conn,
      tenantId: params.tenantId,
      sourceType: params.sourceType as any,
      sourceId: params.sourceId,
      emit: (e) => events.push(e),
      beforeCommit: (fn) => beforeCommitHooks.push(fn),
    };

    // (i) 규정 / (ii) 재고 / (iii) 회계 — 순차 실행, 하나라도 throw 시 전체 rollback
    for (const action of params.actions) {
      await action(ctx);
    }

    // commit 직전 hook (audit log 등)
    for (const hook of beforeCommitHooks) {
      await hook();
    }

    // commit 후 outbox 패턴으로 도메인 이벤트 publish (별도 PR 에서 정착)
    return { events } as any;
  });
}
```

### 사용 예시 — `autoMaterialIssue` 재설계

```ts
// 변경 후 (의사 코드)
export async function autoIssueMaterialsForBatch(batchId: number, userId: number) {
  return await postWithinTransaction({
    sourceType: "BATCH",
    sourceId: batchId,
    tenantId: ...,
    actions: [
      // (i) 규정 — LOT 할당 (FEFO + 자동 보정)
      async (ctx) => {
        for (const input of batchInputs) {
          const lot = await allocateLotsFEFO_Tx(ctx, input);  // ctx.conn 사용
          ctx.emit({ type: "lot.consumed", lotId: lot.id, quantity: input.quantity });
        }
      },
      // (ii) 재고 — 수불 + inventory 차감
      async (ctx) => {
        for (const input of batchInputs) {
          await deductInventory_Tx(ctx, input);
          ctx.emit({ type: "inventory.changed", materialId: input.materialId, delta: -input.quantity });
        }
      },
      // (iii) 회계 — 분개 (재공품)
      async (ctx) => {
        const entryId = await postBatchJournal_Tx(ctx, batchInputs);
        ctx.emit({ type: "journal.posted", entryId, sourceType: "BATCH", sourceId: batchId });
      },
    ],
  });
}
```

**효과**:
- 4번째 원재료에서 LOT 부족 throw → 1~3번도 자동 rollback → batch 전체 미차감 상태로 복귀
- 부분 차감 / 부분 분개 / 부분 수불부 발생 0
- lot_id=NULL INSERT 자체가 사라짐 (실패 시 fallback 으로 가는 게 아니라 throw → rollback)

---

## 🛡 단일 트랜잭션 적용 대상 (전수)

| # | 거래 유형 | 현재 상태 | 적용 우선순위 |
| --- | --- | --- | --- |
| 1 | **autoMaterialIssue** (배치 원재료 투입) | ❌ 부분 차감 | 🔴 최우선 |
| 2 | **completeBatch** (배치 완료) | 🟡 부분 적용 | 🟠 높음 |
| 3 | **purchasePost** (매입 POST) | ✅ 적용됨 | — |
| 4 | **productSalePost** (매출 POST) | ✅ 적용됨 | — |
| 5 | **purchaseCancel** (매입 취소) | ✅ 적용됨 | — |
| 6 | **productSaleCancel** (매출 취소) | ✅ 적용됨 | — |
| 7 | **purchaseReturn** (매입 반품) | 🟡 확인 필요 | 🟠 높음 |
| 8 | **expense.ts** (비용 전표 POST) | 🟡 LOT 무관, 분개만 | 🟢 낮음 (LOT/재고 영향 없음) |
| 9 | **bankTransaction match** (은행 매칭) | 🟡 분개만 | 🟢 낮음 |
| 10 | **inventoryReceipt** (재고 입고) | 🟡 확인 필요 | 🟠 높음 |
| 11 | **inventoryRelease** (수동 출고) | 🟡 확인 필요 | 🟠 높음 |
| 12 | **inventoryCount** (재고 실사 조정) | 🟡 확인 필요 | 🟠 높음 |
| 13 | **CCP 이탈 → LOT HOLD** | ❌ 미구현 (특허 [0016] 해결수단 3) | 🔴 최우선 (F-3 와 연결) |

---

## 🧱 점진 이주 마일스톤 (Strangler Fig)

### Phase F2-1 — 인프라 (1 PR)

- `server/lib/_core/transactionContext.ts` 신규 — `postWithinTransaction` + `TransactionContext` + `DomainEvent` 타입
- `server/lib/_core/transactionContext.test.ts` — 단위 테스트
- 기존 `withTransaction` 그대로 유지 (사용 중인 곳 영향 없음)

### Phase F2-2 — autoMaterialIssue 재설계 (1 PR, 큼)

- 가장 위험도 높은 코드 + 가장 효과 큼
- `allocateLotsFEFO_Tx`, `deductInventory_Tx`, `postBatchJournal_Tx` 헬퍼 분리
- 부분 차감 케이스 회귀 테스트 추가
- PR #103 / #109 / #111 의 trace / 백필 / NULL 모두 본 PR 후엔 발생 빈도 0

### Phase F2-3 — completeBatch 재설계 (1 PR)

- 배치 완료 시 제품 LOT 생성 + 원가 계산 + 회계 분개 단일 트랜잭션
- `productionCompletePost.ts` / `productionCompleteCancel.ts` 검토

### Phase F2-4 — 재고 수동 작업 통합 (1 PR)

- `inventoryReceipt`, `inventoryRelease`, `inventoryCount` 셋 다 동일 패턴

### Phase F2-5 — Outbox 패턴 (1 PR)

- 도메인 이벤트를 commit 후 별도 publishing
- `domain_events_outbox` 테이블 추가
- 이벤트 구독자 (CCP 알림 / Operational AI / 분석 대시보드 등) 분리

### Phase F2-6 — F-3 (IoT 폐쇄 루프) 연결 (별도 로드맵)

- CCP 이탈 → LOT HOLD → 손실 분개 → 시정조치 워크플로 자동 트리거
- 본 트랜잭션 엔진 위에서 작동

---

## 🛡 위험 / 안전 평가

### Big Risk

- **autoMaterialIssue 재설계** = batch 자동출고 로직의 핵심 변경. 회귀 시 운영 영향 큼.
- 점진 이주 + dual-run (기존 + 신규 같이 돌리고 비교) 필요할 수도.

### Mitigation

1. **Phase F2-1 (인프라) 단독 머지** — 사용처 0 → 회귀 영향 0
2. **Phase F2-2 (autoMaterialIssue) 머지 전**:
   - 통합 테스트 추가 (배치 5종 원재료 중 3번째 실패 시 전체 rollback 검증)
   - 운영 사이트 dry-run (별도 환경에서 1주 운영 비교)
3. **Roll-back 전략**: feature flag 로 신/구 코드 둘 다 유지, 문제 시 즉시 전환
4. **Phase F2-3~F2-5 는 F2-2 의 패턴이 검증된 후** 점진 적용

---

## 📊 효과 (특허 청사진 정량 비교)

| 영역 | 종래 / 현재 | F-2 적용 후 |
| --- | --- | --- |
| 데이터 정합성 | 부분 차감 가능 | 단일 트랜잭션 원자성, 부분 실패 시 전체 롤백 |
| LOT 추적성 | 일부 트랜잭션 lot_id NULL (PR #111 후 4건) | LOT 매칭 실패 시 throw → rollback → INSERT 자체 발생 X |
| 분개-재고 정합성 | 별도 호출 가능 (드물게 어긋남) | 같은 트랜잭션 → 항상 동기 |
| 회계 부분 발생 | 가능 (재고는 차감됐는데 분개 누락) | 불가능 (rollback) |
| 감사 추적 | 분산된 audit log | 도메인 이벤트 단일 stream (Phase F2-5) |
| CCP 이탈 자동 격리 | 미구현 | F-3 연결 시 자동 (Phase F2-6) |

---

## 🔄 다음 세션 진행 결정

본 설계는 **설계 문서만**. 실제 구현은 별도 PR 시리즈.

- [ ] **A** Phase F2-1 시작 (인프라, 작음 + 안전) — 추천 시작점
- [ ] **B** Phase F2-2 시작 (autoMaterialIssue 재설계) — 큰 변경, 신중
- [ ] **C** F-1 동적 자동 구성 엔진 설계 문서 (특허 [0013] 해결수단 1)
- [ ] **D** F-3 IoT 폐쇄 루프 설계 문서 (특허 [0016] 해결수단 3)
- [ ] **E** 다른 우선순위

추천: **A (F2-1 인프라)** — 안전 + 후속 PR 의 토대.

---

## 📚 참고

- 특허 명세서 [0014] 해결수단 2 (단일 트랜잭션 처리 엔진)
- 특허 명세서 [0019] (거래 취소 역트랜잭션)
- `server/db/connection.ts:99` — 기존 `withTransaction` 헬퍼
- `server/lib/accounting/purchasePost.ts:168` — 적용 사례
- `server/lib/production/autoMaterialIssue.ts:17-23` — Technical Debt 노트 (이 설계가 해결)
- `docs/architecture/03-event-catalog.md` — 도메인 이벤트 정의 (확장 필요)
- PR #103 (Phase 1 trace) / PR #109 (Phase 2 백필) / PR #111 (sentinel→NULL) — 증상 대응 시리즈
