/**
 * 하루 CCP 가열공정 계획 — 설비별 시간표 (2026-10-18, PR-B)
 *
 * 미리보기와 실제 배치 생성이 **같은 함수·같은 입력** 으로 계산한다. 이 파일은 DB 를 읽지 않는다(순수 함수).
 * 입력은 server/lib/production/ccpPlanInputs.ts 가 읽어 온다.
 *
 * 시간 개념 (CEO 설계 2026-10-18 — "가열시간, 투입 간격, 설비 한 사이클은 서로 다른 시간"):
 *   - 가열 운전시간 heatingMin : 공정 시간 프로필(1개일 때) → 설비 기본 가열시간 → 비움
 *   - 설비 점유 occupancyMin   : 설비 사이클 + (가열 − 설비 기본 가열). 같은 설비를 다시 쓸 수 있는 시각을 정한다
 *   - 투입 시작 간격 intervalMin: 같은 공정에서 다음 회차를 시작할 수 있는 최소 간격 (순차·묶음 방식)
 *   - 동시 운전 방식 mode       : sequential(한 대씩 간격 두고) · concurrent(동시) · grouped(묶음 크기만큼 동시, 묶음끼리 간격)
 *   한계기준(CL)은 판정용이다 — 시간·온도·압력 계획값으로 쓰지 않는다.
 *
 * 예정시각은 계산한 그대로다. 무작위로 흩뜨리지 않는다 (CEO 결정 2026-10-18). 실제 시각은 작업자가 확인·수정한다.
 * CCP-4P(금속검출)는 하루 통과 배분이 따로 있어 여기서 다루지 않는다.
 */

export type EquipMode = "sequential" | "concurrent" | "grouped";

export interface PlannerEquipment {
  id: number;
  name: string;
  sortOrder: number;
  /** 설비 설정온도 (운영값) */
  defaultTemperature: number | null;
  /** 설비 설정압력 MPa (운영값) */
  defaultPressureMpa: number | null;
  /** 설비 1사이클(설비 기본 가열 포함) 분 */
  cycleTotalMin: number | null;
  /** 설비 기본 가열시간 분 */
  defaultTimeMin: number | null;
}

export interface PlannerGroup {
  id: number;
  name: string;
  ccpType: string;
  mappingSource: "BOM" | "MANUAL" | "ALWAYS";
  mode: EquipMode;
  intervalMin: number;
  batchSize: number;
  /** 공정 가열 운전시간 (시간 프로필, 활성 1개일 때) */
  profileTimeMin: number | null;
  equipments: PlannerEquipment[];
  /** 공정 첫 설비의 작업 시작시각 HH:MM (없으면 null) */
  workStartTime: string | null;
}

export interface PlannerItem {
  rowKey: string;
  productId: number;
  plannedKg: number;
  /** 배치 시작시각 HH:MM — 기본 시작시각 */
  startTime: string;
  /** 오늘만 바꾼 시작시각 — 있으면 설비 작업 시작시각보다 우선 */
  startTimeOverride?: string | null;
  /** 1회차(설비 1회) 기준 완제품 kg — 배치가 쓰는 BOM 버전의 batch_target_kg (원물·공정 기준 스냅샷이면 그 값) */
  subBatchKg: number | null;
  /** 공정별 1회차 투입량 kg (BOM 버전 하나 또는 원물·공정 기준 스냅샷) */
  inputByGroup: Record<number, number>;
  /** 가열공정(1B/2B)만 */
  groups: PlannerGroup[];
}

/** 이미 저장된 오늘 계획 — 설비가 언제 비는지 */
export interface BusySlot {
  equipmentId: number;
  processGroupId: number;
  startMin: number;
  endMin: number;
}

export interface PlannerContext {
  /** 오늘만 쓰지 않는 설비 */
  excludedEquipmentIds?: number[];
  busy?: BusySlot[];
}

export interface PlannedRound {
  seq: number;
  roundNo: number;
  equipmentId: number | null;
  equipmentName: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  heatingMin: number | null;
  cycleTotalMin: number | null;
  occupancyMin: number | null;
  tempC: number | null;
  pressureBar: number | null;
  inputKg: number | null;
}

export interface PlannedProcess {
  processGroupId: number;
  name: string;
  ccpType: string;
  mappingSource: string;
  rounds: PlannedRound[];
  warnings: string[];
}

export interface PlannedItem {
  rowKey: string;
  productId: number;
  plannedKg: number;
  roundsCount: number;
  processes: PlannedProcess[];
  warnings: string[];
}

export const toMin = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ""));
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
};
export const toHHMM = (min: number): string => {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

/** 회차 수 = 계획량 ÷ 1회차 기준량 올림 (기준량을 모르면 1) */
export function roundsFor(plannedKg: number, subBatchKg: number | null): number {
  if (!(subBatchKg != null && subBatchKg > 0) || !(plannedKg > 0)) return 1;
  return Math.max(1, Math.ceil(plannedKg / subBatchKg - 1e-9));
}

/** 회차별 투입량 — 공정 총 투입량을 회차에 나눈다 (ccpFormSettings.splitCcpInputQty 와 같은 규칙) */
export function splitInput(totalKg: number | null, perRoundKg: number | null, rounds: number, seq: number): number | null {
  if (totalKg == null || !(totalKg > 0)) return perRoundKg;
  const n = Math.max(1, Math.floor(rounds) || 1);
  if (perRoundKg != null && perRoundKg > 0) {
    const needed = Math.ceil(totalKg / perRoundKg - 1e-9);
    if (needed === n) return r2(seq < n ? perRoundKg : totalKg - perRoundKg * (n - 1));
  }
  return r2(totalKg / n);
}

/** 설비 점유 = 사이클 + (가열 − 설비 기본 가열). 값이 모자라면 사이클 → 가열 → null */
export function occupancyFor(eq: PlannerEquipment, heatingMin: number | null): number | null {
  if (eq.cycleTotalMin != null && heatingMin != null && eq.defaultTimeMin != null) return eq.cycleTotalMin + (heatingMin - eq.defaultTimeMin);
  return eq.cycleTotalMin ?? heatingMin;
}

/**
 * 하루 계획. items 순서대로 설비를 배정한다 — 앞 줄이 먼저 설비를 쓴다.
 * 같은 공정·설비를 쓰는 이미 저장된 오늘 배치(context.busy)가 있으면 그 뒤로 잡는다.
 */
export function planDay(items: PlannerItem[], context: PlannerContext = {}): PlannedItem[] {
  const excluded = new Set(context.excludedEquipmentIds ?? []);
  // 설비가 비는 시각 · 공정별 마지막 시작 시각
  const freeAt = new Map<number, number>();
  const lastStart = new Map<number, number>();
  for (const b of context.busy ?? []) {
    freeAt.set(b.equipmentId, Math.max(freeAt.get(b.equipmentId) ?? -Infinity, b.endMin));
    lastStart.set(b.processGroupId, Math.max(lastStart.get(b.processGroupId) ?? -Infinity, b.startMin));
  }

  return items.map((item) => {
    const rounds = roundsFor(item.plannedKg, item.subBatchKg);
    const itemWarnings: string[] = [];
    if (!(item.subBatchKg != null && item.subBatchKg > 0)) itemWarnings.push("BOM 1회차 기준량이 없어 회차를 1회로 계산했습니다.");

    const processes = item.groups.map((g): PlannedProcess => {
      const warnings: string[] = [];
      const eqs = g.equipments.filter((e) => !excluded.has(e.id)).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      if (g.equipments.length && !eqs.length) warnings.push("오늘 제외한 설비뿐이라 설비를 배정하지 못했습니다.");
      else if (!g.equipments.length) warnings.push("공정에 설비가 지정되지 않아 설비·시각을 계산하지 못했습니다.");

      // 회차 수 — 묶음 방식은 한 회차에 묶음 크기만큼 설비가 같이 돈다 (행 = 묶음 수 × 묶음 크기, 이전 생성 규칙과 같음)
      //   오늘 쓸 수 있는 설비가 묶음 크기보다 적으면 묶음을 그 대수로 줄인다 — 같은 설비를 한 묶음에 두 번 배정하지 않는다
      //   (2026-10-19 Codex 단지 회귀: 3대 묶음에서 1대 제외 시 같은 설비가 같은 시각에 두 번 배정됨)
      const setSize = g.mode === "grouped" ? Math.max(1, g.batchSize || 1) : 1;
      const size = eqs.length ? Math.min(setSize, eqs.length) : setSize;
      if (size < setSize) warnings.push(`오늘 쓸 수 있는 설비가 ${eqs.length}대라 묶음을 ${setSize}대에서 ${size}대로 줄여 계산했습니다.`);
      const groupsCount = g.mode === "grouped" && size > 1 ? Math.max(1, Math.ceil(rounds / size)) : rounds;
      const rowCount = groupsCount * size;

      // 투입량 — 공정 1회차 기준량 × 계획량 ÷ 1회차 기준 완제품량 (BOM 공정 지정이 없으면 계획량 전체)
      const perRound = item.inputByGroup[g.id] ?? null;
      let total: number | null = null;
      let perRoundKg: number | null = perRound;
      if (perRound != null && item.subBatchKg && item.subBatchKg > 0) total = (perRound * item.plannedKg) / item.subBatchKg;
      else if (perRound == null) {
        total = item.plannedKg > 0 ? item.plannedKg : null;
        perRoundKg = item.subBatchKg && item.subBatchKg > 0 ? item.subBatchKg : null;
      }

      const startBase = toMin(item.startTimeOverride || g.workStartTime || item.startTime);
      const heatingMin = g.profileTimeMin;
      if (heatingMin == null && eqs.some((e) => e.defaultTimeMin == null)) warnings.push("가열 운전시간(공정 시간 프로필·설비 기본 가열)이 없는 설비가 있습니다.");

      const out: PlannedRound[] = [];
      let seq = 0;
      for (let gi = 0; gi < groupsCount; gi++) {
        // 이번 회차(묶음)에 쓸 설비 — 가장 먼저 비는 설비부터 (같으면 설비 순서)
        const pick: PlannerEquipment[] = [];
        if (eqs.length) {
          const ranked = [...eqs].sort((a, b) => (freeAt.get(a.id) ?? -Infinity) - (freeAt.get(b.id) ?? -Infinity) || a.sortOrder - b.sortOrder || a.id - b.id);
          for (let k = 0; k < size; k++) pick.push(ranked[k]); // size ≤ 설비 수 — 한 묶음에 같은 설비 없음
        }
        // 시작 시각 — 공정 시작 · 설비가 비는 시각 · (순차/묶음) 앞 회차 + 간격
        let start: number | null = null;
        if (pick.length && Number.isFinite(startBase)) {
          start = startBase;
          for (const e of pick) start = Math.max(start, freeAt.get(e.id) ?? -Infinity);
          const prev = lastStart.get(g.id);
          if (g.mode !== "concurrent" && prev != null && Number.isFinite(prev)) start = Math.max(start, prev + Math.max(0, g.intervalMin));
          lastStart.set(g.id, start);
        }
        for (let k = 0; k < size; k++) {
          seq++;
          const e = pick[k] ?? null;
          const heat = e ? (heatingMin ?? e.defaultTimeMin) : heatingMin;
          const occ = e ? occupancyFor(e, heat) : null;
          if (e && start != null) freeAt.set(e.id, start + (occ ?? 0));
          out.push({
            seq,
            roundNo: gi + 1,
            equipmentId: e?.id ?? null,
            equipmentName: e?.name ?? null,
            plannedStart: start != null ? toHHMM(start) : null,
            plannedEnd: start != null && occ != null ? toHHMM(start + occ) : null,
            heatingMin: heat ?? null,
            cycleTotalMin: e?.cycleTotalMin ?? null,
            occupancyMin: occ,
            tempC: e?.defaultTemperature ?? null,
            pressureBar: e?.defaultPressureMpa != null ? r2(e.defaultPressureMpa * 10) : null,
            inputKg: splitInput(total, perRoundKg, rowCount, seq),
          });
        }
      }
      if (eqs.some((e) => occupancyFor(e, heatingMin ?? e.defaultTimeMin) == null)) warnings.push("설비 사이클 시간이 없어 같은 설비를 다시 쓸 시각을 계산하지 못한 설비가 있습니다.");
      return { processGroupId: g.id, name: g.name, ccpType: g.ccpType, mappingSource: g.mappingSource, rounds: out, warnings };
    });

    return { rowKey: item.rowKey, productId: item.productId, plannedKg: item.plannedKg, roundsCount: rounds, processes, warnings: itemWarnings };
  });
}
