/**
 * 배치 생산 승인 공통 관문 — 지티 QA B01·B03·B04 (2026-10-18)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ov = vi.fn();
const unissued = vi.fn();
const dispatch = vi.fn();
const execute = vi.fn();
vi.mock("./db/production/batchApprovalOverview", () => ({ getBatchApprovalOverview: (...a: any[]) => ov(...a) }));
vi.mock("./lib/production/issuedBatchLines", () => ({ countUnissuedBatchLines: (...a: any[]) => unissued(...a) }));
vi.mock("./lib/production/autoMaterialIssueDispatcher", () => ({ autoIssueMaterialsDispatch: (...a: any[]) => dispatch(...a) }));
vi.mock("./db/connection", () => ({ getRawConnection: async () => ({ execute }), getDb: vi.fn() }));
vi.mock("./lib/production/batchVoidGuard", () => ({ assertBatchNotVoided: vi.fn(async () => undefined) })); // 무효 생산 건 검사는 batchRecovery.test·MySQL 시험
vi.mock("./db/haccp/ccpStatusSync", () => ({ applyBatchDecisionToCcpForms: vi.fn(async () => ({})) }));
vi.mock("./db/production/productOutboundManagement", () => ({
  ensureBatchLots: vi.fn(async () => ({ created: [], skipped: true, reason: "materials_not_issued", warning: "원료 1줄 미출고" })),
}));
vi.mock("./lib/production/batchCompletionHooks", () => ({ runBatchCompletionHooks: vi.fn(async () => ({ warnings: ["배치 원가 확정 보류: 원료 미출고"] })) }));

import { prepareBatchForApproval, completeApprovedBatch, approvalMessage } from "./lib/production/batchApprovalGate";

beforeEach(() => { ov.mockReset(); unissued.mockReset(); dispatch.mockReset(); execute.mockReset(); vi.spyOn(console, "warn").mockImplementation(() => {}); });

describe("prepareBatchForApproval", () => {
  it("CCP 기록지 작성중이면 승인하지 않음 — 출고도 시도하지 않음 (B03)", async () => {
    ov.mockResolvedValue({ formBlockers: ["CCP-1B 기록지가 작성중입니다 (제출 필요)."] });
    await expect(prepareBatchForApproval(1118, 14, 4)).rejects.toThrow(/CCP 기록지 확인 필요: CCP-1B 기록지가 작성중/);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("원료 미출고 → 공통 자동출고 시도, 그래도 남으면 승인하지 않음 (B01)", async () => {
    ov.mockResolvedValue({ formBlockers: [] });
    unissued.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    dispatch.mockResolvedValue({ errors: ["원료A 재고 부족"], warnings: [] });
    await expect(prepareBatchForApproval(1119, 14, 4)).rejects.toThrow(/원료 2줄이 출고되지 않았습니다 \(원료A 재고 부족\)/);
    expect(dispatch).toHaveBeenCalledWith(1119, 4, 14);
  });
  it("자동출고로 다 나가면 통과, 처음부터 출고됐으면 출고 시도 없음", async () => {
    ov.mockResolvedValue({ formBlockers: [] });
    unissued.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    dispatch.mockResolvedValue({ errors: [], warnings: [] });
    await expect(prepareBatchForApproval(1119, 14, 4)).resolves.toBeUndefined();
    unissued.mockResolvedValueOnce(0);
    dispatch.mockClear();
    await prepareBatchForApproval(1117, 14, 4);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("completeApprovedBatch", () => {
  it("완료시각은 실제 처리 시각(NOW, 있으면 유지) — 17:00·end_time 을 채우지 않음 (B04), 후속 경고를 돌려줌 (B01)", async () => {
    execute.mockResolvedValue([{}]);
    const w = await completeApprovedBatch(1119, 14, 4, "t");
    const [q] = execute.mock.calls[0];
    expect(q).toMatch(/completed_at = COALESCE\(completed_at, NOW\(\)\)/);
    expect(q).not.toMatch(/17:00|end_time/);
    expect(w).toEqual(["제품 LOT 생성 보류: 원료 1줄 미출고", "배치 원가 확정 보류: 원료 미출고"]);
    expect(approvalMessage("승인 완료", w)).toBe("승인 완료 — 확인 필요: 제품 LOT 생성 보류: 원료 1줄 미출고 / 배치 원가 확정 보류: 원료 미출고");
  });
});

describe("모든 승인 경로가 공통 관문을 씀", () => {
  const read = (p: string) => readFileSync(join(__dirname, p), "utf-8");
  it("승인관리 개별·바로·일괄 + 최종 승인 — 17:00 고정값 없음", () => {
    const g = read("routers/checklist/genericChecklist.router.ts");
    expect(g.match(/prepareBatchForApproval\(/g)?.length).toBe(3);
    expect(g.match(/completeApprovedBatch\(/g)?.length).toBe(3);
    const f = read("lib/production/autoApprovalRequest.ts");
    expect(f).toMatch(/prepareBatchForApproval\(/);
    expect(f).toMatch(/completeApprovedBatch\(/);
    for (const src of [g, f]) expect(src).not.toMatch(/17:00:00/);
  });
});
