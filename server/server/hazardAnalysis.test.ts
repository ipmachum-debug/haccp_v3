import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

/**
 * 위험 분석 시스템 API 테스트
 */

// 테스트용 컨텍스트 생성
const createTestContext = (userId: number = 1, role: "admin" | "user" = "admin"): Context => ({
  user: {
    id: userId,
    email: "test@example.com",
    name: "Test User",
    role,
    isActive: 1
  }
});

describe("위험 분석 시스템 (HACCP 원칙 1)", () => {
  let hazardAnalysisId: number;

  describe("위험 분석 생성", () => {
    it("새로운 위험 분석을 생성할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.hazardAnalysis.create({
        productId: 1,
        siteId: 1,
        processStep: "원료 입고",
        hazardType: "biological",
        hazardDescription: "병원성 미생물 오염 가능성",
        severity: 5,
        likelihood: 3,
        controlMeasures: "입고 검사 실시",
        monitoringProcedure: "미생물 검사",
        criticalLimit: "대장균 불검출",
        analyzedDate: "2026-01-20"
      });

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
      hazardAnalysisId = result.id;
    });
  });

  describe("위험 분석 조회", () => {
    it("ID로 위험 분석을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.hazardAnalysis.getById({ id: hazardAnalysisId });

      expect(result).toBeDefined();
      expect(result.processStep).toBe("원료 입고");
      expect(result.hazardType).toBe("biological");
      expect(result.riskScore).toBe(15); // 5 * 3
      expect(result.riskLevel).toBe("high");
    });

    it("제품별 위험 분석 목록을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.hazardAnalysis.listByProduct({ productId: 1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("위험도 계산", () => {
    it("심각도와 발생 가능성으로 위험도를 자동 계산해야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      
      // 낮은 위험도 (1-5)
      const lowRisk = await caller.hazardAnalysis.create({
        productId: 1,
        siteId: 1,
        processStep: "포장",
        hazardType: "physical",
        hazardDescription: "포장재 이물",
        severity: 1,
        likelihood: 2,
        analyzedDate: "2026-01-20"
      });

      const lowResult = await caller.hazardAnalysis.getById({ id: lowRisk.id });
      expect(lowResult.riskScore).toBe(2);
      expect(lowResult.riskLevel).toBe("low");

      // 중간 위험도 (6-10)
      const mediumRisk = await caller.hazardAnalysis.create({
        productId: 1,
        siteId: 1,
        processStep: "가열",
        hazardType: "biological",
        hazardDescription: "가열 불충분",
        severity: 3,
        likelihood: 3,
        analyzedDate: "2026-01-20"
      });

      const mediumResult = await caller.hazardAnalysis.getById({ id: mediumRisk.id });
      expect(mediumResult.riskScore).toBe(9);
      expect(mediumResult.riskLevel).toBe("medium");

      // 높은 위험도 (11-15)
      const highRisk = await caller.hazardAnalysis.create({
        productId: 1,
        siteId: 1,
        processStep: "냉각",
        hazardType: "biological",
        hazardDescription: "냉각 지연",
        severity: 4,
        likelihood: 4,
        analyzedDate: "2026-01-20"
      });

      const highResult = await caller.hazardAnalysis.getById({ id: highRisk.id });
      expect(highResult.riskScore).toBe(16);
      expect(highResult.riskLevel).toBe("critical");
    });
  });

  describe("위험 분석 수정", () => {
    it("위험 분석 정보를 수정할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      
      await caller.hazardAnalysis.update({
        id: hazardAnalysisId,
        isCcp: 1,
        ccpNumber: "CCP-1B",
        status: "approved"
      });

      const result = await caller.hazardAnalysis.getById({ id: hazardAnalysisId });
      expect(result.isCcp).toBe(1);
      expect(result.ccpNumber).toBe("CCP-1B");
      expect(result.status).toBe("approved");
    });

    it("심각도 변경 시 위험도가 재계산되어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      
      await caller.hazardAnalysis.update({
        id: hazardAnalysisId,
        severity: 2
      });

      const result = await caller.hazardAnalysis.getById({ id: hazardAnalysisId });
      expect(result.riskScore).toBe(6); // 2 * 3
      expect(result.riskLevel).toBe("medium");
    });
  });

  describe("CCP 관리", () => {
    it("CCP로 지정된 위험 분석만 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.hazardAnalysis.listCcp({ productId: 1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result.every((item) => item.isCcp === 1)).toBe(true);
    });
  });

  describe("위험 요소 관리 방법", () => {
    let controlId: number;

    it("위험 분석에 관리 방법을 추가할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.hazardAnalysis.addControl({
        hazardAnalysisId,
        controlType: "preventive",
        controlDescription: "입고 시 온도 확인",
        responsibility: "품질관리팀",
        frequency: "매 입고 시",
        recordForm: "입고 검사 기록서"
      });

      expect(result).toHaveProperty("id");
      controlId = result.id;
    });

    it("위험 분석별 관리 방법 목록을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.hazardAnalysis.listControls({ hazardAnalysisId });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("관리 방법을 수정할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await caller.hazardAnalysis.updateControl({
        id: controlId,
        frequency: "매일 2회"
      });

      const result = await caller.hazardAnalysis.listControls({ hazardAnalysisId });
      const updated = result.find((c) => c.id === controlId);
      expect(updated?.frequency).toBe("매일 2회");
    });
  });
});
