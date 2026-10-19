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
  /** 공정 미지정 원료의 들어가는 곳 — direct(성형에 바로)·late(나중에 넣음)·null(아직 모름) (생산 설계 2a) */
  entryStage?: string | null;
  /** 1배치에 이 공정으로 들어가는 kg — 서버가 실제 계획과 같은 규칙으로 미리 계산 (원물·공정 환산이면 전처리 후 kg).
   *  없으면(undefined) 배합비 × 1배치 총 생산량으로 계산, null 이면 계산 근거 없음(합계에서 뺌) */
  kgPerBatch?: number | null;
}

export const ENTRY_STAGE_LABEL: Record<string, string> = { direct: "성형에 바로", late: "나중에 넣음" };
/** 원료가 들어가는 곳 이름 — 공정이 우선, 없으면 분류, 그것도 없으면 '아직 모름' */
export function entryLabel(i: { processGroupId: number | null; entryStage?: string | null }, groupName?: string): string {
  if (i.processGroupId != null) return groupName ?? `공정 #${i.processGroupId}`;
  return (i.entryStage && ENTRY_STAGE_LABEL[i.entryStage]) || "아직 모름";
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
  equipments: Array<{
    id: number; name: string; tempC: number | null; timeMin: number | null; cycleMin: number | null;
    /** 이 공정에서 실제 계획이 쓰는 가열 분 (공정 시간 프로필 1개면 그 값, 아니면 설비 기본 가열) · 설비 점유 분 (#600 U600-01) */
    appliedHeatMin?: number | null; occupancyMin?: number | null;
  }>;
}

export interface RecipeInput {
  approved: boolean;
  batchTargetKg: number | null;
  ingredients: RecipeIngredient[];
  /** 원물·공정 환산이 켜진 버전인데 계산이 안 되는 이유 — 이 상태면 생산 건을 만들 수 없다 */
  calcError?: string | null;
  /** 계산은 되지만 확인이 필요한 이유 */
  calcNote?: string | null;
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
  if (r.calcError) issues.push({ level: "red", code: "mass-basis-error", text: `원물·공정 환산을 계산할 수 없습니다 — ${r.calcError} (지금은 생산 건을 만들 수 없음)` });
  if (r.calcNote) issues.push({ level: "yellow", code: "mass-basis-note", text: r.calcNote });

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

  // 공정도 없고 들어가는 곳(성형에 바로·나중에 넣음)도 정하지 않은 원료만 — 분류된 원료는 정상 (2a)
  const unassigned = r.ingredients.filter((i) => i.processGroupId == null && !(i.entryStage && ENTRY_STAGE_LABEL[i.entryStage]));
  if (unassigned.length) {
    issues.push({ level: "yellow", code: "unassigned", text: `들어가는 곳을 정하지 않은 원료 ${unassigned.length}개 (${unassigned.slice(0, 3).map((i) => i.name).join(", ")}${unassigned.length > 3 ? " 외" : ""}) — 성형에 바로 넣는지, 나중에 넣는지 정하세요` });
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

/** 원료 1배치 kg 의 공정별 합계 (흐름 요약용). 서버가 계산한 kgPerBatch 우선, 없으면 % × 1배치 총 생산량 (추가 원재료는 kg 그대로) */
export function processLoads(r: RecipeInput, groups: Map<number, DesignGroup>): Array<{ label: string; kg: number }> {
  const total = r.batchTargetKg ?? 0;
  const m = new Map<string, number>();
  for (const i of r.ingredients) {
    if (i.kgPerBatch === null) continue;
    const kg = i.kgPerBatch !== undefined ? i.kgPerBatch : i.isAdditional || i.unit !== "%" ? Number(i.quantity) || 0 : (total * (Number(i.quantity) || 0)) / 100;
    const label = entryLabel(i, i.processGroupId != null ? groups.get(i.processGroupId)?.name : undefined);
    m.set(label, (m.get(label) ?? 0) + kg);
  }
  return Array.from(m.entries()).map(([label, kg]) => ({ label, kg: Math.round(kg * 100) / 100 }));
}
