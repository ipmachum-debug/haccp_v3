/**
 * 생산 설계 1단계 (2026-10-19, 설계 18 §13) — 준비 상태 신호등 · 공정별 1배치 투입량 · 변경 전후 비교 · 메뉴 연결
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkRecipe, groupIssues, processLoads, type DesignGroup } from "../shared/production/designReadiness";
import { diffRecipe, diffFields } from "./lib/production/designChangeDiff";
import { HUBS, HUB_BY_PATH, MENU_PLACEMENTS } from "../shared/navigation/menuRegistry";
import { ROUTES } from "../client/src/lib/routePaths";

const eq = (id: number, o: Partial<DesignGroup["equipments"][number]> = {}) => ({ id, name: `교반기${id}호기`, tempC: 99, timeMin: 10, cycleMin: 70, ...o });
const mixing: DesignGroup = { id: 1, name: "교반-가열공정", ccpType: "CCP-1B", mode: "sequential", batchSize: 1, profileCount: 1, profileTimeMin: 10, equipments: [eq(1), eq(2), eq(3)] };
const metal: DesignGroup = { id: 5, name: "금속검출공정", ccpType: "CCP-4P", mode: "sequential", batchSize: 1, profileCount: 0, profileTimeMin: null, equipments: [] };
const groups = new Map([[1, mixing], [5, metal]]);
const ing = (name: string, quantity: number, processGroupId: number | null, o: any = {}) => ({ name, unit: "%", quantity, processGroupId, isAdditional: false, ...o });

describe("준비 상태 신호등", () => {
  // 왕찹쌀떡 v2 실제 구조 — 96kg, 교반 62.6% + 성형에 바로(앙금·전분) 37.4%
  const wang = { approved: true, batchTargetKg: 96, ingredients: [ing("찹쌀", 62.6, 1), ing("통팥앙금", 30, null), ing("옥수수전분", 7.4, null)] };

  it("공정 미지정 원료는 노랑(확인 필요) — 빨강 아님 (성형에 바로 넣는 재료일 수 있다)", () => {
    const r = checkRecipe(wang, groups);
    expect(r.signal).toBe("yellow");
    expect(r.issues.map((i) => i.code)).toEqual(["unassigned"]);
    expect(r.issues[0].text).toMatch(/공정이 지정되지 않은 원료 2개 \(통팥앙금, 옥수수전분\)/);
  });

  it("공정별 1배치 투입량 = 배합비 % × 1배치 총 생산량 → 교반 60.1kg · 공정 지정 없음 35.9kg (합 96)", () => {
    const loads = processLoads(wang, groups);
    expect(loads).toEqual([{ label: "교반-가열공정", kg: 60.1 }, { label: "공정 지정 없음", kg: 35.9 }]);
  });

  it("모두 지정·승인·100% → 초록", () => {
    expect(checkRecipe({ approved: true, batchTargetKg: 34, ingredients: [ing("찹쌀", 100, 1)] }, groups).signal).toBe("green");
  });

  it("빨강: 승인 버전 없음 · 1배치 총 생산량 없음 · 합계 ≠ 100 · kg 줄 섞임 · 공정에 설비 없음 · 없는 공정", () => {
    const codes = (r: any) => checkRecipe(r, groups).issues.filter((i) => i.level === "red").map((i) => i.code);
    expect(codes({ approved: false, batchTargetKg: 0, ingredients: [ing("찹쌀", 90, 1)] })).toEqual(["not-approved", "no-batch-total", "pct-sum"]);
    expect(codes({ approved: true, batchTargetKg: 50, ingredients: [ing("찹쌀", 100, 1), { name: "설탕", unit: "kg", quantity: 19, processGroupId: 1, isAdditional: false }] })).toEqual(["unit-mixed"]);
    const empty = new Map([[1, { ...mixing, equipments: [] }]]);
    expect(checkRecipe({ approved: true, batchTargetKg: 50, ingredients: [ing("찹쌀", 100, 1)] }, empty).issues.map((i) => i.code)).toEqual(["group-no-equipment"]);
    expect(codes({ approved: true, batchTargetKg: 50, ingredients: [ing("찹쌀", 100, 9)] })).toEqual(["group-missing"]);
  });

  it("추가 원재료(정제수 등)는 배합비 합계에 넣지 않는다", () => {
    expect(checkRecipe({ approved: true, batchTargetKg: 50, ingredients: [ing("찹쌀", 100, 1), { name: "정제수", unit: "kg", quantity: 3, processGroupId: 1, isAdditional: true }] }, groups).signal).toBe("green");
  });
});

describe("공장 설정 오류·누락", () => {
  it("설비 없음(빨강) · 가열시간·사이클 없음 · 시간 설정 여러 개 · 묶음 > 설비 (노랑), 금속검출은 가열 검사 대상 아님", () => {
    expect(groupIssues({ ...mixing, equipments: [] })[0]).toMatchObject({ level: "red", code: "group-no-equipment" });
    const steam: DesignGroup = { ...mixing, name: "증숙(설기류)공정", mode: "grouped", batchSize: 3, profileCount: 2, profileTimeMin: null, equipments: [eq(4, { cycleMin: null }), eq(5)] };
    expect(groupIssues(steam).map((i) => i.code)).toEqual(["group-multi-profile", "equip-no-cycle", "group-bundle-gt-equip"]);
    expect(groupIssues({ ...mixing, profileCount: 0, profileTimeMin: null, equipments: [eq(1, { timeMin: null })] }).map((i) => i.code)).toEqual(["equip-no-heat"]);
    expect(groupIssues(metal)).toEqual([]);
  });
});

describe("변경 전후 비교", () => {
  const snap = (batch: number, rows: any[]) => ({ version: { batchTargetKg: batch, reportNo: "R1" }, ingredients: rows });
  const row = (key: string, name: string, quantity: any, processGroup: string | null, deductible = 1) => ({ key, name, quantity, unit: "%", processGroup, deductible, additional: 0 });
  it("1배치 총 생산량 · 배합 · 공정 · 재고 차감 · 추가 · 삭제 — 바뀐 것만", () => {
    const before = snap(20, [row("a", "멥쌀", "73.3", "증숙(설기류)공정"), row("b", "설탕", "9.1", null), row("c", "소금", "1", null)]);
    const after = snap(34, [row("a", "멥쌀", "73.30", null), row("b", "설탕", "10", null, 0), row("d", "콩", "2", null)]);
    expect(diffRecipe(before, after)).toEqual([
      { field: "batchTargetKg", before: 20, after: 34 },
      { field: "멥쌀 공정", before: "증숙(설기류)공정", after: "지정 없음" },
      { field: "설탕 배합", before: "9.1%", after: "10%" },
      { field: "설탕 재고 차감", before: "차감", after: "안 함" },
      { field: "원료 추가: 콩", before: null, after: "2%" },
      { field: "원료 삭제: 소금", before: "1%", after: null },
    ]);
    expect(diffRecipe(before, before)).toEqual([]);
  });
  it("설비: 받은 값 중 실제로 바뀐 칸만, 빈 값은 '바꾸지 않음'", () => {
    expect(diffFields({ defaultTime: 10, defaultTemperature: "99.00", name: "증숙기1호" }, { defaultTime: 35, defaultTemperature: "99", name: "", notes: undefined } as any))
      .toEqual({ defaultTime: { before: 10, after: 35 } });
    expect(diffFields({ defaultTime: 10 }, { defaultTime: 10 })).toBeNull();
  });
});

describe("메뉴·화면 연결", () => {
  it("생산 설계 허브 = 생산관리 다음, 관리자 4항목 (설계 현황 · 우리 공장 · 제품 배합 · 변경·적용 이력)", () => {
    const sorted = [...HUBS].sort((a, b) => a.order - b.order).map((h) => h.id);
    expect(sorted.indexOf("design")).toBe(sorted.indexOf("production") + 1);
    const items = MENU_PLACEMENTS.filter((p) => HUB_BY_PATH[p.path] === "design");
    expect(items.map((p) => p.label)).toEqual(["설계 현황", "우리 공장", "제품 배합", "변경·적용 이력"]);
    expect(items.every((p) => p.roles.join() === "super_admin,admin")).toBe(true);
    expect(items.map((p) => p.path)).toEqual([ROUTES.DESIGN_OVERVIEW, ROUTES.DESIGN_FACTORY, ROUTES.DESIGN_RECIPES, ROUTES.DESIGN_HISTORY]);
  });
  it("라우트는 ROUTES 상수, 서버는 읽기 전용(관리자)", () => {
    const app = readFileSync(join(__dirname, "..", "client/src/App.tsx"), "utf-8");
    for (const k of ["DESIGN_OVERVIEW", "DESIGN_FACTORY", "DESIGN_RECIPES", "DESIGN_HISTORY"]) expect(app).toMatch(new RegExp(`path=\\{ROUTES\\.${k}\\}`));
    const r = readFileSync(join(__dirname, "routers/production/productionDesign.router.ts"), "utf-8");
    expect(r).not.toMatch(/\.mutation\(/);
    expect(r.match(/adminProcedure/g)?.length).toBeGreaterThanOrEqual(4);
  });
  it("배합 저장은 전·후를 읽어 바뀐 것만 감사 기록에 (저장 실패와 무관)", () => {
    const m = readFileSync(join(__dirname, "routers/production/mfReport.router.ts"), "utf-8");
    expect(m).toMatch(/snapshotRecipe\(auditConn, ctx\.tenantId, input\.mfReportId\)/);
    expect(m).toMatch(/action: "mf_report\.update", entityType: "mf_report"/);
    const e = readFileSync(join(__dirname, "routers/checklist/equipment.router.ts"), "utf-8");
    expect(e).toMatch(/changes: diff \?\? \{\}/);
  });
});
