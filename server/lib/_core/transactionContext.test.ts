/**
 * TransactionContext 단위 테스트 (F2-1).
 *
 * 검증 항목:
 *   - actions 순차 실행
 *   - emit() tenant 격리 강제
 *   - beforeCommit hooks 순서
 *   - 이벤트 publishEvent 호출
 *   - actions throw 시 rollback (withTransaction 위임)
 *   - hooks throw 시 rollback
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PoolConnection } from "mysql2/promise";

// withTransaction / publishEvent 모듈 mock
// 실제 DB 없이 핵심 로직만 검증
const mockConn = {} as PoolConnection;
const mockWithTransaction = vi.fn(
  async <T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> => {
    return await fn(mockConn);
  },
);
const mockPublishEvent = vi.fn(async () => 1);

vi.mock("../../db/connection", () => ({
  withTransaction: (fn: any, op?: string) => mockWithTransaction(fn, op),
}));

vi.mock("../../platform/event-bus", () => ({
  publishEvent: (...args: any[]) => mockPublishEvent(...args),
}));

// mock 설정 후 import (순서 중요 — vi.mock 은 hoisted 됨)
import { postWithinTransaction } from "./transactionContext";

describe("postWithinTransaction", () => {
  beforeEach(() => {
    mockWithTransaction.mockClear();
    mockPublishEvent.mockClear();
  });

  describe("정상 흐름", () => {
    it("actions 가 순차 실행됨", async () => {
      const calls: string[] = [];
      await postWithinTransaction({
        sourceType: "BATCH",
        sourceId: 100,
        tenantId: 2,
        actions: [
          async () => { calls.push("action-1"); },
          async () => { calls.push("action-2"); },
          async () => { calls.push("action-3"); },
        ],
      });

      expect(calls).toEqual(["action-1", "action-2", "action-3"]);
    });

    it("emit() 한 이벤트가 publishEvent 로 전달됨", async () => {
      const result = await postWithinTransaction({
        sourceType: "BATCH",
        sourceId: 100,
        tenantId: 2,
        actions: [
          async (ctx) => {
            ctx.emit({
              tenantId: 2,
              eventType: "lot.consumed",
              aggregateType: "lot",
              aggregateId: 50,
              payload: { quantity: 10 },
            });
            ctx.emit({
              tenantId: 2,
              eventType: "journal.posted",
              aggregateType: "journal_entry",
              aggregateId: 200,
              payload: { sourceType: "BATCH" },
            });
          },
        ],
      });

      expect(mockPublishEvent).toHaveBeenCalledTimes(2);
      expect(result.events).toHaveLength(2);
      expect(result.events[0]?.eventType).toBe("lot.consumed");
      expect(result.events[1]?.eventType).toBe("journal.posted");
    });

    it("beforeCommit hooks 가 등록 순서대로 실행됨", async () => {
      const order: string[] = [];
      await postWithinTransaction({
        sourceType: "BATCH",
        sourceId: 100,
        tenantId: 2,
        actions: [
          async (ctx) => {
            ctx.beforeCommit(async () => { order.push("hook-1"); });
            ctx.beforeCommit(async () => { order.push("hook-2"); });
            order.push("action");
          },
        ],
      });

      expect(order).toEqual(["action", "hook-1", "hook-2"]);
    });

    it("operationName 이 withTransaction 에 전달됨", async () => {
      await postWithinTransaction({
        sourceType: "PURCHASE",
        sourceId: 999,
        tenantId: 2,
        operationName: "test-op",
        actions: [async () => {}],
      });

      expect(mockWithTransaction).toHaveBeenCalledWith(
        expect.any(Function),
        "test-op",
      );
    });

    it("operationName 미설정 시 sourceType:sourceId 사용", async () => {
      await postWithinTransaction({
        sourceType: "SALE",
        sourceId: 42,
        tenantId: 2,
        actions: [async () => {}],
      });

      expect(mockWithTransaction).toHaveBeenCalledWith(
        expect.any(Function),
        "SALE:42",
      );
    });

    it("이벤트 0개일 때 publishEvent 미호출", async () => {
      await postWithinTransaction({
        sourceType: "BATCH",
        sourceId: 100,
        tenantId: 2,
        actions: [async () => { /* emit 없음 */ }],
      });

      expect(mockPublishEvent).not.toHaveBeenCalled();
    });
  });

  describe("tenant 격리 강제", () => {
    it("emit() event.tenantId 가 ctx.tenantId 와 다르면 throw", async () => {
      await expect(
        postWithinTransaction({
          sourceType: "BATCH",
          sourceId: 100,
          tenantId: 2,
          actions: [
            async (ctx) => {
              ctx.emit({
                tenantId: 999, // 의도적 불일치
                eventType: "lot.consumed",
                aggregateType: "lot",
                aggregateId: 50,
                payload: {},
              });
            },
          ],
        }),
      ).rejects.toThrow(/tenant.*격리|tenantId.*\(999\)/i);

      // 이벤트 발행 안 됨
      expect(mockPublishEvent).not.toHaveBeenCalled();
    });
  });

  describe("실패 흐름 (rollback)", () => {
    it("action throw 시 publishEvent 미호출 (이벤트 outbox 미발행)", async () => {
      await expect(
        postWithinTransaction({
          sourceType: "BATCH",
          sourceId: 100,
          tenantId: 2,
          actions: [
            async (ctx) => {
              ctx.emit({
                tenantId: 2,
                eventType: "lot.consumed",
                aggregateType: "lot",
                aggregateId: 50,
                payload: {},
              });
            },
            async () => {
              throw new Error("의도적 실패");
            },
          ],
        }),
      ).rejects.toThrow("의도적 실패");

      // emit 됐어도 publishEvent 호출 안 됨 (action throw 가 먼저)
      expect(mockPublishEvent).not.toHaveBeenCalled();
    });

    it("beforeCommit hook throw 시 publishEvent 미호출", async () => {
      await expect(
        postWithinTransaction({
          sourceType: "BATCH",
          sourceId: 100,
          tenantId: 2,
          actions: [
            async (ctx) => {
              ctx.emit({
                tenantId: 2,
                eventType: "lot.consumed",
                aggregateType: "lot",
                aggregateId: 50,
                payload: {},
              });
              ctx.beforeCommit(async () => {
                throw new Error("hook 실패");
              });
            },
          ],
        }),
      ).rejects.toThrow("hook 실패");

      expect(mockPublishEvent).not.toHaveBeenCalled();
    });
  });

  describe("ctx 사용 패턴 (특허 [0014] 시나리오 — 식품 배치 자동출고)", () => {
    it("(i) 규정 → (ii) 재고 → (iii) 회계 순서로 actions 실행 + 이벤트 발행", async () => {
      const order: string[] = [];

      const result = await postWithinTransaction({
        sourceType: "BATCH",
        sourceId: 565,
        tenantId: 2,
        userId: 1,
        actions: [
          // (i) 규정 — LOT FEFO 할당
          async (ctx) => {
            order.push("compliance");
            ctx.emit({
              tenantId: ctx.tenantId,
              eventType: "lot.consumed",
              aggregateType: "lot",
              aggregateId: 101,
              payload: { quantity: 50 },
              createdBy: ctx.userId,
            });
          },
          // (ii) 재고 — inventory 차감
          async (ctx) => {
            order.push("inventory");
            ctx.emit({
              tenantId: ctx.tenantId,
              eventType: "inventory.changed",
              aggregateType: "inventory",
              aggregateId: 1,
              payload: { materialId: 645, delta: -50 },
            });
          },
          // (iii) 회계 — 분개
          async (ctx) => {
            order.push("accounting");
            ctx.emit({
              tenantId: ctx.tenantId,
              eventType: "journal.posted",
              aggregateType: "journal_entry",
              aggregateId: 200,
              payload: { sourceType: ctx.sourceType, sourceId: ctx.sourceId },
            });
          },
        ],
      });

      expect(order).toEqual(["compliance", "inventory", "accounting"]);
      expect(result.events).toHaveLength(3);
      expect(mockPublishEvent).toHaveBeenCalledTimes(3);
      // 모든 이벤트가 같은 tenant
      expect(result.events.every((e) => e.tenantId === 2)).toBe(true);
    });
  });
});
