/**
 * 매입·매출 금액 계약 (2026-10-15, Codex #524 판매 승인 직전 검증)
 *
 * accounting_sales / accounting_purchases
 *   total_amount = 공급가액 (부가세 제외, 수량 × 단가)
 *   tax_amount   = 부가세
 *   합계(청구액) = total_amount + tax_amount   ← 화면의 "합계"
 *
 * 근거 (운영 백업 10/16, 회사 2): 매출 4,610행 중 세액이 있는 행은 전부 tax ≈ total × 10% (1/11 아님).
 *   매입 132행도 같다. 쓰는 곳(수기 등록·출고 연동·반복 거래·엑셀) 모두 total = 수량 × 단가.
 *
 * 사고: 확정 분개가 total_amount 를 합계로 보고 공급가 = total − tax 로 나눴다.
 *   매출: 외상매출금 = 공급가, 매출 = 공급가 − 세액 → 둘 다 세액만큼 적게 (#10535·#10536 합 234,780원 예측).
 *   이미 전기된 매출 262건 합 6,629,542원 (보정은 별도 결정).
 *
 * 수금·취소는 다시 계산하지 않고 **원 전표 금액** 을 쓴다 — 이 계약 이전에 전기된 전표도 정확히 맞물리게.
 */

export type DocumentAmounts = { supply: number; tax: number; gross: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 공급가·세액·합계 — total_amount 는 공급가 */
export function documentAmounts(row: { totalAmount?: unknown; taxAmount?: unknown }): DocumentAmounts {
  const supply = r2(Number(row.totalAmount ?? 0) || 0);
  const tax = r2(Number(row.taxAmount ?? 0) || 0);
  return { supply, tax, gross: r2(supply + tax) };
}

export type PostedLine = {
  account_id: number; account_code: string; account_name: string;
  debit_amount: number; credit_amount: number; partner_id: number | null; description: string | null;
};

/**
 * 원 전표(마커로 시작하는 가장 최근 전표)의 분개행. 없으면 null.
 * 마커 뒤 공백까지 비교 — SALE-110 이 SALE-1104 전표에 걸리지 않게.
 */
export async function findPostedEntryLines(conn: any, tenantId: number, marker: string): Promise<{ entryId: number; lines: PostedLine[] } | null> {
  const [eRows]: any = await conn.execute(
    `SELECT id FROM expense_journal_entries
      WHERE tenant_id = ? AND (description = ? OR description LIKE ?)
      ORDER BY id DESC LIMIT 1`,
    [tenantId, marker, `${marker} %`],
  );
  const entry = eRows?.[0];
  if (!entry) return null;
  const [lRows]: any = await conn.execute(
    `SELECT account_id, account_code, account_name, debit_amount, credit_amount, partner_id, description
       FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ? ORDER BY sort_order, id`,
    [entry.id, tenantId],
  );
  return {
    entryId: Number(entry.id),
    lines: ((lRows as any[]) ?? []).map((l) => ({
      ...l, account_id: Number(l.account_id), debit_amount: Number(l.debit_amount || 0), credit_amount: Number(l.credit_amount || 0),
    })),
  };
}

/** 원 전표에서 특정 계정의 차변(또는 대변) 합 */
export function sumAccount(lines: PostedLine[], accountId: number, side: "debit" | "credit"): number {
  return r2(lines.filter((l) => l.account_id === accountId).reduce((a, l) => a + (side === "debit" ? l.debit_amount : l.credit_amount), 0));
}
