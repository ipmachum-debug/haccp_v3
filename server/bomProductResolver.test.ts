import { describe, it, expect, vi } from "vitest";
import { resolveBomProductIds, inPlaceholders, bomProductV2IdExpr } from "./lib/production/bomProductResolver";

function fakeConn(rows: Array<{ candidate: number | string | null }>) {
  const execute = vi.fn(async () => [rows, []] as any);
  return { execute } as any;
}

describe("resolveBomProductIds", () => {
  it("직접 일치 ID 가 항상 첫 원소", async () => {
    const ids = await resolveBomProductIds(82, 2, fakeConn([]));
    expect(ids).toEqual([82]);
  });

  it("item_master.legacy_product_id 로 연결된 id 를 후보에 추가 (찹쌀떡 82 → 256)", async () => {
    const conn = fakeConn([{ candidate: 256 }]);
    const ids = await resolveBomProductIds(82, 2, conn);
    expect(ids).toEqual([82, 256]);
    // tenant 격리 파라미터가 두 UNION 가지 모두에 들어간다
    const [, params] = conn.execute.mock.calls[0];
    expect(params).toEqual([2, 82, 2, 82]);
  });

  it("중복·비정상 값은 걸러낸다", async () => {
    const ids = await resolveBomProductIds(82, 2, fakeConn([{ candidate: 82 }, { candidate: "256" }, { candidate: null }, { candidate: 0 }]));
    expect(ids).toEqual([82, 256]);
  });

  it("조회 실패 시 직접 일치만 반환 (기존 동작 유지)", async () => {
    const conn = { execute: vi.fn(async () => { throw new Error("boom"); }) } as any;
    const ids = await resolveBomProductIds(82, 2, conn);
    expect(ids).toEqual([82]);
  });

  it("0 이하 ID 는 조회 없이 그대로", async () => {
    const conn = fakeConn([{ candidate: 1 }]);
    expect(await resolveBomProductIds(0, 2, conn)).toEqual([0]);
    expect(conn.execute).not.toHaveBeenCalled();
  });
});

describe("SQL 조각", () => {
  it("inPlaceholders", () => {
    expect(inPlaceholders([82])).toBe("?");
    expect(inPlaceholders([82, 256])).toBe("?, ?");
  });

  it("bomProductV2IdExpr 는 직접 일치 → legacy_product_id 순 COALESCE", () => {
    const e = bomProductV2IdExpr("r");
    expect(e).toContain("p0.id = r.product_id");
    expect(e).toContain("im0.legacy_product_id");
    expect(e.indexOf("h_products_v2")).toBeLessThan(e.indexOf("item_master"));
  });
});
