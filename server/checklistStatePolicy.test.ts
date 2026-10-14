/**
 * 공통 일지 상태 정책 — 서버 강제 (2026-10-15, Codex 발견)
 *  - create 는 항상 작성중 / update 는 status 무시, 작성중이 아니면 재작성(작성중 + 진행 요청 취소 + 직인 제거)
 *  - delete 는 작성중만
 *  - submitForReview 는 한 트랜잭션: 요청 INSERT → 상태 UPDATE, 실패하면 되돌림, 진행 중 요청 있으면 거부,
 *    승인 요청 없는 '승인대기'(#91 등) 는 복구 요청 허용
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  record: { status: "draft", form_data: { approval: { writerApproved: true, reviewerApproved: true, approverApproved: true, reviewerDate: "x", approverDate: "y" }, a: 1 } } as any,
  active: [] as Array<{ id: number }>,
  failInsert: false,
  log: [] as string[],
  executed: [] as Array<{ sql: string; params: any[] }>,
  inserted: null as any,
}));

const conn = {
  beginTransaction: vi.fn(async () => { state.log.push("BEGIN"); }),
  commit: vi.fn(async () => { state.log.push("COMMIT"); }),
  rollback: vi.fn(async () => { state.log.push("ROLLBACK"); }),
  release: vi.fn(() => { state.log.push("RELEASE"); }),
  execute: vi.fn(async (sql: string, params: any[]) => {
    state.executed.push({ sql, params });
    if (/SELECT id, status, form_data FROM h_generic_checklist_records/.test(sql)) return [state.record ? [{ id: params[0], ...state.record }] : []];
    if (/SELECT status FROM h_generic_checklist_records/.test(sql)) return [state.record ? [{ status: state.record.status }] : []];
    if (/SELECT id FROM h_approval_requests/.test(sql)) return [state.active];
    if (/INSERT INTO h_approval_requests/.test(sql)) {
      state.log.push("INSERT_REQUEST");
      if (state.failInsert) throw new Error("Data truncated for column 'request_type'");
      return [{ insertId: 555 }];
    }
    if (/UPDATE h_generic_checklist_records SET status = 'submitted'/.test(sql)) { state.log.push("SET_SUBMITTED"); return [{ affectedRows: 1 }]; }
    if (/UPDATE h_approval_requests SET status = 'cancelled'/.test(sql)) { state.log.push("CANCEL_REQUESTS"); return [{ affectedRows: state.active.length }]; }
    if (/UPDATE h_generic_checklist_records SET/.test(sql)) { state.log.push("UPDATE_RECORD"); return [{ affectedRows: 1 }]; }
    if (/DELETE FROM h_generic_checklist_records/.test(sql)) { state.log.push("DELETE"); return [{ affectedRows: 1 }]; }
    return [{ affectedRows: 0 }];
  }),
};

vi.mock("./db/connection", () => ({
  getRawConnection: vi.fn(async () => ({ getConnection: vi.fn(async () => conn), execute: conn.execute })),
  getDb: vi.fn(async () => null),
}));
vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    insert: () => ({ values: async (v: any) => { state.inserted = v; return [{ insertId: 900 }]; } }),
  })),
}));

import { genericChecklistRouter } from "./routers/checklist/genericChecklist.router";
import { decideDelete, decideSubmit, decideUpdate, clearReviewStamps } from "./lib/checklist/recordStatePolicy";

const caller = () => genericChecklistRouter.createCaller({ user: { id: 4, role: "admin", tenantId: 2, siteId: 1 }, tenantId: 2, req: {} as any, res: {} as any } as any);

beforeEach(() => {
  state.record = { status: "draft", form_data: { approval: { writerApproved: true, reviewerApproved: true, approverApproved: true, reviewerDate: "x", approverDate: "y" }, a: 1 } };
  state.active = []; state.failInsert = false; state.log = []; state.executed = []; state.inserted = null;
});

describe("판단 규칙", () => {
  it("update: 작성중이 아니면 재작성", () => {
    expect(decideUpdate("draft")).toEqual({ nextStatus: "draft", reopen: false });
    for (const s of ["submitted", "approved", "rejected"] as const) expect(decideUpdate(s)).toEqual({ nextStatus: "draft", reopen: true });
  });
  it("delete: 작성중만", () => {
    expect(decideDelete("draft")).toEqual({ ok: true });
    expect(decideDelete("submitted")).toMatchObject({ ok: false });
    expect(decideDelete("approved")).toMatchObject({ ok: false });
  });
  it("submit: 진행 요청 있으면 거부, 작성중·반려 정상, 요청 없는 승인대기는 복구, 승인완료 거부", () => {
    expect(decideSubmit("draft", [])).toEqual({ ok: true, recovering: false });
    expect(decideSubmit("rejected", [])).toEqual({ ok: true, recovering: false });
    expect(decideSubmit("submitted", [])).toEqual({ ok: true, recovering: true });
    expect(decideSubmit("submitted", [7])).toMatchObject({ ok: false });
    expect(decideSubmit("draft", [7])).toMatchObject({ ok: false });
    expect(decideSubmit("approved", [])).toMatchObject({ ok: false });
  });
  it("직인 제거 — 작성자 직인 유지, 원본 불변", () => {
    const src = { approval: { writerApproved: true, reviewerApproved: true, approverApproved: true }, x: 1 };
    expect(clearReviewStamps(src)).toEqual({ approval: { writerApproved: true, reviewerApproved: false, approverApproved: false, reviewerDate: null, approverDate: null }, x: 1 });
    expect(src.approval.reviewerApproved).toBe(true);
  });
});

describe("create — 항상 작성중", () => {
  it("화면이 submitted/approved 를 보내도 draft 로 저장", async () => {
    await caller().create({ formType: "daily_log", formDate: "2026-10-15", formData: {}, status: "approved" });
    expect(state.inserted.status).toBe("draft");
  });
});

describe("update — status 무시, 재작성", () => {
  it("작성중 기록: 그대로 작성중, 승인 요청 손대지 않음", async () => {
    const r = await caller().update({ id: 10, formData: { a: 2 }, status: "approved" });
    expect(r).toMatchObject({ status: "draft", reopened: false, cancelledRequests: 0 });
    expect(state.log).toEqual(["BEGIN", "UPDATE_RECORD", "COMMIT", "RELEASE"]);
    const upd = state.executed.find((e) => /UPDATE h_generic_checklist_records SET/.test(e.sql))!;
    expect(upd.params[0]).toBe("draft");
  });

  it("승인완료 기록을 고치면 작성중 + 진행 요청 취소 + 검토·승인 직인 제거", async () => {
    state.record.status = "approved"; state.active = [{ id: 3 }];
    const r = await caller().update({ id: 797, formData: { approval: { writerApproved: true, reviewerApproved: true, approverApproved: true }, b: 1 } });
    expect(r).toMatchObject({ status: "draft", reopened: true, previousStatus: "approved", cancelledRequests: 1 });
    expect(state.log).toEqual(["BEGIN", "UPDATE_RECORD", "CANCEL_REQUESTS", "COMMIT", "RELEASE"]);
    const saved = JSON.parse(state.executed.find((e) => /UPDATE h_generic_checklist_records SET/.test(e.sql))!.params[1]);
    expect(saved.approval).toMatchObject({ writerApproved: true, reviewerApproved: false, approverApproved: false });
  });

  it("없는 기록(다른 회사 포함) → NOT_FOUND, 쓰기 없음", async () => {
    state.record = null;
    await expect(caller().update({ id: 1, formData: {} })).rejects.toThrow(/찾을 수 없습니다/);
    expect(state.log).toContain("ROLLBACK");
    expect(state.log).not.toContain("UPDATE_RECORD");
  });
});

describe("delete — 작성중만", () => {
  it("승인대기 기록 삭제 거부 (#91 화면 정책과 같게)", async () => {
    state.record.status = "submitted";
    await expect(caller().delete({ id: 91 })).rejects.toThrow(/승인대기 상태의 기록은 삭제할 수 없습니다/);
    expect(state.log).not.toContain("DELETE");
    expect(state.log).toContain("ROLLBACK");
  });
  it("작성중은 삭제 (조건에 status='draft' 포함)", async () => {
    await caller().delete({ id: 10 });
    const del = state.executed.find((e) => /DELETE FROM/.test(e.sql))!;
    expect(del.sql).toMatch(/AND status = 'draft'/);
    expect(del.params).toEqual([10, 2]);
  });
});

describe("submitForReview — 한 트랜잭션", () => {
  it("작성중: 요청 INSERT 다음에 상태 UPDATE, 커밋", async () => {
    const r = await caller().submitForReview({ id: 10, requestType: "pest_control_checklist", title: "t" });
    expect(r).toMatchObject({ success: true, requestId: 555, recovered: false });
    expect(state.log).toEqual(["BEGIN", "INSERT_REQUEST", "SET_SUBMITTED", "COMMIT", "RELEASE"]);
  });

  it("요청 INSERT 가 실패하면 상태를 바꾸지 않고 되돌린다 (#91 같은 승인 요청 없는 승인대기 재발 방지)", async () => {
    state.failInsert = true;
    await expect(caller().submitForReview({ id: 10, requestType: "x", title: "t" })).rejects.toThrow(/Data truncated/);
    expect(state.log).toEqual(["BEGIN", "INSERT_REQUEST", "ROLLBACK", "RELEASE"]);
    expect(state.log).not.toContain("SET_SUBMITTED");
  });

  it("진행 중 요청이 있으면 CONFLICT (중복 요청 방지), 쓰기 없음", async () => {
    state.active = [{ id: 44 }];
    await expect(caller().submitForReview({ id: 10, requestType: "x", title: "t" })).rejects.toThrow(/이미 승인 요청이 진행 중/);
    expect(state.log).not.toContain("INSERT_REQUEST");
  });

  it("승인 요청 없는 승인대기 → 요청을 다시 만들어 복구", async () => {
    state.record.status = "submitted";
    const r = await caller().submitForReview({ id: 91, requestType: "pest_control_checklist", title: "t" });
    expect(r).toMatchObject({ recovered: true });
    const ins = state.executed.find((e) => /INSERT INTO h_approval_requests/.test(e.sql))!;
    expect(ins.params).toEqual([1, "pest_control_checklist", 91, "t", "[승인 요청 누락 복구 — 이전 오류로 요청 없이 승인대기였던 기록]", 4, 2]);
  });

  it("승인완료는 다시 요청 불가", async () => {
    state.record.status = "approved";
    await expect(caller().submitForReview({ id: 10, requestType: "x", title: "t" })).rejects.toThrow(/승인완료/);
  });
});

describe("approvalState", () => {
  it("승인대기인데 진행 요청 없으면 orphanSubmitted", async () => {
    state.record.status = "submitted";
    expect(await caller().approvalState({ id: 91 })).toEqual({ status: "submitted", activeRequestIds: [], approvedRequestIds: [], orphanSubmitted: true, statusMismatch: false });
    state.active = [{ id: 5 }];
    expect(await caller().approvalState({ id: 91 })).toMatchObject({ orphanSubmitted: false, activeRequestIds: [5] });
  });
});
