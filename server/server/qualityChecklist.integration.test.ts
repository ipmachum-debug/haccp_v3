/**
 * 품질 체크리스트 시스템 통합 테스트 (간소화 버전)
 */

import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

describe("품질 체크리스트 시스템 통합 테스트", () => {
  it("템플릿 목록 조회", async () => {
    const caller = appRouter.createCaller({ user: { id: 1, role: "user" } });
    const templates = await caller.qualityChecklist.listTemplates({ isActive: true });
    expect(Array.isArray(templates)).toBe(true);
  });

  it("체크리스트 인스턴스 목록 조회", async () => {
    const caller = appRouter.createCaller({ user: { id: 1, role: "user" } });
    const instances = await caller.qualityChecklist.listInstances({});
    expect(Array.isArray(instances)).toBe(true);
  });

  it("승인 대기 목록 조회", async () => {
    const caller = appRouter.createCaller({ user: { id: 1, role: "user" } });
    const pending = await caller.qualityChecklist.getPendingApprovals();
    expect(Array.isArray(pending)).toBe(true);
  });
});
