/**
 * FEFO LOT 할당 회귀 테스트 (Top 10 #10 - 재고/LOT 핵심 흐름 보호)
 *
 * 검증:
 *  1. 유통기한 오름차순 — 가장 빠른 유통기한부터 우선 할당
 *  2. 다중 LOT 분할 — 한 LOT 가 수량 부족하면 다음 LOT 로 이월
 *  3. 정확한 수량 할당 — 할당 합 = 요청 수량
 *  4. 재고 부족 — 에러 throw + 가용량 명시
 *  5. 테넌트 격리 — tenant_id 필터가 where 에 포함
 *  6. 폴백 경로 — inventory_id 로 못 찾으면 material_id 로 재검색
 *  7. 유통기한 null LOT — 맨 뒤로 (COALESCE('9999-12-31'))
 *
 * 한번 깨지면 큰 사고 영역:
 *  - FEFO 순서 역전 → 유통기한 지난 LOT 먼저 출고 (식품안전)
 *  - 재고 차감 오류 → 재고 부족/과다 (회계·운영 혼란)
 *  - 테넌트 필터 누락 → 타 테넌트 LOT 출고 (심각)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── mock setup ───
type MockLotRow = {
  id: number;
  availableQuantity: string | number;
  unitPrice: string | number | null;
  expiryDate: Date | string | null;
};

// select().from().where().orderBy() 체인의 결과를 제어
let primaryLots: MockLotRow[] = [];
let fallbackLots: MockLotRow[] = [];
let currentQueryIndex = 0;
let capturedWhereCalls: unknown[] = [];

const mockDb = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn((cond: unknown) => {
    capturedWhereCalls.push(cond);
    return mockDb;
  }),
  orderBy: vi.fn(() => {
    // 첫 번째 호출 = primary, 두 번째 = fallback
    const result = currentQueryIndex === 0 ? primaryLots : fallbackLots;
    currentQueryIndex++;
    return Promise.resolve(result);
  }),
  execute: vi.fn().mockResolvedValue(undefined),
  insert: vi.fn(() => mockDb),
  values: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../../db", () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock("../../../drizzle/schema/part2", () => ({
  hInventoryLots: {
    id: "hInventoryLots.id",
    tenantId: "hInventoryLots.tenantId",
    inventoryId: "hInventoryLots.inventoryId",
    materialId: "hInventoryLots.materialId",
    availableQuantity: "hInventoryLots.availableQuantity",
    unitPrice: "hInventoryLots.unitPrice",
    expiryDate: "hInventoryLots.expiryDate",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (field: unknown, value: unknown) => ({ type: "eq", field, value }),
  and: (...args: unknown[]) => ({ type: "and", conditions: args }),
  gte: (field: unknown, value: unknown) => ({ type: "gte", field, value }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: "sql",
    strings,
    values,
  }),
}));

import { allocateLotsFEFO } from "./fefoLotAllocation";

describe("allocateLotsFEFO — FEFO 순서 보장", () => {
  beforeEach(() => {
    primaryLots = [];
    fallbackLots = [];
    currentQueryIndex = 0;
    capturedWhereCalls = [];
    vi.clearAllMocks();
  });

  it("유통기한 빠른 LOT 부터 순서대로 할당", async () => {
    // DB 가 이미 ORDER BY expiryDate ASC 로 반환한다고 가정
    primaryLots = [
      { id: 101, availableQuantity: 10, unitPrice: 1000, expiryDate: "2026-05-01" },
      { id: 102, availableQuantity: 10, unitPrice: 1000, expiryDate: "2026-06-01" },
      { id: 103, availableQuantity: 10, unitPrice: 1000, expiryDate: "2026-07-01" },
    ];

    const result = await allocateLotsFEFO(1, 5, "kg", 2);

    expect(result).toHaveLength(1);
    expect(result[0].lotId).toBe(101); // 가장 빠른 유통기한 LOT
    expect(result[0].quantity).toBe(5);
    expect(result[0].expiryDate).toBe("2026-05-01");
  });

  it("한 LOT 로 부족하면 다음 LOT 로 이월 (다중 분할)", async () => {
    primaryLots = [
      { id: 201, availableQuantity: 3, unitPrice: 500, expiryDate: "2026-05-01" },
      { id: 202, availableQuantity: 7, unitPrice: 600, expiryDate: "2026-06-01" },
      { id: 203, availableQuantity: 10, unitPrice: 700, expiryDate: "2026-07-01" },
    ];

    const result = await allocateLotsFEFO(1, 8, "kg", 2);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ lotId: 201, quantity: 3, unitCost: 500, expiryDate: "2026-05-01" });
    expect(result[1]).toEqual({ lotId: 202, quantity: 5, unitCost: 600, expiryDate: "2026-06-01" });
    // 총합 = 요청 수량
    const total = result.reduce((s, a) => s + a.quantity, 0);
    expect(total).toBe(8);
  });

  it("정확히 한 LOT 소진 후 두 번째 LOT 까지 사용", async () => {
    primaryLots = [
      { id: 301, availableQuantity: 5, unitPrice: 1000, expiryDate: "2026-05-01" },
      { id: 302, availableQuantity: 5, unitPrice: 1000, expiryDate: "2026-06-01" },
    ];

    const result = await allocateLotsFEFO(1, 10, "kg", 2);

    expect(result).toHaveLength(2);
    expect(result[0].quantity).toBe(5);
    expect(result[1].quantity).toBe(5);
  });

  it("재고 부족 시 에러 throw + 가용량 명시", async () => {
    primaryLots = [
      { id: 401, availableQuantity: 3, unitPrice: 1000, expiryDate: "2026-05-01" },
      { id: 402, availableQuantity: 4, unitPrice: 1000, expiryDate: "2026-06-01" },
    ];

    await expect(allocateLotsFEFO(1, 10, "kg", 2)).rejects.toThrow(
      /재고 부족.*요청 10kg.*가용 7/,
    );
  });

  it("사용 가능한 LOT 가 전혀 없으면 에러", async () => {
    primaryLots = [];

    await expect(allocateLotsFEFO(1, 5, "kg", 2)).rejects.toThrow(
      /재고 ID 1에 사용 가능한 LOT가 없습니다/,
    );
  });

  it("polyfill: inventory_id 로 못 찾으면 material_id 로 폴백 검색", async () => {
    primaryLots = []; // inventory_id 로 조회 → 빈 배열
    fallbackLots = [
      { id: 501, availableQuantity: 10, unitPrice: 1200, expiryDate: "2026-08-01" },
    ];

    const result = await allocateLotsFEFO(999, 3, "kg", 2, /* materialId */ 7);

    expect(result).toHaveLength(1);
    expect(result[0].lotId).toBe(501);
    expect(result[0].unitCost).toBe(1200);
    // execute 가 호출됐어야 함 (inventory_id 자동 보정 UPDATE)
    expect(mockDb.execute).toHaveBeenCalled();
  });

  it("폴백에도 LOT 없으면 에러", async () => {
    primaryLots = [];
    fallbackLots = [];

    await expect(allocateLotsFEFO(999, 3, "kg", 2, 7)).rejects.toThrow(
      /사용 가능한 LOT가 없습니다/,
    );
  });

  it("unitPrice null → unitCost 0 으로 안전 변환", async () => {
    primaryLots = [
      { id: 601, availableQuantity: 10, unitPrice: null, expiryDate: "2026-05-01" },
    ];

    const result = await allocateLotsFEFO(1, 5, "kg", 2);

    expect(result[0].unitCost).toBe(0);
  });

  it("expiryDate null LOT 도 할당 가능 (COALESCE 로 뒤로 밀림)", async () => {
    // 실제 ORDER BY 는 DB 가 처리 — 여기서는 이미 정렬된 순서로 mock
    primaryLots = [
      { id: 701, availableQuantity: 5, unitPrice: 1000, expiryDate: "2026-05-01" },
      { id: 702, availableQuantity: 5, unitPrice: 1000, expiryDate: null }, // 맨 뒤
    ];

    const result = await allocateLotsFEFO(1, 7, "kg", 2);

    expect(result[0].lotId).toBe(701);
    expect(result[0].expiryDate).toBe("2026-05-01");
    expect(result[1].lotId).toBe(702);
    expect(result[1].expiryDate).toBeNull();
  });

  it("테넌트 격리: where 절에 tenantId eq 조건 포함", async () => {
    primaryLots = [
      { id: 801, availableQuantity: 10, unitPrice: 1000, expiryDate: "2026-05-01" },
    ];

    await allocateLotsFEFO(1, 3, "kg", /* tenantId */ 42);

    // and(...) 안에 eq(tenantId, 42) 조건이 포함됐는지 검증
    const whereArg = capturedWhereCalls[0] as { type: string; conditions: unknown[] };
    expect(whereArg.type).toBe("and");
    const conditions = whereArg.conditions as Array<{ type: string; field: string; value: unknown }>;
    const tenantCondition = conditions.find(
      (c) => c.field === "hInventoryLots.tenantId",
    );
    expect(tenantCondition).toBeDefined();
    expect(tenantCondition?.value).toBe(42);
  });

  it("requestedQuantity 0 은 빈 배열 반환하지 않고 에러 (일관성)", async () => {
    primaryLots = [];

    // 재고가 없는 상태에서 0 요청도 "LOT 없음" 으로 에러 발생
    // (requestedQuantity=0 케이스는 호출 측에서 사전 차단하는 것이 원칙)
    await expect(allocateLotsFEFO(1, 0, "kg", 2)).rejects.toThrow();
  });
});
