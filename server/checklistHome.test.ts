/**
 * 일지 PR 3 — 체크리스트 시작 화면·즐겨찾기 (2026-10-15)
 *  - 즐겨찾기: 양식 식별자만, 회사·사용자별 저장(update/insert), 형식 검사·중복 제거·최대 50
 *  - 통합 작성 기록 검색: 회사 격리 + 바인딩 (작성자 LIKE, 종류 IN, 내 기록, 상태, 기간)
 *  - 카탈로그: 33종 식별자 유일·기존 URL(목록·작성) 전부 라우트 유지, 옛 화면도 같은 카탈로그
 *  - 화면 도우미: 별표 토글·순서 이동·사라진 양식·검색/주기 필터·기록 주소
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const state = vi.hoisted(() => ({ executed: [] as Array<{ sql: string; params: any[] }>, prefRow: null as null | { id: number; preference_value: string } }));
vi.mock("./db/connection", () => ({
  getDb: vi.fn(async () => null),
  getRawConnection: vi.fn(async () => ({
    execute: vi.fn(async (sql: string, params: any[]) => {
      state.executed.push({ sql, params });
      if (/SELECT preference_value FROM h_user_preferences/.test(sql)) return [state.prefRow ? [state.prefRow] : []];
      if (/SELECT id FROM h_user_preferences/.test(sql)) return [state.prefRow ? [{ id: state.prefRow.id }] : []];
      if (/SELECT COUNT\(\*\) AS total/.test(sql)) return [[{ total: 1 }]];
      if (/FROM h_generic_checklist_records r/.test(sql)) return [[{ id: 5, formType: "pest_control_checklist", formDate: "2026-02-10", title: "t", status: "submitted", siteId: 2, writerName: "이준석", createdBy: 2 }]];
      return [{ affectedRows: 1 }];
    }),
  })),
}));

import { checklistHomeRouter } from "./routers/checklist/checklistHome.router";
import { normalizeFavorites, parseFavorites, buildRecordSearch, FAVORITES_KEY } from "./lib/checklist/checklistHome";
import { CHECKLIST_ITEMS, CHECKLIST_CATEGORIES, FORM_TYPE_LABELS } from "../client/src/lib/checklist/catalog";
import { toggleFavorite, moveFavorite, resolveFavorites, filterCatalog, recordHref, PERIODIC_LOGS } from "../client/src/lib/checklist/home";
import { REPO_ROOT, readAppRoutes, firstMatch } from "./__helpers__/appRoutes";

const caller = (user: any) => checklistHomeRouter.createCaller({ user, tenantId: user.tenantId, req: {} as any, res: {} as any } as any);
const A = { id: 4, role: "admin", tenantId: 2 };
const B = { id: 9, role: "inspector", tenantId: 2 };
const OTHER = { id: 4, role: "admin", tenantId: 3 };

beforeEach(() => { state.executed = []; state.prefRow = null; });

describe("즐겨찾기 — 회사·사용자별, 양식 식별자만", () => {
  it("정리: 형식 틀린 값·중복 제거, 순서 유지, 최대 50", () => {
    expect(normalizeFavorites(["pest-control-checklist", "BAD ID", "pest-control-checklist", 3, "/quality/x", "illumination"])).toEqual(["pest-control-checklist", "illumination"]);
    expect(normalizeFavorites(Array.from({ length: 70 }, (_, i) => `f${i}`))).toHaveLength(50);
    expect(parseFavorites('["a","b"]')).toEqual(["a", "b"]);
    expect(parseFavorites("not json")).toEqual([]);
    expect(parseFavorites(null)).toEqual([]);
  });

  it("조회는 (회사, 사용자, 키) 로만 — 다른 계정·다른 회사 값과 섞이지 않음", async () => {
    state.prefRow = { id: 1, preference_value: '["illumination","temperature-humidity"]' };
    expect(await caller(A).favorites()).toEqual({ items: ["illumination", "temperature-humidity"] });
    expect(state.executed[0].params).toEqual([2, 4, FAVORITES_KEY]);
    await caller(B).favorites();
    expect(state.executed[1].params).toEqual([2, 9, FAVORITES_KEY]);
    await caller(OTHER).favorites();
    expect(state.executed[2].params).toEqual([3, 4, FAVORITES_KEY]);
  });

  it("저장: 처음이면 INSERT, 있으면 그 행 UPDATE (회사·사용자 조건 포함), 값은 식별자 JSON 만", async () => {
    const r1 = await caller(A).setFavorites({ items: ["illumination", "illumination", "pest-control-checklist"] });
    expect(r1.items).toEqual(["illumination", "pest-control-checklist"]);
    const ins = state.executed.find((e) => /INSERT INTO h_user_preferences/.test(e.sql))!;
    expect(ins.params).toEqual([2, 4, FAVORITES_KEY, '["illumination","pest-control-checklist"]']);

    state.executed = []; state.prefRow = { id: 77, preference_value: "[]" };
    await caller(A).setFavorites({ items: ["illumination"] });
    const upd = state.executed.find((e) => /UPDATE h_user_preferences/.test(e.sql))!;
    expect(upd.sql).toMatch(/WHERE id = \? AND tenant_id = \? AND user_id = \?/);
    expect(upd.params).toEqual(['["illumination"]', 77, 2, 4]);
  });

  it("형식이 틀린 식별자(경로·입력값)는 서버가 거부", async () => {
    await expect(caller(A).setFavorites({ items: ["/quality/checklists"] })).rejects.toThrow();
    await expect(caller(A).setFavorites({ items: Array.from({ length: 51 }, (_, i) => `f${i}`) })).rejects.toThrow();
  });
});

describe("통합 작성 기록 검색", () => {
  it("회사 조건이 항상 첫째, 모든 값은 바인딩", () => {
    const q = buildRecordSearch({ formTypes: ["pest_control_checklist", "training_log"], from: "2026-02-01", to: "2026-02-28", writer: " 이준 ", status: "submitted", mine: true, page: 2, pageSize: 30 }, 2, 4);
    expect(q.listSql).toMatch(/WHERE r\.tenant_id = \? AND r\.form_type IN \(\?,\?\) AND r\.form_date >= \? AND r\.form_date <= \? AND r\.status = \? AND r\.created_by = \? AND .* LIKE \?/s);
    expect(q.params).toEqual([2, "pest_control_checklist", "training_log", "2026-02-01", "2026-02-28", "submitted", 4, "%이준%"]);
    expect(q.listSql).toMatch(/LIMIT 30 OFFSET 30/);
    expect(q.listSql).not.toMatch(/이준|pest_control/); // 값이 SQL 에 직접 들어가지 않음
  });

  it("필터 없으면 회사만", () => {
    const q = buildRecordSearch({ page: 1, pageSize: 10 }, 7, 1);
    expect(q.params).toEqual([7]);
    expect(q.countSql).toMatch(/WHERE r\.tenant_id = \?$/);
  });

  it("라우터: 결과 모양·작성자 이름, 형식 틀린 종류는 거부", async () => {
    const r = await caller(B).records({ page: 1, pageSize: 30 });
    expect(r).toMatchObject({ total: 1, items: [{ id: 5, formType: "pest_control_checklist", formDate: "2026-02-10", status: "submitted", writerName: "이준석" }] });
    await expect(caller(B).records({ formTypes: ["x'; DROP"], page: 1, pageSize: 30 })).rejects.toThrow();
  });
});

describe("카탈로그 — 단일 출처·기존 URL 유지", () => {
  const routes = readAppRoutes();
  it("33종, 식별자 유일 (즐겨찾기가 가리키는 값)", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(33);
    expect(new Set(CHECKLIST_ITEMS.map((i) => i.id)).size).toBe(33);
    expect(CHECKLIST_CATEGORIES).toHaveLength(7);
  });

  it("모든 양식의 목록·작성 주소가 기존 라우트로 연결 (주기 일지 포함)", () => {
    for (const it of CHECKLIST_ITEMS) {
      expect(firstMatch(routes, it.listPath), it.listPath).toBeTruthy();
      expect(firstMatch(routes, it.createPath.split("?")[0]), it.createPath).toBeTruthy();
    }
    for (const p of PERIODIC_LOGS) {
      expect(firstMatch(routes, p.createPath), p.createPath).toBeTruthy();
      expect(firstMatch(routes, p.listPath.split("?")[0]), p.listPath).toBeTruthy();
    }
  });

  it("시작 화면·옛 전체 화면 라우트, /classic 이 /:id 보다 먼저", () => {
    expect(firstMatch(routes, "/quality/checklists")?.importPath).toMatch(/ChecklistHome/);
    expect(firstMatch(routes, "/quality/checklists/classic")?.importPath).toMatch(/ChecklistDashboard/);
    expect(firstMatch(routes, "/quality/checklists/123")?.importPath).toMatch(/ChecklistDetail/);
  });

  it("옛 화면도 같은 카탈로그를 쓴다 (하드코딩 목록 없음)", () => {
    const src = readFileSync(join(REPO_ROOT, "client/src/pages/checklist/ChecklistDashboard.tsx"), "utf-8");
    expect(src).toMatch(/const checklistCategories = CHECKLIST_CATEGORIES;/);
    expect(src).not.toMatch(/listPath: "\/personal-hygiene-check"/);
  });

  it("formType 이름표 — 공통 일지 양식 + 주기 일지", () => {
    expect(FORM_TYPE_LABELS.pest_control_checklist).toBe("방충·방서 점검표");
    expect(FORM_TYPE_LABELS.daily_log).toBe("일일일지");
  });
});

describe("화면 도우미", () => {
  it("별표 토글 — 새로 켜면 맨 뒤, 끄면 제거", () => {
    expect(toggleFavorite(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleFavorite(["a", "b"], "a")).toEqual(["b"]);
  });
  it("순서 이동 — 끝에서는 그대로", () => {
    expect(moveFavorite(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveFavorite(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveFavorite(["a"], "zz", 1)).toEqual(["a"]);
  });
  it("사라진 양식 식별자는 화면에서만 빠진다", () => {
    expect(resolveFavorites(["illumination", "gone-form"]).map((i) => i.id)).toEqual(["illumination"]);
  });
  it("검색·주기 필터", () => {
    expect(filterCatalog(CHECKLIST_ITEMS, "방충", "all").map((i) => i.id)).toContain("pest-control-checklist");
    expect(filterCatalog(CHECKLIST_ITEMS, "", "weekly").map((i) => i.id)).toEqual(["pest-control-checklist"]);
    expect(filterCatalog(CHECKLIST_ITEMS, "", "daily").every((i) => i.cycle === "daily")).toBe(true);
  });
  it("기록 주소 — 기존 상세 URL", () => {
    expect(recordHref("pest_control_checklist", 91)).toBe("/pest-control/checklists/91");
    expect(recordHref("training_log", 797)).toBe("/training-log/797");
    expect(recordHref("daily_log", 1)).toBe("/dashboard/daily-logs");
    expect(recordHref("unknown_form", 1)).toBeNull();
  });
});
