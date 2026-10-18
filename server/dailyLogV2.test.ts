/**
 * 일일일지 v2 — 회사별 정의·기록·검사·표시 (PR-B1 / docs/architecture/17)
 */
import { describe, it, expect } from "vitest";
import { definitionProblems, criteriaText, type DailyLogDefinition } from "../shared/dailyLog/definition";
import { khaccpDefinition } from "../shared/dailyLog/khaccpDefinition";
import { newRecordV2, expectedRows, evaluateRow, mergeV2, v2SaveProblems, v2SubmitIssues, v2ApproveIssues, rowIdOf } from "../shared/dailyLog/recordV2";
import { buildDailyLogViewModelV2 } from "../shared/dailyLog/viewModelV2";

const NOW = { date: "2026-11-20", time: "18:00" };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** B사: 원료실 3 · 냉동 3 · 냉장 없음, 습도 없음, 하루 3회 */
function companyB(): DailyLogDefinition {
  const slots = (p: string) => [1, 2, 3].map((n) => ({ slotId: `${p}.s${n}`, label: ["시작", "중간", "종료"][n - 1], plannedTime: null, sortOrder: n }));
  const t = (lower: number | null, upper: number | null) => ({ lower, upper, lowerInclusive: true, upperInclusive: true, required: true });
  return {
    definitionVersion: 1, templateCode: null, enabledSections: ["hygiene", "temperatureHumidity", "freezer"],
    sectionInfo: {},
    questions: [{ itemId: "b.q1", section: "hygiene", stage: "작업전", category: "개인위생", text: "손 세척을 했는가?", responseType: "check", sortOrder: 1, active: true }],
    zones: [{ zoneId: "b.z1", name: "원료창고", sortOrder: 1, active: true }, { zoneId: "b.z2", name: "냉동구역", sortOrder: 2, active: true }],
    points: [
      ...[1, 2, 3].map((n) => ({ pointId: `b.room${n}`, zoneId: "b.z1", name: `원료실${n}`, section: "temperatureHumidity" as const, sortOrder: n, active: true, measurements: { temperature: t(1, 25) }, slots: slots(`b.room${n}`) })),
      ...[1, 2, 3].map((n) => ({ pointId: `b.fz${n}`, zoneId: "b.z2", name: `냉동고${n}호`, section: "freezer" as const, sortOrder: n, active: true, measurements: { temperature: t(null, -18) }, slots: slots(`b.fz${n}`) })),
    ],
  };
}

describe("정의 검사", () => {
  it("단지 원본 템플릿·B사 정의는 통과", () => {
    expect(definitionProblems(khaccpDefinition())).toEqual([]);
    expect(definitionProblems(companyB())).toEqual([]);
  });
  it("ID 중복·없는 구역·하한>상한·사용 영역에 대상 없음은 거부", () => {
    const d = companyB();
    d.points[1].pointId = d.points[0].pointId;
    d.points[2].zoneId = "nope";
    d.points[3].measurements.temperature = { lower: 5, upper: -5, lowerInclusive: true, upperInclusive: true, required: true };
    d.enabledSections.push("refrigerator");
    const p = definitionProblems(d).join("\n");
    expect(p).toMatch(/측정 대상 ID 중복/);
    expect(p).toMatch(/구역이 없습니다/);
    expect(p).toMatch(/하한이 상한보다 큽니다/);
    expect(p).toMatch(/냉장 온도 점검기록지: 사용 중인 측정 대상이 없습니다/);
  });
  it("기준 문장은 숫자 설정에서", () => {
    expect(criteriaText("temperature", { lower: 0, upper: 10, lowerInclusive: true, upperInclusive: true, required: true })).toBe("0℃~10℃");
    expect(criteriaText("humidity", { lower: null, upper: 65, lowerInclusive: true, upperInclusive: true, required: true })).toBe("65% 이하");
  });
});

describe("회사별 기록 — 구역·대상·회차 수가 다르면 각자", () => {
  it("단지: 원재료실2·급속1·냉동1·냉장1 × 오전·오후 = 10행, 질문 32", () => {
    const r = newRecordV2(khaccpDefinition(), "2026-11-20", 7);
    expect(r.measurements).toHaveLength(10);
    expect(r.answers).toHaveLength(32);
    expect(r.measurements.every((m) => m.temperature === null && m.humidity === null && m.measuredAt === null && m.evaluation === null)).toBe(true);
  });
  it("B사: 원료실3·냉동3 × 하루 3회 = 18행, 냉장 없음, 습도 칸 요구 없음", () => {
    const r = newRecordV2(companyB(), "2026-11-20", 1);
    expect(r.measurements).toHaveLength(18);
    expect(expectedRows(companyB()).every((e) => !e.point.measurements.humidity)).toBe(true);
  });
  it("사용 중지 대상·영역은 행이 생기지 않음", () => {
    const d = companyB();
    d.points[0].active = false;
    expect(newRecordV2(d, "2026-11-20", 1).measurements).toHaveLength(15);
  });
});

describe("평가는 서버가 기준으로 — 0 은 값, 미입력은 평가 없음", () => {
  const fridge = khaccpDefinition().points.find((p) => p.pointId === "kh.fridge")!;
  it("0~10℃: 0 적합, -0.1 부적합, 미입력 null, 대상외 null", () => {
    expect(evaluateRow(fridge, { temperature: 0, humidity: null, notApplicable: false })).toBe("pass");
    expect(evaluateRow(fridge, { temperature: -0.1, humidity: null, notApplicable: false })).toBe("fail");
    expect(evaluateRow(fridge, { temperature: null, humidity: null, notApplicable: false })).toBeNull();
    expect(evaluateRow(fridge, { temperature: 3, humidity: null, notApplicable: true })).toBeNull();
  });
  it("화면이 pass 로 보내도 기준 밖이면 fail, 정의·날짜·설정 버전은 이전 값 유지", () => {
    const prev = newRecordV2(khaccpDefinition(), "2026-11-20", 7);
    const inc: any = clone(prev);
    const row = inc.measurements.find((m: any) => m.pointId === "kh.fridge");
    row.temperature = 15; row.evaluation = "pass";
    inc.businessDate = "2020-01-01"; inc.settingsVersionId = 999; inc.definitionSnapshot = { hacked: true };
    const out = mergeV2(prev, inc);
    expect(out.measurements.find((m) => m.pointId === "kh.fridge")!.evaluation).toBe("fail");
    expect(out.businessDate).toBe("2026-11-20");
    expect(out.settingsVersionId).toBe(7);
    expect(out.definitionSnapshot).toBe(prev.definitionSnapshot);
  });
});

describe("저장·제출·승인 검사 — 정의 스냅샷 기준", () => {
  const filled = () => {
    const r = newRecordV2(khaccpDefinition(), "2026-11-20", 7);
    for (const m of r.measurements) {
      m.measuredAt = "08:00";
      m.temperature = m.pointId.startsWith("kh.raw") ? 20 : m.pointId === "kh.rapid" ? -30 : m.pointId === "kh.freezer" ? -20 : 3;
      if (m.pointId.startsWith("kh.raw")) m.humidity = 50;
    }
    for (const a of r.answers) {
      if (a.itemId === "H07") a.numericValue = 4;
      else if (a.itemId === "H18") { a.value = "yes"; a.notApplicable = true; a.notApplicableReason = "출하 없음"; }
      else a.value = "yes";
    }
    return mergeV2(r, r);
  };
  it("다 채우면 통과", () => {
    expect(v2SubmitIssues(filled(), NOW)).toEqual([]);
  });
  it("필수 행을 배열에서 빼도 누락으로 잡힘, 모르는 행·중복 행은 저장부터 거부", () => {
    const r = filled();
    r.measurements = r.measurements.slice(1);
    expect(v2SubmitIssues(r, NOW).join()).toMatch(/원재료실1 오전: 측정 행이 없습니다/);
    const r2 = filled();
    r2.measurements.push({ ...r2.measurements[0] });
    r2.measurements.push({ ...r2.measurements[1], rowId: rowIdOf("other.point", "x"), pointId: "other.point", slotId: "x" });
    const p = v2SaveProblems(r2).join();
    expect(p).toMatch(/중복/);
    expect(p).toMatch(/정의에 없는 측정 행/);
  });
  it("미측정·실측시각 없음·미래 시각·대상외 사유 없음", () => {
    const r = filled();
    r.measurements[0].temperature = null;
    r.measurements[1].measuredAt = null;
    r.measurements[2].measuredAt = "19:30";
    r.measurements[3].notApplicable = true;
    const p = v2SubmitIssues(r, NOW).join("\n");
    expect(p).toMatch(/원재료실1 오전 온도를 입력하세요/);
    expect(p).toMatch(/실제 측정시각을 입력하세요/);
    expect(p).toMatch(/19:30 이 아직 오지 않았습니다/);
    expect(p).toMatch(/'대상외' 사유/);
  });
  it("기준 이탈·'아니오' 는 발생내용과 대응 필요, 미해결 이탈은 승인 불가", () => {
    const r = filled();
    const fr = r.measurements.find((m) => m.pointId === "kh.fridge")!;
    fr.temperature = 12;
    const r2 = mergeV2(r, r);
    expect(v2SubmitIssues(r2, NOW).join()).toMatch(/기준 이탈 — 발생내용과 대응/);
    r2.deviations.push({ deviationId: "d1", rowId: fr.rowId, itemId: null, description: "냉장고 12℃", action: "원재료 이동·냉장고 점검", result: "", completedAt: null, actionBy: "홍", confirmedBy: "", state: "open" });
    expect(v2SubmitIssues(r2, NOW)).toEqual([]);
    expect(v2ApproveIssues(r2, NOW).join()).toMatch(/해결되지 않은 이탈·조치 1건/);
    r2.deviations[0].state = "resolved";
    expect(v2ApproveIssues(r2, NOW)).toEqual([]);
  });
  it("운송 온도: 숫자 또는 운송 없음+사유 (7번 온도만, 18번 예/아니오+온도)", () => {
    const r = filled();
    const a7 = r.answers.find((a) => a.itemId === "H07")!;
    a7.numericValue = null;
    expect(v2SubmitIssues(r, NOW).join()).toMatch(/위생 7번: 온도/);
    a7.numericValue = 0;
    expect(v2SubmitIssues(r, NOW)).toEqual([]);
  });
});

describe("표시 데이터", () => {
  it("적합·부적합·미기록·대상외, 0℃, 기준 문장, 운송 온도", () => {
    const r = newRecordV2(khaccpDefinition(), "2026-11-20", 7);
    const fr = r.measurements.filter((m) => m.pointId === "kh.fridge");
    fr[0].temperature = 0; fr[0].measuredAt = "08:00";
    fr[1].notApplicable = true; fr[1].notApplicableReason = "냉장고 정비";
    r.answers.find((a) => a.itemId === "H07")!.numericValue = 4.5;
    const vm = buildDailyLogViewModelV2(mergeV2(r, r));
    const fridge = vm.sections.find((s) => s.section === "refrigerator")!;
    expect(fridge.measures![0]).toMatchObject({ point: "원재료 냉장고", slot: "오전", measuredAt: "08:00", verdict: "적합", criteria: "온도 0℃~10℃" });
    expect(fridge.measures![0].values.temperature).toBe("0℃");
    expect(fridge.measures![1]).toMatchObject({ verdict: "대상외", naReason: "냉장고 정비" });
    const raw = vm.sections.find((s) => s.section === "temperatureHumidity")!;
    expect(raw.kinds).toEqual(["temperature", "humidity"]);
    expect(raw.measures![0].verdict).toBe("미기록");
    const h = vm.sections.find((s) => s.section === "hygiene")!;
    expect(h.checks![6]).toMatchObject({ itemId: "H07", verdict: null, tempText: "4.5℃" });
    expect(h.checks![0].verdict).toBe("미기록");
    expect(h.info?.title).toBe("일반위생관리 및 공정점검표");
  });
});
