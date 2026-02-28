import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

describe("Inspection System Integration Tests", () => {
  let adminContext: any;
  let workerContext: any;
  let inspectorContext: any;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // 테스트 사용자 생성
    const hashedPassword = await bcrypt.hash("password123", 10);

    // Admin 사용자
    const timestamp = Date.now();
    const [adminUser] = await db
      .insert(users)
      .values({
        email: `admin-inspection-${timestamp}@test.com`,
        name: "Admin Inspection",
        passwordHash: hashedPassword,
        role: "admin",
        isActive: true
      })
      .$returningId();

    adminContext = {
      user: {
        id: adminUser.id,
        openId: `test-${adminUser.id}`,
        email: `admin-inspection-${timestamp}@test.com`,
        name: "Admin Inspection",
        loginMethod: "manus" as const,
        role: "admin" as any
        lastSignedIn: new Date()
      },
      req: {} as any,
      res: {} as any
    };

    // Worker 사용자
    const [workerUser] = await db
      .insert(users)
      .values({
        email: `worker-inspection-${timestamp}@test.com`,
        name: "Worker Inspection",
        passwordHash: hashedPassword,
        role: "worker",
        isActive: true
      })
      .$returningId();

    workerContext = {
      user: {
        id: workerUser.id,
        openId: `test-${workerUser.id}`,
        email: `worker-inspection-${timestamp}@test.com`,
        name: "Worker Inspection",
        loginMethod: "manus" as const,
        role: "worker" as any
        lastSignedIn: new Date()
      },
      req: {} as any,
      res: {} as any
    };

    // Inspector 사용자
    const [inspectorUser] = await db
      .insert(users)
      .values({
        email: `inspector-inspection-${timestamp}@test.com`,
        name: "Inspector Inspection",
        passwordHash: hashedPassword,
        role: "inspector",
        isActive: true
      })
      .$returningId();

    inspectorContext = {
      user: {
        id: inspectorUser.id,
        openId: `test-${inspectorUser.id}`,
        email: `inspector-inspection-${timestamp}@test.com`,
        name: "Inspector Inspection",
        loginMethod: "manus" as const,
        role: "inspector" as any
        lastSignedIn: new Date()
      },
      req: {} as any,
      res: {} as any
    };
  });

  describe("Material Inspection", () => {
    it("should create material inspection record (worker)", async () => {
      const caller = appRouter.createCaller(workerContext);

      const result = await caller.inspection.material.create({
        materialId: 1,
        materialCode: "MAT-001",
        materialName: "돼지고기",
        lotNumber: "LOT-20260119-001",
        inspectionDate: "2026-01-19",
        inspectorName: "Worker Inspection",
        supplierName: "공급업체A",
        notes: "테스트 검사",
        items: [
          {
            itemName: "외관 검사",
            standard: "이물질 없음",
            result: "양호",
            passed: "pass",
            sortOrder: 1
          },
          {
            itemName: "냄새 검사",
            standard: "이취 없음",
            result: "양호",
            passed: "pass",
            sortOrder: 2
          },
        ]
      });

      expect(result.success).toBe(true);
      expect(result.recordId).toBeGreaterThan(0);
    });

    it("should list material inspection records", async () => {
      const caller = appRouter.createCaller(workerContext);

      const records = await caller.inspection.material.list({});

      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeGreaterThan(0);
    });

    it("should get material inspection record by id", async () => {
      const caller = appRouter.createCaller(workerContext);

      // 먼저 검사 기록 생성
      const createResult = await caller.inspection.material.create({
        materialId: 2,
        materialCode: "MAT-002",
        materialName: "쇠고기",
        lotNumber: "LOT-20260119-002",
        inspectionDate: "2026-01-19",
        inspectorName: "Worker Inspection",
        items: [
          {
            itemName: "외관 검사",
            standard: "이물질 없음",
            result: "양호",
            passed: "pass",
            sortOrder: 1
          },
        ]
      });

      const record = await caller.inspection.material.getById({
        id: createResult.recordId
      });

      expect(record).toBeDefined();
      expect(record?.materialCode).toBe("MAT-002");
      expect(record?.items.length).toBeGreaterThan(0);
    });

    it("should update material inspection status", async () => {
      const caller = appRouter.createCaller(workerContext);

      // 먼저 검사 기록 생성
      const createResult = await caller.inspection.material.create({
        materialId: 3,
        materialCode: "MAT-003",
        materialName: "닭고기",
        lotNumber: "LOT-20260119-003",
        inspectionDate: "2026-01-19",
        inspectorName: "Worker Inspection",
        items: [
          {
            itemName: "외관 검사",
            standard: "이물질 없음",
            result: "양호",
            passed: "pass",
            sortOrder: 1
          },
        ]
      });

      const result = await caller.inspection.material.updateStatus({
        id: createResult.recordId,
        status: "completed",
        inspectionResult: "pass"
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Shipping Inspection", () => {
    it("should create shipping inspection record (worker)", async () => {
      const caller = appRouter.createCaller(workerContext);

      const result = await caller.inspection.shipping.create({
        batchId: 1,
        batchCode: "BATCH-001",
        productCode: "PROD-001",
        productName: "햄버거 패티",
        inspectionDate: "2026-01-19",
        inspectorName: "Worker Inspection",
        quantity: "1000개",
        notes: "테스트 출하 검사",
        items: [
          {
            itemName: "외관 검사",
            standard: "포장 상태 양호",
            result: "양호",
            passed: "pass",
            sortOrder: 1
          },
          {
            itemName: "중량 검사",
            standard: "100g ± 5g",
            result: "102g",
            passed: "pass",
            sortOrder: 2
          },
        ]
      });

      expect(result.success).toBe(true);
      expect(result.recordId).toBeGreaterThan(0);
    });

    it("should list shipping inspection records", async () => {
      const caller = appRouter.createCaller(workerContext);

      const records = await caller.inspection.shipping.list({});

      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeGreaterThan(0);
    });

    it("should update shipping inspection status", async () => {
      const caller = appRouter.createCaller(workerContext);

      // 먼저 검사 기록 생성
      const createResult = await caller.inspection.shipping.create({
        batchId: 2,
        batchCode: "BATCH-002",
        productCode: "PROD-002",
        productName: "소시지",
        inspectionDate: "2026-01-19",
        inspectorName: "Worker Inspection",
        items: [
          {
            itemName: "외관 검사",
            standard: "포장 상태 양호",
            result: "양호",
            passed: "pass",
            sortOrder: 1
          },
        ]
      });

      const result = await caller.inspection.shipping.updateStatus({
        id: createResult.recordId,
        status: "completed",
        inspectionResult: "pass"
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Hygiene Inspection", () => {
    it("should create hygiene inspection record (worker)", async () => {
      const caller = appRouter.createCaller(workerContext);

      const result = await caller.inspection.hygiene.create({
        inspectionDate: "2026-01-19",
        inspectionArea: "생산 라인 A",
        inspectorName: "Worker Inspection",
        notes: "테스트 위생 검사",
        items: [
          {
            itemName: "바닥 청결도",
            standard: "이물질 없음",
            result: "양호",
            passed: "pass",
            sortOrder: 1
          },
          {
            itemName: "벽면 청결도",
            standard: "오염 없음",
            result: "양호",
            passed: "pass",
            sortOrder: 2
          },
        ]
      });

      expect(result.success).toBe(true);
      expect(result.recordId).toBeGreaterThan(0);
    });

    it("should list hygiene inspection records", async () => {
      const caller = appRouter.createCaller(workerContext);

      const records = await caller.inspection.hygiene.list({});

      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeGreaterThan(0);
    });

    it("should update hygiene inspection status", async () => {
      const caller = appRouter.createCaller(workerContext);

      // 먼저 검사 기록 생성
      const createResult = await caller.inspection.hygiene.create({
        inspectionDate: "2026-01-19",
        inspectionArea: "생산 라인 B",
        inspectorName: "Worker Inspection",
        items: [
          {
            itemName: "바닥 청결도",
            standard: "이물질 없음",
            result: "양호",
            passed: "pass",
            sortOrder: 1
          },
        ]
      });

      const result = await caller.inspection.hygiene.updateStatus({
        id: createResult.recordId,
        status: "completed",
        result: "good"
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Role-based Access Control", () => {
    it("should allow inspector to view inspection records", async () => {
      const caller = appRouter.createCaller(inspectorContext);

      const materialRecords = await caller.inspection.material.list({});
      const shippingRecords = await caller.inspection.shipping.list({});
      const hygieneRecords = await caller.inspection.hygiene.list({});

      expect(Array.isArray(materialRecords)).toBe(true);
      expect(Array.isArray(shippingRecords)).toBe(true);
      expect(Array.isArray(hygieneRecords)).toBe(true);
    });

    it("should allow admin to create inspection records", async () => {
      const caller = appRouter.createCaller(adminContext);

      const result = await caller.inspection.material.create({
        materialId: 4,
        materialCode: "MAT-004",
        materialName: "양파",
        lotNumber: "LOT-20260119-004",
        inspectionDate: "2026-01-19",
        inspectorName: "Admin Inspection",
        items: [
          {
            itemName: "외관 검사",
            standard: "신선도 양호",
            result: "양호",
            passed: "pass",
            sortOrder: 1
          },
        ]
      });

      expect(result.success).toBe(true);
    });
  });
});
