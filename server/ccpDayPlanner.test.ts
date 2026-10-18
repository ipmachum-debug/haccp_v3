/**
 * 하루 CCP 가열공정 계획 (PR-B) — 미리보기와 실제 생성이 같이 쓰는 순수 함수
 */
import { describe, it, expect } from "vitest";
import { planDay, roundsFor, splitInput, occupancyFor, type PlannerGroup, type PlannerItem, type PlannerEquipment } from "./lib/production/ccpDayPlanner";

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
