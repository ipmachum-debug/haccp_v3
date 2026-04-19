/**
 * 공개 테넌트 라우터 — 회귀 테스트
 *
 * 검증:
 *  1. getAll 은 민감 정보(사용자 수, 생성일, 상태) 를 반환하지 않는다
 *  2. getAll 은 status='active' 테넌트만 반환한다
 *  3. 응답 shape 은 { success, tenants: Array<{id, name}> } 이다
 *
 * 회원가입 페이지에서 경쟁사 정보가 스크래핑되는 것을 방지한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 쿼리 빌드 단계별로 호출된 인자를 캡처하는 체이닝 가능한 mock
type QueryCapture = {
  selectArg?: unknown;
  whereArg?: unknown;
  orderByArg?: unknown;
  fromArg?: unknown;
};

const capture: QueryCapture = {};

const mockDb = {
  select: vi.fn((arg?: unknown) => {
    capture.selectArg = arg;
    return mockDb;
  }),
  from: vi.fn((arg: unknown) => {
    capture.fromArg = arg;
    return mockDb;
  }),
  where: vi.fn((arg: unknown) => {
    capture.whereArg = arg;
    return mockDb;
  }),
  orderBy: vi.fn((arg: unknown) => {
    capture.orderByArg = arg;
    // 쿼리 빌더의 최종 await 단계에서 PromiseLike 결과를 반환해야 함
    return Promise.resolve([
      { id: 1, name: "골든터틀" },
      { id: 2, name: "테스트회사" },
    ]);
  }),
};

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

// drizzle-orm 은 실제 모듈을 유지한 채 tag 함수만 덮어써서 쿼리 구조를 캡처
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    asc: (field: any) => ({ type: "asc", field }),
    desc: (field: any) => ({ type: "desc", field }),
    eq: (field: any, value: any) => ({ type: "eq", field, value }),
    and: (...args: any[]) => ({ type: "and", conditions: args }),
    count: () => ({ type: "count" }),
  };
});

vi.mock("../../../drizzle/schema/schema_main", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../drizzle/schema/schema_main")>();
  return {
    ...actual,
    tenants: {
      id: { __columnName: "id" },
      name: { __columnName: "name" },
      status: { __columnName: "status" },
      createdAt: { __columnName: "createdAt" },
    },
    users: {
      id: { __columnName: "id" },
      tenantId: { __columnName: "tenantId" },
    },
  };
});

describe("tenantsPublic — 공개 API 노출 최소화", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capture.selectArg = undefined;
    capture.fromArg = undefined;
    capture.whereArg = undefined;
    capture.orderByArg = undefined;
  });

  it("getAll 은 id, name 만 SELECT 해야 한다 (사용자 수/생성일/상태 노출 금지)", async () => {
    const { tenantsPublicRouter } = await import("./tenantsPublic.router");

    const caller = tenantsPublicRouter.createCaller({} as any);
    await caller.getAll();

    // select() 에 전달된 컬럼 리스트 검증
    const projection = capture.selectArg as Record<string, unknown>;
    expect(projection).toBeDefined();
    const projectedKeys = Object.keys(projection).sort();
    expect(projectedKeys).toEqual(["id", "name"]);

    // 민감 필드가 응답 스키마에 포함되지 않아야 함
    expect(projectedKeys).not.toContain("_count");
    expect(projectedKeys).not.toContain("createdAt");
    expect(projectedKeys).not.toContain("isActive");
    expect(projectedKeys).not.toContain("status");
  });

  it("getAll 은 where(status='active') 필터를 포함해야 한다", async () => {
    const { tenantsPublicRouter } = await import("./tenantsPublic.router");

    const caller = tenantsPublicRouter.createCaller({} as any);
    await caller.getAll();

    // where 절에 status 기반 eq 가 들어가는지 구조적으로 검증
    const whereArg = capture.whereArg as any;
    expect(whereArg).toBeDefined();
    expect(whereArg.type).toBe("eq");
    expect(whereArg.value).toBe("active");
  });

  it("getAll 응답 shape 은 { success: true, tenants: [...] }", async () => {
    const { tenantsPublicRouter } = await import("./tenantsPublic.router");

    const caller = tenantsPublicRouter.createCaller({} as any);
    const result = await caller.getAll();

    expect(result.success).toBe(true);
    expect(Array.isArray(result.tenants)).toBe(true);
    // 각 항목에 민감 필드가 없어야 함
    for (const t of result.tenants) {
      expect(t).toHaveProperty("id");
      expect(t).toHaveProperty("name");
      expect(t).not.toHaveProperty("_count");
      expect(t).not.toHaveProperty("createdAt");
      expect(t).not.toHaveProperty("isActive");
    }
  });

  it("getAll 은 leftJoin(users) 를 사용하지 않아야 한다 (사용자 수 집계 금지)", async () => {
    const { tenantsPublicRouter } = await import("./tenantsPublic.router");

    const caller = tenantsPublicRouter.createCaller({} as any);
    await caller.getAll();

    // mockDb 에 leftJoin 속성이 없으므로 호출되면 TypeError 가 났을 것.
    // 즉, 여기까지 정상 도달했다는 것은 leftJoin(users) 가 제거되었음을 의미한다.
    expect((mockDb as any).leftJoin).toBeUndefined();
  });
});
