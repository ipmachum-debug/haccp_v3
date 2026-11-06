import { describe, expect, it, vi } from "vitest";
import { convertMetricQuantity } from "../shared/uom/metricQuantity";
import { resolvePackConversion } from "./lib/inventory/inbound/packUnits";

describe("purchase metric quantities", () => {
  it.each([
    [750, "g", "kg", 0.75], [0.75, "kg", "g", 750],
    [750, "mL", "L", 0.75], [0.75, "L", "ml", 750],
    [750, " G ", " KG ", 0.75], [2, "개", "개", 2], [2, "ea", "EA", 2],
  ])("converts %s %s to %s", (quantity, from, to, expected) => {
    expect(convertMetricQuantity(Number(quantity), String(from), String(to))).toBe(expected);
  });
  it.each([["g", "L"], ["kg", "mL"], ["box", "kg"], ["", "kg"]])("never guesses %s to %s", (from, to) => {
    expect(convertMetricQuantity(750, from, to)).toBeNull();
  });
  it("rejects non-finite values", () => {
    expect(convertMetricQuantity(Infinity, "g", "kg")).toBeNull();
    expect(convertMetricQuantity(NaN, "kg", "kg")).toBeNull();
  });
  it.each([["kg", "g", 1500, 1.5, 0.001], ["g", "kg", 1.5, 1500, 1000], ["L", "mL", 1500, 1.5, 0.001]])(
    "receives metric quantities in %s without creating package settings", async (base, unit, quantity, expected, factor) => {
      const conn = { execute: vi.fn(async () => [[{ unit: base }]]) };
      expect(await resolvePackConversion(conn, 15, 713, String(unit), Number(quantity), "test")).toEqual({
        baseUnit: base, factor, conversionId: null, stockQuantity: expected,
      });
      expect(conn.execute).toHaveBeenCalledTimes(1);
      expect(conn.execute.mock.calls[0]).toEqual([expect.stringContaining("tenant_id = ?"), [713, 15]]);
    },
  );
  it("keeps an explicitly configured package factor", async () => {
    const conn = { execute: vi.fn().mockResolvedValueOnce([[{ unit: "kg" }]]).mockResolvedValueOnce([[{ id: 8, base_qty: "0.75", base_unit: "kg" }]]) };
    expect(await resolvePackConversion(conn, 15, 713, "개", 2, "test")).toMatchObject({ factor: 0.75, stockQuantity: 1.5, conversionId: 8 });
    expect(conn.execute.mock.calls[1][1]).toEqual([15, 713, "개"]);
  });
  it("still blocks missing package mappings", async () => {
    const conn = { execute: vi.fn().mockResolvedValueOnce([[{ unit: "kg" }]]).mockResolvedValueOnce([[]]) };
    await expect(resolvePackConversion(conn, 15, 713, "개", 2, "test")).rejects.toThrow("환산 설정이 없습니다");
  });
  it("resolves a stored pack-to-ea mapping scoped to one material and company", async () => {
    const conn = { execute: vi.fn().mockResolvedValueOnce([[{ unit: "ea" }]]).mockResolvedValueOnce([[{ id: 34, base_qty: "1", base_unit: "ea" }]]) };
    expect(await resolvePackConversion(conn, 15, 728, "pack", 3, "test")).toMatchObject({ baseUnit: "ea", factor: 1, stockQuantity: 3, conversionId: 34 });
    expect(conn.execute.mock.calls[1][1]).toEqual([15, 728, "pack"]);
  });
});
