/**
 * 생산 설계 — 제품별 준비 상태 · 공장 설정 오류/누락 (순수 함수, 2026-10-19 설계 18 §13)
 *
 * 신호등 기준 = "생산에 쓰면 틀리게 계산되거나 기록이 빠지는가". 정상 분류(성형에 바로 넣는 재료 등)는 빨강이 아니다.
 *   빨강 — 지금 생산하면 계산·기록이 틀리거나 막힘 (승인 버전 없음 · 1배치 총 생산량 없음 · 배합비 합계 오류 ·
 *          kg 줄을 %로 계산 · 원료가 들어가는 공정에 설비 없음)
 *   노랑 — 생산은 되지만 확인이 필요 (공정 미지정 원료 · 설비 가열시간/사이클 없음 · 시간 프로필 여러 개 · 묶음 대수 > 설비 대수)
 *   초록 — 위 문제 없음
 * 쓰기 없음. 데이터를 바꾸지 않고 '무엇을 어디서 고치면 되는지' 만 알려 준다.
 */

export type Signal = "green" | "yellow" | "red";

export interface ReadinessIssue {
  level: "red" | "yellow";
  /** 짧은 분류 — 화면 묶음용 */
  code: string;
  text: string;
}

export interface RecipeIngredient {
  name: string;
  unit: string;
  quantity: number;
  processGroupId: number | null;
  isAdditional: boolean;
}

export interface DesignGroup {
  id: number;
  name: string;
  ccpType: string;
  mode: string;
  batchSize: number;
  /** 활성 시간 프로필 수 — 2개 이상이면 계획 계산이 프로필을 쓰지 않는다 */
  profileCount: number;
  profileTimeMin: number | null;
  equipments: Array<{ id: number; name: string; tempC: number | null; timeMin: number | null; cycleMin: number | null }>;
}

export interface RecipeInput {
  approved: boolean;
  batchTargetKg: number | null;
  ingredients: RecipeIngredient[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** 공정(그룹) 자체의 문제 — 제품과 상관없이 같은 문장 */
export function groupIssues(g: DesignGroup): ReadinessIssue[] {
  const out: ReadinessIssue[] = [];
  if (g.ccpType === "CCP-4P") return out; // 금속검출은 가열 계획 대상이 아님
  if (!g.equipments.length) {
    out.push({ level: "red", code: "group-no-equipment", text: `${g.name}: 연결된 설비가 없어 회차·시각을 계산할 수 없습니다` });
    return out;
  }
  if (g.profileCount > 1) out.push({ level: "yellow", code: "group-multi-profile", text: `${g.name}: 가열 시간 설정(프로필)이 ${g.profileCount}개라 계획에서 쓰지 않고 설비 기본 가열시간을 씁니다` });
  if (g.profileTimeMin == null && g.profileCount <= 1) {
    const noHeat = g.equipments.filter((e) => e.timeMin == null);
    if (noHeat.length) out.push({ level: "yellow", code: "equip-no-heat", text: `${g.name}: 가열시간이 없는 설비 ${noHeat.length}대 (${noHeat.slice(0, 3).map((e) => e.name).join(", ")})` });
  }
  const noCycle = g.equipments.filter((e) => e.cycleMin == null);
  if (noCycle.length) out.push({ level: "yellow", code: "equip-no-cycle", text: `${g.name}: 한 번 도는 시간(사이클)이 없는 설비 ${noCycle.length}대 — 다음 회차 시각을 계산할 수 없습니다` });
  if (g.mode === "grouped" && g.batchSize > g.equipments.length) out.push({ level: "yellow", code: "group-bundle-gt-equip", text: `${g.name}: ${g.batchSize}대 묶음인데 설비가 ${g.equipments.length}대입니다` });
  return out;
}

/** 제품 배합 한 개의 준비 상태 */
export function checkRecipe(r: RecipeInput, groups: Map<number, DesignGroup>): { signal: Signal; issues: ReadinessIssue[]; usedGroupIds: number[] } {
  const issues: ReadinessIssue[] = [];
  if (!r.approved) issues.push({ level: "red", code: "not-approved", text: "승인된 버전이 없습니다 — 지금은 초안으로 생산됩니다" });
  if (!(r.batchTargetKg != null && r.batchTargetKg > 0)) issues.push({ level: "red", code: "no-batch-total", text: "1배치 총 생산량이 없습니다 — 회차를 계산할 수 없습니다" });

  const main = r.ingredients.filter((i) => !i.isAdditional);
  const pct = main.filter((i) => i.unit === "%");
  const kg = main.filter((i) => i.unit !== "%");
  if (pct.length) {
    const sum = pct.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    if (Math.abs(sum - 100) > 0.05) issues.push({ level: "red", code: "pct-sum", text: `배합비 합계가 ${r1(sum)}% 입니다 (100% 이어야 함)` });
  }
  if (kg.length && pct.length) {
    issues.push({ level: "red", code: "unit-mixed", text: `kg 로 적힌 원료 ${kg.length}개 (${kg.slice(0, 3).map((i) => i.name).join(", ")}) — 지금 계산은 % 로 처리합니다` });
  } else if (kg.length && !pct.length) {
    issues.push({ level: "red", code: "unit-kg", text: `원료가 모두 kg 로 적혀 있습니다 — 지금 계산은 % 로 처리합니다` });
  }

  const unassigned = r.ingredients.filter((i) => i.processGroupId == null);
  if (unassigned.length) {
    issues.push({ level: "yellow", code: "unassigned", text: `공정이 지정되지 않은 원료 ${unassigned.length}개 (${unassigned.slice(0, 3).map((i) => i.name).join(", ")}${unassigned.length > 3 ? " 외" : ""}) — 성형 때 바로 넣는 재료인지 확인하세요` });
  }

  const used = Array.from(new Set(r.ingredients.map((i) => i.processGroupId).filter((x): x is number => x != null)));
  for (const id of used) {
    const g = groups.get(id);
    if (!g) { issues.push({ level: "red", code: "group-missing", text: `원료가 지정된 공정(#${id})이 없거나 사용 중지됐습니다` }); continue; }
    for (const gi of groupIssues(g)) if (gi.level === "red") issues.push(gi);
  }

  const signal: Signal = issues.some((i) => i.level === "red") ? "red" : issues.length ? "yellow" : "green";
  return { signal, issues, usedGroupIds: used };
}

/** 원료 % → 1배치 kg, 공정별 합계 (흐름 요약용). 추가 원재료는 kg 그대로 */
export function processLoads(r: RecipeInput, groups: Map<number, DesignGroup>): Array<{ label: string; kg: number }> {
  const total = r.batchTargetKg ?? 0;
  const m = new Map<string, number>();
  for (const i of r.ingredients) {
    const kg = i.isAdditional || i.unit !== "%" ? Number(i.quantity) || 0 : (total * (Number(i.quantity) || 0)) / 100;
    const label = i.processGroupId == null ? "공정 지정 없음" : groups.get(i.processGroupId)?.name ?? `공정 #${i.processGroupId}`;
    m.set(label, (m.get(label) ?? 0) + kg);
  }
  return Array.from(m.entries()).map(([label, kg]) => ({ label, kg: Math.round(kg * 100) / 100 }));
}
