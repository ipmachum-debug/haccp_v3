/**
 * 생산 설계 1단계 (2026-10-19, 설계 18 §13) — 준비 상태 신호등 · 공정별 1배치 투입량 · 변경 전후 비교 · 메뉴 연결
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkRecipe, groupIssues, processLoads, entryLabel, type DesignGroup } from "../shared/production/designReadiness";
import { mergeIngredientRows } from "./lib/production/mfIngredientMerge";
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
    expect(r.issues[0].text).toMatch(/들어가는 곳을 정하지 않은 원료 2개 \(통팥앙금, 옥수수전분\)/);
  });

  it("공정별 1배치 투입량 = 배합비 % × 1배치 총 생산량 → 교반 60.1kg · 아직 모름 35.9kg (합 96)", () => {
    const loads = processLoads(wang, groups);
    expect(loads).toEqual([{ label: "교반-가열공정", kg: 60.1 }, { label: "아직 모름", kg: 35.9 }]);
  });

  it("2a: 들어가는 곳(성형에 바로·나중에 넣음)을 정한 원료는 정상 → 초록, 요약도 그 이름으로", () => {
    const classified = { ...wang, ingredients: [ing("찹쌀", 62.6, 1), ing("통팥앙금", 30, null, { entryStage: "direct" }), ing("옥수수전분", 7.4, null, { entryStage: "late" })] };
    expect(checkRecipe(classified, groups).signal).toBe("green");
    expect(processLoads(classified, groups)).toEqual([{ label: "교반-가열공정", kg: 60.1 }, { label: "성형에 바로", kg: 28.8 }, { label: "나중에 넣음", kg: 7.1 }]);
    // 모르는 값은 분류로 보지 않는다
    expect(checkRecipe({ ...wang, ingredients: [ing("찹쌀", 62.6, 1), ing("통팥앙금", 37.4, null, { entryStage: "xx" })] }, groups).signal).toBe("yellow");
    expect(entryLabel({ processGroupId: 1, entryStage: "direct" }, "교반")).toBe("교반"); // 공정이 우선
  });

  it("F600-01: 서버가 실제 계획 규칙으로 계산한 kgPerBatch 를 그대로 쓴다 (원물·공정 환산 5.17kg), null 은 합계에서 뺀다", () => {
    const r = { approved: true, batchTargetKg: 5, ingredients: [ing("멥쌀", 73.3, 1, { kgPerBatch: 4 }), ing("설탕", 26.7, 1, { kgPerBatch: 1.172 }), ing("중간재", 0, null, { kgPerBatch: null })] };
    expect(processLoads(r, groups)).toEqual([{ label: "교반-가열공정", kg: 5.17 }]);
    expect(checkRecipe({ ...r, calcError: "기준 완제품 kg 가 없습니다" }, groups).issues.map((i) => i.code)).toContain("mass-basis-error");
    expect(checkRecipe({ ...r, ingredients: r.ingredients.slice(0, 2), calcNote: "다른 버전" }, groups)).toMatchObject({ signal: "yellow" });
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

describe("배합 저장이 들어가는 곳을 지우지 않음 (2a)", () => {
  const base = { quantity: 30, unit: "%", isDeductible: 1, materialType: "RAW" };
  it("배합 수정 화면이 보내지 않으면 원래 값 유지 · 공정을 지정하면(보냈거나 이어받은) 비움", () => {
    const existing = [{ id: 1, processGroupId: null, entryStage: "direct" }, { id: 2, processGroupId: 3, entryStage: null }];
    const m = mergeIngredientRows([{ ...base, id: 1, materialId: 10 }, { ...base, id: 2, materialId: 11, entryStage: "late" }, { ...base, id: 1, materialId: 10, processGroupId: 3 }], existing, 9);
    expect(m.map((r) => r.entryStage)).toEqual(["direct", null, null]);
    expect(mergeIngredientRows([{ ...base, id: 1, materialId: 10, entryStage: null }], existing, 9)[0].entryStage).toBeNull(); // 명시적으로 비움
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
  it("#600 후속: 계산 보조 칸(기준 원물·전처리 배율·조정량·보정 수량·들어가는 곳)만 바뀌어도 기록", () => {
    const b = snap(5, [{ ...row("a", "멥쌀", "73.3", "증숙"), basisRawKg: "8.000", pretreatmentFactor: "1.25", adjustedWeightKg: null, correctedQuantity: null, entryStage: null }]);
    const a = snap(5, [{ ...row("a", "멥쌀", "73.3", "증숙"), basisRawKg: 8, pretreatmentFactor: "1.30", adjustedWeightKg: "4.1", correctedQuantity: null, entryStage: "direct" }]);
    expect(diffRecipe(b, a)).toEqual([
      { field: "멥쌀 전처리 배율", before: "1.25", after: "1.30" },
      { field: "멥쌀 조정량(kg)", before: null, after: "4.1" },
      { field: "멥쌀 들어가는 곳", before: null, after: "성형에 바로" },
    ]);
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
  it("라우트는 ROUTES 상수, 서버 쓰기는 '들어가는 곳 저장' 하나뿐(관리자·감사 기록)", () => {
    const app = readFileSync(join(__dirname, "..", "client/src/App.tsx"), "utf-8");
    for (const k of ["DESIGN_OVERVIEW", "DESIGN_FACTORY", "DESIGN_RECIPES", "DESIGN_HISTORY", "DESIGN_RECIPE_DETAIL"]) expect(app).toMatch(new RegExp(`path=\\{ROUTES\\.${k}\\}`));
    const r = readFileSync(join(__dirname, "routers/production/productionDesign.router.ts"), "utf-8");
    expect(r.match(/\.mutation\(/g)?.length).toBe(1);
    expect(r).toMatch(/setEntryStages: adminProcedure/);
    expect(r).toMatch(/recipeDetail: adminProcedure/);
    expect(r).toMatch(/action: "mf_report\.entry_stage"/);
    expect(r.match(/adminProcedure/g)?.length).toBeGreaterThanOrEqual(6);
  });
  it("들어가는 곳 저장: 이 회사·이 버전·공정 없는 줄만 (SQL 조건)", () => {
    const d = readFileSync(join(__dirname, "lib/production/designOverview.ts"), "utf-8");
    expect(d).toMatch(/WHERE v\.id = \? AND r\.id = \? AND r\.tenant_id = \?/);
    expect(d).toMatch(/UPDATE h_mf_ingredients SET entry_stage = \? WHERE id = \? AND mf_report_version_id = \? AND process_group_id IS NULL/);
  });
  it("배합 저장은 전·후를 읽어 바뀐 것만 감사 기록에 (저장 실패와 무관)", () => {
    const m = readFileSync(join(__dirname, "routers/production/mfReport.router.ts"), "utf-8");
    expect(m).toMatch(/snapshotRecipe\(auditConn, ctx\.tenantId, input\.mfReportId\)/);
    expect(m).toMatch(/action: "mf_report\.update", entityType: "mf_report"/);
    const e = readFileSync(join(__dirname, "routers/checklist/equipment.router.ts"), "utf-8");
    expect(e).toMatch(/changes: diff \?\? \{\}/);
  });
});
