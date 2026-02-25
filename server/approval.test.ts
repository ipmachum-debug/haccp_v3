import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

describe("Approval Workflow API Tests", () => {
  let adminCaller: ReturnType<typeof appRouter.createCaller>;
  let workerCaller: ReturnType<typeof appRouter.createCaller>;
  let inspectorCaller: ReturnType<typeof appRouter.createCaller>;
  let requestId: number;

  beforeAll(async () => {
    // Admin context (관리자)
    adminCaller = appRouter.createCaller({
      user: {
        id: 1,
        email: "admin@test.com",
        name: "Admin User",
        role: "admin",
        siteId: 1,
        isActive: 1
      }
    } as Context);

    // Worker context (작업자)
    workerCaller = appRouter.createCaller({
      user: {
        id: 2,
        email: "worker@test.com",
        name: "Worker User",
        role: "worker",
        siteId: 1,
        isActive: 1
      }
    } as Context);

    // Inspector context (검사자)
    inspectorCaller = appRouter.createCaller({
      user: {
        id: 3,
        email: "inspector@test.com",
        name: "Inspector User",
        role: "inspector",
        siteId: 1,
        isActive: 1
      }
    } as Context);
  });

  it("should create approval request", async () => {
    const result = await workerCaller.approval.createRequest({
      requestType: "batch_approval",
      referenceType: "batch",
      referenceId: 1,
      title: "배치 #1 생산 승인 요청",
      description: "배치 #1의 생산을 승인해주세요.",
      priority: "high"
    });

    expect(result.success).toBe(true);
    expect(result.requestId).toBeGreaterThan(0);
    requestId = result.requestId;
  });

  it("should list approval requests", async () => {
    const requests = await adminCaller.approval.list({
      status: "pending"
    });

    expect(Array.isArray(requests)).toBe(true);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests[0]).toHaveProperty("id");
    expect(requests[0]).toHaveProperty("title");
    expect(requests[0]).toHaveProperty("status");
  });

  it("should get approval request by id", async () => {
    const request = await adminCaller.approval.getById({ id: requestId });

    expect(request).toBeDefined();
    expect(request?.id).toBe(requestId);
    expect(request?.title).toBe("배치 #1 생산 승인 요청");
    expect(request?.status).toBe("pending");
  });

  it("should approve request", async () => {
    const result = await inspectorCaller.approval.approve({
      requestId,
      notes: "승인합니다."
    });

    expect(result.success).toBe(true);

    // 승인 후 상태 확인
    const request = await adminCaller.approval.getById({ id: requestId });
    expect(request?.status).toBe("approved");
    expect(request?.approvedBy).toBe(3); // inspector id
  });

  it("should get approval history", async () => {
    const history = await adminCaller.approval.getHistory({ requestId });

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]).toHaveProperty("action");
    expect(history[0]).toHaveProperty("actionBy");
    expect(history[0]).toHaveProperty("actionAt");
  });

  it("should create and reject approval request", async () => {
    // 새로운 승인 요청 생성
    const createResult = await workerCaller.approval.createRequest({
      requestType: "inventory_adjustment",
      referenceType: "inventory",
      referenceId: 1,
      title: "재고 조정 승인 요청",
      description: "재고 조정을 승인해주세요.",
      priority: "medium"
    });

    expect(createResult.success).toBe(true);
    const newRequestId = createResult.requestId;

    // 거부 처리
    const rejectResult = await inspectorCaller.approval.reject({
      requestId: newRequestId,
      rejectionReason: "재고 수량이 맞지 않습니다."
    });

    expect(rejectResult.success).toBe(true);

    // 거부 후 상태 확인
    const request = await adminCaller.approval.getById({ id: newRequestId });
    expect(request?.status).toBe("rejected");
    expect(request?.rejectedBy).toBe(3); // inspector id
    expect(request?.rejectionReason).toBe("재고 수량이 맞지 않습니다.");
  });

  it("should create and cancel approval request", async () => {
    // 새로운 승인 요청 생성
    const createResult = await workerCaller.approval.createRequest({
      requestType: "material_inspection",
      referenceType: "inspection",
      referenceId: 1,
      title: "원재료 검사 승인 요청",
      description: "원재료 검사를 승인해주세요.",
      priority: "low"
    });

    expect(createResult.success).toBe(true);
    const newRequestId = createResult.requestId;

    // 취소 처리
    const cancelResult = await workerCaller.approval.cancelRequest({
      requestId: newRequestId,
      reason: "잘못 요청했습니다."
    });

    expect(cancelResult.success).toBe(true);

    // 취소 후 상태 확인
    const request = await adminCaller.approval.getById({ id: newRequestId });
    expect(request?.status).toBe("cancelled");
  });

  it("should get pending approval count", async () => {
    const count = await adminCaller.approval.getPendingCount();

    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
