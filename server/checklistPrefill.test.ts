/**
 * 일지 자동 채움 (일지 PR 2, 2026-10-15)
 *  - 정리 규칙: 뼈대(장소·설비·항목·기준)는 가져오고 판정·측정값·체크·날짜·서명은 비운다 (덤프 10/14 실제 모양)
 *  - 참고 기록 선택: 사업장 범위·오늘 기록·반려 제외·상태 우선·직접 선택
 *  - 온습도 판정: 현재 기준으로 계산, 못 읽으면 미확인
 *  - 공통 양식이 1초 타이머·이전 조회를 더 쓰지 않는다
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeForPrefill, describePrefill, entryPolicyOf, JUDGMENT_TOKENS } from "../client/src/lib/checklist/prefillPolicy";
import { judgeTemp } from "../client/src/lib/checklist/tempJudge";
import { pickPrefill, summarizeRecord, type PrefillRow } from "./lib/checklist/prefillContext";
import { REPO_ROOT } from "./__helpers__/appRoutes";

const TODAY = "2026-10-15";

describe("sanitizeForPrefill — 무엇을 가져오고 무엇을 비우나", () => {
  it("온습도 #94: 기준·구역은 그대로, 측정값·판정은 비움 (Codex 재현: 기준 15°C 이하·입력 20°C·판정 적합 복사)", () => {
    const fd = {
      formDate: "2026-02-17", checkDate: "2026-02-17",
      spaceRows: [
        { id: "4", area: "가공실", judgment: "적합", location: "중앙", tempResult: "20", tempStandard: "15°C 이하" },
        { id: "3", area: "냉동실", judgment: "적합", location: "중앙", tempResult: "-18", tempStandard: "-18°C 이하" },
      ],
      approval: { writerName: "이준석", writerApproved: true },
    };
    const r = sanitizeForPrefill(fd, { recordDate: TODAY });
    expect(r.data.spaceRows).toEqual([
      { id: "4", area: "가공실", judgment: "", location: "중앙", tempResult: "", tempStandard: "15°C 이하" },
      { id: "3", area: "냉동실", judgment: "", location: "중앙", tempResult: "", tempStandard: "-18°C 이하" },
    ]);
    expect(r.data).not.toHaveProperty("approval");
    expect(r.data).not.toHaveProperty("formDate");
    expect(r.data.checkDate).toBe(TODAY); // 본문 날짜는 새 기록일로
    expect(r.counts).toMatchObject({ judgment: 2, measurement: 2 });
    // 참고값으로 이전 값 보존 (사람이 알아볼 이름 포함)
    const temp = r.cleared.find((c) => c.path === "spaceRows[0].tempResult")!;
    expect(temp).toMatchObject({ value: "20", kind: "measurement" });
    expect(temp.label).toBe("가공실 · 온도");
    expect(r.cleared.find((c) => c.path === "spaceRows[0].judgment")!.label).toBe("가공실 · 판정");
  });

  it("설비 점검(한글 칸): 항목별 '적합' 은 비우고 'N/A'·설비명·열 구성은 유지", () => {
    const fd = { data: [{ "판정": "", "설비명": "금속검출기", "안전장치": "적합", "윤활상태": "N/A" }], columns: ["설비명", "판정"], operator: "김", verifier: "이" };
    const r = sanitizeForPrefill(fd, { recordDate: TODAY });
    expect(r.data.data).toEqual([{ "판정": "", "설비명": "금속검출기", "안전장치": "", "윤활상태": "N/A" }]);
    expect(r.data.columns).toEqual(["설비명", "판정"]);
    expect(r.data.operator).toBe("김");        // 반복 담당자 이름은 유지
    expect(r.data.verifier).toBe("");          // 확인자(그날의 확인)는 비움
  });

  it("압축기 정비: 실시 체크(true)는 미확인(false), 행 날짜는 새 기록일, 서명·승인자 비움, false 는 그대로", () => {
    const fd = { rows: [{ date: "2026-02-11", worker: "이정언", oilChange: true, cleanerWash: false, signature: "서명" }], author: "이정언", approver: "한상갑" };
    const r = sanitizeForPrefill(fd, { recordDate: TODAY });
    expect(r.data.rows).toEqual([{ date: TODAY, worker: "이정언", oilChange: false, cleanerWash: false, signature: "" }]);
    expect(r.data.approver).toBe("");
    expect(r.data.author).toBe("이정언");
    expect(r.counts.check).toBe(1); // false 는 기록하지 않음 (0/false 값 보존)
  });

  it("방충: 포획 수(중첩 숫자)는 비우고, 설비·위치·0 이 아닌 뼈대는 유지 / 숫자 id 유지", () => {
    const fd = { rows: [{ id: 3, equipmentName: "포충등", installLocation: "원료창고", flyingPests: { 파리: 4, 모기: 0 }, flyingTotal: 4, managementNote: "교체", deviation: "초과", correctiveAction: "청소" }] };
    const r = sanitizeForPrefill(fd, { recordDate: TODAY });
    expect(r.data.rows).toEqual([{ id: 3, equipmentName: "포충등", installLocation: "원료창고", flyingPests: { 파리: "", 모기: "" }, flyingTotal: "", managementNote: "교체", deviation: "", correctiveAction: "" }]);
  });

  it("건강일지 답변 O/X 는 모두 미확인으로", () => {
    const r = sanitizeForPrefill({ employeeRows: [{ name: "김미영", answers: { q1: "X", q2: "O" } }] }, { recordDate: TODAY });
    expect(r.data.employeeRows).toEqual([{ name: "김미영", answers: { q1: "", q2: "" } }]);
    expect(r.cleared[0].label).toBe("김미영 · 답변 · q1");
  });

  it("양식별 keep / clear 예외, 원본 객체는 바꾸지 않음", () => {
    const src = { rows: [{ result: "적합", note: "반복 문구" }], fixedResult: "적합" };
    const snapshot = JSON.stringify(src);
    const r = sanitizeForPrefill(src, { recordDate: TODAY, keep: ["fixedResult"], clear: ["note"] });
    expect(r.data).toEqual({ rows: [{ result: "", note: "" }], fixedResult: "적합" });
    expect(JSON.stringify(src)).toBe(snapshot);
  });

  it("빈 원본·null 도 안전", () => {
    expect(sanitizeForPrefill(null, { recordDate: TODAY }).data).toEqual({});
    expect(describePrefill({ judgment: 0, measurement: 0, check: 0, date: 0, dayOnly: 0 })).toBe("비운 값은 없습니다.");
    expect(describePrefill({ judgment: 2, measurement: 3, check: 0, date: 1, dayOnly: 1 })).toBe("판정 2건, 측정값 3건, 서명·조치 1건은 비웠습니다 — 오늘 확인해 입력하세요.");
    expect(JUDGMENT_TOKENS.has("N/A")).toBe(false);
  });

  it("하루 한 장 / 여러 장 정책", () => {
    expect(entryPolicyOf("temperature_humidity_check")).toBe("single");
    expect(entryPolicyOf("quality_issue_record")).toBe("multiple");
    expect(entryPolicyOf("training_log")).toBe("multiple");
  });
});

const row = (o: Partial<PrefillRow>): PrefillRow => ({ id: 1, siteId: 1, formDate: "2026-10-14", status: "approved", title: null, formData: {}, createdAt: "2026-10-14T01:00:00Z", ...o });

describe("pickPrefill — 참고 기록 고르기", () => {
  const rows = [
    row({ id: 10, siteId: 1, formDate: TODAY, status: "draft" }),                       // 오늘 초안 → 이어쓰기
    row({ id: 9, siteId: 1, formDate: "2026-10-14", status: "draft", createdAt: "2026-10-14T09:00:00Z" }),
    row({ id: 8, siteId: 1, formDate: "2026-10-14", status: "approved", createdAt: "2026-10-14T01:00:00Z", formData: { approval: { writerName: "이준석" }, spaceRows: [{ area: "가공실" }, { area: "냉장실" }] } }),
    row({ id: 7, siteId: 2, formDate: "2026-10-14", status: "approved" }),             // 다른 사업장
    row({ id: 6, siteId: 1, formDate: "2026-10-13", status: "rejected" }),             // 반려
    row({ id: 5, siteId: 1, formDate: "2026-10-12", status: "submitted" }),
  ];

  it("사업장 사용자: 같은 사업장만, 오늘 기록은 이어쓰기로, 최근 날짜 안에서 승인완료 우선", () => {
    const r = pickPrefill(rows, { formDate: TODAY, userSiteId: 1 });
    expect(r.todayRecords).toEqual([{ id: 10, status: "draft", siteId: 1 }]);
    expect(r.reference?.id).toBe(8);
    expect(r.reference?.writerName).toBe("이준석");
    expect(r.reference?.summary).toBe("가공실, 냉장실 (2행)");
    expect(r.candidates.map((c) => c.id)).toEqual([9, 8, 5]); // 다른 사업장(7)·반려(6)·오늘(10) 제외
  });

  it("다른 사업장 기록을 직접 골라도 범위 밖이면 refNotFound", () => {
    const r = pickPrefill(rows, { formDate: TODAY, userSiteId: 1, refId: 7 });
    expect(r.reference).toBeNull();
    expect(r.refNotFound).toBe(true);
  });

  it("사업장 없는 관리자: 회사 전체 (다른 사업장 후보도 사업장 표시와 함께)", () => {
    const r = pickPrefill(rows, { formDate: TODAY, userSiteId: null });
    expect(r.candidates.some((c) => c.id === 7 && c.siteId === 2)).toBe(true);
  });

  it("직접 고른 기록(범위 안)은 오늘 기록이라도 참고로 쓸 수 있다", () => {
    expect(pickPrefill(rows, { formDate: TODAY, userSiteId: 1, refId: 10 }).reference?.id).toBe(10);
  });

  it("기록 없음 → reference null, 후보 0", () => {
    const r = pickPrefill([], { formDate: TODAY, userSiteId: 1 });
    expect(r).toMatchObject({ reference: null, candidates: [], todayRecords: [], refNotFound: false });
  });

  it("form_data 가 문자열(JSON)이어도 읽는다", () => {
    expect(summarizeRecord({ rows: [{ location: "포장실" }] })).toBe("포장실 (1행)");
    const r = pickPrefill([row({ id: 3, formData: JSON.stringify({ rows: [{ location: "A" }] }) })], { formDate: TODAY, userSiteId: null });
    expect(r.reference?.formData).toEqual({ rows: [{ location: "A" }] });
  });
});

describe("judgeTemp — 현재 기준으로 판정", () => {
  it("Codex 재현 사례: 기준 15°C 이하 · 20°C → 부적합", () => {
    expect(judgeTemp("20", "15°C 이하")).toBe("부적합");
    expect(judgeTemp("15", "15°C 이하")).toBe("적합");
  });
  it("범위·음수·이상", () => {
    expect(judgeTemp("2", "-2 ~ 5°C")).toBe("적합");
    expect(judgeTemp("-3", "-2 ~ 5°C")).toBe("부적합");
    expect(judgeTemp("-18", "-18°C 이하")).toBe("적합");
    expect(judgeTemp("-17.5", "-18°C 이하")).toBe("부적합");
    expect(judgeTemp("4", "5°C 이상")).toBe("부적합");
    expect(judgeTemp(0, "-2 ~ 5°C")).toBe("적합"); // 0 도 값
  });
  it("값이 없거나 기준을 못 읽으면 미확인", () => {
    expect(judgeTemp("", "15°C 이하")).toBe("");
    expect(judgeTemp("abc", "15°C 이하")).toBe("");
    expect(judgeTemp("10", "실온")).toBe("");
  });
});

describe("공통 양식 — 타이머·이전 조회 제거", () => {
  const src = readFileSync(join(REPO_ROOT, "client/src/components/checklist/ChecklistFormLayout.tsx"), "utf-8");
  it("1초 타이머로 복원 종료를 판단하지 않고, getLatestByDate 대신 prefillContext 를 쓴다", () => {
    expect(src).not.toMatch(/setTimeout\(/);
    expect(src).not.toMatch(/getLatestByDate/);
    expect(src).toMatch(/genericChecklist\.prefillContext\.useQuery/);
    expect(src).toMatch(/sanitizeForPrefill/);
  });
  it("수정 화면 복원이 결재 자동 지정 '적용' 이 아니라 조회 완료에 의존", () => {
    expect(src).toMatch(/!dataLoaded && approvalSettled/);
  });
});
