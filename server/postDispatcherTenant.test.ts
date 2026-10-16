/**
 * 확정 API 회사 소유권 (2026-10-16, Codex 운영 DB 점검 P1)
 * 이전: dispatchPostSale/Purchase(id, userId) 가 전표 id 로 전표를 읽고 **전표의 회사** 로 처리 → 다른 회사 전표도 확정 가능.
 * 고정: 호출자 tenantId 필수, 전표 회사와 다르면 "찾을 수 없음" (확정 함수 호출 없음). 확정 함수에도 같은 검사(이중 방어).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./__helpers__/appRoutes";

const st = vi.hoisted(() => ({ docTenant: 2 as number | undefined, calls: [] as any[] }));
vi.mock("./db/connection", () => ({
  getDb: vi.fn(async () => ({ execute: vi.fn(async () => [[st.docTenant != null ? { tenant_id: st.docTenant } : undefined].filter(Boolean)]) })),
}));
vi.mock("./lib/accounting/tenantModuleCheck", () => ({ isHaccpEnabled: vi.fn(async () => true) }));
vi.mock("./lib/accounting/productSalePost", () => ({ postProductSale: vi.fn(async (...a: any[]) => { st.calls.push(["sale", ...a]); return { alreadyProcessed: false }; }) }));
vi.mock("./lib/accounting/purchasePost", () => ({ postPurchase: vi.fn(async (...a: any[]) => { st.calls.push(["purchase", ...a]); return { alreadyProcessed: false }; }) }));

import { dispatchPostSale, dispatchPostPurchase } from "./lib/accounting/postDispatcher";

beforeEach(() => { st.docTenant = 2; st.calls = []; });

describe("확정 디스패처 — 호출자 회사 대조", () => {
  it("같은 회사면 확정 함수에 호출자 회사까지 넘긴다", async () => {
    await dispatchPostSale(10536, 4, 2);
    await dispatchPostPurchase(420, 4, 2);
    expect(st.calls).toEqual([["sale", 10536, 4, 2], ["purchase", 420, 4, 2]]);
  });
  it("다른 회사 전표 → '찾을 수 없음', 확정 함수 호출 없음", async () => {
    await expect(dispatchPostSale(10536, 4, 9)).rejects.toThrow(/매출 전표 ID 10536 를 찾을 수 없습니다/);
    await expect(dispatchPostPurchase(420, 4, 9)).rejects.toThrow(/매입 전표 ID 420 를 찾을 수 없습니다/);
    expect(st.calls).toEqual([]);
  });
  it("없는 전표·호출자 회사 없음 → 거부", async () => {
    st.docTenant = undefined;
    await expect(dispatchPostSale(1, 4, 2)).rejects.toThrow(/찾을 수 없습니다/);
    st.docTenant = 2;
    await expect(dispatchPostSale(1, 4, 0)).rejects.toThrow(/tenantId 필수/);
  });
  it("모든 호출부가 호출자 회사를 넘긴다 (승인 API·발주 입고·수기 매입)", () => {
    const r = (p: string) => readFileSync(join(REPO_ROOT, p), "utf-8");
    expect(r("server/routers/accounting/inventoryAccounting.router.ts")).toContain("dispatchPostPurchase(input.purchaseId, ctx.user.id, ctx.tenantId)");
    expect(r("server/routers/accounting/inventoryAccounting.router.ts")).toContain("dispatchPostSale(input.saleId, ctx.user.id, ctx.tenantId)");
    expect(r("server/routers/accounting/purchaseOrder.router.ts")).toContain("dispatchPostPurchase(newPurchaseId, ctx.user.id, ctx.tenantId)");
    expect(r("server/db/haccp/haccpIntegration.ts")).toContain("postPurchase(purchaseId, params.createdBy, tenantId)");
    // ERP 경로도 회사 검사 + UPDATE 에 tenant 조건
    for (const p of ["server/lib/accounting/erpSalePost.ts", "server/lib/accounting/erpPurchasePost.ts"]) {
      const src = r(p);
      expect(src, p).toMatch(/expectedTenantId != null && Number\(expectedTenantId\) !== Number\(\w+\.tenant_id\)/);
      expect(src, p).not.toMatch(/SET status = 'approved' WHERE id = \?`/);
    }
  });
});
