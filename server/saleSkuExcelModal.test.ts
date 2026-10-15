/**
 * 매출 엑셀 일괄등록 — 판매 SKU (2026-10-16, Codex #527 배포 리뷰 P1)
 *
 * 재현: 실제 진입은 매출 조회(SalesList) → "엑셀 일괄등록" → ExcelBulkUploadModal(mode="sale") 6단계 모달.
 *   #527 은 쓰이지 않는 SalesBulkUpload 화면만 고쳐, 모달에서는 SKU 선택·경고·skuId 전송이 없었다
 *   (매출_일괄등록_1006_1007.xlsx — 카스테라앙금인절미 15/34행 OK, SKU208/209 두 개인데 선택 0개).
 * 고정: 모달 매출 모드가 공통 규칙(client/src/lib/sales/saleSkuChoice.ts)으로 SKU 를 정하고, 미선택은 등록 차단, payload 에 skuId.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pickSaleSkuId, needsSaleSkuChoice, saleSkuIdForPayload } from "../client/src/lib/sales/saleSkuChoice";
import { REPO_ROOT } from "./__helpers__/appRoutes";

const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf-8");
const SKY = [
  { id: 208, skuCode: "S208", skuName: "하늘사랑 1.6kg" },
  { id: 209, skuCode: "S209", skuName: "자사 1.6kg" },
];

describe("SKU 고르기 규칙", () => {
  it("SKU 하나면 그것", () => {
    expect(pickSaleSkuId([{ id: 400, skuCode: "S400", skuName: "인절미 kg" }], {})).toBe(400);
  });
  it("엑셀 SKU 코드·품목명이 SKU 코드·SKU 명과 정확히 같으면 그 SKU (공백·-·_·대소문자 무시)", () => {
    expect(pickSaleSkuId(SKY, { skuCode: "s-209" })).toBe(209);
    expect(pickSaleSkuId(SKY, { itemName: "하늘사랑 1.6KG" })).toBe(208);
  });
  it("카스테라앙금인절미 같은 품목명 — SKU 둘 중 정할 수 없으면 null", () => {
    expect(pickSaleSkuId(SKY, { skuCode: "", itemName: "카스테라앙금인절미(혼합) 냉동" })).toBeNull();
    expect(pickSaleSkuId([], { itemName: "x" })).toBeNull();
  });
  it("골라야 하는 행: 매출·자사제품·묶음 아님·SKU 여럿·미선택일 때만", () => {
    const base = { isPurchase: false, itemType: "own_product", bundleSkuId: null, skuId: null, candidateCount: 2 };
    expect(needsSaleSkuChoice(base)).toBe(true);
    expect(needsSaleSkuChoice({ ...base, skuId: 208 })).toBe(false);
    expect(needsSaleSkuChoice({ ...base, bundleSkuId: 77 })).toBe(false); // 묶음은 묶음 대표 SKU
    expect(needsSaleSkuChoice({ ...base, isPurchase: true })).toBe(false); // 매입 모드는 그대로
    expect(needsSaleSkuChoice({ ...base, itemType: "raw_material" })).toBe(false);
    expect(needsSaleSkuChoice({ ...base, candidateCount: 1 })).toBe(false);
  });
  it("등록 skuId: 묶음 → 묶음 대표 SKU, 아니면 고른 SKU, 자사제품 아니면 없음", () => {
    expect(saleSkuIdForPayload({ itemType: "own_product", bundleSkuId: 77, skuId: 208 })).toBe(77);
    expect(saleSkuIdForPayload({ itemType: "own_product", skuId: 208 })).toBe(208);
    expect(saleSkuIdForPayload({ itemType: "raw_material", skuId: 208 })).toBeUndefined();
  });
});

describe("실제 진입 경로 — 매출 조회 → 엑셀 일괄등록 모달", () => {
  it("SalesList 가 ExcelBulkUploadModal 을 매출 모드로 연다", () => {
    expect(read("client/src/pages/accounting/SalesList.tsx")).toMatch(/<ExcelBulkUploadModal\s+open=\{bulkUploadOpen\}\s+onOpenChange=\{setBulkUploadOpen\}\s+mode="sale"/);
  });
  it("모달 매출 모드: 공통 규칙 사용, 행 상태 'SKU 선택 필요', 행 SKU 선택, 등록 차단, payload skuId", () => {
    const src = read("client/src/components/ExcelBulkUploadModal.tsx");
    expect(src).toContain('from "@/lib/sales/saleSkuChoice"');
    expect(src).toMatch(/if \(needsSaleSku\(row\)\) return \{ \.\.\.row, status: 'warning', statusMessage: 'SKU 선택 필요' \};/); // 재계산 공통
    expect(src).toMatch(/const skuId = pickSaleSku\(itemMasterId, itemType, skuCode, itemName\);/); // 파싱
    expect(src).toContain('data-testid="excel-sale-sku-select"');
    expect(src).toMatch(/const skuMissing = readyRows\.filter\(\(r\) => needsSaleSku\(r\)\);/);
    expect(src).toContain("skuId: saleSkuIdForPayload(r),");
    // 학습 별칭·SKU 명/코드 일치는 정확 SKU 를 보존, 품목 재매칭·AI 재매칭·묶음 지정 때 SKU 를 다시 정한다
    expect(src).toContain("skuId: (item?.itemType ?? 'own_product') === 'own_product' ? m.skuId : null,");
    expect(src).toContain("skuId: bundle ? bundle.parentSkuId : pickSaleSku(sel.id, sel.itemType ?? row.itemType, row.skuCode, row.itemName),");
    expect(src).toContain("skuId: pickSaleSku(upd.itemMasterId, upd.itemType, r.skuCode, r.itemName),");
    expect(src).toContain("skuId: choice.parentSkuId,");
  });
  it("매입 모드 payload 는 그대로 (skuId 없음)", () => {
    const src = read("client/src/components/ExcelBulkUploadModal.tsx");
    const purchase = src.slice(src.indexOf("if (isPurchase) {\n      const uploadItems"), src.indexOf("bulkPurchaseMutation.mutateAsync"));
    expect(purchase).not.toContain("skuId");
  });
});
