/**
 * 처리이력 총건수 = 보이는 행 (2026-10-15, Codex #523 검증)
 * 재현: 검색 20261013 → "총 6건" 인데 5행. 승인 대기 CCP-4P(#3618)를 서버는 세고 화면은 걸러냈다 (20261014: 4 vs 3, #3623).
 * 고정: "전체" 도 처리된 상태(approved/rejected/cancelled)를 서버에 넘겨 목록·총건수·페이지가 같은 조건을 쓴다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./__helpers__/appRoutes";

const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf-8");

describe("처리이력 상태 조건", () => {
  it("화면: '전체' 는 처리된 상태 목록을 서버에 넘기고, 화면에서 따로 거르지 않음", () => {
    const src = read("client/src/pages/system/ApprovalManagement.tsx");
    expect(src).toContain('statuses: statusFilter === "all" ? HISTORY_DONE_STATUSES : undefined');
    expect(src).toContain('["approved", "rejected", "cancelled"]');
    expect(src).toContain("const historyRequests: ApprovalRequest[] = historyAll;");
  });
  it("서버: 목록과 총건수 둘 다 statuses 를 IN 조건으로", () => {
    const src = read("server/db/system/auditApprovalSupplier.ts");
    const list = src.slice(src.indexOf("export async function getApprovalRequests("), src.indexOf("export async function getApprovalRequestsCount("));
    const count = src.slice(src.indexOf("export async function getApprovalRequestsCount("), src.indexOf("export async function getApprovalRequestsByIds("));
    for (const part of [list, count]) expect(part).toMatch(/inArray\(hApprovalRequests\.status, filters\.statuses as any\)/);
    const router = read("server/routers/system/approval.router.ts");
    const paged = router.slice(router.indexOf("listPaged: tenantRequiredProcedure"), router.indexOf("listByIds:"));
    expect(paged).toMatch(/statuses: z\.array\(z\.enum\(\[/);
    expect(paged).toContain("const filters = { ...input, tenantId: ctx.tenantId };");
  });
});
