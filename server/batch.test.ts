import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    email: "test@example.com",
    name: "Test User",
    passwordHash: "hashed",
    role: "user",
    isActive: 1
    lastLoginAt: new Date()
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {}
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {}
    } as TrpcContext["res"]
  };

  return { ctx };
}

describe("batch API", () => {
  it("should create, get, update, and delete a batch", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // 1. 배치 생성
    const createResult = await caller.batch.create({
      siteId: 1,
      productId: 1,
      batchNumber: `BATCH-TEST-${Date.now()}`,
      plannedQuantity: 1000,
      plannedStartDate: new Date()
    });

    expect(createResult.success).toBe(true);
    expect(createResult.batchId).toBeDefined();
    expect(typeof createResult.batchId).toBe("number");
    expect(createResult.message).toBe("배치가 생성되었습니다.");

    const batchId = createResult.batchId as number;

    // 2. 배치 조회
    const batch = await caller.batch.getById({ id: batchId });

    expect(batch).toBeDefined();
    expect(batch.id).toBe(batchId);

    // 3. 배치 상태 변경
    const updateResult = await caller.batch.updateStatus({
      id: batchId,
      status: "in_progress"
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.message).toBe("배치 상태가 변경되었습니다.");

    // 4. 배치 삭제
    const deleteResult = await caller.batch.delete({ id: batchId });

    expect(deleteResult.success).toBe(true);
    expect(deleteResult.message).toBe("배치가 삭제되었습니다.");
  });

  it("should list all batches", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const batches = await caller.batch.list();

    expect(Array.isArray(batches)).toBe(true);
  });
});
