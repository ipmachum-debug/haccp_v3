import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

/**
 * 시정 조치 관리 시스템 API 테스트
 */

const createTestContext = (userId: number = 1, role: "admin" | "user" = "admin"): Context => ({
  user: {
    id: userId,
    email: "test@example.com",
    name: "Test User",
    role,
    isActive: 1
  }
});

describe("시정 조치 관리 시스템", () => {
  let requestId: number;

  describe("시정 조치 요청 생성", () => {
    it("새로운 시정 조치 요청을 생성할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.correctiveAction.create({
        sourceType: "ccp_deviation",
        sourceId: 1,
        batchId: 1,
        ccpInstanceId: 1,
        problemDescription: "CCP 한계기준 이탈: 가열 온도 75°C 미만",
        occurredAt: new Date().toISOString(),
        immediateAction: "해당 배치 격리 및 재가열 실시",
        priority: "high"
      });

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
      requestId = result.id;
    });

    it("CCP 이탈 시 자동으로 시정 조치를 생성할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.correctiveAction.createFromCcpDeviation({
        ccpInstanceId: 1,
        batchId: 1,
        problemDescription: "냉각 온도 한계기준 초과"
      });

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
    });
  });

  describe("시정 조치 요청 조회", () => {
    it("ID로 시정 조치 요청을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.correctiveAction.getById({ id: requestId });

      expect(result).toBeDefined();
      expect(result.sourceType).toBe("ccp_deviation");
      expect(result.priority).toBe("high");
      expect(result.status).toBe("open");
    });

    it("배치별 시정 조치 목록을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.correctiveAction.listByBatch({ batchId: 1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("상태별 시정 조치 목록을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.correctiveAction.listByStatus({ status: "open" });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("시정 조치 프로세스", () => {
    it("즉시 조치를 등록할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.correctiveAction.recordImmediateAction({
        id: requestId,
        immediateAction: "배치 격리 및 재가열 완료"
      });

      expect(result.success).toBe(true);

      const updated = await caller.correctiveAction.getById({ id: requestId });
      expect(updated.status).toBe("investigating");
      expect(updated.immediateAction).toBe("배치 격리 및 재가열 완료");
    });

    it("근본 원인 분석을 등록할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.correctiveAction.recordRootCause({
        id: requestId,
        rootCauseAnalysis: "가열 장비 온도 센서 오작동",
        rootCauseCategory: "equipment_failure"
      });

      expect(result.success).toBe(true);

      const updated = await caller.correctiveAction.getById({ id: requestId });
      expect(updated.rootCauseCategory).toBe("equipment_failure");
    });

    it("시정 조치를 등록할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const today = new Date().toISOString().split("T")[0];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const result = await caller.correctiveAction.recordCorrectiveAction({
        id: requestId,
        correctiveAction: "온도 센서 교체 및 재검증",
        actionStartDate: today,
        actionDueDate: dueDate.toISOString().split("T")[0],
        preventiveAction: "월 1회 센서 정기 점검 실시"
      });

      expect(result.success).toBe(true);

      const updated = await caller.correctiveAction.getById({ id: requestId });
      expect(updated.status).toBe("action_taken");
      expect(updated.correctiveAction).toBe("온도 센서 교체 및 재검증");
    });

    it("조치 완료를 처리할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const today = new Date().toISOString().split("T")[0];

      const result = await caller.correctiveAction.completeAction({
        id: requestId,
        actionCompletedDate: today
      });

      expect(result.success).toBe(true);

      const updated = await caller.correctiveAction.getById({ id: requestId });
      expect(updated.status).toBe("verifying");
    });

    it("효과를 검증할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const today = new Date().toISOString().split("T")[0];

      const result = await caller.correctiveAction.verifyEffectiveness({
        id: requestId,
        verificationMethod: "온도 센서 재검증 및 3일간 모니터링",
        verificationResult: "정상 작동 확인, 한계기준 준수",
        isEffective: 1,
        verifiedDate: today
      });

      expect(result.success).toBe(true);

      const updated = await caller.correctiveAction.getById({ id: requestId });
      expect(updated.status).toBe("closed");
      expect(updated.isEffective).toBe(1);
    });
  });

  describe("우선순위 관리", () => {
    it("우선순위를 변경할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      
      await caller.correctiveAction.updatePriority({
        id: requestId,
        priority: "critical"
      });

      const result = await caller.correctiveAction.getById({ id: requestId });
      expect(result.priority).toBe("critical");
    });
  });

  describe("첨부 파일 관리", () => {
    let attachmentId: number;

    it("첨부 파일을 추가할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.correctiveAction.addAttachment({
        requestId,
        fileName: "sensor_replacement_report.pdf",
        fileUrl: "https://example.com/files/sensor_report.pdf",
        fileType: "application/pdf",
        fileSize: 1024000
      });

      expect(result).toHaveProperty("id");
      attachmentId = result.id;
    });

    it("첨부 파일 목록을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.correctiveAction.listAttachments({ requestId });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("첨부 파일을 삭제할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.correctiveAction.deleteAttachment({ id: attachmentId });

      expect(result.success).toBe(true);
    });
  });
});
