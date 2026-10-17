/**
 * autoMaterialIssueDispatcher — 자동출고 공통 진입점 (2026-10-17)
 * 엔진·잠금은 mock — 회사 확인, 잠금 실패 시 busy, 엔진 하나(v2 분기 없음) 만 검증.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const state = { locked: true };
const mockEngine = vi.fn(async (..._args: any[]) => ({ success: true, issuedMaterials: [], totalCost: 0, warnings: [], errors: [] }));

vi.mock("./autoMaterialIssue", () => ({
  autoIssueMaterialsForBatch: (batchId: number, userId: number, tenantId: number) => mockEngine(batchId, userId, tenantId),
}));
vi.mock("./batchIssueLock", () => ({
  withBatchIssueLock: vi.fn(async (_t: number, _b: number, fn: () => Promise<any>) => (state.locked ? { locked: true, value: await fn() } : { locked: false })),
}));

import { autoIssueMaterialsDispatch } from "./autoMaterialIssueDispatcher";

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  mockEngine.mockClear();
  state.locked = true;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("autoIssueMaterialsDispatch", () => {
  it("엔진에 회사까지 넘긴다", async () => {
    await autoIssueMaterialsDispatch(7, 4, 2);
    expect(mockEngine).toHaveBeenCalledWith(7, 4, 2);
  });

  it("회사 없으면 거부 (엔진 호출 없음)", async () => {
    await expect(autoIssueMaterialsDispatch(7, 4, 0)).rejects.toThrow(/테넌트/);
    expect(mockEngine).not.toHaveBeenCalled();
  });

  it("잠금을 못 잡으면 busy, 출고 없음", async () => {
    state.locked = false;
    const r = await autoIssueMaterialsDispatch(7, 4, 2);
    expect(r).toMatchObject({ success: false, busy: true });
    expect(mockEngine).not.toHaveBeenCalled();
  });

  it("예전 v2 플래그가 있어도 같은 엔진 (분기 없음)", async () => {
    process.env.USE_AUTO_ISSUE_V2 = "true";
    process.env.USE_AUTO_ISSUE_V2_TENANTS = "2";
    await autoIssueMaterialsDispatch(7, 4, 2);
    expect(mockEngine).toHaveBeenCalledTimes(1);
  });
});
