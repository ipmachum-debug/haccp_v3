/**
 * TransactionContext — 단일 트랜잭션 엔진 (F-2)
 *
 * ============================================================================
 * 특허 [0014] 해결수단 2 정착 인프라:
 *   거래 이벤트 (매입 / 매출 / 생산 배치 등) 의 확정 (POST) 명령 시
 *   (i) 규정 추적 / (ii) 재고 수불 / (iii) 회계 분개 를 단일 트랜잭션
 *   안에서 원자적으로 처리. 하나라도 실패하면 전체 rollback.
 *
 * 트리거: PR #117 F-2 단일 트랜잭션 엔진 설계 의 Phase F2-1 구현.
 *
 * ============================================================================
 * 의존:
 *   - server/db/connection.ts:withTransaction → BEGIN/COMMIT/ROLLBACK 보장
 *   - server/platform/event-bus → publishEvent (Outbox 패턴, 같은 트랜잭션)
 *
 * 본 모듈 자체는:
 *   - 어떤 industry/* 도 import 안 함 (코어 무결성)
 *   - 어떤 도메인 (purchase/sale/batch) 도 import 안 함 (Hexagonal)
 *   - 도메인은 본 인프라를 호출 (역방향 의존)
 *
 * 사용 패턴:
 *   ```ts
 *   await postWithinTransaction({
 *     sourceType: "BATCH",
 *     sourceId: batchId,
 *     tenantId,
 *     actions: [
 *       async (ctx) => { // (i) 규정 — LOT FEFO 할당
 *         const lot = await allocateLotsFEFO(ctx.conn, ...);
 *         ctx.emit({ eventType: "lot.consumed", aggregateType: "lot",
 *                    aggregateId: lot.id, payload: { quantity },
 *                    tenantId: ctx.tenantId });
 *       },
 *       async (ctx) => { // (ii) 재고 — inventory 차감
 *         await deductInventory(ctx.conn, ...);
 *       },
 *       async (ctx) => { // (iii) 회계 — 분개
 *         const entryId = await postBatchJournal(ctx.conn, ...);
 *         ctx.emit({ eventType: "journal.posted", ... });
 *       },
 *     ],
 *   });
 *   ```
 *
 * ============================================================================
 * 안전 보장:
 *   - actions 중 어느 하나라도 throw 시 자동 rollback (withTransaction)
 *   - emit() 한 이벤트는 commit 시점에 publishEvent 로 outbox INSERT
 *     → rollback 시 이벤트도 자동 폐기 (트랜잭션 일관성)
 *   - emit() event.tenantId !== ctx.tenantId 시 throw (tenant 격리 강제)
 *   - beforeCommit hook 은 commit 직전 실행 — 마지막 검증 / audit
 * ============================================================================
 */

import type { PoolConnection } from "mysql2/promise";
import { withTransaction } from "../../db/connection";
import { publishEvent } from "../../platform/event-bus";
import type { DomainEventInput } from "../../platform/event-bus";

/**
 * 거래 유형 — POST/CANCEL 명령의 출처.
 *
 * 신규 거래 유형 추가 시 본 union 에 추가 + sourceType 검증 룰 갱신.
 * (도메인 등록 시 idempotency 키의 일부로 활용 가능)
 */
export type TxSourceType =
  | "PURCHASE"          // 매입
  | "SALE"              // 매출
  | "BATCH"             // 생산 배치 원재료 투입
  | "PRODUCTION"        // 생산 완료 (제품 LOT 생성)
  | "EXPENSE"           // 비용 전표
  | "BANK"              // 은행 거래 매칭
  | "INVENTORY_RECEIPT" // 수동 입고
  | "INVENTORY_RELEASE" // 수동 출고
  | "INVENTORY_COUNT";  // 재고 실사 조정

/**
 * 트랜잭션 컨텍스트 — actions 가 받는 객체.
 *
 * conn 으로 같은 트랜잭션 안에서 모든 DB 작업 실행.
 * emit() 으로 도메인 이벤트 발행 (commit 시 outbox INSERT).
 * beforeCommit() 으로 commit 직전 hook 등록 (audit, 검증).
 */
export interface TransactionContext {
  /** 트랜잭션 connection (FOR UPDATE / SELECT / INSERT 모두 이 위에서) */
  readonly conn: PoolConnection;

  /** 멀티테넌트 격리 — 모든 emit() 이 이 값과 일치해야 함 */
  readonly tenantId: number;

  /** 거래 출처 (idempotency 키의 일부) */
  readonly sourceType: TxSourceType;

  /** 거래 ID (sourceType 안에서 unique) */
  readonly sourceId: number;

  /** 작업자 ID (선택 — audit 용) */
  readonly userId?: number;

  /**
   * 도메인 이벤트 발행.
   *
   * commit 시점에 publishEvent 로 outbox INSERT 됨 → rollback 시 자동 폐기.
   * tenantId 가 ctx.tenantId 와 일치해야 함 (불일치 시 throw — tenant 격리 강제).
   */
  emit(event: DomainEventInput): void;

  /**
   * commit 직전 hook 등록.
   *
   * 등록 순서대로 실행. throw 시 rollback.
   * 활용: audit log INSERT, 사후 검증 SQL, 통계 업데이트 등.
   */
  beforeCommit(fn: () => Promise<void>): void;
}

/**
 * postWithinTransaction 의 입력 파라미터.
 *
 * actions 는 순차 실행 — 하나라도 throw 시 전체 rollback.
 * 각 action 은 ctx 를 받아 DB 작업 + 도메인 이벤트 emit.
 */
export interface PostWithinTransactionParams {
  readonly sourceType: TxSourceType;
  readonly sourceId: number;
  readonly tenantId: number;
  readonly userId?: number;

  /**
   * 트랜잭션 실패 추적용 식별자 (선택).
   * 미설정 시 `${sourceType}:${sourceId}` 사용.
   */
  readonly operationName?: string;

  /** 단일 트랜잭션 안에서 순차 실행될 작업들 */
  readonly actions: ReadonlyArray<(ctx: TransactionContext) => Promise<void>>;
}

/**
 * postWithinTransaction 의 반환값.
 *
 * events: 트랜잭션 commit 시점에 outbox 에 INSERT 된 이벤트 목록.
 * (rollback 시에는 빈 배열 — throw 가 발생하므로 caller 가 받지 못함)
 */
export interface PostWithinTransactionResult {
  readonly events: ReadonlyArray<DomainEventInput>;
}

/**
 * 단일 트랜잭션 안에서 actions 를 순차 실행 + 도메인 이벤트 outbox 발행.
 *
 * 실행 순서:
 *   1. withTransaction 으로 BEGIN
 *   2. actions 순차 실행 (어느 하나라도 throw 시 → step 5 rollback)
 *   3. beforeCommit hooks 순차 실행 (throw 시 → step 5 rollback)
 *   4. emit() 한 이벤트들 outbox INSERT (같은 트랜잭션)
 *   5. COMMIT (실패 시 ROLLBACK)
 *
 * @param params 거래 정보 + actions
 * @returns commit 된 이벤트 목록
 * @throws actions / hooks / DB 에서 발생한 모든 에러를 그대로 전파
 */
export async function postWithinTransaction(
  params: PostWithinTransactionParams,
): Promise<PostWithinTransactionResult> {
  const operationName =
    params.operationName ?? `${params.sourceType}:${params.sourceId}`;

  return await withTransaction(async (conn) => {
    const events: DomainEventInput[] = [];
    const beforeCommitHooks: Array<() => Promise<void>> = [];

    const ctx: TransactionContext = {
      conn,
      tenantId: params.tenantId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      userId: params.userId,
      emit: (event) => {
        // tenant 격리 강제 — 이벤트의 tenantId 가 컨텍스트와 다르면 사고
        if (event.tenantId !== params.tenantId) {
          throw new Error(
            `[TransactionContext] emit() event.tenantId(${event.tenantId}) ` +
            `!= ctx.tenantId(${params.tenantId}). 거래 ${operationName} 차단.`,
          );
        }
        events.push(event);
      },
      beforeCommit: (fn) => {
        beforeCommitHooks.push(fn);
      },
    };

    // (1) actions 순차 실행 — throw 시 자동 rollback (withTransaction)
    for (const action of params.actions) {
      await action(ctx);
    }

    // (2) commit 직전 hooks (audit, 검증) — throw 시 자동 rollback
    for (const hook of beforeCommitHooks) {
      await hook();
    }

    // (3) 도메인 이벤트 outbox INSERT (같은 트랜잭션 안에서)
    //     rollback 시 outbox 도 함께 폐기 → 이벤트 일관성
    for (const event of events) {
      await publishEvent(event, conn);
    }

    return { events };
  }, operationName);
}
