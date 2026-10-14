/**
 * 3-c 2차 + #498 배포 검증 지적 4건 (2026-10-14)
 *  - 매출·매입·발주 필터 = FilterBar + URL 유지, 발주서 표 = DataGrid (모바일 카드에도 작업 버튼)
 *  - 매출·매입 묶음 행 상태도 표준 문구 (승인 대기 · 승인 · 수금 완료 · 취소) — 엑셀 내려받기 문구 포함
 *  - 제품 재고 보기 출고량 = 매출 확정 재고 원장(SALE) + 제품 출고 화면 기록
 *  - 주간·월간 일지 목록 결재 상태 = 결재 요청 상태 → 없으면 기록 상태 (작성 화면과 같은 기준)
 *  - 공통 품질 날짜: DB 날짜·기본값을 UTC 로 바꾸지 않는다 (오전 9시 전 하루 밀림)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveStatus } from "../client/src/lib/statusDictionary";
import { periodicLogStatus } from "../client/src/components/production/PeriodicLogListModal";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");
const SALES = "client/src/pages/accounting/SalesList.tsx";
const PURCHASES = "client/src/pages/accounting/PurchasesList.tsx";
const PO = "client/src/pages/accounting/PurchaseOrderList.tsx";

describe("3-c 2차 — 필터·표", () => {
  it("매출·매입·발주 조회 조건은 FilterBar + URL 유지", () => {
    for (const f of [SALES, PURCHASES, PO]) {
      const s = read(f);
      expect(s, f).toContain("useUrlFilters(");
      expect(s, f).toContain("<FilterBar");
    }
  });

  it("발주서 표는 DataGrid, 행 작업 버튼은 표와 모바일 카드가 같은 함수", () => {
    const s = read(PO);
    expect(s).toContain("<DataGrid<OrderRow>");
    expect(s.match(/renderPoActions\(po\)/g)?.length).toBe(2);
  });

  it("매출·매입 묶음 표(증빙 단위 펼침)는 그대로 — 기능 손실 방지", () => {
    for (const f of [SALES, PURCHASES]) expect(read(f), f).toContain("dominantStatus");
  });
});

describe("매출 상태 문구 (Codex: 대기 중·승인됨·취소됨 이 남아 있었다)", () => {
  it("묶음 행·엑셀 문구도 상태 사전", () => {
    for (const [f, dom] of [[SALES, "sale"], [PURCHASES, "purchase"]] as const) {
      const s = read(f);
      expect(s, f).toContain(`status={group.dominantStatus}\n                                  domain="${dom}"`);
      expect(s, f).toContain(`resolveStatus(status, "${dom}").label`);
      expect(s, f).not.toMatch(/"대기 중"|"승인됨"|"취소됨"/);
    }
    expect(["pending", "approved", "received", "cancelled"].map((c) => resolveStatus(c, "sale").label))
      .toEqual(["승인 대기", "승인", "수금 완료", "취소"]);
  });
});

describe("제품 출고량 (Codex: 총 출고량 0.0 kg)", () => {
  it("매출 확정 재고 원장(SALE/usage)을 제품 ID 로 kg 환산 합산 — 화면은 두 경로 합산", () => {
    const db = read("server/db/production/productOutboundManagement.ts");
    expect(db).toContain("export async function getProductSalesOutflow");
    expect(db).toContain("t.reference_type = 'SALE'");
    expect(db).toContain("COALESCE(ps.kg_per_sales_unit, 1)");
    const view = read("client/src/components/inventory/ProductStockView.tsx");
    expect(view).toContain("trpc.inventory.getProductSalesOutflow.useQuery()");
    expect(view).toContain("manualOut.totalOutbound + (saleOut?.kg ?? 0)");
  });
});

describe("일지 목록 결재 상태 (Codex: 목록 '요청 전' vs 작성 화면 '승인완료')", () => {
  it("결재 요청 상태가 없으면 기록 상태", () => {
    expect(periodicLogStatus({ approval_status: null, status: "approved" })).toBe("approved");
    expect(periodicLogStatus({ approval_status: "pending_review", status: "submitted" })).toBe("pending_review");
    expect(periodicLogStatus({})).toBeNull();
    expect(resolveStatus("approved").label).toBe("승인");
    expect(resolveStatus("submitted").label).toBe("검토 대기");
  });
});

describe("공통 품질 날짜 (Codex: 부적합 발견일·처리일 차이)", () => {
  it("서버: DB 날짜를 toISOString 으로 바꾸지 않는다", () => {
    const dir = join(__dirname, "..", "server/db/coreMes/quality");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      expect(readFileSync(join(dir, f), "utf-8"), f).not.toContain("toISOString().slice(0, 10)");
    }
  });
  it("화면: 오늘·30일 뒤 기본값은 로컬 날짜", () => {
    for (const f of ["nonconforming/NonconformingPage", "correctiveAction/CorrectiveActionPage", "audit/AuditPage", "training/TrainingPage", "calibration/CalibrationPage", "supplier/SupplierPage"]) {
      expect(read(`client/src/pages/${f}.tsx`), f).not.toContain("toISOString().slice(0, 10)");
    }
  });
});
