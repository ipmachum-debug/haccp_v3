import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { hashPassword } from "./_core/jwtAuth";
import { createUser, getUserByEmail } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockContext(user: AuthenticatedUser | null = null): TrpcContext {
  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
      cookies: {}
    } as TrpcContext["req"],
    res: {
      cookie: () => {},
      clearCookie: () => {}
    } as TrpcContext["res"]
  };

  return ctx;
}

describe("JWT 인증 시스템", () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "testpassword123";
  const testName = "테스트 사용자";

  it("회원가입이 정상적으로 작동해야 함", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.register({
      email: testEmail,
      password: testPassword,
      name: testName
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe("회원가입이 완료되었습니다.");

    // 데이터베이스에서 사용자 확인
    const user = await getUserByEmail(testEmail);
    expect(user).toBeDefined();
    expect(user?.email).toBe(testEmail);
    expect(user?.name).toBe(testName);
  });

  it("중복된 이메일로 회원가입 시 오류가 발생해야 함", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.register({
        email: testEmail,
        password: testPassword,
        name: testName
      })
    ).rejects.toThrow("이미 사용 중인 이메일입니다.");
  });

  it("로그인이 정상적으로 작동해야 함", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.login({
      email: testEmail,
      password: testPassword
    });

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(testEmail);
    expect(result.user.name).toBe(testName);
  });

  it("잘못된 비밀번호로 로그인 시 오류가 발생해야 함", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        email: testEmail,
        password: "wrongpassword"
      })
    ).rejects.toThrow("이메일 또는 비밀번호가 올바르지 않습니다.");
  });

  it("존재하지 않는 이메일로 로그인 시 오류가 발생해야 함", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        email: "nonexistent@example.com",
        password: testPassword
      })
    ).rejects.toThrow("이메일 또는 비밀번호가 올바르지 않습니다.");
  });

  it("로그아웃이 정상적으로 작동해야 함", async () => {
    const user: AuthenticatedUser = {
      id: 1,
      email: testEmail,
      passwordHash: await hashPassword(testPassword),
      name: testName,
      role: "user",
      companyId: null,
      siteId: null,
      isActive: 1,
      lastLoginAt: new Date()
    };

    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result.success).toBe(true);
  });

  it("인증된 사용자 정보를 조회할 수 있어야 함", async () => {
    const user: AuthenticatedUser = {
      id: 1,
      email: testEmail,
      passwordHash: await hashPassword(testPassword),
      name: testName,
      role: "user",
      companyId: null,
      siteId: null,
      isActive: 1,
      lastLoginAt: new Date()
    };

    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeDefined();
    expect(result?.email).toBe(testEmail);
    expect(result?.name).toBe(testName);
  });

  it("인증되지 않은 사용자는 null을 반환해야 함", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeNull();
  });
});
