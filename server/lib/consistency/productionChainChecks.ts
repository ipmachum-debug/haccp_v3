/**
 * 생산 흐름 정합성 검증 (2026-10-15) — 배치 → 원료 차감 → 제품 LOT → 회계 → 판매 출고 → LOT 차감
 * ═══════════════════════════════════════════════════════════════
 * 기간(배치 생산일 planned_date / 매출 거래일) 안의 기록만 본다 — 옛 데이터의 오래된 불일치와 섞지 않기 위해.
 * 검증 항목:
 *   PROD_INPUT_NOT_ISSUED      — 완료 배치의 투입 줄인데 출고 기록 없음 (inventory_deducted=0 이고 usage 거래 없음)
 *   PROD_INPUT_OVER_ISSUED     — 투입 줄 출고 합계가 계획량의 105% 초과 (중복 출고 의심. FEFO 로 LOT 여러 개 나눠 출고는 정상)
 *   PROD_NO_PRODUCT_LOT        — 완료 배치인데 제품 LOT 없음
 *   PROD_LOT_KG_MISMATCH       — 실적(kg) ≠ 제품 LOT 수량 × SKU 판매단위 kg (1% 초과)
 *   PROD_NO_COMPLETION_JOURNAL — 생산완료 분개 대상(생산일 ≥ 전기 시작일, 원가 > 0)인데 [생산완료] BATCH-<id> 분개 없음
 *   SALE_APPROVED_NO_DEDUCTION — 승인·수금 매출(제품)인데 LOT 차감(SALE 거래) 없음
 *   SALE_PENDING_BACKLOG       — 승인 대기 매출 (LOT 차감·분개 전 단계 — 쌓이면 제품 재고가 실제보다 많다)
 * 회계 제외(accounting_excluded=1, B2C 플랫폼 정산분)는 매출 분개를 하지 않는 것이 정상 — 분개 검사 대상 아님.
 * 덤프 10/14 대조 결과와 같은 기준 (실적 kg 은 SKU 환산: 380kg ÷ 0.8kg/팩 = 475팩).
 * ═══════════════════════════════════════════════════════════════
 */
import type { Pool } from "mysql2/promise";
import type { Finding } from "./types";

const SAMPLE_LIMIT = 20;

export type ChainRange = { from: string; to: string };

export function productionJournalStartDate(): string {
  return process.env.PRODUCTION_JOURNAL_START_DATE || "2026-10-12";
}

/** 실적 kg 과 LOT 환산 kg 비교 — 1% 또는 0.5kg 중 큰 값까지 허용 (순수 계산, 테스트 대상) */
export function kgMismatch(actualKg: number, lotKg: number): boolean {
  return Math.abs(actualKg - lotKg) > Math.max(0.5, Math.abs(actualKg) * 0.01);
}

const finding = (code: string, title: string, severity: Finding["severity"], rows: any[], message?: string): Finding => ({
  code, title, severity, count: rows.length, samples: rows.slice(0, SAMPLE_LIMIT), ...(message ? { message } : {}),
});

export async function checkInputsNotIssued(conn: Pool, tenantId: number, r: ChainRange): Promise<Finding> {
  const [rows]: any = await conn.execute(
    `SELECT b.id AS batch_id, b.batch_code, b.planned_date, i.id AS input_id, i.material_id, i.planned_quantity
       FROM h_batches b
       JOIN h_batch_inputs i ON i.batch_id = b.id AND i.tenant_id = b.tenant_id
      WHERE b.tenant_id = ? AND b.status = 'completed' AND b.planned_date BETWEEN ? AND ?
        AND COALESCE(i.inventory_deducted, 0) = 0
        AND COALESCE(i.planned_quantity, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM h_inventory_transactions t
                         WHERE t.tenant_id = b.tenant_id AND t.source_id = b.id AND t.source_line_id = i.id
                           AND t.transaction_type = 'usage' AND t.source_type IN ('BATCH', 'batch_completion'))
      ORDER BY b.planned_date DESC, b.id`,
    [tenantId, r.from, r.to],
  );
  return finding("PROD_INPUT_NOT_ISSUED", "완료 배치 투입 줄 미출고 (원료 차감 누락)", "high", rows);
}

export async function checkInputsOverIssued(conn: Pool, tenantId: number, r: ChainRange): Promise<Finding> {
  const [rows]: any = await conn.execute(
    `SELECT b.id AS batch_id, b.batch_code, i.id AS input_id, i.planned_quantity, SUM(ABS(t.quantity)) AS issued_qty, COUNT(*) AS tx_count
       FROM h_batches b
       JOIN h_batch_inputs i ON i.batch_id = b.id AND i.tenant_id = b.tenant_id
       JOIN h_inventory_transactions t ON t.tenant_id = b.tenant_id AND t.source_id = b.id AND t.source_line_id = i.id
                                      AND t.transaction_type = 'usage' AND t.source_type IN ('BATCH', 'batch_completion')
      WHERE b.tenant_id = ? AND b.planned_date BETWEEN ? AND ? AND COALESCE(i.planned_quantity, 0) > 0
      GROUP BY b.id, b.batch_code, i.id, i.planned_quantity
     HAVING SUM(ABS(t.quantity)) > i.planned_quantity * 1.05 + 0.001`,
    [tenantId, r.from, r.to],
  );
  return finding("PROD_INPUT_OVER_ISSUED", "투입 줄 과다 출고 (중복 출고 의심)", "critical", rows,
    "같은 투입 줄의 출고 합계가 계획량의 105% 초과. FEFO 로 여러 LOT 에서 나눠 출고한 것은 합계가 계획량과 같아 걸리지 않는다.");
}

export async function checkNoProductLot(conn: Pool, tenantId: number, r: ChainRange): Promise<Finding> {
  const [rows]: any = await conn.execute(
    `SELECT b.id AS batch_id, b.batch_code, b.planned_date, b.actual_quantity
       FROM h_batches b
      WHERE b.tenant_id = ? AND b.status = 'completed' AND b.planned_date BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM h_inventory_lots l WHERE l.tenant_id = b.tenant_id AND l.batch_id = b.id AND l.product_id IS NOT NULL)
      ORDER BY b.planned_date DESC`,
    [tenantId, r.from, r.to],
  );
  return finding("PROD_NO_PRODUCT_LOT", "완료 배치인데 제품 LOT 없음", "high", rows);
}

export async function checkLotKgMismatch(conn: Pool, tenantId: number, r: ChainRange): Promise<Finding> {
  const [rows]: any = await conn.execute(
    `SELECT b.id AS batch_id, b.batch_code, b.planned_date, b.actual_quantity,
            SUM(l.quantity * COALESCE(s.kg_per_sales_unit, CASE WHEN LOWER(l.unit) = 'kg' THEN 1 END)) AS lot_kg,
            SUM(CASE WHEN s.id IS NULL AND LOWER(COALESCE(l.unit, '')) <> 'kg' THEN 1 ELSE 0 END) AS unconvertible_lots
       FROM h_batches b
       JOIN h_inventory_lots l ON l.tenant_id = b.tenant_id AND l.batch_id = b.id AND l.product_id IS NOT NULL
       LEFT JOIN product_skus s ON s.id = l.sku_id AND s.tenant_id = b.tenant_id
      WHERE b.tenant_id = ? AND b.status = 'completed' AND b.planned_date BETWEEN ? AND ? AND b.actual_quantity IS NOT NULL
      GROUP BY b.id, b.batch_code, b.planned_date, b.actual_quantity`,
    [tenantId, r.from, r.to],
  );
  const bad = (rows as any[]).filter((x) => x.lot_kg == null || Number(x.unconvertible_lots) > 0 || kgMismatch(Number(x.actual_quantity), Number(x.lot_kg)));
  return finding("PROD_LOT_KG_MISMATCH", "실적 kg ≠ 제품 LOT 환산 kg", "high", bad,
    "LOT 수량 × SKU 판매단위 kg (예: 475팩 × 0.8kg = 380kg). SKU 환산 정보가 없는 LOT 도 여기 포함.");
}

export async function checkNoCompletionJournal(conn: Pool, tenantId: number, r: ChainRange): Promise<Finding> {
  const start = productionJournalStartDate();
  const from = r.from > start ? r.from : start;
  if (from > r.to) return finding("PROD_NO_COMPLETION_JOURNAL", "생산완료 분개 누락", "high", [], `분개 시작일(${start}) 이전 기간 — 대상 없음`);
  const [rows]: any = await conn.execute(
    `SELECT b.id AS batch_id, b.batch_code, b.planned_date, b.material_cost
       FROM h_batches b
      WHERE b.tenant_id = ? AND b.status = 'completed' AND b.planned_date BETWEEN ? AND ?
        AND (COALESCE(b.material_cost, 0) > 0
             OR (SELECT COALESCE(SUM(i.total_price), 0) FROM h_batch_inputs i WHERE i.batch_id = b.id AND i.tenant_id = b.tenant_id) > 0)
        AND NOT EXISTS (SELECT 1 FROM expense_journal_entries e
                         WHERE e.tenant_id = b.tenant_id AND e.description LIKE CONCAT('[생산완료] BATCH-', b.id, '%'))
      ORDER BY b.planned_date DESC`,
    [tenantId, from, r.to],
  );
  return finding("PROD_NO_COMPLETION_JOURNAL", "생산완료 분개 누락 (차변 제품 1430 / 대변 원재료 1410)", "high", rows,
    `생산일 ${start} 이후 완료·원가 > 0 배치 대상`);
}

export async function checkSaleApprovedNoDeduction(conn: Pool, tenantId: number, r: ChainRange): Promise<Finding> {
  const [rows]: any = await conn.execute(
    `SELECT s.id AS sale_id, s.transaction_date, s.item_name, s.quantity, s.status, COALESCE(s.accounting_excluded, 0) AS accounting_excluded
       FROM accounting_sales s
      WHERE s.tenant_id = ? AND s.transaction_date BETWEEN ? AND ?
        AND s.status IN ('approved', 'received') AND s.product_id IS NOT NULL AND COALESCE(s.quantity, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM h_inventory_transactions t
                         WHERE t.tenant_id = s.tenant_id AND t.source_id = s.id AND t.source_type IN ('SALE', 'SALE_LEGACY', 'BUNDLE_OUTBOUND'))
      ORDER BY s.transaction_date DESC`,
    [tenantId, r.from, r.to],
  );
  return finding("SALE_APPROVED_NO_DEDUCTION", "승인된 제품 매출인데 LOT 차감 없음", "high", rows);
}

export async function checkSalePendingBacklog(conn: Pool, tenantId: number, r: ChainRange): Promise<Finding> {
  const [rows]: any = await conn.execute(
    `SELECT SUBSTRING(s.transaction_date, 1, 7) AS month, COUNT(*) AS pending_count, SUM(s.total_amount) AS pending_amount
       FROM accounting_sales s
      WHERE s.tenant_id = ? AND s.transaction_date BETWEEN ? AND ? AND s.status = 'pending'
      GROUP BY SUBSTRING(s.transaction_date, 1, 7) ORDER BY month`,
    [tenantId, r.from, r.to],
  );
  const total = (rows as any[]).reduce((a, x) => a + Number(x.pending_count || 0), 0);
  return { code: "SALE_PENDING_BACKLOG", title: "승인 대기 매출 (LOT 차감·분개 전)", severity: total > 0 ? "medium" : "info", count: total, samples: rows,
    message: "승인 전 매출은 제품 LOT 을 차감하지 않는다 — 쌓이면 제품 재고가 실제보다 많게 보인다." };
}

export async function runProductionChainChecks(conn: Pool, tenantId: number, range: ChainRange): Promise<Finding[]> {
  return Promise.all([
    checkInputsNotIssued(conn, tenantId, range),
    checkInputsOverIssued(conn, tenantId, range),
    checkNoProductLot(conn, tenantId, range),
    checkLotKgMismatch(conn, tenantId, range),
    checkNoCompletionJournal(conn, tenantId, range),
    checkSaleApprovedNoDeduction(conn, tenantId, range),
    checkSalePendingBacklog(conn, tenantId, range),
  ]);
}
