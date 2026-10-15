/**
 * 판매 SKU 화면 고정 (2026-10-16)
 * 매출 등록·일괄 업로드·수정 화면이 판매 SKU 를 고르고 서버로 보낸다. 실제 차감 동작은 saleLotStatus.mysql.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./__helpers__/appRoutes";

const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf-8");

describe("판매 SKU 화면", () => {
  it("매출 등록: 자사제품 줄마다 SKU 선택, SKU 여럿이면 저장 차단, skuId 전송", () => {
    const src = read("client/src/pages/accounting/SalesManagement.tsx");
    expect(src).toContain('data-testid="sale-sku-select"');
    expect(src).toContain("skuId: item.skuId,");
    expect(src).toMatch(/item\.itemType === "own_product" && !item\.skuId && skusOf\(item\.itemMasterId\)\.length > 1/);
  });
  it("일괄 업로드: SKU 하나면 자동·SKU 코드/명/별칭 일치, 아니면 행에서 선택, 미선택 행은 업로드 차단, skuId 전송", () => {
    const src = read("client/src/pages/accounting/SalesBulkUpload.tsx");
    expect(src).toContain('data-testid="bulk-sale-sku-select"');
    expect(src).toContain("skuId: r.itemType === 'own_product' ? (r.skuId ?? undefined) : undefined,");
    expect(src).toContain("skuId: item.itemType === 'own_product' ? (m.skuId ?? null) : null,");
    expect(src).toMatch(/const skuMissing = readyRows\.filter\(\(r\) => needsSkuChoice\(r\)\);/);
  });
  it("수정: SKU 선택(대기 매출만), 상태 선택은 잠김", () => {
    const src = read("client/src/components/accounting/EditSaleDialog.tsx");
    expect(src).toContain('data-testid="edit-sale-sku-select"');
    expect(src).toContain("disabled={!isPending}");
    expect(src).toMatch(/setFormData\(\{ \.\.\.formData, status: value \}\)\s*\n\s*\}\s*\n\s*disabled\s*\n/);
  });
  it("서버 입력: 등록·일괄·수정이 skuId 를 받는다", () => {
    const src = read("server/routers/haccp/haccpIntegration.router.ts");
    expect(src.match(/skuId: z\.number\(\)\.int\(\)\.positive\(\)/g)?.length).toBe(3);
  });
  it("수동 SQL·Drizzle 마이그레이션: sku_id NULL 허용 + (tenant_id, sku_id) 인덱스, 멱등", () => {
    const manual = read("scripts/migrations-manual/2026-10-16-sales-sku-id.sql");
    expect(manual).toContain("ADD COLUMN `sku_id` bigint NULL AFTER `material_id`, ALGORITHM=INSTANT");
    expect(manual).toContain("information_schema.COLUMNS");
    expect(read("drizzle/0051_sales_sku_id.sql")).toContain("CREATE INDEX `idx_sales_tenant_sku`");
  });
});
