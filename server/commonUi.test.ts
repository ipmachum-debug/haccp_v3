/**
 * 3-a 공통 UI 부품의 순수 로직 (UI/UX 개편, 2026-10-14)
 *  - 상태 사전: 같은 코드는 어디서나 같은 문구·색, 업무별 예외, 모르는 코드는 원문 그대로(숨기지 않음)
 *  - URL 필터: 기본값과 같은 값은 쿼리에서 빠지고 나머지 쿼리는 보존
 *  - 데이터 표: 정렬(빈 값은 뒤, 숫자·한국어) · 페이지 · 정렬 순환
 *  - 알림: use-toast 가 앱에 장착된 sonner 로 간다 (이전엔 표시기가 없어 135개 파일의 알림이 보이지 않았다)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveStatus, STATUS_KINDS } from "../client/src/lib/statusDictionary";
import { readFilters, writeFilters } from "../client/src/components/common/FilterBar";
import { sortRows, paginate, nextSort } from "../client/src/components/common/DataGrid";
import { reasonText } from "../client/src/lib/notify";

const sonnerMock = vi.hoisted(() => {
  const fn: any = vi.fn(() => "id-default");
  fn.error = vi.fn(() => "id-error");
  fn.success = vi.fn(() => "id-success");
  fn.warning = vi.fn(() => "id-warn");
  fn.loading = vi.fn();
  fn.dismiss = vi.fn();
  fn.promise = vi.fn();
  return fn;
});
vi.mock("sonner", () => ({ toast: sonnerMock }));

describe("상태 사전", () => {
  it("표준 9종 + 진행 중 문구 고정", () => {
    expect(Object.fromEntries(Object.entries(STATUS_KINDS).map(([k, v]) => [k, v.label]))).toEqual({
      draft: "작성 중", pending: "대기", in_progress: "진행 중", pending_review: "검토 대기", pending_approval: "승인 대기",
      approved: "승인", completed: "완료", rejected: "반려", cancelled: "취소", error: "오류",
    });
  });
  it("여러 원래 코드가 같은 표준 상태로 — 대소문자 무시", () => {
    expect(resolveStatus("submitted").label).toBe("검토 대기");
    expect(resolveStatus("APPROVED").label).toBe("승인");
    expect(resolveStatus("canceled").label).toBe("취소");
    expect(resolveStatus("failed").tone).toBe("red");
    expect(resolveStatus("pending_writer").label).toBe("대기"); // 작성자 확인 대기 — 검토 대기 아님
  });
  it("업무별 예외: 매출·매입 pending = 승인 대기", () => {
    expect(resolveStatus("pending").label).toBe("대기");
    expect(resolveStatus("pending", "sale").label).toBe("승인 대기");
  });
  it("모르는 코드는 원문 그대로 회색 (숨기지 않음)", () => {
    expect(resolveStatus("partial_received")).toEqual({ kind: null, label: "partial_received", tone: "zinc" });
    expect(resolveStatus(null).label).toBe("-");
  });
});

describe("URL 필터", () => {
  const D = { q: "", status: "all", from: "" };
  it("읽기: 쿼리에 있는 값만 덮어쓴다", () => {
    expect(readFilters("?status=pending&x=1", D)).toEqual({ q: "", status: "pending", from: "" });
  });
  it("쓰기: 기본값·빈 값은 빼고, 필터와 무관한 쿼리(tab 등)는 보존", () => {
    expect(writeFilters("?tab=list&status=pending", D, { status: "all", q: "단지" })).toBe("?tab=list&q=%EB%8B%A8%EC%A7%80");
    expect(writeFilters("", D, { status: "all" })).toBe("");
  });
});

describe("데이터 표", () => {
  type R = { id: number; name: string; amount: number | null };
  const rows: R[] = [{ id: 1, name: "나", amount: 30 }, { id: 2, name: "가", amount: null }, { id: 3, name: "다", amount: 5 }];
  const cols = [{ key: "name", header: "이름", sortable: true }, { key: "amount", header: "금액", sortable: true }];
  it("숫자 정렬 · 빈 값은 방향과 무관하게 뒤", () => {
    expect(sortRows(rows, cols, { key: "amount", dir: "asc" }).map((r) => r.id)).toEqual([3, 1, 2]);
    expect(sortRows(rows, cols, { key: "amount", dir: "desc" }).map((r) => r.id)).toEqual([1, 3, 2]);
  });
  it("한국어 문자 정렬", () => {
    expect(sortRows(rows, cols, { key: "name", dir: "asc" }).map((r) => r.name)).toEqual(["가", "나", "다"]);
  });
  it("페이지: 범위 밖 페이지는 끝으로 고정", () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({ items: [3, 4], page: 2, pages: 3 });
    expect(paginate([1, 2, 3], 9, 2)).toEqual({ items: [3], page: 2, pages: 2 });
    expect(paginate([], 1, 50)).toEqual({ items: [], page: 1, pages: 1 });
  });
  it("정렬 순환: 없음 → 오름 → 내림 → 없음", () => {
    expect(nextSort(null, "a")).toEqual({ key: "a", dir: "asc" });
    expect(nextSort({ key: "a", dir: "asc" }, "a")).toEqual({ key: "a", dir: "desc" });
    expect(nextSort({ key: "a", dir: "desc" }, "a")).toBeNull();
    expect(nextSort({ key: "a", dir: "desc" }, "b")).toEqual({ key: "b", dir: "asc" });
  });
});

describe("알림 — use-toast 는 sonner 로", () => {
  beforeEach(() => vi.clearAllMocks());

  it("실패(destructive)는 빨간 오류, 그 외는 일반 알림 — 설명 유지", async () => {
    const { toast, useToast } = await import("../client/src/hooks/use-toast");
    toast({ title: "저장 실패", description: "권한 없음", variant: "destructive" });
    expect(sonnerMock.error).toHaveBeenCalledWith("저장 실패", expect.objectContaining({ description: "권한 없음" }));
    useToast().toast({ title: "등록 완료" });
    expect(sonnerMock).toHaveBeenCalledWith("등록 완료", {});
  });

  it("사유 문구: Error · tRPC 오류 · 문자열", () => {
    expect(reasonText(new Error("DB 연결 실패"))).toBe("DB 연결 실패");
    expect(reasonText({ message: "FORBIDDEN" })).toBe("FORBIDDEN");
    expect(reasonText("")).toBeUndefined();
  });

  it("앱 표시기: sonner 하나, 색 구분·상단 위치", () => {
    const sonnerUi = readFileSync(join(__dirname, "..", "client/src/components/ui/sonner.tsx"), "utf-8");
    expect(sonnerUi).toContain("richColors");
    expect(sonnerUi).toContain('position="top-right"');
    const app = readFileSync(join(__dirname, "..", "client/src/App.tsx"), "utf-8");
    expect(app).toContain('import { Toaster } from "@/components/ui/sonner"');
  });
});

describe("헤더 전역 도구", () => {
  it("PC 헤더: 검색 · 출퇴근 · 알림 · 프로필 / 모바일: 검색 · 출퇴근 · 알림", () => {
    const layout = readFileSync(join(__dirname, "..", "client/src/components/dashboard/DashboardLayout.tsx"), "utf-8");
    expect(layout).toContain("<GlobalMenuSearch sections={hubSections}");
    expect(layout).toContain("<GlobalMenuSearch compact sections={hubSections}");
    expect(layout).toContain("<HeaderProfileMenu");
  });
});
