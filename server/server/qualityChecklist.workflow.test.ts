/**
 * 체크리스트 작성 플로우 통합 테스트
 */

import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

describe("체크리스트 작성 플로우 통합 테스트", () => {
  it("템플릿 목록 조회", async () => {
    const caller = appRouter.createCaller({ user: { id: 1, role: "user" } });
    const templates = await caller.qualityChecklist.listTemplates({ isActive: true });
    expect(Array.isArray(templates)).toBe(true);
  });

  it("인스턴스 목록 조회", async () => {
    const caller = appRouter.createCaller({ user: { id: 1, role: "user" } });
    const instances = await caller.qualityChecklist.listInstances({});
    expect(Array.isArray(instances)).toBe(true);
  });

  it("통계 조회", async () => {
    const caller = appRouter.createCaller({ user: { id: 1, role: "user" } });
    const stats = await caller.qualityChecklist.getStatistics();
    expect(stats).toBeDefined();
    expect(typeof stats.inProgress).toBe("number");
    expect(typeof stats.completed).toBe("number");
    expect(typeof stats.pendingApproval).toBe("number");
  });
});
