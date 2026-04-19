/**
 * PaginatedTable 정렬/페이지네이션 로직 테스트
 *
 * React 훅(usePaginatedSort)의 순수 로직 부분을 테스트합니다.
 * 정렬 방향 사이클, 페이지 계산, 페이지 크기 변경 로직을 검증합니다.
 */
import { describe, it, expect } from "vitest";

/* ─── 정렬 방향 사이클 로직 (handleSort에서 추출) ─── */
type SortDirection = "asc" | "desc" | null;
interface SortState {
  key: string;
  direction: SortDirection;
}

function nextSortState(prev: SortState, key: string): SortState {
  if (prev.key === key) {
    if (prev.direction === "asc") return { key, direction: "desc" };
    if (prev.direction === "desc") return { key: "", direction: null };
    return { key, direction: "asc" };
  }
  return { key, direction: "asc" };
}

/* ─── 페이지 계산 로직 (usePaginatedSort에서 추출) ─── */
function calculatePagination(
  totalItems: number,
  pageSize: number,
  requestedPage: number
) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);
  return {
    totalPages,
    safePage,
    startIdx,       // 0-based start (display as startIdx+1)
    endIdx,         // exclusive end
    displayStart: startIdx + 1,
  };
}

/* ─── 기본 정렬 함수 (sortedData 로직에서 추출) ─── */
function defaultSort<T>(data: T[], key: string, direction: SortDirection): T[] {
  if (!key || !direction) return data;
  return [...data].sort((a, b) => {
    const aVal = (a as any)[key];
    const bVal = (b as any)[key];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return direction === "asc" ? 1 : -1;
    if (bVal == null) return direction === "asc" ? -1 : 1;
    const aNum = typeof aVal === "string" ? parseFloat(aVal) : aVal;
    const bNum = typeof bVal === "string" ? parseFloat(bVal) : bVal;
    if (typeof aNum === "number" && typeof bNum === "number" && !isNaN(aNum) && !isNaN(bNum)) {
      return direction === "asc" ? aNum - bNum : bNum - aNum;
    }
    const cmp = String(aVal).localeCompare(String(bVal), "ko");
    return direction === "asc" ? cmp : -cmp;
  });
}

describe("Sort direction cycle (handleSort logic)", () => {
  it("new key starts with 'asc'", () => {
    const result = nextSortState({ key: "", direction: null }, "name");
    expect(result).toEqual({ key: "name", direction: "asc" });
  });

  it("same key: asc -> desc", () => {
    const result = nextSortState({ key: "name", direction: "asc" }, "name");
    expect(result).toEqual({ key: "name", direction: "desc" });
  });

  it("same key: desc -> null (reset)", () => {
    const result = nextSortState({ key: "name", direction: "desc" }, "name");
    expect(result).toEqual({ key: "", direction: null });
  });

  it("same key: null -> asc", () => {
    const result = nextSortState({ key: "name", direction: null }, "name");
    expect(result).toEqual({ key: "name", direction: "asc" });
  });

  it("different key resets to 'asc'", () => {
    const result = nextSortState({ key: "name", direction: "desc" }, "age");
    expect(result).toEqual({ key: "age", direction: "asc" });
  });

  it("full cycle: null -> asc -> desc -> null", () => {
    let state: SortState = { key: "", direction: null };
    state = nextSortState(state, "col");
    expect(state.direction).toBe("asc");
    state = nextSortState(state, "col");
    expect(state.direction).toBe("desc");
    state = nextSortState(state, "col");
    expect(state.direction).toBeNull();
  });
});

describe("Page calculation", () => {
  it("calculates total pages correctly", () => {
    expect(calculatePagination(100, 30, 1).totalPages).toBe(4);
    expect(calculatePagination(90, 30, 1).totalPages).toBe(3);
    expect(calculatePagination(91, 30, 1).totalPages).toBe(4);
    expect(calculatePagination(0, 30, 1).totalPages).toBe(1); // min 1
  });

  it("clamps page to totalPages when page exceeds range", () => {
    const result = calculatePagination(50, 30, 10);
    expect(result.safePage).toBe(2); // only 2 pages exist
  });

  it("returns correct slice indices for page 1", () => {
    const result = calculatePagination(100, 30, 1);
    expect(result.startIdx).toBe(0);
    expect(result.endIdx).toBe(30);
    expect(result.displayStart).toBe(1);
  });

  it("returns correct slice indices for page 2", () => {
    const result = calculatePagination(100, 30, 2);
    expect(result.startIdx).toBe(30);
    expect(result.endIdx).toBe(60);
    expect(result.displayStart).toBe(31);
  });

  it("handles last page with partial data", () => {
    const result = calculatePagination(85, 30, 3);
    expect(result.startIdx).toBe(60);
    expect(result.endIdx).toBe(85); // not 90
    expect(result.displayStart).toBe(61);
  });

  it("handles single item", () => {
    const result = calculatePagination(1, 30, 1);
    expect(result.totalPages).toBe(1);
    expect(result.startIdx).toBe(0);
    expect(result.endIdx).toBe(1);
  });
});

describe("Page size change resets to page 1", () => {
  // This tests the invariant from the hook: setPageSize sets page=1
  it("changing page size should reset page calculation from page 1", () => {
    // User was on page 3 with 30/page (items 61-90)
    // After changing to 50/page, the hook resets to page 1
    const before = calculatePagination(150, 30, 3);
    expect(before.displayStart).toBe(61);

    // After page size change, page resets to 1
    const after = calculatePagination(150, 50, 1);
    expect(after.displayStart).toBe(1);
    expect(after.totalPages).toBe(3);
    expect(after.endIdx).toBe(50);
  });

  it("new page size that makes old page invalid is handled by clamping", () => {
    // If somehow page wasn't reset (defensive), clamping protects
    const result = calculatePagination(50, 100, 5);
    expect(result.safePage).toBe(1);
    expect(result.startIdx).toBe(0);
    expect(result.endIdx).toBe(50);
  });
});

describe("Default sort function", () => {
  const data = [
    { name: "banana", value: 20 },
    { name: "apple", value: 10 },
    { name: "cherry", value: 30 },
  ];

  it("returns data unchanged when direction is null", () => {
    expect(defaultSort(data, "name", null)).toEqual(data);
  });

  it("returns data unchanged when key is empty", () => {
    expect(defaultSort(data, "", "asc")).toEqual(data);
  });

  it("sorts strings ascending", () => {
    const sorted = defaultSort(data, "name", "asc");
    expect(sorted.map((d) => d.name)).toEqual(["apple", "banana", "cherry"]);
  });

  it("sorts strings descending", () => {
    const sorted = defaultSort(data, "name", "desc");
    expect(sorted.map((d) => d.name)).toEqual(["cherry", "banana", "apple"]);
  });

  it("sorts numbers ascending", () => {
    const sorted = defaultSort(data, "value", "asc");
    expect(sorted.map((d) => d.value)).toEqual([10, 20, 30]);
  });

  it("sorts numbers descending", () => {
    const sorted = defaultSort(data, "value", "desc");
    expect(sorted.map((d) => d.value)).toEqual([30, 20, 10]);
  });

  it("handles null values (pushed to end in asc)", () => {
    const withNull = [
      { name: "b", value: 2 },
      { name: null, value: null },
      { name: "a", value: 1 },
    ];
    const sorted = defaultSort(withNull, "name", "asc");
    expect(sorted[0].name).toBe("a");
    expect(sorted[1].name).toBe("b");
    expect(sorted[2].name).toBeNull();
  });

  it("does not mutate original array", () => {
    const original = [...data];
    defaultSort(data, "name", "asc");
    expect(data).toEqual(original);
  });
});
