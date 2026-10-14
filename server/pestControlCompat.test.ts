/**
 * 방충 옛 형식(items) 호환 변환 — 공통 기록 #91 (덤프 10/14 실제 모양)
 * 없는 정보를 만들지 않고, 옮기지 못한 것은 안내로 남긴다.
 */
import { describe, it, expect } from "vitest";
import { convertLegacyPestItems } from "../client/src/lib/checklist/pestControlCompat";

const REC91 = {
  items: [
    { notes: "", location: "원료창고", deviceType: "trap_light", captureCount: 10 },
    { notes: "", location: "주방", deviceType: "trap_box", captureCount: 20 },
    { notes: "", location: "성형실", deviceType: "r_trap", captureCount: 30 },
  ],
  formDate: "2026-02-15", checkDate: "2026-02-10", confirmer: "", specialNotes: "", correctiveAction: "",
};

describe("convertLegacyPestItems", () => {
  it("#91: 3행 변환 — 아는 장치만 한글, 모르는 값은 그대로, 포획 수는 비고로", () => {
    const r = convertLegacyPestItems(REC91);
    expect(r.converted).toBe(true);
    expect(r.rows).toEqual([
      { equipmentName: "포충등", installLocation: "원료창고", managementNote: "포획 10 (옛 기록 · 비래/보행 구분 없음)" },
      { equipmentName: "포서통", installLocation: "주방", managementNote: "포획 20 (옛 기록 · 비래/보행 구분 없음)" },
      { equipmentName: "r_trap", installLocation: "성형실", managementNote: "포획 30 (옛 기록 · 비래/보행 구분 없음)" },
    ]);
    expect(r.notices.join(" ")).toContain("3개 행");
    expect(r.notices.join(" ")).toContain("r_trap");
    expect(r.specialNotesAppend).toBe("");
  });

  it("포획 0 도 남긴다 (0/false 값 보존), 비고·확인자·개선조치 옮김", () => {
    const r = convertLegacyPestItems({ items: [{ location: "A", deviceType: "trap_box", captureCount: 0, notes: "청소함" }], confirmer: "김", correctiveAction: "교체" });
    expect(r.rows[0].managementNote).toBe("포획 0 (옛 기록 · 비래/보행 구분 없음) · 청소함");
    expect(r.specialNotesAppend).toBe("확인자: 김\n개선조치: 교체");
    expect(r.notices.some((n) => n.includes("확인자"))).toBe(true);
  });

  it("지금 형식(rows)이 있거나 items 가 없으면 변환하지 않는다", () => {
    expect(convertLegacyPestItems({ rows: [{ equipmentName: "x" }], items: REC91.items }).converted).toBe(false);
    expect(convertLegacyPestItems({}).converted).toBe(false);
    expect(convertLegacyPestItems(null).converted).toBe(false);
    expect(convertLegacyPestItems({ items: [] }).converted).toBe(false);
  });
});
