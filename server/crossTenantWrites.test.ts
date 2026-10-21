/**
 * 회사 조건 없이 쓰던 곳 (2026-10-21, 새 시스템 쓰기 경로 전수 조사에서 발견)
 * - 원재료 유통기한 알림 기준일 일괄 변경: tenantId 를 받고도 조건에 안 넣어 모든 회사 원재료를 바꿈
 * - 거래명세서 대표 계좌: 회사 조건 없이 첫 대표 계좌를 읽어 다른 회사 계좌가 찍힐 수 있었음
 * - 대표 계좌 설정: 모든 회사의 대표 표시를 해제함
 * - 배치 승인 완료 후 문서 상태: batch_id 로만 갱신
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (p: string) => readFileSync(join(__dirname, p), "utf-8");

describe("원재료 유통기한 알림 기준일 일괄 변경", () => {
  it("회사 조건으로 거르고, 회사가 없으면 거부 · 라우터가 세션 회사를 넘긴다", () => {
    const fn = src("db/inventory/inventoryFunctions.ts");
    const body = fn.slice(fn.indexOf("export async function batchUpdateExpiryWarningDays"), fn.indexOf("// Delete Inventory Lot"));
    expect(body).toMatch(/requireTenantId\(tenantId\)/);
    expect(body).toMatch(/and\(eq\(hMaterials\.tenantId, t\), eq\(hMaterials\.expiryWarningDays, 7\)\)/);
    expect(src("routers/inventory/inventory.router.ts")).toMatch(/batchUpdateExpiryWarningDays\(input\.expiryWarningDays, ctx\.tenantId\)/);
  });
});

describe("대표 계좌", () => {
  const bank = src("bankTransactions.ts");
  it("조회는 회사 조건 필수 — 회사가 없으면 계좌 없음", () => {
    const body = bank.slice(bank.indexOf("export async function getPrimaryBankAccount"), bank.indexOf("// 통장 거래 내역 관리"));
    expect(body).toMatch(/getPrimaryBankAccount\(tenantId: number \| null \| undefined\)/);
    expect(body).toMatch(/eq\(bankAccounts\.tenantId, Number\(tenantId\)\)/);
    expect(body).toMatch(/return null;/);
  });
  it("거래명세서 두 곳 모두 회사를 넘긴다", () => {
    const st = src("db/accounting/transactionStatement.ts");
    expect(st.match(/getPrimaryBankAccount\(tenantId\)/g)?.length).toBe(2);
    expect(st).not.toMatch(/getPrimaryBankAccount\(\)/);
  });
  it("설정은 이 회사 계좌만 해제 · 지정", () => {
    const body = bank.slice(bank.indexOf("export async function setPrimaryBankAccount"), bank.indexOf("export async function getPrimaryBankAccount"));
    expect(body).toMatch(/set\(\{ isPrimary: 0 \}\)\.where\(eq\(bankAccounts\.tenantId, tenantId\)\)/);
    expect(body).not.toMatch(/set\(\{ isPrimary: 0 \}\);/);
  });
});

describe("배치 승인 완료 후 문서 상태", () => {
  it("승인 요청의 회사로 범위를 묶는다", () => {
    const s = src("db/system/auditApprovalSupplier.ts");
    expect(s).toMatch(/WHERE batch_id = \? AND tenant_id = \? AND status = 'pending'/);
    expect(s).toMatch(/UPDATE document_instances SET status = 'approved', approver_id = \?, approved_at = NOW\(\) WHERE batch_id = \? AND tenant_id = \? AND status != 'approved'/);
  });
});
