import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("감사 로그 및 역할별 UI 통합 테스트", () => {
  let adminCaller: ReturnType<typeof appRouter.createCaller>;
  let workerCaller: ReturnType<typeof appRouter.createCaller>;
  let inspectorCaller: ReturnType<typeof appRouter.createCaller>;
  let userCaller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const { getDb } = await import("./db");
    const { users } = await import("../drizzle/schema");
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    // 테스트 사용자 생성 (고유한 이메일 사용)
    const timestamp = Date.now();
    const [admin] = await db
      .insert(users)
      .values({
        email: `admin-${timestamp}@test.com`,
        name: "Admin User",
        passwordHash: "test",
        role: "admin",
        isActive: 1
      })
      .$returningId();

    const [worker] = await db
      .insert(users)
      .values({
        email: `worker-${timestamp}@test.com`,
        name: "Worker User",
        passwordHash: "test",
        role: "worker",
        isActive: 1
      })
      .$returningId();

    const [inspector] = await db
      .insert(users)
      .values({
        email: `inspector-${timestamp}@test.com`,
        name: "Inspector User",
        passwordHash: "test",
        role: "inspector",
        isActive: 1
      })
      .$returningId();

    const [user] = await db
      .insert(users)
      .values({
        email: `user-${timestamp}@test.com`,
        name: "Regular User",
        passwordHash: "test",
        role: "user",
        isActive: 1
      })
      .$returningId();

    // Caller 생성
    const createMockContext = (userId: number, email: string, role: string): TrpcContext => ({
      user: {
        id: userId,
        openId: `test-${userId}`,
        email,
        name: email.split("@")[0],
        loginMethod: "manus" as const,
        role: role as any
        lastSignedIn: new Date()
      },
      req: {} as any,
      res: {} as any
    });

    adminCaller = appRouter.createCaller(createMockContext(admin.id, `admin-${timestamp}@test.com`, "admin"));
    workerCaller = appRouter.createCaller(createMockContext(worker.id, `worker-${timestamp}@test.com`, "worker"));
    inspectorCaller = appRouter.createCaller(createMockContext(inspector.id, `inspector-${timestamp}@test.com`, "inspector"));
    userCaller = appRouter.createCaller(createMockContext(user.id, `user-${timestamp}@test.com`, "user"));
  });

  describe("감사 로그 기능", () => {
    it("배치 생성 시 감사 로그가 기록되어야 함", async () => {
      // 배치 생성
      const batch = await workerCaller.batch.create({
        batchNumber: "TEST-BATCH-001",
        siteId: 1,
        productId: 1,
        plannedQuantity: 100,
        plannedStartDate: new Date()
      });

      expect(batch.success).toBe(true);
      expect(batch.batchId).toBeDefined();

      // 감사 로그 확인
      const logs = await adminCaller.auditLog.getByEntity({
        entityType: "batch",
        entityId: batch.batchId
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe("batch.create");
      expect(logs[0].entityType).toBe("batch");
      expect(logs[0].entityId).toBe(batch.batchId);
    });

    it("사용자 역할 변경 시 감사 로그가 기록되어야 함", async () => {
      const { getDb } = await import("./db");
      const { users } = await import("../drizzle/schema");
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      // 테스트 사용자 생성
      const timestamp = Date.now();
      const [testUser] = await db
        .insert(users)
        .values({
          email: `test-role-change-${timestamp}@test.com`,
          name: "Test User",
          passwordHash: "test",
          role: "user",
          isActive: 1
        })
        .$returningId();

      // 역할 변경
      await adminCaller.user.updateRole({
        userId: testUser.id,
        role: "worker"
      });

      // 감사 로그 확인
      const logs = await adminCaller.auditLog.getByEntity({
        entityType: "user",
        entityId: testUser.id
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe("user.updateRole");
      expect(logs[0].description).toContain("worker");
    });

    it("관리자만 전체 감사 로그를 조회할 수 있어야 함", async () => {
      // 관리자는 조회 가능
      const adminLogs = await adminCaller.auditLog.list({ limit: 10 });
      expect(Array.isArray(adminLogs)).toBe(true);

      // 일반 사용자는 조회 불가
      await expect(userCaller.auditLog.list({ limit: 10 })).rejects.toThrow();
    });
  });

  describe("역할별 API 접근 제어", () => {
    it("작업자는 배치를 생성할 수 있어야 함", async () => {
      const result = await workerCaller.batch.create({
        batchNumber: "WORKER-BATCH-001",
        siteId: 1,
        productId: 1,
        plannedQuantity: 100,
        plannedStartDate: new Date()
      });

      expect(result.success).toBe(true);
    });

    it("일반 사용자는 배치를 생성할 수 없어야 함", async () => {
      await expect(
        userCaller.batch.create({
          batchNumber: "USER-BATCH-001",
          siteId: 1,
          productId: 1,
          plannedQuantity: 100,
          plannedStartDate: new Date()
        })
      ).rejects.toThrow();
    });

    it("관리자만 사용자 목록을 조회할 수 있어야 함", async () => {
      // 관리자는 조회 가능
      const users = await adminCaller.user.list();
      expect(Array.isArray(users)).toBe(true);

      // 작업자는 조회 불가
      await expect(workerCaller.user.list()).rejects.toThrow();

      // 일반 사용자는 조회 불가
      await expect(userCaller.user.list()).rejects.toThrow();
    });

    it("관리자만 사용자 역할을 변경할 수 있어야 함", async () => {
      const { getDb } = await import("./db");
      const { users } = await import("../drizzle/schema");
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const timestamp = Date.now();
      const [testUser] = await db
        .insert(users)
        .values({
          email: `test-role-update-${timestamp}@test.com`,
          name: "Test User",
          passwordHash: "test",
          role: "user",
          isActive: 1
        })
        .$returningId();

      // 관리자는 역할 변경 가능
      await adminCaller.user.updateRole({
        userId: testUser.id,
        role: "worker"
      });

      // 작업자는 역할 변경 불가
      await expect(
        workerCaller.user.updateRole({
          userId: testUser.id,
          role: "admin"
        })
      ).rejects.toThrow();
    });
  });

  describe("역할별 대시보드 데이터", () => {
    it("모든 사용자가 자신의 정보를 조회할 수 있어야 함", async () => {
      const adminMe = await adminCaller.auth.me();
      expect(adminMe?.role).toBe("admin");

      const workerMe = await workerCaller.auth.me();
      expect(workerMe?.role).toBe("worker");

      const inspectorMe = await inspectorCaller.auth.me();
      expect(inspectorMe?.role).toBe("inspector");

      const userMe = await userCaller.auth.me();
      expect(userMe?.role).toBe("user");
    });

    it("작업자는 배치 목록을 조회할 수 있어야 함", async () => {
      const batches = await workerCaller.batch.list();
      expect(Array.isArray(batches)).toBe(true);
    });

    it("검사자는 CCP 기록을 조회할 수 있어야 함", async () => {
      const records = await inspectorCaller.ccp.getAllRecords({
        status: "submitted"
      });
      expect(Array.isArray(records)).toBe(true);
    });
  });
});
