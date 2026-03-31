import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { hashPassword } from "./_core/jwtAuth";
import { eq } from "drizzle-orm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(user: AuthenticatedUser): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {}
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {}
    } as TrpcContext["res"]
  };
}

describe("Role-Based Access Control", () => {
  let adminUserId: number;
  let workerUserId: number;
  let inspectorUserId: number;
  let regularUserId: number;
  let adminEmail: string;
  let workerEmail: string;
  let inspectorEmail: string;
  let regularEmail: string;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const timestamp = Date.now();
    adminEmail = `admin-rbac-${timestamp}@test.com`;
    workerEmail = `worker-rbac-${timestamp}@test.com`;
    inspectorEmail = `inspector-rbac-${timestamp}@test.com`;
    regularEmail = `user-rbac-${timestamp}@test.com`;

    const hashedPassword = await hashPassword("test1234");

    // 관리자 생성
    const [admin] = await db
      .insert(users)
      .values({
        email: adminEmail,
        passwordHash: hashedPassword,
        name: "Admin User",
        role: "admin",
        isActive: 1
      })
      .$returningId();
    adminUserId = admin.id;

    // 작업자 생성
    const [worker] = await db
      .insert(users)
      .values({
        email: workerEmail,
        passwordHash: hashedPassword,
        name: "Worker User",
        role: "worker",
        isActive: 1
      })
      .$returningId();
    workerUserId = worker.id;

    // 검사자 생성
    const [inspector] = await db
      .insert(users)
      .values({
        email: inspectorEmail,
        passwordHash: hashedPassword,
        name: "Inspector User",
        role: "inspector",
        isActive: 1
      })
      .$returningId();
    inspectorUserId = inspector.id;

    // 일반 사용자 생성
    const [regular] = await db
      .insert(users)
      .values({
        email: regularEmail,
        passwordHash: hashedPassword,
        name: "Regular User",
        role: "user",
        isActive: 1
      })
      .$returningId();
    regularUserId = regular.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    await db.delete(users).where(eq(users.id, adminUserId));
    await db.delete(users).where(eq(users.id, workerUserId));
    await db.delete(users).where(eq(users.id, inspectorUserId));
    await db.delete(users).where(eq(users.id, regularUserId));
  });

  describe("Admin-only endpoints", () => {
    it("관리자는 사용자 목록을 조회할 수 있다", async () => {
      const adminUser: AuthenticatedUser = {
        id: adminUserId,
        openId: "admin-openid",
        email: adminEmail,
        name: "Admin User",
        loginMethod: "local",
        role: "admin"
        lastSignedIn: new Date()
      };

      const ctx = createAuthContext(adminUser);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.user.list();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("작업자는 사용자 목록을 조회할 수 없다", async () => {
      const workerUser: AuthenticatedUser = {
        id: workerUserId,
        openId: "worker-openid",
        email: workerEmail,
        name: "Worker User",
        loginMethod: "local",
        role: "worker"
        lastSignedIn: new Date()
      };

      const ctx = createAuthContext(workerUser);
      const caller = appRouter.createCaller(ctx);

      await expect(caller.user.list()).rejects.toThrow();
    });

    it("일반 사용자는 사용자 목록을 조회할 수 없다", async () => {
      const regularUser: AuthenticatedUser = {
        id: regularUserId,
        openId: "user-openid",
        email: regularEmail,
        name: "Regular User",
        loginMethod: "local",
        role: "user"
        lastSignedIn: new Date()
      };

      const ctx = createAuthContext(regularUser);
      const caller = appRouter.createCaller(ctx);

      await expect(caller.user.list()).rejects.toThrow();
    });
  });

  describe("Worker-level endpoints", () => {
    it("작업자는 배치를 생성할 수 있다", async () => {
      const workerUser: AuthenticatedUser = {
        id: workerUserId,
        openId: "worker-openid",
        email: workerEmail,
        name: "Worker User",
        loginMethod: "local",
        role: "worker"
        lastSignedIn: new Date()
      };

      const ctx = createAuthContext(workerUser);
      const caller = appRouter.createCaller(ctx);

      // 배치 생성 테스트 (실제 데이터가 필요하므로 에러 발생 예상)
      // 여기서는 권한 체크만 통과하는지 확인
      try {
        await caller.batch.create({
          siteId: 1,
          productId: 999999, // 존재하지 않는 제품
          batchNumber: "TEST-BATCH",
          plannedQuantity: 100,
          plannedStartDate: new Date()
        });
      } catch (error: any) {
        // 권한 에러가 아닌 다른 에러가 발생해야 함 (데이터 없음 등)
        expect(error.message).not.toContain("권한");
        expect(error.message).not.toContain("FORBIDDEN");
      }
    });

    it("관리자도 배치를 생성할 수 있다", async () => {
      const adminUser: AuthenticatedUser = {
        id: adminUserId,
        openId: "admin-openid",
        email: adminEmail,
        name: "Admin User",
        loginMethod: "local",
        role: "admin"
        lastSignedIn: new Date()
      };

      const ctx = createAuthContext(adminUser);
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.batch.create({
          siteId: 1,
          productId: 999999,
          batchNumber: "TEST-BATCH-ADMIN",
          plannedQuantity: 100,
          plannedStartDate: new Date()
        });
      } catch (error: any) {
        expect(error.message).not.toContain("권한");
        expect(error.message).not.toContain("FORBIDDEN");
      }
    });

    it("검사자는 배치를 생성할 수 없다", async () => {
      const inspectorUser: AuthenticatedUser = {
        id: inspectorUserId,
        openId: "inspector-openid",
        email: inspectorEmail,
        name: "Inspector User",
        loginMethod: "local",
        role: "inspector"
        lastSignedIn: new Date()
      };

      const ctx = createAuthContext(inspectorUser);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.batch.create({
          siteId: 1,
          productId: 1,
          batchNumber: "TEST-BATCH",
          plannedQuantity: 100,
          plannedStartDate: new Date()
        })
      ).rejects.toThrow("작업자 권한이 필요합니다.");
    });

    it("일반 사용자는 배치를 생성할 수 없다", async () => {
      const regularUser: AuthenticatedUser = {
        id: regularUserId,
        openId: "user-openid",
        email: regularEmail,
        name: "Regular User",
        loginMethod: "local",
        role: "user"
        lastSignedIn: new Date()
      };

      const ctx = createAuthContext(regularUser);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.batch.create({
          siteId: 1,
          productId: 1,
          batchNumber: "TEST-BATCH",
          plannedQuantity: 100,
          plannedStartDate: new Date()
        })
      ).rejects.toThrow("작업자 권한이 필요합니다.");
    });
  });

  describe("Read-only endpoints", () => {
    it("모든 역할이 배치 목록을 조회할 수 있다", async () => {
      const roles: Array<{ user: AuthenticatedUser; name: string }> = [
        {
          name: "admin",
          user: {
            id: adminUserId,
            openId: "admin-openid",
            email: adminEmail,
            name: "Admin User",
            loginMethod: "local",
            role: "admin"
            lastSignedIn: new Date()
          }
        },
        {
          name: "worker",
          user: {
            id: workerUserId,
            openId: "worker-openid",
            email: workerEmail,
            name: "Worker User",
            loginMethod: "local",
            role: "worker"
            lastSignedIn: new Date()
          }
        },
        {
          name: "inspector",
          user: {
            id: inspectorUserId,
            openId: "inspector-openid",
            email: inspectorEmail,
            name: "Inspector User",
            loginMethod: "local",
            role: "inspector"
            lastSignedIn: new Date()
          }
        },
        {
          name: "user",
          user: {
            id: regularUserId,
            openId: "user-openid",
            email: regularEmail,
            name: "Regular User",
            loginMethod: "local",
            role: "user"
            lastSignedIn: new Date()
          }
        },
      ];

      for (const { user, name } of roles) {
        const ctx = createAuthContext(user);
        const caller = appRouter.createCaller(ctx);

        const result = await caller.batch.list();
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      }
    });
  });
});
