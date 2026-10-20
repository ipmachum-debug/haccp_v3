/**
 * 하루 CCP 가열공정 계획 (PR-B) — 미리보기와 실제 생성이 같이 쓰는 순수 함수
 */
import { describe, it, expect } from "vitest";
import { planDay, roundsFor, splitInput, occupancyFor, heatingFor, type PlannerGroup, type PlannerItem, type PlannerEquipment } from "./lib/production/ccpDayPlanner";

const eq = (id: number, o: Partial<PlannerEquipment> = {}): PlannerEquipment => ({
  id, name: `교반기${id}`, sortOrder: id, defaultTemperature: 99, defaultPressureMpa: 0.18, cycleTotalMin: 70, defaultTimeMin: 10, ...o,
});
const group = (o: Partial<PlannerGroup> = {}): PlannerGroup => ({
  id: 1, name: "교반-가열공정", ccpType: "CCP-1B", mappingSource: "BOM", mode: "sequential", intervalMin: 10, batchSize: 1,
  profileTimeMin: 10, equipments: [eq(1), eq(2), eq(3)], workStartTime: "05:00", ...o,
});
const item = (o: Partial<PlannerItem> = {}): PlannerItem => ({
  rowKey: "r1", productId: 10, plannedKg: 30, startTime: "09:00", subBatchKg: 10, inputByGroup: { 1: 10 }, groups: [group()], ...o,
});
const times = (p: ReturnType<typeof planDay>[number]) => p.processes[0].rounds.map((r) => `${r.equipmentName}@${r.plannedStart}`);

describe("회차·투입량·점유", () => {
  it("회차 = 계획량 ÷ 1회차 기준량 올림", () => {
    expect(roundsFor(25, 10)).toBe(3);
    expect(roundsFor(30, 10)).toBe(3);
    expect(roundsFor(5, null)).toBe(1);
  });
  it("투입량: 앞 회차는 기준량, 마지막은 남은 양", () => {
    expect([1, 2, 3].map((s) => splitInput(25, 10, 3, s))).toEqual([10, 10, 5]);
  });
  it("점유 = 사이클 + (가열 − 설비 기본 가열): 약식 34 + (35 − 10) = 59", () => {
    expect(occupancyFor(eq(1, { cycleTotalMin: 34 }), 35)).toBe(59);
  });
});

describe("planDay — 설비 시간표", () => {
  it("순차·간격 10분·사이클 70분: 05:00/05:10/05:20 → 같은 설비는 70분 뒤", () => {
    const [p] = planDay([item({ plannedKg: 60 })]);
    expect(times(p)).toEqual(["교반기1@05:00", "교반기2@05:10", "교반기3@05:20", "교반기1@06:10", "교반기2@06:20", "교반기3@06:30"]);
    expect(p.processes[0].rounds[0]).toMatchObject({ heatingMin: 10, occupancyMin: 70, tempC: 99, pressureBar: 1.8, inputKg: 10, plannedEnd: "06:10" });
  });
  it("다음 줄 제품은 비어 있는 설비부터 이어서 (2회차만 쓴 뒤 3호기는 바로)", () => {
    const [a, b] = planDay([item({ plannedKg: 20 }), item({ rowKey: "r2", plannedKg: 20 })]);
    expect(times(a)).toEqual(["교반기1@05:00", "교반기2@05:10"]);
    expect(times(b)).toEqual(["교반기3@05:20", "교반기1@06:10"]);
  });
  it("오늘 제외한 설비는 쓰지 않음", () => {
    const [p] = planDay([item()], { excludedEquipmentIds: [2] });
    expect(times(p)).toEqual(["교반기1@05:00", "교반기3@05:10", "교반기1@06:10"]);
    const [none] = planDay([item()], { excludedEquipmentIds: [1, 2, 3] });
    expect(none.processes[0].rounds.every((r) => r.equipmentId == null && r.plannedStart == null)).toBe(true);
    expect(none.processes[0].warnings.join()).toMatch(/오늘 제외한 설비뿐/);
  });
  it("이미 저장된 오늘 배치가 쓰는 설비는 그 뒤로", () => {
    const [p] = planDay([item({ plannedKg: 10 })], { busy: [
      { equipmentId: 1, processGroupId: 1, startMin: 300, endMin: 370 },
      { equipmentId: 2, processGroupId: 1, startMin: 310, endMin: 380 },
      { equipmentId: 3, processGroupId: 1, startMin: 320, endMin: 390 },
    ] });
    expect(times(p)).toEqual(["교반기1@06:10"]);
  });
  it("동시 방식은 간격 없이 같은 시각, 묶음 방식은 묶음 크기만큼 함께", () => {
    const [c] = planDay([item({ groups: [group({ mode: "concurrent" })] })]);
    expect(times(c)).toEqual(["교반기1@05:00", "교반기2@05:00", "교반기3@05:00"]);
    const [g] = planDay([item({ plannedKg: 40, groups: [group({ mode: "grouped", batchSize: 2, equipments: [eq(1), eq(2), eq(3), eq(4)] })] })]);
    // 4회차 ÷ 묶음 2 = 2묶음, 행 4개
    expect(times(g)).toEqual(["교반기1@05:00", "교반기2@05:00", "교반기3@05:10", "교반기4@05:10"]);
  });
  it("오늘만 바꾼 시작시각이 설비 작업 시작시각보다 우선, 설비 시작이 없으면 배치 시작", () => {
    expect(times(planDay([item({ plannedKg: 10, startTimeOverride: "07:30" })])[0])).toEqual(["교반기1@07:30"]);
    expect(times(planDay([item({ plannedKg: 10, groups: [group({ workStartTime: null })] })])[0])).toEqual(["교반기1@09:00"]);
  });
  it("가열 운전시간은 공정 프로필 → 설비 기본, 한계기준 하한을 쓰지 않음", () => {
    const [p] = planDay([item({ plannedKg: 10, groups: [group({ profileTimeMin: null, equipments: [eq(1, { defaultTimeMin: 12, cycleTotalMin: 40 })] })] })]);
    expect(p.processes[0].rounds[0]).toMatchObject({ heatingMin: 12, occupancyMin: 40 });
  });
  it("시간 프로필 0/1/여러 개를 구분 — 여러 개면 가열시간을 정하지 않고 설비 기본으로 내려가지 않음 (검토 2)", () => {
    expect([heatingFor(0, null, 10), heatingFor(1, 35, 10), heatingFor(2, null, 10), heatingFor(2, 35, 10), heatingFor(0, null, null), heatingFor(1, null, 12)])
      .toEqual([10, 35, null, null, null, 12]);
    // Codex 재현: 활성 프로필 2개(10분/35분), 설비 기본 10분·사이클 34분 → 이전: 가열 10분(설비 기본) / 지금: 가열 비움, 점유는 사이클 34분
    const many = group({ profileTimeMin: null, profileCount: 2, equipments: [eq(1, { defaultTimeMin: 10, cycleTotalMin: 34 })] });
    const [p] = planDay([item({ plannedKg: 20, groups: [many] })]);
    expect(p.processes[0].rounds.map((r) => [r.heatingMin, r.occupancyMin, r.plannedStart])).toEqual([[null, 34, "05:00"], [null, 34, "05:34"]]);
    expect(p.processes[0].warnings.join()).toMatch(/프로필\)이 2개라 가열 운전시간을 정하지 않았습니다/);
    // 1개 → 프로필 값, 0개 → 설비 기본 (기존과 같음)
    expect(planDay([item({ plannedKg: 10, groups: [group({ profileTimeMin: 35, profileCount: 1, equipments: [eq(1, { cycleTotalMin: 34 })] })] })])[0].processes[0].rounds[0]).toMatchObject({ heatingMin: 35, occupancyMin: 59 });
    expect(planDay([item({ plannedKg: 10, groups: [group({ profileTimeMin: null, profileCount: 0, equipments: [eq(1, { cycleTotalMin: 34 })] })] })])[0].processes[0].rounds[0]).toMatchObject({ heatingMin: 10, occupancyMin: 34 });
    // 여러 개 + 설비 기본 없음도 그대로 비움
    expect(planDay([item({ plannedKg: 10, groups: [group({ profileTimeMin: null, profileCount: 3, equipments: [eq(1, { defaultTimeMin: null, cycleTotalMin: 34 })] })] })])[0].processes[0].rounds[0]).toMatchObject({ heatingMin: null, occupancyMin: 34 });
  });
  it("설비 없는 공정 → 설비·시각 비움 + 안내, 설정값을 한계기준으로 채우지 않음", () => {
    const [p] = planDay([item({ groups: [group({ equipments: [] })] })]);
    expect(p.processes[0].rounds).toHaveLength(3);
    expect(p.processes[0].rounds[0]).toMatchObject({ equipmentId: null, plannedStart: null, tempC: null, pressureBar: null });
    expect(p.processes[0].warnings.join()).toMatch(/설비가 지정되지 않아/);
  });
  it("BOM 공정 지정이 없으면 계획량 전체를 회차에 나눔", () => {
    const [p] = planDay([item({ plannedKg: 25, inputByGroup: {} })]);
    expect(p.processes[0].rounds.map((r) => r.inputKg)).toEqual([10, 10, 5]);
  });
  it("같은 입력이면 늘 같은 결과 (무작위 없음)", () => {
    expect(planDay([item(), item({ rowKey: "r2" })])).toEqual(planDay([item(), item({ rowKey: "r2" })]));
  });
});

describe("묶음 설비 일부 제외 — 같은 설비 동시 이중 배정 없음 (2026-10-19, Codex 단지 회귀)", () => {
  const overlaps = (p: ReturnType<typeof planDay>) => {
    const rows = p.flatMap((x) => x.processes.flatMap((g) => g.rounds)).filter((r) => r.equipmentId != null && r.plannedStart);
    const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const bad: string[] = [];
    rows.forEach((a, i) => rows.slice(i + 1).forEach((b) => {
      if (a.equipmentId !== b.equipmentId) return;
      const [as, ae, bs, be] = [m(a.plannedStart!), m(a.plannedEnd ?? a.plannedStart!), m(b.plannedStart!), m(b.plannedEnd ?? b.plannedStart!)];
      if (as === bs || (as < be && bs < ae)) bad.push(`${a.equipmentName} ${a.plannedStart}/${b.plannedStart}`);
    }));
    return bad;
  };
  it("3대 묶음에서 1대 제외 → 2대 묶음으로 계산, 같은 설비가 같은 시각에 두 번 나오지 않음", () => {
    const g = group({ mode: "grouped", batchSize: 3, equipments: [eq(1), eq(2), eq(3)] });
    const p = planDay([item({ plannedKg: 60, groups: [g] })], { excludedEquipmentIds: [3] });
    const rounds = p[0].processes[0].rounds;
    expect(rounds.map((r) => r.equipmentId)).not.toContain(3);
    expect(times(p[0])).toEqual(["교반기1@05:00", "교반기2@05:00", "교반기1@06:10", "교반기2@06:10", "교반기1@07:20", "교반기2@07:20"]);
    expect(p[0].processes[0].warnings.join()).toMatch(/2대라 묶음을 3대에서 2대로/);
    expect(overlaps(p)).toEqual([]);
  });
  it("제외 없이 3대 묶음은 이전과 같음, 두 제품을 이어서 계획해도 설비 점유가 겹치지 않음", () => {
    const g = group({ mode: "grouped", batchSize: 3, equipments: [eq(1), eq(2), eq(3)] });
    const p = planDay([item({ plannedKg: 30, groups: [g] })]);
    expect(times(p[0])).toEqual(["교반기1@05:00", "교반기2@05:00", "교반기3@05:00"]);
    const two = planDay([item({ plannedKg: 50, groups: [g] }), item({ rowKey: "r2", productId: 11, plannedKg: 30, groups: [g] })], { excludedEquipmentIds: [2] });
    expect(overlaps(two)).toEqual([]);
  });
});

describe("단지 증숙 운영 확정 (2026-10-19 대표 확정) — 약식 1대씩 · 설기 최대 3대 묶음", () => {
  const steamer = (id: number) => eq(id, { name: `증숙기${id}호`, cycleTotalMin: 34, defaultTimeMin: 10 });
  const six = [1, 2, 3, 4, 5, 6].map(steamer);
  const rows = (p: ReturnType<typeof planDay>[number]) => p.processes[0].rounds.map((r) => `${r.equipmentName}@${r.plannedStart} ${r.inputKg}kg`);

  it("약식 119kg (1대 34kg, 1대씩 10분 간격, 가열 35분) → 4회: 34·34·34·17, 서로 다른 증숙기, 점유 59분", () => {
    const g = group({ name: "증숙(약식류)공정", mode: "sequential", intervalMin: 10, batchSize: 1, profileTimeMin: 35, equipments: six, workStartTime: "08:40" });
    const [p] = planDay([item({ plannedKg: 119, subBatchKg: 34, inputByGroup: { 1: 34 }, groups: [g] })]);
    expect(p.roundsCount).toBe(4);
    expect(rows(p)).toEqual(["증숙기1호@08:40 34kg", "증숙기2호@08:50 34kg", "증숙기3호@09:00 34kg", "증숙기4호@09:10 17kg"]);
    expect(p.processes[0].rounds.every((r) => r.heatingMin === 35 && r.occupancyMin === 59)).toBe(true);
  });

  it("설기 37.5kg (1대 5kg, 최대 3대 묶음) → 8회: 묶음 3·3·2, 마지막 대 2.5kg(시루 1개), 묶음 안 설비 겹침 없음", () => {
    const g = group({ name: "증숙(설기류)공정", mode: "grouped", intervalMin: 10, batchSize: 3, profileTimeMin: 10, equipments: six, workStartTime: "08:40" });
    const [p] = planDay([item({ plannedKg: 37.5, subBatchKg: 5, inputByGroup: { 1: 5 }, groups: [g] })]);
    expect(p.roundsCount).toBe(8);
    expect(rows(p)).toEqual([
      "증숙기1호@08:40 5kg", "증숙기2호@08:40 5kg", "증숙기3호@08:40 5kg",
      "증숙기4호@08:50 5kg", "증숙기5호@08:50 5kg", "증숙기6호@08:50 5kg",
      "증숙기1호@09:14 5kg", "증숙기2호@09:14 2.5kg",
    ]);
  });

  it("설기 5배치 → 1-2-3, 4-5 (마지막 묶음을 3대로 채우지 않음)", () => {
    const g = group({ mode: "grouped", batchSize: 3, equipments: six, workStartTime: "08:40" });
    const [p] = planDay([item({ plannedKg: 25, subBatchKg: 5, inputByGroup: { 1: 5 }, groups: [g] })]);
    expect(p.processes[0].rounds.map((r) => r.roundNo)).toEqual([1, 1, 1, 2, 2]);
    expect(p.processes[0].rounds.map((r) => r.inputKg)).toEqual([5, 5, 5, 5, 5]);
  });
});

describe("설비마다 다른 작업 시작 시각 (Codex #605 재검토 7)", () => {
  const two = (o: any = {}) => group({ workStartTime: null, equipments: [eq(1, { workStartTime: "05:00" }), eq(2, { workStartTime: "08:40" })], ...o });
  const times = (p: any) => p.processes[0].rounds.map((r: any) => `${r.equipmentName}@${r.plannedStart}`);
  it("1호기 05:00 · 2호기 08:40 — 2호기는 08:40 전에 배정하지 않는다", () => {
    const [p] = planDay([item({ plannedKg: 10, subBatchKg: 10, groups: [two()] })]);
    expect(times(p)[0]).toMatch(/@05:00$/);
    const [q] = planDay([item({ plannedKg: 10, subBatchKg: 10, groups: [two()] })], { excludedEquipmentIds: [1] });
    expect(times(q)).toEqual([expect.stringMatching(/@08:40$/)]); // 1호기를 빼면 2호기는 자기 시각
  });
  it("묶음 운전은 묶인 설비 중 늦은 시작에 맞춘다, 오늘만 시작 시각은 모든 설비보다 우선", () => {
    const [p] = planDay([item({ plannedKg: 20, subBatchKg: 10, groups: [two({ mode: "grouped", batchSize: 2 })] })]);
    expect(p.processes[0].rounds.map((r: any) => r.plannedStart)).toEqual(["08:40", "08:40"]);
    const [q] = planDay([item({ plannedKg: 10, subBatchKg: 10, startTimeOverride: "07:00", groups: [two()] })], { excludedEquipmentIds: [1] });
    expect(times(q)).toEqual([expect.stringMatching(/@07:00$/)]);
  });
  it("설비 시각이 없으면 이전처럼 공정 기본(첫 설비) 시각", () => {
    const [p] = planDay([item({ plannedKg: 10, subBatchKg: 10, groups: [group({ workStartTime: "06:30" })] })]);
    expect(p.processes[0].rounds[0].plannedStart).toBe("06:30");
  });
});

describe("자정 — 하루 계획은 24:00 안에서만 (2026-10-20 BOM·설비 시간·인쇄 기준 검토 5)", () => {
  const one = (o: Partial<PlannerEquipment> = {}) => group({ profileTimeMin: null, profileCount: 0, workStartTime: null, equipments: [eq(1, { cycleTotalMin: 30, defaultTimeMin: 10, ...o })] });
  it("23:50 시작 30분 점유 → 끝 24:20 이라 막음 (HH:mm 으로 감싸 00:20 으로 저장하지 않음)", () => {
    const [p] = planDay([item({ plannedKg: 10, startTime: "23:50", groups: [one()] })]);
    expect(p.blocking.join()).toMatch(/1회차\(교반기1\)가 자정을 넘깁니다 \(끝 24:20\)/);
  });
  it("Codex 재현: 같은 설비 23:50~ 이미 점유 + 다음 계획 → 다음 날로 넘어가 막힘 (이전: 00:20 으로 저장 → 다시 읽으면 기준일 20분 → 세 번째 계획이 같은 00:20 에 배정)", () => {
    const busy = [{ equipmentId: 1, processGroupId: 1, startMin: 23 * 60 + 50, endMin: 24 * 60 + 20 }];
    const [p] = planDay([item({ plannedKg: 10, startTime: "09:00", groups: [one()] })], { busy });
    expect(p.blocking.length).toBe(1);
    expect(p.processes[0].rounds[0].plannedStart).toBe("00:20"); // 표시 값일 뿐 — blocking 이라 저장되지 않는다
  });
  it("24시간을 넘는 계획(회차가 많음) → 막힘, 자정 전에 끝나는 계획은 그대로", () => {
    const [long] = planDay([item({ plannedKg: 600, subBatchKg: 10, startTime: "05:00", groups: [one({ cycleTotalMin: 30 })] })]);
    expect(long.roundsCount).toBe(60);
    expect(long.blocking.length).toBe(1);
    const [ok] = planDay([item({ plannedKg: 30, startTime: "23:00", groups: [one({ cycleTotalMin: 20 })] })]);
    expect(ok.processes[0].rounds.map((r) => r.plannedStart)).toEqual(["23:00", "23:20", "23:40"]);
    expect(ok.blocking).toEqual([]);
  });
  it("여러 공정이 같은 실제 설비를 쓰면 같은 설비 ID 로 이어서 배정 — 뒤 공정이 자정을 넘으면 그 공정만 막힘 사유", () => {
    const shared = eq(7, { cycleTotalMin: 60, defaultTimeMin: 10 });
    const g1 = group({ id: 1, name: "교반", profileTimeMin: null, profileCount: 0, workStartTime: "22:00", equipments: [shared] });
    const g2 = group({ id: 2, name: "증숙", profileTimeMin: null, profileCount: 0, workStartTime: "22:00", equipments: [shared] });
    const [p] = planDay([item({ plannedKg: 10, inputByGroup: {}, groups: [g1, g2] })], { busy: [{ equipmentId: 7, processGroupId: 9, startMin: 21 * 60, endMin: 22 * 60 + 30 }] });
    expect(p.processes.map((x) => x.rounds[0].plannedStart)).toEqual(["22:30", "23:30"]);
    expect(p.processes[0].blocking).toEqual([]);
    expect(p.processes[1].blocking.join()).toMatch(/증숙 1회차.*끝 24:30/);
  });
});

