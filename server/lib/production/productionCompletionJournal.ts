/**
 * 생산완료 회계 전기 — 차변 제품(1430) / 대변 원재료(1410)
 *
 * 배경 (2026-10-12, v3 5단계 3차 #452 에서 드러난 공백)
 *   생산완료 분개가 운영에서 한 번도 전기된 적 없다 (배치 580건). 매출 COGS 는 재고 자산을
 *   대변 처리하므로 장부상 제품재고는 생산으로 늘지 않고 판매로만 줄어 음수로 간다.
 *   CEO 결정: 세무사 보고는 이번 분기 불가 → 실사로 끊고 전향적으로 전기 시작, 소급 없음.
 *
 * 왜 재공품(WIP)을 거치지 않나
 *   자동출고(autoMaterialIssue)·배치완료 어디에도 "원재료 → 재공품" 분개가 없다. 재공품을 대변 처리하면
 *   재공품 계정만 음수가 된다. 원재료가 제품으로 바뀐 사실을 한 번에 적는다 (소규모 제조 관행).
 *   재공품은 월말 평가가 필요해질 때 별도 도입.
 *
 * 규칙
 *   - 금액 = h_batches.material_cost > 0 ? material_cost : SUM(h_batch_inputs.total_price). 0 이면 전기 안 함.
 *   - 멱등: 같은 배치의 전표가 있으면 건너뜀 (description 마커 `[생산완료] BATCH-<id>` + tenant).
 *   - 전기 시작일 이전 **생산일(planned_date)** 배치는 건너뜀 (PRODUCTION_JOURNAL_START_DATE, 기본 2026-10-12).
 *     전표 entry_date 도 생산일. 완료 버튼 시각(completed_at)은 쓰지 않는다 — 현장은 며칠 뒤 입력한다.
 *   - 계정이 없으면 ensureSystemAccounts 로 시드 후 재조회 (운영 수작업 불필요).
 *   - 유령 재고 원장(h_inventory_transactions) 은 쓰지 않는다. 재고는 completeBatch 의 SKU LOT 이 정본.
 *   - 호출 지점: runBatchCompletionHooks (배치를 completed 로 만드는 모든 경로의 끝). 실패해도 완료는 유지.
 *   - 같은 트랜잭션에서 제품 LOT 단가를 생산원가로 맞춘다 (productLotUnitCost — 2026-10-15).
 */

import { getRawConnection, withTransaction } from "../../db/connection";
import { resolveSystemAccount, insertJournalLine, ensureSystemAccounts } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";
import { resolveBatchBusinessDate } from "./batchBusinessDate";
import { valueProductLotsInTx, type ProductLotCostResult } from "./productLotUnitCost";

export const DEFAULT_START_DATE = "2026-10-12";

export function isProductionJournalEnabled(): boolean {
  const v = (process.env.PRODUCTION_JOURNAL_ENABLED ?? "true").toLowerCase().trim();
  return !(v === "false" || v === "0" || v === "off");
}

export function productionJournalStartDate(): string {
  const v = process.env.PRODUCTION_JOURNAL_START_DATE?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEFAULT_START_DATE;
}

/** YYYY-MM-DD 비교 — completedAt 이 시작일 이후(포함)인지 */
export function isOnOrAfterStart(completedAt: string | Date | null | undefined, startDate: string): boolean {
  if (!completedAt) return false;
  const d = typeof completedAt === "string" ? completedAt.slice(0, 10) : completedAt.toISOString().slice(0, 10);
  return d >= startDate;
}

/** 전기 금액 결정 — material_cost 우선, 없으면 투입 total_price 합계 */
export function resolveBatchCost(batch: { material_cost?: unknown; actual_cost?: unknown }, inputsTotal: number): number {
  const mc = Number(batch.material_cost ?? 0);
  if (Number.isFinite(mc) && mc > 0) return Math.round(mc * 100) / 100;
  const ac = Number(batch.actual_cost ?? 0);
  if (Number.isFinite(ac) && ac > 0) return Math.round(ac * 100) / 100;
  return Number.isFinite(inputsTotal) && inputsTotal > 0 ? Math.round(inputsTotal * 100) / 100 : 0;
}

export function journalMarker(batchId: number): string {
  return `[생산완료] BATCH-${batchId}`;
}

export type ProductionJournalResult =
  | { posted: true; journalEntryId: number; amount: number; entryDate: string; lotCost: ProductLotCostResult }
  | { posted: false; reason: "disabled" | "before_start" | "already" | "zero_cost" | "not_completed" | "not_found" | "no_accounts" | "materials_not_issued"; detail?: string };

export async function postProductionCompletionJournal(p: {
  batchId: number;
  tenantId: number;
  userId: number;
}): Promise<ProductionJournalResult> {
  if (!isProductionJournalEnabled()) return { posted: false, reason: "disabled" };
  const startDate = productionJournalStartDate();
  const pool = await getRawConnection();

  const [bRows] = await pool.execute<any[]>(
    `SELECT id, batch_code, status, completed_at, planned_date, material_cost, actual_cost, actual_quantity
       FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [p.batchId, p.tenantId],
  );
  const batch = (bRows as any[])[0];
  if (!batch) return { posted: false, reason: "not_found" };
  if (batch.status !== "completed") return { posted: false, reason: "not_completed", detail: String(batch.status) };
  // 업무일자 = 생산일(planned_date). 현장은 며칠 뒤 입력하므로 완료 시각으로 가르면
  // 실사일 전 생산이 실사 뒤 입력됐을 때 평가액과 이중 계상된다 (2026-10-12 CEO 원칙).
  const businessDate = resolveBatchBusinessDate(batch);
  if (!isOnOrAfterStart(businessDate, startDate)) {
    return { posted: false, reason: "before_start", detail: `${businessDate} < ${startDate}` };
  }

  // 원료가 다 출고되기 전에는 생산원가를 확정하지 않는다 (Codex #552 검토 P1 — 미출고 줄은 원가 0 으로 빠진다)
  const { countUnissuedBatchLines } = await import("./issuedBatchLines");
  const unissued = await countUnissuedBatchLines(p.batchId, p.tenantId, pool);
  if (unissued > 0) return { posted: false, reason: "materials_not_issued", detail: `원료 ${unissued}줄 미출고` };

  const [iRows] = await pool.execute<any[]>(
    `SELECT COALESCE(SUM(total_price), 0) AS total FROM h_batch_inputs WHERE batch_id = ? AND tenant_id = ?`,
    [p.batchId, p.tenantId],
  );
  const amount = resolveBatchCost(batch, Number((iRows as any[])[0]?.total ?? 0));
  if (amount <= 0) return { posted: false, reason: "zero_cost" };

  // 계정 — 없으면 시드 후 재조회
  let finished = await resolveSystemAccount(p.tenantId, SYSTEM_ACCOUNTS.INVENTORY_FINISHED, "1430", "제품");
  let raw = await resolveSystemAccount(p.tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  if (!finished.id || !raw.id) {
    await ensureSystemAccounts(p.tenantId, p.userId);
    finished = await resolveSystemAccount(p.tenantId, SYSTEM_ACCOUNTS.INVENTORY_FINISHED, "1430", "제품");
    raw = await resolveSystemAccount(p.tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
    if (!finished.id || !raw.id) return { posted: false, reason: "no_accounts", detail: `제품=${finished.id} 원재료=${raw.id}` };
  }

  const marker = journalMarker(p.batchId);
  const entryDate = businessDate;
  const description = `${marker} ${batch.batch_code ?? ""} 원재료 → 제품 ${amount.toLocaleString("ko-KR")}원`.trim();

  return await withTransaction(async (conn) => {
    // 멱등: 같은 배치 전표가 있으면 건너뜀 (tenant 격리 + 마커 접두)
    //   마커 뒤 공백까지 비교 — `BATCH-110%` 가 BATCH-1104 전표에 걸려 "이미 전기" 로 건너뛰던 문제 차단
    const [exist] = await conn.execute(
      `SELECT id FROM expense_journal_entries WHERE tenant_id = ? AND (description = ? OR description LIKE ?) LIMIT 1 FOR UPDATE`,
      [p.tenantId, marker, `${marker} %`],
    );
    if ((exist as any[]).length > 0) {
      return { posted: false, reason: "already", detail: `entry#${(exist as any[])[0].id}` } as ProductionJournalResult;
    }

    const [je] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [p.tenantId, entryDate, description, amount.toFixed(2), amount.toFixed(2), p.userId],
    );
    const journalEntryId = Number((je as any).insertId);

    // 제품 LOT 단가 = 생산원가 — 같은 트랜잭션 (둘 다 되거나 둘 다 안 됨, 2026-10-15 #521 리뷰)
    //   분개가 이미 있으면 위에서 "already" 로 끝나므로 단가도 다시 바꾸지 않는다 (확정).
    //   움직임이 있는 LOT 은 valueProductLotsInTx 가 건너뛰고 has_movement 를 돌려준다 — 분개는 그대로 전기.
    const lotCost = await valueProductLotsInTx(conn, p.batchId, p.tenantId, amount);

    await insertJournalLine(conn, {
      tenantId: p.tenantId, journalEntryId,
      accountId: finished.id, accountCode: finished.code, accountName: finished.name,
      debitAmount: amount, creditAmount: 0, description: marker, sortOrder: 0,
    });
    await insertJournalLine(conn, {
      tenantId: p.tenantId, journalEntryId,
      accountId: raw.id, accountCode: raw.code, accountName: raw.name,
      debitAmount: 0, creditAmount: amount, description: marker, sortOrder: 1,
    });

    console.info(`[productionJournal] batch=${p.batchId} tenant=${p.tenantId} entry=${journalEntryId} amount=${amount} date=${entryDate}`);
    return { posted: true, journalEntryId, amount, entryDate, lotCost } as ProductionJournalResult;
  }, `productionJournal:${p.batchId}`);
}
