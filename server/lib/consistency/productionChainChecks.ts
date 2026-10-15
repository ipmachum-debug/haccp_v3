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
 *   SALE_APPROVED_NO_DEDUCTION — 승인·수금 매출(제품)인데 LOT 차감 없음 (단품: SALE 거래 / 혼합: bundle_lots 'sales:<id>' 또는 BUNDLE_OUTBOUND reference)
 *   SALE_PENDING_BACKLOG       — 승인 대기 매출 (LOT 차감·분개 전 단계 — 쌓이면 제품 재고가 실제보다 많다)
 *   PROD_LOT_COST_MISMATCH     — 제품 LOT 원가 합(수량 × 단가) ≠ 배치 원가 (전기 시작일 이후, 2026-10-15)
 *   JOURNAL_WRONG_ACCOUNT      — 생산완료·매출원가 분개가 엉뚱한 계정에 전기됨 (2026-10-15)
 *   SYSTEM_ACCOUNT_NAME_MISMATCH — 시스템 계정 역할과 이름 불일치 (예: 매출원가 역할이 '급여' 계정)
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
                         WHERE e.tenant_id = b.tenant_id
                           AND (e.description = CONCAT('[생산완료] BATCH-', b.id) OR e.description LIKE CONCAT('[생산완료] BATCH-', b.id, ' %')))
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
                         WHERE t.tenant_id = s.tenant_id AND t.source_id = s.id AND t.source_type IN ('SALE', 'SALE_LEGACY'))
        -- 혼합(번들) 제품은 구성 제품 LOT 에서 나눠 차감 — 거래의 source_id 는 혼합 LOT 이고 판매 번호는 bundle_lots.notes('sales:<id>')
        --   또는 (2026-10-15~) 거래의 reference_type='sales'·reference_id 에 남는다 (이전 점검은 이걸 못 봐 차감된 혼합 매출을 미차감으로 잡았다)
        AND NOT EXISTS (SELECT 1 FROM bundle_lots bl WHERE bl.tenant_id = s.tenant_id AND bl.notes = CONCAT('sales:', s.id))
        AND NOT EXISTS (SELECT 1 FROM h_inventory_transactions t2
                         WHERE t2.tenant_id = s.tenant_id AND t2.source_type = 'BUNDLE_OUTBOUND' AND t2.reference_type = 'sales' AND t2.reference_id = s.id)
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

/** LOT 원가 합 vs 배치 원가 — 1% 또는 10원 중 큰 값까지 허용 (단가 소수 2자리 반올림) */
export function lotCostMismatch(batchCost: number, lotValue: number): boolean {
  return Math.abs(batchCost - lotValue) > Math.max(10, Math.abs(batchCost) * 0.01);
}

/**
 * 제품 LOT 단가 = 생산원가 검증 (2026-10-15)
 * 판매 승인 매출원가 = LOT 단가 × 수량. LOT 에 판매가가 들어가 있으면 원가가 판매가로 잡히고,
 * 단가 0 이면 매출원가 분개가 없다. 생산완료 분개와 같은 범위(전기 시작일 이후 생산) 만 본다.
 */
export async function checkLotCostMismatch(conn: Pool, tenantId: number, r: ChainRange): Promise<Finding> {
  const start = productionJournalStartDate();
  const from = r.from > start ? r.from : start;
  if (from > r.to) return finding("PROD_LOT_COST_MISMATCH", "제품 LOT 원가 단가 불일치", "high", [], `원가 단가 시작일(${start}) 이전 기간 — 대상 없음`);
  const [rows]: any = await conn.execute(
    `SELECT b.id AS batch_id, b.batch_code, b.planned_date,
            CASE WHEN COALESCE(b.material_cost, 0) > 0 THEN b.material_cost
                 WHEN COALESCE(b.actual_cost, 0) > 0 THEN b.actual_cost
                 ELSE (SELECT COALESCE(SUM(i.total_price), 0) FROM h_batch_inputs i WHERE i.batch_id = b.id AND i.tenant_id = b.tenant_id) END AS batch_cost,
            (SELECT COALESCE(SUM(l.quantity * COALESCE(l.unit_price, 0)), 0) FROM h_inventory_lots l
              WHERE l.batch_id = b.id AND l.tenant_id = b.tenant_id AND l.product_id IS NOT NULL) AS lot_value,
            (SELECT COUNT(*) FROM h_inventory_lots l
              WHERE l.batch_id = b.id AND l.tenant_id = b.tenant_id AND l.product_id IS NOT NULL AND COALESCE(l.unit_price, 0) = 0) AS zero_price_lots
       FROM h_batches b
      WHERE b.tenant_id = ? AND b.status = 'completed' AND b.planned_date BETWEEN ? AND ?
        AND EXISTS (SELECT 1 FROM h_inventory_lots l WHERE l.batch_id = b.id AND l.tenant_id = b.tenant_id AND l.product_id IS NOT NULL)
      ORDER BY b.planned_date DESC`,
    [tenantId, from, r.to],
  );
  const bad = (rows as any[]).filter((x) => Number(x.batch_cost) > 0 && lotCostMismatch(Number(x.batch_cost), Number(x.lot_value)));
  return finding("PROD_LOT_COST_MISMATCH", "제품 LOT 원가 단가 불일치 (LOT 수량 × 단가 ≠ 배치 원가)", "high", bad,
    "판매 매출원가는 LOT 단가로 계산된다 — 판매가·0 이 들어가 있으면 원가가 틀린다. 생산일 기준 전기 시작일 이후 배치.");
}

/**
 * 자동분개 계정 검증 (2026-10-15) — 분개가 "있는지" 뿐 아니라 "맞는 계정인지"
 *   [생산완료]: 차변 = 제품(INVENTORY_FINISHED), 대변 = 원재료(INVENTORY_RAW)
 *   [매출원가]: 차변 = 매출원가(COST_OF_GOODS), 대변 = 자산(재고) 계정
 * 단지 10/12 생산완료 4건이 차변 '제품매출'(수익)으로 전기된 사고를 잡는 점검.
 */
export async function checkJournalWrongAccount(conn: Pool, tenantId: number, r: ChainRange): Promise<Finding> {
  const [rows]: any = await conn.execute(
    `SELECT e.id AS entry_id, e.entry_date, SUBSTRING(e.description, 1, 40) AS description, l.id AS line_id,
            CASE WHEN l.debit_amount > 0 THEN '차변' ELSE '대변' END AS side,
            l.account_code, a.name AS account_name, a.category, a.system_code, l.debit_amount + l.credit_amount AS amount
       FROM expense_journal_entries e
       JOIN expense_journal_lines l ON l.journal_entry_id = e.id AND l.tenant_id = e.tenant_id
       LEFT JOIN accounting_accounts a ON a.id = l.account_id AND a.tenant_id = e.tenant_id
      WHERE e.tenant_id = ? AND e.entry_date BETWEEN ? AND ?
        AND (
          (e.description LIKE '[생산완료] BATCH-%' AND (
             (l.debit_amount > 0 AND COALESCE(a.system_code, '') <> 'INVENTORY_FINISHED')
          OR (l.credit_amount > 0 AND COALESCE(a.system_code, '') <> 'INVENTORY_RAW')))
          OR
          (e.description LIKE '[매출원가]%' AND (
             (l.debit_amount > 0 AND COALESCE(a.system_code, '') <> 'COST_OF_GOODS')
          OR (l.credit_amount > 0 AND COALESCE(a.category, '') <> 'assets')))
        )
      ORDER BY e.entry_date DESC, e.id DESC`,
    [tenantId, r.from, r.to],
  );
  return finding("JOURNAL_WRONG_ACCOUNT", "자동분개 계정 오류 (생산완료·매출원가)", "critical", rows,
    "생산완료: 차변 제품(1430)/대변 원재료(1410). 매출원가: 차변 매출원가/대변 재고(자산). 보정은 승인 후 별도 작업.");
}

/** 시스템 계정 이름 점검 — 역할과 이름이 어긋난 계정 (예: 매출원가 역할이 '급여' 계정에 붙음) */
export const SYSTEM_ACCOUNT_NAME_HINTS: Record<string, string[]> = {
  COST_OF_GOODS: ["원가"],
  INVENTORY_FINISHED: ["제품"],
  INVENTORY_RAW: ["원재료", "원료"],
  INVENTORY_GOODS: ["상품"],
  SALES_REVENUE: ["매출"],
  ACCOUNTS_RECEIVABLE: ["매출채권", "외상매출", "미수"],
  ACCOUNTS_PAYABLE: ["매입채무", "외상매입", "미지급"],
};
export function systemAccountNameMismatch(systemCode: string, name: string, category?: string): boolean {
  const hints = SYSTEM_ACCOUNT_NAME_HINTS[systemCode];
  if (!hints) return false;
  if (systemCode === "INVENTORY_FINISHED" && category && category !== "assets") return true;
  return !hints.some((h) => String(name ?? "").includes(h));
}
export async function checkSystemAccountNames(conn: Pool, tenantId: number): Promise<Finding> {
  const [rows]: any = await conn.execute(
    `SELECT id AS account_id, code, name, category, system_code FROM accounting_accounts
      WHERE tenant_id = ? AND system_code IS NOT NULL AND system_code <> '' AND is_active = 'Y' ORDER BY code`,
    [tenantId],
  );
  const bad = (rows as any[]).filter((x) => systemAccountNameMismatch(x.system_code, x.name, x.category));
  return finding("SYSTEM_ACCOUNT_NAME_MISMATCH", "시스템 계정 역할과 계정 이름 불일치", "high", bad,
    "자동분개는 역할(system_code)로 계정을 고른다 — 이름이 다른 계정에 역할이 붙어 있으면 그 계정으로 전기된다.");
}

export async function runProductionChainChecks(conn: Pool, tenantId: number, range: ChainRange): Promise<Finding[]> {
  return Promise.all([
    checkInputsNotIssued(conn, tenantId, range),
    checkInputsOverIssued(conn, tenantId, range),
    checkNoProductLot(conn, tenantId, range),
    checkLotKgMismatch(conn, tenantId, range),
    checkNoCompletionJournal(conn, tenantId, range),
    checkLotCostMismatch(conn, tenantId, range),
    checkSaleApprovedNoDeduction(conn, tenantId, range),
    checkSalePendingBacklog(conn, tenantId, range),
    checkJournalWrongAccount(conn, tenantId, range),
    checkSystemAccountNames(conn, tenantId),
  ]);
}
