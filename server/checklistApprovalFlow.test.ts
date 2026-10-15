/**
 * 일지 승인 흐름 보강 (2026-10-15, Codex 실저장·승인 검증 후속)
 *  1. 바로승인 — 누른 요청을 그대로 승인 (이전: 첫 클릭 무반응·직전 선택 요청 승인 위험)
 *  2. 재작성 — 완료된 승인 이력은 보존, 진행 중 요청만 취소 (공통 양식·건강일지 같은 정책)
 *  3. 결재 직인 — 검토·승인 시 일지 본문에 찍는다
 *  4. 건강일지 목록 — 작성중만 삭제 버튼
 *  5. 누락 복구 요청에 "누락 복구" 표시 항상
 *  6. 누락 vs 상태 불일치 — 승인된 요청이 있으면 다시 요청 금지 (#690·#694)
 *  +  다른 종류 요청(원료 사용 보고·CCP 기록지 등) 승인이 같은 번호의 일지를 바꾸지 않음 (#94)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const state = vi.hoisted(() => ({
  request: { reference_id: 94, request_type: "material_usage_report", reference_type: "material_usage_report", status: "pending_approval" } as any,
  record: { status: "submitted", form_data: { approval: { writerName: "이준석", writerApproved: true } } } as any,
  active: [] as any[], approved: [] as any[],
  raw: [] as Array<{ sql: string; params: any[] }>,
}));

const conn = {
  beginTransaction: vi.fn(async () => {}), commit: vi.fn(async () => {}), rollback: vi.fn(async () => {}), release: vi.fn(() => {}),
  execute: vi.fn(async (sql: string, params: any[]) => {
    state.raw.push({ sql, params });
    if (/SELECT form_data FROM h_generic_checklist_records/.test(sql)) return [state.record ? [state.record] : []];
    if (/SELECT id, status, form_data FROM h_generic_checklist_records/.test(sql)) return [state.record ? [{ id: params[0], ...state.record }] : []];
    if (/SELECT status FROM h_generic_checklist_records/.test(sql)) return [state.record ? [{ status: state.record.status }] : []];
    if (/status = 'approved'/.test(sql) && /SELECT id FROM h_approval_requests/.test(sql)) return [state.approved];
    if (/SELECT id FROM h_approval_requests/.test(sql)) return [state.active];
    if (/INSERT INTO h_approval_requests/.test(sql)) return [{ insertId: 777 }];
    return [{ affectedRows: 1 }];
  }),
};
vi.mock("./db/connection", () => ({
  getRawConnection: vi.fn(async () => ({ getConnection: vi.fn(async () => conn), execute: conn.execute })),
  getDb: vi.fn(async () => null),
}));
vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({ execute: vi.fn(async () => [[state.request]]), insert: () => ({ values: async () => [{ insertId: 1 }] }) })),
}));

import { genericChecklistRouter } from "./routers/checklist/genericChecklist.router";
import { applyApprovalStamp, isChecklistReference, classifySubmitted, decideSubmit, stampDate } from "./lib/checklist/recordStatePolicy";
import { REPO_ROOT } from "./__helpers__/appRoutes";

const caller = () => genericChecklistRouter.createCaller({ user: { id: 4, name: "한상갑", role: "admin", tenantId: 2, siteId: 1 }, tenantId: 2, req: {} as any, res: {} as any } as any);
const recordWrites = () => state.raw.filter((e) => /UPDATE h_generic_checklist_records/.test(e.sql));

beforeEach(() => {
  state.request = { reference_id: 94, request_type: "material_usage_report", reference_type: "material_usage_report", status: "pending_approval" };
  state.record = { status: "submitted", form_data: { approval: { writerName: "이준석", writerApproved: true } } };
  state.active = []; state.approved = []; state.raw = [];
});

describe("다른 종류 요청 승인은 공통 일지를 건드리지 않는다 (#94)", () => {
  it("원료 사용 보고 #94 승인 → 온습도 일지 #94 쓰기 0", async () => {
    await caller().approveChecklist({ approvalRequestId: 3199, action: "approve" });
    expect(recordWrites()).toHaveLength(0);
  });
  it("CCP 기록지 반려·검토 반려·바로승인·일괄 승인도 0", async () => {
    state.request = { reference_id: 91, request_type: "ccp_form", reference_type: "ccp_form_record", status: "pending_review" };
    await caller().approveChecklist({ approvalRequestId: 1, action: "reject" });
    await caller().reviewChecklist({ approvalRequestId: 1, action: "reject" });
    await caller().reviewChecklist({ approvalRequestId: 1, action: "approve" });
    await caller().approveWithAutoReview({ approvalRequestId: 1 });
    await caller().batchApproveChecklists({ approvalRequestIds: [1, 2] });
    expect(recordWrites()).toHaveLength(0);
  });
  it("판정 함수", () => {
    expect(isChecklistReference("checklist")).toBe(true);
    expect(isChecklistReference("generic_checklist")).toBe(true);
    expect(isChecklistReference("material_usage_report")).toBe(false);
    expect(isChecklistReference(null)).toBe(false);
  });
});

describe("결재 직인", () => {
  it("검토 → 검토 직인만, 최종 승인 → 승인완료 + 승인 직인, 바로승인(검토 단계) → 둘 다", async () => {
    state.request = { reference_id: 91, request_type: "pest_control_checklist", reference_type: "checklist", status: "pending_review" };
    await caller().reviewChecklist({ approvalRequestId: 1, action: "approve" });
    let w = recordWrites().at(-1)!;
    expect(w.sql).not.toMatch(/status = \?/);
    expect(JSON.parse(w.params[0]).approval).toMatchObject({ writerApproved: true, reviewerApproved: true, reviewerName: "한상갑" });
    expect(JSON.parse(w.params[0]).approval.approverApproved).toBeUndefined();

    state.raw = []; state.request.status = "pending_approval";
    await caller().approveChecklist({ approvalRequestId: 1, action: "approve" });
    w = recordWrites().at(-1)!;
    expect(w.params[0]).toBe("approved");
    expect(JSON.parse(w.params[1]).approval).toMatchObject({ approverApproved: true, approverName: "한상갑", approverDate: stampDate() });

    state.raw = []; state.request.status = "pending_review";
    await caller().approveWithAutoReview({ approvalRequestId: 1 });
    w = recordWrites().at(-1)!;
    expect(JSON.parse(w.params[1]).approval).toMatchObject({ reviewerApproved: true, approverApproved: true });
  });
  it("직인 함수 — 원본 불변, 작성자 직인 유지", () => {
    const src = { approval: { writerApproved: true }, x: 1 };
    const out = applyApprovalStamp(src, "reviewAndApprove", { name: "A", date: "2026. 10. 15." });
    expect(out).toEqual({ approval: { writerApproved: true, reviewerApproved: true, reviewerDate: "2026. 10. 15.", reviewerName: "A", approverApproved: true, approverDate: "2026. 10. 15.", approverName: "A" }, x: 1 });
    expect(src.approval).toEqual({ writerApproved: true });
    expect(applyApprovalStamp(null, "approve", { name: "", date: "d" })).toEqual({ approval: { approverApproved: true, approverDate: "d", approverName: "" } });
  });
});

describe("누락 vs 상태 불일치 (#690·#694)", () => {
  it("승인된 요청이 있으면 다시 요청 거부", async () => {
    state.approved = [{ id: 1629 }];
    await expect(caller().submitForReview({ id: 690, requestType: "daily_log", title: "t" })).rejects.toThrow(/이미 승인된 요청\(#1629\)/);
    expect(state.raw.some((e) => /INSERT INTO h_approval_requests/.test(e.sql))).toBe(false);
  });
  it("approvalState 분류", async () => {
    state.approved = [{ id: 1629 }];
    expect(await caller().approvalState({ id: 690 })).toMatchObject({ orphanSubmitted: false, statusMismatch: true, approvedRequestIds: [1629] });
    state.approved = [];
    expect(await caller().approvalState({ id: 79 })).toMatchObject({ orphanSubmitted: true, statusMismatch: false });
    expect(classifySubmitted("draft", [], [5])).toEqual({ orphanSubmitted: false, statusMismatch: false });
    expect(decideSubmit("draft", [], [5])).toEqual({ ok: true, recovering: false }); // 재작성 후 재요청은 정상
  });
  it("누락 복구 요청에는 화면 설명이 있어도 '누락 복구' 표시", async () => {
    await caller().submitForReview({ id: 79, requestType: "illumination_check", title: "t", description: "작성일: 2026-02-16" });
    const ins = state.raw.find((e) => /INSERT INTO h_approval_requests/.test(e.sql))!;
    expect(ins.params[4]).toMatch(/^작성일: 2026-02-16 \[승인 요청 누락 복구/);
  });
});

describe("화면·정책 고정", () => {
  const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf-8");
  it("바로승인은 누른 요청을 인자로 넘긴다", () => {
    const src = read("client/src/pages/system/ApprovalManagement.tsx");
    expect(src).toMatch(/onAutoReviewApprove=\{\(r\) => \{ setSelectedRequest\(r\); setComment\(""\); handleAutoReviewApprove\(r\); \}\}/);
    expect(src).toMatch(/const handleAutoReviewApprove = \(target\?: ApprovalRequest\)/);
  });
  it("재작성은 완료 승인을 취소하지 않는다", () => {
    const src = read("server/routers/checklist/genericChecklist.router.ts");
    const reopen = src.slice(src.indexOf("reopenForEdit:"));
    expect(reopen).toMatch(/AND status IN \('pending_writer', 'pending_review', 'pending_approval', 'pending'\)/);
    expect(src).not.toMatch(/db\.update\(hGenericChecklistRecords\)\.set\(\{ status: "(approved|draft|submitted)"/);
  });
  it("건강일지 목록 삭제 버튼은 작성중만", () => {
    const src = read("client/src/pages/checklist/EmployeeHealthCheckRecordList.tsx");
    expect(src).not.toMatch(/record\.status === "draft" \|\| isAdmin/);
  });
});

describe("결재란 이름 복원 — 기존 기록은 저장된 이름 우선 (Codex #511 검증)", async () => {
  const { resolveApprovalNames } = await import("../client/src/lib/checklist/approvalNames");
  it("실제 처리자(한상갑)가 현재 설정(이정언)보다 우선, 작성자도 저장값", () => {
    const designated = { writerName: "이정언", reviewerName: "이정언", approverName: "한상갑" };
    const stored = { writerName: "CODEX TEST", reviewerId: 19, reviewerName: "한상갑", reviewerApproved: true, approverName: "한상갑", approverApproved: true };
    expect(resolveApprovalNames(designated, stored)).toEqual({
      writerId: null, writerName: "CODEX TEST", reviewerId: 19, reviewerName: "한상갑", approverId: null, approverName: "한상갑",
    });
  });
  it("조직 설정이 바뀌어도 저장된 이름 유지 / 비어 있는 칸만 현재 설정 (반환에 없음 = 현재 설정 유지)", () => {
    expect(resolveApprovalNames({ reviewerName: "박새담당" }, { reviewerName: "이정언" })).toEqual({ reviewerId: null, reviewerName: "이정언" });
    expect(resolveApprovalNames({ reviewerName: "이정언" }, { writerName: "이준석", reviewerName: "  " })).toEqual({ writerId: null, writerName: "이준석" });
    expect(resolveApprovalNames({}, null)).toEqual({});
  });
  it("공통 양식이 규칙을 쓰고, 재작성 저장 때만 현재 담당자를 다음 결재자로", () => {
    const src = readFileSync(join(REPO_ROOT, "client/src/components/checklist/ChecklistFormLayout.tsx"), "utf-8");
    expect(src).toMatch(/\.\.\.resolveApprovalNames\(prev as any, fd\.approval\)/);
    expect(src).not.toMatch(/!approval\.reviewerName && fd\.approval\.reviewerName/);
    expect(src).toMatch(/reviewerName: wasNonDraft && designatedRef\.current\.reviewerName \? designatedRef\.current\.reviewerName : approval\.reviewerName/);
  });
});

describe("결재란 — 2줄 공통 컴포넌트 (대표 요청)", async () => {
  const { shortStampDate } = await import("../client/src/components/checklist/ApprovalStampBox");
  it("날짜 짧게", () => {
    expect(shortStampDate("2026. 10. 15.")).toBe("10.15");
    expect(shortStampDate("2026-02-05")).toBe("2.05");
    expect(shortStampDate("")).toBe("");
    expect(shortStampDate("오늘")).toBe("오늘");
  });
  it("공통 양식·건강일지가 같은 결재란을 쓰고, 옛 4줄(이름·작성자자 줄) 없음", () => {
    for (const p of ["client/src/components/checklist/ChecklistFormLayout.tsx", "client/src/pages/checklist/EmployeeHealthCheckForm.tsx"]) {
      const src = readFileSync(join(REPO_ROOT, p), "utf-8");
      expect(src, p).toMatch(/<ApprovalStampBox approval=\{approval\} \/>/);
      expect(src, p).not.toMatch(/text-gray-400">작성자<\/td>/);
    }
  });
});

describe("건강일지 재작성 — 다음 결재자는 현재 담당자 (Codex #512 검증)", async () => {
  const { designatedApprovers, approvalOnRewrite } = await import("../client/src/lib/checklist/approvalNames");
  const EMP = [{ id: 19, name: "한상갑" }, { id: 21, name: "이정언", approvalRole: "reviewer" }, { id: 22, name: "이준석" }];
  it("현재 담당자 — 결재 설정 우선, 설정 없으면 직원 결재 역할", () => {
    expect(designatedApprovers({ authorEmployeeId: 22, reviewerEmployeeId: 21, approverEmployeeId: 19 }, EMP)).toEqual({
      writer: { id: 22, name: "이준석" }, reviewer: { id: 21, name: "이정언" }, approver: { id: 19, name: "한상갑" },
    });
    expect(designatedApprovers(null, EMP)).toEqual({ writer: undefined, reviewer: { id: 21, name: "이정언" }, approver: undefined });
  });
  it("#871 재현: 과거 검토자 한상갑(직인) → 재작성 저장 시 검토자 이정언(21), 직인·날짜 해제, 작성자 유지", () => {
    const stored = { writerName: "CODEX TEST", writerApproved: true, reviewerId: null, reviewerName: "한상갑", reviewerApproved: true, reviewerDate: "2026. 10. 15.", approverId: null, approverName: "한상갑", approverApproved: true, approverDate: "2026. 10. 15." };
    const d = designatedApprovers({ authorEmployeeId: 22, reviewerEmployeeId: 21, approverEmployeeId: 19 }, EMP);
    expect(approvalOnRewrite(stored, d)).toEqual({
      writerName: "CODEX TEST", writerApproved: true,
      reviewerId: 21, reviewerName: "이정언", reviewerApproved: false, reviewerDate: undefined,
      approverId: 19, approverName: "한상갑", approverApproved: false, approverDate: undefined,
    });
  });
  it("현재 담당자가 없으면 기존 이름 유지 (직인만 해제)", () => {
    expect(approvalOnRewrite({ reviewerName: "한상갑", reviewerApproved: true }, {})).toMatchObject({ reviewerName: "한상갑", reviewerApproved: false });
  });
  it("건강일지가 재작성 저장에 규칙을 쓴다", () => {
    const src = readFileSync(join(REPO_ROOT, "client/src/pages/checklist/EmployeeHealthCheckForm.tsx"), "utf-8");
    expect(src).toMatch(/const ap = wasNonDraft \? approvalOnRewrite\(approval as any, designated\) : approval;/);
    expect(src).toMatch(/reviewerName: ap\.reviewerName/);
    expect(src).toMatch(/setApproval\(prev => approvalOnRewrite\(prev as any, designated\) as any\)/);
  });
});

describe("인쇄 결재란 — 화면과 같은 2줄 (대표 요청)", async () => {
  const { stampTableHtml, escapeHtml } = await import("../client/src/lib/print/stampHtml");
  it("HTML 출력: 결재 시각이 없으면 직인 대신 회색 이름 (이전: 이름만 있으면 직인), 이름 줄 없음, 이름은 이스케이프", () => {
    const html = stampTableHtml({ authorName: "이준석", reviewerName: "이정언", approverName: "<b>한</b>", requestedAt: "2026-10-15", reviewedAt: "", approvedAt: "" });
    expect(html.match(/class="st-seal"/g)?.length).toBe(1);                 // 작성만 직인
    expect(html).toContain('<span class="st-pending">이정언</span>');
    expect(html).toContain("&lt;b&gt;한&lt;/b&gt;");
    expect(html).not.toContain("<b>");
    expect(html.match(/<tr>/g)?.length).toBe(2);                             // 2줄
    expect(html).toContain('<div class="st-date">10.15</div>');
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
  });
  it("검토는 승인 시각만 있어도 직인 (이전 규칙 유지)", () => {
    const html = stampTableHtml({ authorName: "A", reviewerName: "B", approverName: "C", approvedAt: "2026-10-16" });
    expect(html.match(/class="st-seal"/g)?.length).toBe(3);
  });
  it("인쇄 공통 컴포넌트·두 일지가 새 결재란을 쓰고 옛 사각 도장·이름 줄 없음", () => {
    const helpers = readFileSync(join(REPO_ROOT, "client/src/components/print/PrintHelpers.tsx"), "utf-8");
    expect(helpers).not.toMatch(/ApprovalSeal/);
    expect(helpers).not.toMatch(/>작 성</);
    expect(helpers).toMatch(/<td colSpan=\{4\}/);
    for (const p of ["client/src/pages/quality/VisualInspectionLog.tsx", "client/src/pages/haccp/FinishedProductInspectionLog.tsx"]) {
      const src = readFileSync(join(REPO_ROOT, p), "utf-8");
      expect(src, p).toMatch(/stampTableHtml\(/);
      expect(src, p).toMatch(/<ApprovalHeader compact/);
      expect(src, p).not.toMatch(/seal-name/);
    }
  });
});

describe("배치 승인 — 세 경로 모두 제품 LOT·완료 훅(생산완료 분개) 실행 (10/12 실배치 검증)", () => {
  it("개별 승인·바로 승인·일괄 승인이 같은 후속 처리를 부른다", () => {
    const src = readFileSync(join(REPO_ROOT, "server/routers/checklist/genericChecklist.router.ts"), "utf-8");
    for (const tag of ["approveChecklist", "approveWithAutoReview", "batchApproveChecklists"]) {
      expect(src, tag).toContain(`await finishApprovedBatch(Number(refId), ctx.tenantId, "${tag}")`);
    }
    const helper = src.slice(src.indexOf("async function finishApprovedBatch"), src.indexOf("async function inTx"));
    expect(helper).toMatch(/ensureBatchLots\(batchId, tenantId\)/);
    expect(helper).toMatch(/runBatchCompletionHooks\(batchId, tenantId/);
  });
});
