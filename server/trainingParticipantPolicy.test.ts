/**
 * HACCP 교육 참가자 — 참석 · 합격 · 수료증은 별개 (Codex 교육 점검 2026-10-18 EDU-02~04)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decidePassed, certificateBlockers, expiryFromTrainingDate } from "./lib/training/trainingParticipantPolicy";
import { formatTrainingMinutes } from "../shared/trainingLabels";

describe("decidePassed — 과정 합격 점수로 서버가 판정", () => {
  it("합격 점수 있음", () => {
    expect(decidePassed(80, "80.00")).toBe(1);
    expect(decidePassed(79.5, "80")).toBe(0);
  });
  it("합격 점수 없음 → 판정하지 않음 (화면 고정 80점 기준 제거)", () => {
    expect(decidePassed(50, null)).toBeNull();
    expect(decidePassed(50, "")).toBeNull();
  });
});

describe("certificateBlockers", () => {
  const course = { hasAssessment: 1, passingScore: "80" };
  it("출석·합격 전이면 막음", () => {
    expect(certificateBlockers({ attendanceStatus: "registered", passed: null, certificateIssued: 0 }, course)).toHaveLength(2);
    expect(certificateBlockers({ attendanceStatus: "attended", passed: 0, certificateIssued: 0 }, course).join()).toMatch(/평가 합격 전/);
    expect(certificateBlockers({ attendanceStatus: "attended", passed: 1, certificateIssued: 1 }, course).join()).toMatch(/이미/);
  });
  it("평가 없는 과정은 출석만으로 발급 가능", () => {
    expect(certificateBlockers({ attendanceStatus: "attended", passed: null, certificateIssued: 0 }, { hasAssessment: 0, passingScore: null })).toEqual([]);
  });
});

describe("expiryFromTrainingDate — 재교육 기한 = 교육일 + 유효기간", () => {
  it("월 단위, 말일 넘침은 그 달 말일", () => {
    expect(expiryFromTrainingDate("2026-10-18", 12)).toBe("2027-10-18");
    expect(expiryFromTrainingDate("2026-08-31", 6)).toBe("2027-02-28");
    expect(expiryFromTrainingDate("2026-10-18", null)).toBeNull();
  });
});

describe("표시", () => {
  it("교육 시간은 분 저장 → 시간·분 표시", () => {
    expect(formatTrainingMinutes(90)).toBe("1시간 30분");
    expect(formatTrainingMinutes(60)).toBe("1시간");
    expect(formatTrainingMinutes(null)).toBe("-");
  });
  it("교육 관리 화면은 저장 이름 그대로 읽는다 (EDU-03)", () => {
    const s = readFileSync(join(__dirname, "../client/src/pages/system/TrainingManagement.tsx"), "utf-8");
    for (const wrong of ["durationHours}", "validityMonths ?", "instructorName ||", "currentParticipants", "participant.attended", "jsPDF"]) {
      expect(s, wrong).not.toContain(wrong);
    }
    expect(s).toMatch(/formatTrainingMinutes\(course\.duration\)/);
    expect(s).toMatch(/schedule\.trainerName/);
    expect(s).toMatch(/<ScheduleManageDialog/);
    expect(s).toMatch(/<CourseDetailDialog/);
  });
  it("수료증 만료일은 일정을 거쳐 과정을 찾는다 (일정 번호를 과정 번호로 쓰지 않음)", () => {
    const s = readFileSync(join(__dirname, "db/system/training.ts"), "utf-8");
    expect(s).not.toMatch(/getTrainingCourseById\(participant\.scheduleId/);
    expect(s).toMatch(/values\(\{ \.\.\.data, tenantId \}/);
  });
});
