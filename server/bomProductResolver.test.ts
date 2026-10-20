import { describe, it, expect, vi } from "vitest";
import { resolveBomProductIds, bomItemIdsOfProduct, inPlaceholders, bomProductV2IdExpr } from "./lib/production/bomProductResolver";
import { asProductionProductId } from "../shared/identity/itemIds";

function fakeConn(rows: Array<{ id: number | string | null }>) {
  const execute = vi.fn(async () => [rows, []] as any);
  return { execute } as any;
}
const pp = (n: number) => asProductionProductId(n);

// 번호 체계 2단계 (2026-10-20): 생산 제품 번호 → 정체성 번호는 FK(legacy_product_id) 만. 숫자 직접 일치·역방향 흡수 없음.
describe("resolveBomProductIds — FK 만", () => {
  it("연결된 정체성 번호만 (찹쌀떡 생산 82 → 정체성 256), 입력 숫자 자체는 넣지 않음", async () => {
    const conn = fakeConn([{ id: 256 }]);
    const ids = await resolveBomProductIds(pp(82), 2, conn);
    expect(ids).toEqual([256]);
    const [sql, params] = conn.execute.mock.calls[0];
    expect(sql).toMatch(/legacy_product_id = \?/);
    expect(sql).not.toMatch(/UNION/);
    expect(params).toEqual([2, 82]);
  });

  it("연결이 없으면 [0] — 아무 보고서도 고르지 않음 (같은 숫자의 다른 품목으로 잇지 않음)", async () => {
    expect(await resolveBomProductIds(pp(82), 2, fakeConn([]))).toEqual([0]);
  });

  it("비정상 값은 걸러낸다", async () => {
    expect(await bomItemIdsOfProduct(pp(82), 2, fakeConn([{ id: 256 }, { id: "300" }, { id: null }, { id: 0 }]))).toEqual([256, 300]);
  });

  it("조회 실패 시 [0] (추측하지 않음)", async () => {
    const conn = { execute: vi.fn(async () => { throw new Error("boom"); }) } as any;
    expect(await resolveBomProductIds(pp(82), 2, conn)).toEqual([0]);
  });

  it("0 이하 번호는 조회 없이 [0]", async () => {
    const conn = fakeConn([{ id: 1 }]);
    expect(await resolveBomProductIds(pp(0), 2, conn)).toEqual([0]);
    expect(conn.execute).not.toHaveBeenCalled();
  });
});

describe("SQL 조각", () => {
  it("inPlaceholders", () => {
    expect(inPlaceholders([82])).toBe("?");
    expect(inPlaceholders([82, 256])).toBe("?, ?");
  });

  it("bomProductV2IdExpr 는 FK(legacy_product_id) 만 — 같은 숫자의 생산 제품과 직접 맞추지 않음", () => {
    const e = bomProductV2IdExpr("r");
    expect(e).toContain("im0.legacy_product_id");
    expect(e).not.toContain("p0.id = r.product_id");
    expect(e).not.toContain("h_products_v2");
  });
});
