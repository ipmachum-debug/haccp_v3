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

describe("User Management API", () => {
  let adminUserId: number;
  let workerUserId: number;
  let adminEmail: string;
  let workerEmail: string;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    adminEmail = `admin-${Date.now()}@test.com`;
    workerEmail = `worker-${Date.now()}@test.com`;

    // 관리자 사용자 생성
    const hashedPassword = await hashPassword("admin1234");
    const [adminUser] = await db
      .insert(users)
      .values({
        email: adminEmail,
        passwordHash: hashedPassword,
        name: "Admin User",
        role: "admin",
        isActive: 1
      })
      .$returningId();
    adminUserId = adminUser.id;

    // 작업자 사용자 생성
    const [workerUser] = await db
      .insert(users)
      .values({
        email: workerEmail,
        passwordHash: hashedPassword,
        name: "Worker User",
        role: "worker",
        isActive: 1
      })
      .$returningId();
    workerUserId = workerUser.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // 테스트 사용자 삭제
    await db.delete(users).where(eq(users.id, adminUserId));
    await db.delete(users).where(eq(users.id, workerUserId));
  });

  it("관리자는 모든 사용자 목록을 조회할 수 있다", async () => {
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
    expect(result.length).toBeGreaterThan(0);
    
    // 생성한 사용자들이 목록에 포함되어 있는지 확인
    const foundAdmin = result.find(u => u.id === adminUserId);
    const foundWorker = result.find(u => u.id === workerUserId);
    
    expect(foundAdmin).toBeDefined();
    expect(foundAdmin?.role).toBe("admin");
    expect(foundWorker).toBeDefined();
    expect(foundWorker?.role).toBe("worker");
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
    
    await expect(caller.user.list()).rejects.toThrow("관리자만 접근할 수 있습니다.");
  });

  it("관리자는 사용자 역할을 변경할 수 있다", async () => {
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
    
    const result = await caller.user.updateRole({
      userId: workerUserId,
      role: "inspector"
    });
    
    expect(result.success).toBe(true);
    
    // 변경된 역할 확인
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    
    const [updatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, workerUserId));
    
    expect(updatedUser.role).toBe("inspector");
    
    // 원래 역할로 복원
    await caller.user.updateRole({
      userId: workerUserId,
      role: "worker"
    });
  });

  it("작업자는 사용자 역할을 변경할 수 없다", async () => {
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
    
    await expect(
      caller.user.updateRole({
        userId: adminUserId,
        role: "user"
      })
    ).rejects.toThrow("관리자만 접근할 수 있습니다.");
  });

  it("관리자는 사용자를 활성화/비활성화할 수 있다", async () => {
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
    
    // 비활성화
    const deactivateResult = await caller.user.toggleActive({
      userId: workerUserId,
      isActive: false
    });
    
    expect(deactivateResult.success).toBe(true);
    
    // 비활성화 확인
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    
    const [deactivatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, workerUserId));
    
    expect(deactivatedUser.isActive).toBe(0);
    
    // 다시 활성화
    const activateResult = await caller.user.toggleActive({
      userId: workerUserId,
      isActive: true
    });
    
    expect(activateResult.success).toBe(true);
    
    const [activatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, workerUserId));
    
    expect(activatedUser.isActive).toBe(1);
  });

  it("작업자는 사용자를 활성화/비활성화할 수 없다", async () => {
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
    
    await expect(
      caller.user.toggleActive({
        userId: adminUserId,
        isActive: false
      })
    ).rejects.toThrow("관리자만 접근할 수 있습니다.");
  });
});
