/**
 * DB 헬퍼 유틸리티 단위 테스트
 */
import { describe, it, expect } from "vitest";
import { getRows, getFirstRow, getInsertId, safeNumber, safeFloat } from "./dbHelpers";

describe("getRows", () => {
  it("returns empty array for null/undefined", () => {
    expect(getRows(null)).toEqual([]);
    expect(getRows(undefined)).toEqual([]);
  });

  it("returns the array as-is when given a flat array", () => {
    const data = [{ id: 1 }, { id: 2 }];
    expect(getRows(data)).toEqual(data);
  });

  it("unwraps mysql2 [rows, fields] nested array", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const fields = [{ name: "id" }];
    expect(getRows([rows, fields])).toEqual(rows);
  });

  it("returns empty array for non-array values", () => {
    expect(getRows("string")).toEqual([]);
    expect(getRows(42)).toEqual([]);
    expect(getRows({})).toEqual([]);
  });

  it("handles empty array", () => {
    expect(getRows([])).toEqual([]);
  });

  it("handles nested empty array", () => {
    expect(getRows([[], []])).toEqual([]);
  });
});

describe("getFirstRow", () => {
  it("returns first row from flat array", () => {
    expect(getFirstRow([{ id: 1 }, { id: 2 }])).toEqual({ id: 1 });
  });

  it("returns first row from nested mysql2 result", () => {
    const rows = [{ id: 10, name: "test" }];
    expect(getFirstRow([rows, []])).toEqual({ id: 10, name: "test" });
  });

  it("returns null for empty result", () => {
    expect(getFirstRow(null)).toBeNull();
    expect(getFirstRow([])).toBeNull();
    expect(getFirstRow([[], []])).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(getFirstRow(undefined)).toBeNull();
  });
});

describe("getInsertId", () => {
  it("extracts insertId from mysql2 array result", () => {
    // mysql2 returns [ResultSetHeader, ...]
    expect(getInsertId([{ insertId: 42 }])).toBe(42);
  });

  it("extracts insertId from plain object", () => {
    expect(getInsertId({ insertId: 99 })).toBe(99);
  });

  it("returns 0 for null/undefined", () => {
    expect(getInsertId(null)).toBe(0);
    expect(getInsertId(undefined)).toBe(0);
  });

  it("returns 0 when insertId is missing", () => {
    expect(getInsertId([{}])).toBe(0);
    expect(getInsertId({})).toBe(0);
  });

  it("converts string insertId to number", () => {
    expect(getInsertId([{ insertId: "123" }])).toBe(123);
  });
});

describe("safeNumber", () => {
  it("converts valid numbers", () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber(3.14)).toBe(3.14);
    expect(safeNumber(-10)).toBe(-10);
  });

  it("converts numeric strings", () => {
    expect(safeNumber("100")).toBe(100);
    expect(safeNumber("3.14")).toBe(3.14);
  });

  it("returns default for null/undefined", () => {
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber(null, 5)).toBe(5);
  });

  it("returns default for NaN-producing values", () => {
    expect(safeNumber("abc")).toBe(0);
    expect(safeNumber("abc", 99)).toBe(99);
    expect(safeNumber(NaN)).toBe(0);
  });

  it("handles zero correctly", () => {
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber("0")).toBe(0);
  });

  it("handles boolean values", () => {
    expect(safeNumber(true)).toBe(1);
    expect(safeNumber(false)).toBe(0);
  });
});

describe("safeFloat", () => {
  it("rounds to 2 decimal places by default", () => {
    expect(safeFloat(3.14159)).toBe(3.14);
    expect(safeFloat(1.999)).toBe(2);
    expect(safeFloat(10.005)).toBe(10.01);
  });

  it("respects custom decimal places", () => {
    expect(safeFloat(3.14159, 4)).toBe(3.1416);
    expect(safeFloat(3.14159, 0)).toBe(3);
    expect(safeFloat(3.14159, 1)).toBe(3.1);
  });

  it("handles null/undefined via safeNumber fallback", () => {
    expect(safeFloat(null)).toBe(0);
    expect(safeFloat(undefined)).toBe(0);
  });

  it("handles string input", () => {
    expect(safeFloat("123.456")).toBe(123.46);
    expect(safeFloat("abc")).toBe(0);
  });
});
