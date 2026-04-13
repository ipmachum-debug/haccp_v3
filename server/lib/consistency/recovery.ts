/**
 * 정합성 데이터 복구 (Phase 0.5)
 * ═══════════════════════════════════════════════════════════════
 * Module 0 검증 도구로 발견된 이슈들을 실제로 복구하는 함수들.
 * - 모든 함수는 DRY_RUN 지원
 * - 레코드 단위 트랜잭션 (한 건 실패해도 나머지 진행)
 * - 실행 결과는 RecoveryResult 로 반환
 *
 * 철학:
 *   - 이미 있는 레코드는 절대 중복 생성하지 않음 (재실행 안전)
 *   - 재고 음수 절대 금지
 *   - 의심스러우면 skip + 에러 로그 (halt 금지)
 * ═══════════════════════════════════════════════════════════════
 */

import type { Pool, PoolConnection } from "mysql2/promise";
import { withTransaction } from "../../db/connection";
import { resolveSystemAccount } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";

export interface RecoveryOptions {
  dryRun: boolean;
  tenantId: number | null;
  limit?: number;
}

export interface RecoveryResult {
  phase: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ id: number | string; message: string }>;
  details: string[];
}

function emptyResult(phase: string): RecoveryResult {
  return { phase, attempted: 0, succeeded: 0, failed: 0, skipped: 0, errors: [], details: [] };
}

// ───────────────────────────────────────────────────────────────
// Phase A: paid 매입 → 회계 분개 생성 (ACC_PAID_NO_JOURNAL)
// ───────────────────────────────────────────────────────────────

/**
 * paid 매입이지만 [매입] PURCHASE-${id} 분개가 없는 건들을 찾아서
 * 차변 원재료+부가세 / 대변 외상매입금 분개를 생성.
 *
 * 주의:
 *   - 이미 같은 description 의 분개가 있으면 skip
 *   - INVENTORY_RAW/ACCOUNTS_PAYABLE/VAT_INPUT 계정이 없으면 즉시 중단
 *     (계정 세팅 먼저 해야 함)
 */
export async function recoverPaidPurchaseJournals(
  conn: Pool,
  opts: RecoveryOptions,
): Promise<RecoveryResult> {
  const result = emptyResult("ACC_PAID_NO_JOURNAL");

  // 1. 대상 조회
  const tenantFilter = opts.tenantId !== null ? "AND p.tenant_id = ?" : "";
  const params = opts.tenantId !== null ? [opts.tenantId] : [];
  const limitClause = opts.limit ? `LIMIT ${opts.limit}` : "";

  const [targetRows]: any = await conn.execute(
    `SELECT p.id, p.tenant_id, p.transaction_date, p.item_name, p.partner_id,
            p.quantity, p.unit_price, p.total_amount, p.tax_amount,
            p.posted_by, p.posted_at
     FROM accounting_purchases p
     WHERE p.status = 'paid'
       AND NOT EXISTS (
         SELECT 1 FROM expense_journal_entries e
         WHERE e.tenant_id = p.tenant_id
           AND e.description LIKE CONCAT('%PURCHASE-', p.id, '%')
       )
       ${tenantFilter}
     ORDER BY p.transaction_date ASC, p.id ASC
     ${limitClause}`,
    params,
  );

  const targets: any[] = targetRows;
  result.attempted = targets.length;

  if (targets.length === 0) {
    result.details.push("복구 대상 없음 (모든 paid 매입에 분개 존재)");
    return result;
  }

  // 2. 계정 사전 검증 — tenant 별로 한 번씩
  const tenantAccountCache = new Map<number, {
    inventoryRawId: number;
    vatInputId: number;
    accountsPayableId: number;
    inventoryRawCode: string;
    vatInputCode: string;
    accountsPayableCode: string;
    inventoryRawName: string;
    vatInputName: string;
    accountsPayableName: string;
  }>();

  const uniqueTenants = Array.from(new Set(targets.map((t) => Number(t.tenant_id))));
  for (const tid of uniqueTenants) {
    const invAcc = await resolveSystemAccount(tid, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
    const vatAcc = await resolveSystemAccount(tid, SYSTEM_ACCOUNTS.VAT_INPUT, "1350", "부가세대급금");
    const apAcc = await resolveSystemAccount(tid, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");

    if (invAcc.id === 0 || vatAcc.id === 0 || apAcc.id === 0) {
      const missing: string[] = [];
      if (invAcc.id === 0) missing.push("INVENTORY_RAW(1410)");
      if (vatAcc.id === 0) missing.push("VAT_INPUT(1350)");
      if (apAcc.id === 0) missing.push("ACCOUNTS_PAYABLE(2010)");
      const msg = `[HALT] tenant ${tid}: 필수 계정 누락: ${missing.join(", ")}. accounting_accounts 시드 먼저 필요.`;
      result.errors.push({ id: `tenant_${tid}`, message: msg });
      result.details.push(msg);
      return result;
    }

    tenantAccountCache.set(tid, {
      inventoryRawId: invAcc.id,
      vatInputId: vatAcc.id,
      accountsPayableId: apAcc.id,
      inventoryRawCode: invAcc.code,
      vatInputCode: vatAcc.code,
      accountsPayableCode: apAcc.code,
      inventoryRawName: invAcc.name,
      vatInputName: vatAcc.name,
      accountsPayableName: apAcc.name,
    });
  }
  result.details.push(`계정 사전 검증 OK (tenants: ${uniqueTenants.join(", ")})`);

  // 3. 레코드 단위 복구
  for (const p of targets) {
    const tid = Number(p.tenant_id);
    const accs = tenantAccountCache.get(tid)!;
    const totalAmount = Number(p.total_amount || 0);
    const taxAmount = Number(p.tax_amount || 0);
    const supplyAmount = Math.max(0, totalAmount - taxAmount);
    const entryDate = typeof p.transaction_date === "string"
      ? p.transaction_date
      : new Date(p.transaction_date).toISOString().slice(0, 10);
    const description = `[매입] PURCHASE-${p.id} ${p.item_name || ""}`.slice(0, 490);
    const postedBy = Number(p.posted_by) || 1;

    if (totalAmount <= 0) {
      result.skipped++;
      result.details.push(`  skip PURCHASE-${p.id}: total_amount=${totalAmount} (0 이하)`);
      continue;
    }

    if (opts.dryRun) {
      result.succeeded++;
      result.details.push(
        `  [DRY] PURCHASE-${p.id}: 차변 ${accs.inventoryRawCode} ${supplyAmount} + ${accs.vatInputCode} ${taxAmount} / 대변 ${accs.accountsPayableCode} ${totalAmount}`,
      );
      continue;
    }

    try {
      await withTransaction(async (tx: PoolConnection) => {
        // 이중 생성 방지 (레코드 단위로 다시 체크)
        const [existingRows]: any = await tx.execute(
          `SELECT id FROM expense_journal_entries
           WHERE tenant_id = ? AND description LIKE ? LIMIT 1`,
          [tid, `%PURCHASE-${p.id}%`],
        );
        if ((existingRows as any[]).length > 0) {
          throw new Error("RACE: 이미 분개 존재 (다른 프로세스가 처리함)");
        }

        // entry 생성
        const [jeResult]: any = await tx.execute(
          `INSERT INTO expense_journal_entries
             (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
          [tid, entryDate, description, totalAmount, totalAmount, postedBy],
        );
        const entryId = Number((jeResult as any).insertId);

        let sortOrder = 0;
        // 차변: 원재료 (supplyAmount)
        await tx.execute(
          `INSERT INTO expense_journal_lines
             (tenant_id, journal_entry_id, account_id, account_code, account_name,
              debit_amount, credit_amount, description, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            tid, entryId,
            accs.inventoryRawId, accs.inventoryRawCode, accs.inventoryRawName,
            supplyAmount,
            `[복구] 매입 원재료: ${p.item_name || ""}`.slice(0, 490),
            sortOrder++,
          ],
        );

        // 차변: 부가세대급금 (taxAmount, 0 초과일 때만)
        if (taxAmount > 0) {
          await tx.execute(
            `INSERT INTO expense_journal_lines
               (tenant_id, journal_entry_id, account_id, account_code, account_name,
                debit_amount, credit_amount, description, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [
              tid, entryId,
              accs.vatInputId, accs.vatInputCode, accs.vatInputName,
              taxAmount,
              `[복구] 매입 부가세: ${p.item_name || ""}`.slice(0, 490),
              sortOrder++,
            ],
          );
        }

        // 대변: 외상매입금 (totalAmount, partner_id 연결)
        await tx.execute(
          `INSERT INTO expense_journal_lines
             (tenant_id, journal_entry_id, account_id, account_code, account_name,
              debit_amount, credit_amount, partner_id, description, sort_order)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
          [
            tid, entryId,
            accs.accountsPayableId, accs.accountsPayableCode, accs.accountsPayableName,
            totalAmount,
            p.partner_id || null,
            `[복구] 매입: ${p.item_name || ""}`.slice(0, 490),
            sortOrder++,
          ],
        );
      }, `recoverPaidPurchaseJournals:PURCHASE-${p.id}`);

      result.succeeded++;
      if (result.succeeded <= 10) {
        result.details.push(`  ✓ PURCHASE-${p.id}: 분개 생성 완료`);
      }
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.startsWith("RACE:")) {
        result.skipped++;
        result.details.push(`  ~ PURCHASE-${p.id}: ${msg} (중복 방지 skip)`);
      } else {
        result.failed++;
        result.errors.push({ id: p.id, message: msg });
        result.details.push(`  ✗ PURCHASE-${p.id}: ${msg}`);
      }
    }
  }

  return result;
}

// ───────────────────────────────────────────────────────────────
// Phase B: LOT 잔량 vs 거래원장 조정 (INV_LOT_VS_TX)
// ───────────────────────────────────────────────────────────────

/**
 * LOT current_quantity 와 h_inventory_transactions 집계 차이를
 * 'adjustment' 거래로 closing.
 *
 * 원칙: LOT 의 current_quantity 를 "진실" 로 간주 (Excel 임포트 + 실사 기반).
 *       거래원장에 부족한 양을 adjustment 로 추가 기록.
 *
 * 재고 음수 금지: 복구 결과 LOT 이 음수가 되면 skip.
 */
export async function recoverLotVsTxBalance(
  conn: Pool,
  opts: RecoveryOptions,
): Promise<RecoveryResult> {
  const result = emptyResult("INV_LOT_VS_TX");
  const TOLERANCE = 0.001;

  const tenantFilter = opts.tenantId !== null ? "WHERE lot.tenant_id = ?" : "";
  const params = opts.tenantId !== null ? [opts.tenantId] : [];
  const limitClause = opts.limit ? `LIMIT ${opts.limit}` : "";

  const [targetRows]: any = await conn.execute(
    `SELECT
        lot.id AS lot_id,
        lot.tenant_id,
        lot.lot_number,
        lot.material_id,
        lot.unit,
        COALESCE(lot.current_quantity, lot.quantity) AS lot_current,
        COALESCE(SUM(CASE
          WHEN UPPER(tx.transaction_type) IN ('RECEIPT','INBOUND','RETURN') THEN tx.quantity
          WHEN UPPER(tx.transaction_type) IN ('USAGE','OUTBOUND','DISPOSAL','TRANSFER') THEN -tx.quantity
          WHEN UPPER(tx.transaction_type) = 'ADJUSTMENT' THEN tx.quantity
          ELSE tx.quantity
        END), 0) AS tx_net
     FROM h_inventory_lots lot
     LEFT JOIN h_inventory_transactions tx ON tx.lot_id = lot.id
     ${tenantFilter}
     GROUP BY lot.id
     HAVING ABS(lot_current - tx_net) > ${TOLERANCE}
     ORDER BY ABS(lot_current - tx_net) DESC
     ${limitClause}`,
    params,
  );

  const targets: any[] = targetRows;
  result.attempted = targets.length;

  if (targets.length === 0) {
    result.details.push("복구 대상 없음 (모든 LOT 거래원장 일치)");
    return result;
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const lot of targets) {
    const lotId = Number(lot.lot_id);
    const tid = Number(lot.tenant_id);
    const lotCurrent = Number(lot.lot_current);
    const txNet = Number(lot.tx_net);
    const diff = lotCurrent - txNet;

    if (lotCurrent < 0) {
      // ★ 재고 음수 금지 원칙: LOT 자체가 음수면 건드리지 않음 (수동 조사 필요)
      result.skipped++;
      result.details.push(`  skip LOT#${lotId}: lot_current=${lotCurrent} 음수 (수동 조사 필요)`);
      continue;
    }

    if (Math.abs(diff) < TOLERANCE) {
      result.skipped++;
      continue;
    }

    // diff > 0: LOT 에 있는데 tx 기록이 부족 → receipt 로 +diff 추가
    // diff < 0: tx 에는 있는데 LOT 이 적음 → usage 로 |diff| 차감
    // ★ 원칙: quantity 컬럼은 항상 양수로 저장. 방향은 transaction_type 으로 표현.
    const absQty = Math.abs(diff);
    const txType = diff > 0 ? "receipt" : "usage"; // adjustment 타입이 아님
    const noteDirection = diff > 0
      ? "LOT > TX 합 → 누락된 입고 기록 보충"
      : "LOT < TX 합 → 누락된 출고 기록 보충";
    const note = `[RECOVERY] LOT-TX 정합성 복구: diff=${diff.toFixed(3)} ${lot.unit || ""}. ${noteDirection}`;

    if (opts.dryRun) {
      result.succeeded++;
      if (result.succeeded <= 10) {
        result.details.push(
          `  [DRY] LOT#${lotId} (${lot.lot_number}): ${txType} ${absQty.toFixed(3)} ${lot.unit || ""}`,
        );
      }
      continue;
    }

    try {
      await withTransaction(async (tx: PoolConnection) => {
        // 항상 양수 quantity + 적절한 transaction_type
        await tx.execute(
          `INSERT INTO h_inventory_transactions
             (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
              reference_type, source_type, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'RECOVERY', 'recovery_script', ?, ?)`,
          [tid, lotId, txType, absQty, lot.unit || "EA", today, note, 1],
        );
      }, `recoverLotVsTxBalance:LOT-${lotId}`);

      result.succeeded++;
      if (result.succeeded <= 10) {
        result.details.push(
          `  ✓ LOT#${lotId}: ${txType} ${absQty.toFixed(3)} ${lot.unit || ""}`,
        );
      }
    } catch (err: any) {
      result.failed++;
      result.errors.push({ id: lotId, message: err.message || String(err) });
    }
  }

  return result;
}

// ───────────────────────────────────────────────────────────────
// Phase C: material_ledger_daily 재생성 (XCHK_LEDGER_VS_TX, XCHK_PURCHASE_VS_LEDGER)
// ───────────────────────────────────────────────────────────────

/**
 * h_inventory_transactions 를 진실로 간주하여
 * material_ledger_daily 를 material+date 단위로 재집계 UPSERT.
 *
 * - 기존 row 는 UPDATE (receiving_qty/usage_qty 만 덮어씀, notes/source 유지)
 * - 없는 (material, date) 는 INSERT
 * - 미사용 material 은 건드리지 않음 (삭제 금지)
 */
export async function recoverMaterialLedgerDaily(
  conn: Pool,
  opts: RecoveryOptions,
): Promise<RecoveryResult> {
  const result = emptyResult("XCHK_LEDGER_RECOMPUTE");
  const TOLERANCE = 0.001;

  const tenantFilter = opts.tenantId !== null ? "AND lot.tenant_id = ?" : "";
  const params = opts.tenantId !== null ? [opts.tenantId] : [];

  // 1. transactions 기반 집계 (material × date)
  //    - receipt/inbound/return → receiving
  //    - usage/outbound/disposal → usage
  //    - adjustment 는 legacy 데이터에서 쓰일 수 있지만 recovery 는 receipt/usage 로 기록
  const [aggRows]: any = await conn.execute(
    `SELECT
        lot.tenant_id,
        lot.material_id,
        tx.transaction_date,
        SUM(CASE WHEN UPPER(tx.transaction_type) IN ('RECEIPT','INBOUND','RETURN') THEN tx.quantity ELSE 0 END) AS recv,
        SUM(CASE WHEN UPPER(tx.transaction_type) IN ('USAGE','OUTBOUND','DISPOSAL') THEN tx.quantity ELSE 0 END) AS usage_q
     FROM h_inventory_transactions tx
     INNER JOIN h_inventory_lots lot ON lot.id = tx.lot_id
     WHERE lot.material_id IS NOT NULL
       AND tx.transaction_date IS NOT NULL
       ${tenantFilter}
     GROUP BY lot.tenant_id, lot.material_id, tx.transaction_date
     ORDER BY lot.tenant_id, lot.material_id, tx.transaction_date`,
    params,
  );

  const aggs: any[] = aggRows;
  result.attempted = aggs.length;

  if (aggs.length === 0) {
    result.details.push("복구 대상 없음 (재집계할 거래 없음)");
    return result;
  }

  // 2. 각 집계를 UPSERT
  for (const agg of aggs) {
    const tid = Number(agg.tenant_id);
    const matId = Number(agg.material_id);
    const date = typeof agg.transaction_date === "string"
      ? agg.transaction_date
      : new Date(agg.transaction_date).toISOString().slice(0, 10);
    const recv = Number(agg.recv || 0);
    const usage = Number(agg.usage_q || 0);

    if (Math.abs(recv) < TOLERANCE && Math.abs(usage) < TOLERANCE) {
      result.skipped++;
      continue;
    }

    if (opts.dryRun) {
      result.succeeded++;
      if (result.succeeded <= 10) {
        result.details.push(
          `  [DRY] tenant=${tid} mat=${matId} date=${date}: recv=${recv} usage=${usage}`,
        );
      }
      continue;
    }

    try {
      await conn.execute(
        `INSERT INTO material_ledger_daily
           (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, source, notes)
         VALUES (?, ?, ?, ?, ?, 'recovery_script', '[RECOVERY] transactions 재집계')
         ON DUPLICATE KEY UPDATE
           receiving_qty = VALUES(receiving_qty),
           usage_qty = VALUES(usage_qty),
           updated_at = NOW()`,
        [tid, matId, date, recv, usage],
      );
      result.succeeded++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ id: `${tid}:${matId}:${date}`, message: err.message || String(err) });
    }
  }

  return result;
}

// ───────────────────────────────────────────────────────────────
// Phase D: 유통기한 지난 available LOT → expired (INV_EXPIRED_ACTIVE)
// ───────────────────────────────────────────────────────────────

export async function recoverExpiredLots(
  conn: Pool,
  opts: RecoveryOptions,
): Promise<RecoveryResult> {
  const result = emptyResult("INV_EXPIRED_ACTIVE");

  const tenantFilter = opts.tenantId !== null ? "AND tenant_id = ?" : "";
  const params = opts.tenantId !== null ? [opts.tenantId] : [];

  const [targetRows]: any = await conn.execute(
    `SELECT id, tenant_id, lot_number, material_id, expiry_date,
            COALESCE(current_quantity, quantity) AS qty
     FROM h_inventory_lots
     WHERE status = 'available'
       AND expiry_date IS NOT NULL
       AND expiry_date < CURDATE()
       ${tenantFilter}`,
    params,
  );

  const targets: any[] = targetRows;
  result.attempted = targets.length;

  if (targets.length === 0) {
    result.details.push("복구 대상 없음 (만료 LOT 없음)");
    return result;
  }

  for (const lot of targets) {
    const lotId = Number(lot.id);

    if (opts.dryRun) {
      result.succeeded++;
      if (result.succeeded <= 10) {
        result.details.push(
          `  [DRY] LOT#${lotId} (${lot.lot_number}): expiry=${lot.expiry_date} qty=${lot.qty} → expired`,
        );
      }
      continue;
    }

    try {
      await conn.execute(
        `UPDATE h_inventory_lots
         SET status = 'expired', updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [lotId, lot.tenant_id],
      );
      result.succeeded++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ id: lotId, message: err.message || String(err) });
    }
  }

  return result;
}

// ───────────────────────────────────────────────────────────────
// Orchestrator: 전체 phase 실행
// ───────────────────────────────────────────────────────────────

export async function runAllRecovery(
  conn: Pool,
  opts: RecoveryOptions,
): Promise<RecoveryResult[]> {
  const results: RecoveryResult[] = [];

  // Phase A: 누락 분개 (가장 중요)
  results.push(await recoverPaidPurchaseJournals(conn, opts));

  // Phase B: LOT vs TX 불일치
  results.push(await recoverLotVsTxBalance(conn, opts));

  // Phase C: material_ledger_daily 재집계
  //    → Phase B 가 adjustment 를 추가했으므로 이것 기반으로 재집계해야 정합성 맞음
  results.push(await recoverMaterialLedgerDaily(conn, opts));

  // Phase D: 만료 LOT 상태 정리
  results.push(await recoverExpiredLots(conn, opts));

  return results;
}
