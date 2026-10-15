/**
 * 일일일지 승인 관문 — 모든 검토·승인 전이 경로 (2026-10-15, Codex 일일일지 감사 P1)
 *
 * 재현: 측정 14칸·측정시각 8칸이 빈 자동 생성 일지(#872 10/12)가 승인완료.
 * 고정: 빈 일지는 개별·일괄·바로승인·문서 승인·작성자 제출 어느 경로로도 넘어가지 않고,
 *       요청 상태·직인·승인 이력·배치가 하나도 바뀌지 않는다. 일괄은 문서별 사유와 실제 성공 건수를 돌려준다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const st = vi.hoisted(() => ({
  formData: null as any,
  formByRecord: {} as Record<number, any>, // 요청 번호 = 문서 번호로 두고 문서별 양식 (혼합 일괄 처리용)
  formType: "daily_log",
  writes: [] as string[],
  approveRequest: vi.fn(async () => ({ success: true })),
}));

const isWrite = (q: string) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(q);
const rawExec = vi.fn(async (q: string, p: any[] = []) => {
  if (isWrite(q)) { st.writes.push(q.trim().split("\n")[0]); return [{ affectedRows: 1, insertId: 1 }]; }
  const tenantOk = p.includes(2);
  if (/SELECT reference_type, reference_id FROM h_approval_requests/.test(q)) {
    return [tenantOk ? [{ reference_type: "checklist", reference_id: st.formByRecord[p[0]] !== undefined ? p[0] : 872 }] : []];
  }
  if (/SELECT id, form_type, form_data FROM h_generic_checklist_records/.test(q)) {
    const fd = st.formByRecord[p[0]] !== undefined ? st.formByRecord[p[0]] : st.formData;
    return [tenantOk ? [{ id: p[0], form_type: st.formType, form_data: JSON.stringify(fd) }] : []];
  }
  if (/SELECT id, status, requested_by, tenant_id/.test(q)) return [[{ id: p[0], status: "pending_writer", requested_by: 4, tenant_id: 2 }]];
  if (/SELECT id, status, requested_by\s+FROM h_approval_requests/.test(q)) return [p.slice(1).map((id: number) => ({ id, status: "pending_writer", requested_by: 4 }))];
  if (/SELECT id FROM h_approval_requests WHERE id = \? AND tenant_id = \?/.test(q)) return [tenantOk ? [{ id: p[0] }] : []];
  return [[]];
});
const sqlText = (q: any) => (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : "?")).join("");
const drizzleExec = vi.fn(async (q: any) => {
  const text = sqlText(q);
  if (isWrite(text)) { st.writes.push(text.trim().split("\n")[0]); return [{ affectedRows: 1 }]; }
  return [[{ reference_id: 872, request_type: "daily_log", reference_type: "checklist", status: "pending_review", form_data: JSON.stringify(st.formData) }]];
});

vi.mock("./db/connection", () => ({
  getRawConnection: vi.fn(async () => ({ execute: rawExec, getConnection: vi.fn(async () => ({ execute: rawExec, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() })) })),
  getDb: vi.fn(async () => null),
}));
vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({ execute: drizzleExec, insert: () => ({ values: async () => [{ insertId: 1 }] }) })),
  approveRequest: st.approveRequest,
  getApprovalRequestById: vi.fn(async () => null),
  createNotification: vi.fn(async () => undefined),
}));

import { genericChecklistRouter } from "./routers/checklist/genericChecklist.router";
import { approvalRouter } from "./routers/system/approval.router";
import { findMeasurementIssues, summarizeIssues, findMissingMeasurements } from "../shared/dailyLogMeasurements";

const ctx = { user: { id: 4, name: "한상갑", role: "admin", tenantId: 2, siteId: 1 }, tenantId: 2, req: {} as any, res: {} as any } as any;
const gc = () => genericChecklistRouter.createCaller(ctx);
const ap = () => approvalRouter.createCaller(ctx);

// 자동 생성 빈 일지 (#872 와 같은 모양)
const EMPTY_872 = {
  temperatureHumidity: {
    room1Morning: { pass: null, temp: "", time: "", humidity: "" }, room2Morning: { pass: null, temp: "", time: "", humidity: "" },
    room1Afternoon: { pass: null, temp: "", time: "", humidity: "" }, room2Afternoon: { pass: null, temp: "", time: "", humidity: "" },
  },
  freezerTemperature: { morning: { pass: null, time: "", freezer: "", rapidFreezer: "" }, afternoon: { pass: null, time: "", freezer: "", rapidFreezer: "" } },
  refrigeratorTemperature: { morning: { pass: null, temp: "", time: "" }, afternoon: { pass: null, temp: "", time: "" } },
};
const FULL = {
  temperatureHumidity: [
    { roomName: "원재료실1", timePeriod: "오전", checkTime: "08:16", temperature: "21.1", humidity: "55.8" },
    { roomName: "원재료실1", timePeriod: "오후", checkTime: "15:25", temperature: "25.0", humidity: "45.0" },
    { roomName: "원재료실2", timePeriod: "오전", checkTime: "07:59", temperature: "23.6", humidity: "48.2" },
    { roomName: "원재료실2", timePeriod: "오후", checkTime: "15:37", temperature: "23.2", humidity: "46.4" },
  ],
  freezerTemperature: [
    { timePeriod: "오전", checkTime: "08:39", rapidFreezerTemp: "-30.7", freezerTemp: "-18.3" },
    { timePeriod: "오후", checkTime: "15:21", rapidFreezerTemp: "-31.6", freezerTemp: "-20.2" },
  ],
  refrigeratorTemperature: [
    { timePeriod: "오전", checkTime: "07:45", temperature: "1.1" },
    { timePeriod: "오후", checkTime: "15:45", temperature: "0.5" },
  ],
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

beforeEach(() => {
  st.formData = clone(EMPTY_872); st.formType = "daily_log"; st.writes = []; st.formByRecord = {};
  st.approveRequest.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("측정 기록 검사 (findMeasurementIssues)", () => {
  it("#872 빈 일지 — 미측정 14 + 측정시각 없음 8", () => {
    const issues = findMeasurementIssues(EMPTY_872);
    expect(issues.filter((i) => i.kind === "missing")).toHaveLength(14);
    expect(issues.filter((i) => i.kind === "no_time")).toHaveLength(8);
    expect(summarizeIssues(issues)).toMatch(/^미측정 14건, 측정시각 없음 8건 \(원재료실1 오전 온도/);
    expect(findMissingMeasurements(EMPTY_872)).toHaveLength(14); // 기존 함수 동작 그대로
  });
  it("다 채운 일지는 0", () => {
    expect(findMeasurementIssues(FULL)).toEqual([]);
  });
  it("숫자 아님·단위 붙음·입력 범위 밖·잘못된 시각", () => {
    const f = clone(FULL);
    f.temperatureHumidity[0].temperature = "abc";
    f.temperatureHumidity[1].temperature = "25℃";
    f.temperatureHumidity[2].humidity = "120";
    f.freezerTemperature[0].checkTime = "8:39";
    const kinds = findMeasurementIssues(f).map((i) => `${i.label}:${i.kind}`);
    expect(kinds).toEqual([
      "원재료실1 오전 온도:not_number", "원재료실1 오후 온도:not_number", "원재료실2 오전 습도:out_of_range", "오전 측정시각:no_time",
    ]);
  });
  it("기준 밖 실측값(냉동고 -10℃, 냉장고 8℃)은 막지 않는다 — 값 보존, 부적합·이탈 조치로 기록", () => {
    const f = clone(FULL);
    f.freezerTemperature[0].freezerTemp = "-10";
    f.refrigeratorTemperature[1].temperature = "8";
    expect(findMeasurementIssues(f)).toEqual([]);
  });
});

describe("빈 일지 — 모든 승인 경로가 실패하고 아무것도 바뀌지 않는다", () => {
  const single: Array<[string, () => Promise<unknown>]> = [
    ["검토", () => gc().reviewChecklist({ approvalRequestId: 3609, action: "approve" })],
    ["최종 승인", () => gc().approveChecklist({ approvalRequestId: 3609, action: "approve" })],
    ["바로승인", () => gc().approveWithAutoReview({ approvalRequestId: 3609 })],
    ["문서 승인(approval.approve)", () => ap().approve({ requestId: 3609 })],
    ["문서 검토(approval.reviewRequest)", () => ap().reviewRequest({ requestId: 3609 })],
    ["문서 최종 승인(approval.finalApprove)", () => ap().finalApprove({ requestId: 3609 })],
    ["작성자 제출(approval.submitByWriter)", () => ap().submitByWriter({ approvalRequestId: 3609 })],
  ];
  for (const [name, run] of single) {
    it(`${name} → PRECONDITION_FAILED, 쓰기 0`, async () => {
      await expect(run()).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringMatching(/일일일지 #872 측정 기록 미완료 — 미측정 14건, 측정시각 없음 8건/) });
      expect(st.writes).toEqual([]);
      expect(st.approveRequest).not.toHaveBeenCalled();
    });
  }

  it("일괄 검토·일괄 승인 → 문서별 사유, 성공 0, 쓰기 0", async () => {
    const r1: any = await gc().batchReviewChecklists({ approvalRequestIds: [3609, 3610] });
    const r2: any = await gc().batchApproveChecklists({ approvalRequestIds: [3609] });
    expect(r1).toMatchObject({ success: false, count: 0 });
    expect(r1.failed.map((f: any) => f.approvalRequestId)).toEqual([3609, 3610]);
    expect(r1.message).toMatch(/^0건 검토 완료, 2건 검토 안 됨 — #3609: 일일일지 #872 측정 기록 미완료/);
    expect(r2).toMatchObject({ success: false, count: 0 });
    expect(st.writes).toEqual([]);
  });

  it("문서 일괄 승인(approval.bulkApprove)·작성자 일괄 제출 → 실패로 집계, 쓰기 0", async () => {
    const r: any = await ap().bulkApprove({ requestIds: [3609] });
    expect(r).toMatchObject({ succeeded: 0, failed: 1 });
    const s: any = await ap().bulkSubmitByWriter({ approvalRequestIds: [3609] });
    expect(s.submittedCount).toBe(0);
    expect(s.skipped[0].reason).toMatch(/^daily_log_unmeasured/);
    expect(st.writes).toEqual([]);
    expect(st.approveRequest).not.toHaveBeenCalled();
  });
});

describe("정상·빈 일지 혼합 일괄 처리 (Codex #519 배포 검증 — 영구 회귀 테스트로)", () => {
  it("일괄 승인 [정상 #3601, 빈 #3602] → 승인 1·실패 1, 승인 요청 갱신은 정상 건 하나뿐", async () => {
    st.formByRecord = { 3601: clone(FULL), 3602: clone(EMPTY_872) };
    const r: any = await gc().batchApproveChecklists({ approvalRequestIds: [3601, 3602] });
    expect(r).toMatchObject({ success: false, count: 1 });
    expect(r.failed).toEqual([{ approvalRequestId: 3602, message: expect.stringMatching(/^일일일지 #3602 측정 기록 미완료 — 미측정 14건/) }]);
    expect(r.message).toMatch(/^1건 승인 완료, 1건 승인 안 됨 — #3602:/);
    expect(st.writes.filter((w) => /UPDATE h_approval_requests/.test(w))).toHaveLength(1);
  });
  it("일괄 검토도 같은 방식 — 검토 1·실패 1", async () => {
    st.formByRecord = { 3601: clone(FULL), 3602: clone(EMPTY_872) };
    const r: any = await gc().batchReviewChecklists({ approvalRequestIds: [3602, 3601] });
    expect(r).toMatchObject({ count: 1 });
    expect(r.failed.map((f: any) => f.approvalRequestId)).toEqual([3602]);
    expect(st.writes.filter((w) => /UPDATE h_approval_requests/.test(w))).toHaveLength(1);
  });
  it("승인 화면 — 일괄 승인 0건이면 처리 이력으로 넘어가지 않고 선택 유지, 일괄 검토 0건도 선택 유지", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { REPO_ROOT } = await import("./__helpers__/appRoutes");
    const src = readFileSync(join(REPO_ROOT, "client/src/pages/system/_approvalManagement/useApprovalMutations.ts"), "utf-8");
    const approve = src.slice(src.indexOf("const batchApproveMutation"), src.indexOf("const autoReviewApproveMutation"));
    expect(approve.indexOf("if (!data.count) return;")).toBeGreaterThan(-1);
    expect(approve.indexOf("if (!data.count) return;")).toBeLessThan(approve.indexOf('cfg.setActiveTab("history")'));
    expect(approve.indexOf("if (!data.count) return;")).toBeLessThan(approve.indexOf("cfg.setSelectedIds([])"));
    const review = src.slice(src.indexOf("const batchReviewMutation"), src.indexOf("const batchApproveMutation"));
    expect(review).toContain("if (data.count) cfg.setSelectedIds([]);");
  });
});

describe("통과 조건", () => {
  it("측정값·측정시각이 갖춰지면 승인 진행", async () => {
    st.formData = clone(FULL);
    await gc().approveChecklist({ approvalRequestId: 3609, action: "approve" });
    expect(st.writes.some((w) => /UPDATE h_approval_requests/.test(w))).toBe(true);
  });
  it("일일일지가 아닌 문서는 검사하지 않음", async () => {
    st.formType = "pest_control_checklist";
    await gc().approveWithAutoReview({ approvalRequestId: 3609 });
    expect(st.writes.length).toBeGreaterThan(0);
  });
  it("다른 회사 요청은 문서 승인 경로에서 찾지 못함 (approveRequest 는 id 로만 조회)", async () => {
    const other = approvalRouter.createCaller({ ...ctx, user: { ...ctx.user, tenantId: 9 }, tenantId: 9 });
    await expect(other.approve({ requestId: 3609 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(st.approveRequest).not.toHaveBeenCalled();
  });
});
