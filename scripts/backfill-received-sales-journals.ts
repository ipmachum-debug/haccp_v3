/**
 * 과거 received 매출의 수금 분개 소급 생성 스크립트
 *
 * 배경:
 *   2026-04-22 이전 saleMarkReceived 는 UPDATE status 만 수행하고
 *   입금 분개 / ar_ledger / bank_transactions 생성 로직이 누락돼 있었음
 *   (PR #46 에서 해결). 그 시점 이전에 수금 처리된 건들은 장부 왜곡 상태.
 *
 *   이 스크립트가 각 건에 대해 소급으로:
 *   - expense_journal_entries [수금] 엔트리
 *   - expense_journal_lines (차변 보통예금/현금 / 대변 외상매출금)
 *   - ar_ledger (ar_entry_type='payment')
 *   - bank_transactions (deposit, matched)
 *   생성.
 *
 * 안전장치:
 *   - 멱등성: 이미 [수금] 분개 있으면 skip
 *   - withTransaction 원자성 (각 건 단위)
 *   - DRY_RUN 지원
 *   - --max-days 로 범위 제한 (너무 오래된 건 제외)
 *   - 오류 발생 시 해당 건 skip + 다음 건 계속
 *
 * 사용법:
 *   # 미리보기 (tenant 2)
 *   DRY_RUN=true npx tsx scripts/backfill-received-sales-journals.ts --tenant 2
 *
 *   # 실제 실행
 *   npx tsx scripts/backfill-received-sales-journals.ts --tenant 2
 *
 *   # 특정 은행계좌 지정
 *   npx tsx scripts/backfill-received-sales-journals.ts --tenant 2 --bank-account 3
 *
 *   # 전체 활성 테넌트
 *   npx tsx scripts/backfill-received-sales-journals.ts --all
 *
 *   # 90일 이내 수금만 (기본)
 *   npx tsx scripts/backfill-received-sales-journals.ts --tenant 2 --max-days 90
 *
 * 범위 외 (Phase 2 별도 처리):
 *   - approved 인데 [매출] 분개도 없는 건 → 재고 차감까지 복잡. 별도 스크립트
 */

import "dotenv/config";

import { getRawConnection, withTransaction } from "../server/db";
import { resolveSystemAccount, insertJournalLine } from "../server/db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../drizzle/schema/accountingAccounts";

const DRY_RUN = process.env.DRY_RUN === "true";

interface Args {
  tenantId?: number;
  all: boolean;
  bankAccountId?: number;
  maxDays: number;
  userId?: number;   // 미지정 시 해당 tenant 의 첫 admin 자동 조회
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let tenantId: number | undefined;
  let all = false;
  let bankAccountId: number | undefined;
  let maxDays = 90;
  let userId: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--tenant": tenantId = Number(v); i++; break;
      case "--all": all = true; break;
      case "--bank-account": bankAccountId = Number(v); i++; break;
      case "--max-days": maxDays = Number(v); i++; break;
      case "--user": userId = Number(v); i++; break;
    }
  }

  if (!all && !tenantId) {
    console.error("Usage: npx tsx scripts/backfill-received-sales-journals.ts --tenant <id> | --all");
    console.error("옵션: --bank-account <id>, --max-days <N> (기본 90), --user <id> (미지정: 해당 tenant 의 첫 admin)");
    console.error("환경: DRY_RUN=true");
    process.exit(1);
  }
  return { tenantId, all, bankAccountId, maxDays, userId };
}

/** 사용자 ID 결정 — CLI --user 우선, 없으면 해당 tenant 의 첫 admin */
async function resolveUserId(tenantId: number, cliUserId: number | undefined): Promise<number> {
  if (cliUserId) return cliUserId;
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT id FROM users
       WHERE tenant_id = ? AND role IN ('admin', 'super_admin') AND is_active = 1
       ORDER BY id ASC LIMIT 1`,
    [tenantId],
  );
  const row = (rows as Array<{ id: number }>)[0];
  if (!row) {
    throw new Error(`tenant ${tenantId} 에 admin/super_admin 사용자 없음 — --user <id> 로 명시 필요`);
  }
  return row.id;
}

interface SaleToBackfill {
  id: number;
  partner_id: number | null;
  total_amount: string;
  transaction_date: string;
  item_name: string | null;
  created_at: Date;
}

async function findTargets(tenantId: number, maxDays: number): Promise<SaleToBackfill[]> {
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT s.id, s.partner_id, s.total_amount, s.transaction_date,
            s.item_name, s.created_at
       FROM accounting_sales s
      WHERE s.tenant_id = ?
        AND s.status = 'received'
        AND s.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND NOT EXISTS (
          SELECT 1 FROM expense_journal_entries je
          WHERE je.tenant_id = s.tenant_id
            AND je.description LIKE CONCAT('%[수금] SALE-', s.id, '%')
        )
      ORDER BY s.id ASC`,
    [tenantId, maxDays],
  );
  return rows as SaleToBackfill[];
}

async function resolveBankAccount(tenantId: number, opts: Args): Promise<number | null> {
  if (opts.bankAccountId) return opts.bankAccountId;
  const conn = await getRawConnection();
  const [priRows] = await conn.execute(
    `SELECT id FROM bank_accounts
       WHERE tenant_id = ? AND is_active = 'Y' AND is_primary = 1
       ORDER BY id ASC LIMIT 1`,
    [tenantId],
  );
  const pri = (priRows as Array<{ id: number }>)[0];
  if (pri) return pri.id;

  const [anyRows] = await conn.execute(
    `SELECT id FROM bank_accounts
       WHERE tenant_id = ? AND is_active = 'Y'
       ORDER BY id ASC LIMIT 1`,
    [tenantId],
  );
  const any = (anyRows as Array<{ id: number }>)[0];
  return any?.id ?? null;
}

async function backfillOne(
  sale: SaleToBackfill,
  tenantId: number,
  userId: number,
  bankAccountId: number | null,
): Promise<{ journalEntryId: number; arLedgerId: number | null; bankTransactionId: number | null }> {
  const totalAmount = Number(sale.total_amount);

  const receivableAcc = await resolveSystemAccount(
    tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금",
  );
  const cashOrBankAcc = bankAccountId
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.BANK_DEPOSIT, "1020", "보통예금")
    : await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.CASH, "1010", "현금");

  return await withTransaction(async (conn) => {
    // 멱등성 재확인 (동시 실행 대비)
    const [dupRows] = await conn.execute(
      `SELECT id FROM expense_journal_entries
         WHERE tenant_id = ?
           AND description LIKE CONCAT('%[수금] SALE-', ?, '%')
         LIMIT 1`,
      [tenantId, sale.id],
    );
    if ((dupRows as unknown[]).length > 0) {
      throw new Error(`SKIP_DUPLICATE: already has [수금] journal for SALE-${sale.id}`);
    }

    const docId = `SALE-${sale.id}`;
    const description = `[수금] ${docId} ${sale.item_name ?? ""} (backfill)`.trim();
    const receivedDate = typeof sale.transaction_date === "string"
      ? sale.transaction_date
      : new Date(sale.transaction_date).toISOString().slice(0, 10);

    // 1. 분개 헤더
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description,
          total_debit, total_credit, posted_by, posted_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
      [tenantId, receivedDate, description, totalAmount, totalAmount, userId],
    );
    const journalEntryId = Number((jeResult as { insertId: number }).insertId);

    // 2. 분개 라인 (차변 현금/보통예금 / 대변 외상매출금)
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: cashOrBankAcc.id,
      accountCode: cashOrBankAcc.code,
      accountName: cashOrBankAcc.name,
      debitAmount: totalAmount, creditAmount: 0,
      description: `수금: ${docId} (backfill)`,
      sortOrder: 0,
      bankAccountId: bankAccountId ?? null,
    });
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: receivableAcc.id,
      accountCode: receivableAcc.code,
      accountName: receivableAcc.name,
      debitAmount: 0, creditAmount: totalAmount,
      description: `외상매출금 회수: ${docId} (backfill)`,
      sortOrder: 1,
      partnerId: sale.partner_id ?? null,
    });

    // 3. ar_ledger
    let arLedgerId: number | null = null;
    if (sale.partner_id) {
      const [arResult] = await conn.execute(
        `INSERT INTO ar_ledger
           (tenant_id, customer_partner_id, occurred_at, ar_entry_type,
            amount, ref_type, ref_id, memo, accounting_account_id, created_by)
         VALUES (?, ?, ?, 'payment', ?, 'SALE', ?, ?, ?, ?)`,
        [
          tenantId, sale.partner_id, `${receivedDate} 00:00:00`,
          totalAmount, sale.id, `수금(backfill): ${docId}`,
          receivableAcc.id, userId,
        ],
      );
      arLedgerId = Number((arResult as { insertId: number }).insertId);
    }

    // 4. bank_transactions 는 생성하지 않음 (관심사 분리 원칙, 2026-04-22 수정)
    //    사유: productSaleReceive.ts 의 동일 주석 참조.
    //    통장거래는 실제 은행 CSV 업로드로만 생성. 매칭은 별도 UI 에서.
    const bankTransactionId: number | null = null;

    return { journalEntryId, arLedgerId, bankTransactionId };
  }, `backfillSaleReceived:${sale.id}`);
}

async function processTenant(tenantId: number, opts: Args) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Tenant ${tenantId} — received 매출 수금 분개 backfill`);
  console.log(`  DRY_RUN=${DRY_RUN}, max-days=${opts.maxDays}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const targets = await findTargets(tenantId, opts.maxDays);
  console.log(`\n대상: ${targets.length}건 (status='received' AND [수금] 분개 없음)`);

  if (targets.length === 0) {
    console.log(`→ skip (처리 대상 없음)`);
    return { total: 0, success: 0, skipped: 0, failed: 0 };
  }

  const bankAccountId = await resolveBankAccount(tenantId, opts);
  const userId = await resolveUserId(tenantId, opts.userId);
  console.log(`기본 은행계좌: ${bankAccountId ?? "없음 (CASH 로 fallback)"}`);
  console.log(`실행 user_id: ${userId}${opts.userId ? "" : " (자동 조회 — 첫 admin)"}`);
  console.log(`총 금액: ${targets.reduce((s, t) => s + Number(t.total_amount), 0).toLocaleString()} 원\n`);

  // 상위 5건 미리보기
  console.log(`  [대상 상위 5]`);
  for (const t of targets.slice(0, 5)) {
    console.log(`    #${t.id} | ${t.transaction_date} | ${t.item_name ?? "N/A"} | ${Number(t.total_amount).toLocaleString()} 원`);
  }
  if (targets.length > 5) console.log(`    ... ${targets.length - 5}건 더`);

  if (DRY_RUN) {
    console.log(`\n[DRY_RUN=true] 실제 실행 안 함.`);
    return { total: targets.length, success: 0, skipped: 0, failed: 0 };
  }

  console.log(`\n[실행]`);
  let success = 0, skipped = 0, failed = 0;
  const errors: Array<{ id: number; error: string }> = [];

  for (const sale of targets) {
    try {
      const r = await backfillOne(sale, tenantId, userId, bankAccountId);
      success++;
      console.log(`  ✅ SALE-${sale.id}: JE ${r.journalEntryId}, AR ${r.arLedgerId ?? "skip"}, Bank ${r.bankTransactionId ?? "skip"}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.startsWith("SKIP_DUPLICATE")) {
        skipped++;
        console.log(`  ⏭  SALE-${sale.id}: 이미 분개 있음 (skip)`);
      } else {
        failed++;
        errors.push({ id: sale.id, error: msg });
        console.log(`  ❌ SALE-${sale.id}: ${msg}`);
      }
    }
  }

  console.log(`\n[요약 — tenant ${tenantId}]`);
  console.log(`  성공: ${success}, skip(중복): ${skipped}, 실패: ${failed}`);
  if (errors.length > 0) {
    console.log(`\n  [실패 상세 상위 10]`);
    errors.slice(0, 10).forEach(e => {
      console.log(`    SALE-${e.id}: ${e.error}`);
    });
  }
  return { total: targets.length, success, skipped, failed };
}

async function run() {
  const opts = parseArgs();
  const conn = await getRawConnection();

  let tenantIds: number[];
  if (opts.all) {
    const [rows] = await conn.execute(
      `SELECT id FROM tenants WHERE status = 'active' ORDER BY id`,
    );
    tenantIds = (rows as Array<{ id: number }>).map(r => r.id);
  } else {
    tenantIds = [opts.tenantId!];
  }

  console.log(`\n처리 예정 tenant: ${tenantIds.join(", ")}`);

  const totals = { total: 0, success: 0, skipped: 0, failed: 0 };
  for (const tid of tenantIds) {
    const r = await processTenant(tid, opts);
    totals.total += r.total;
    totals.success += r.success;
    totals.skipped += r.skipped;
    totals.failed += r.failed;
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  전체 요약`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  대상 총: ${totals.total}건`);
  console.log(`  성공:    ${totals.success}건`);
  console.log(`  skip:    ${totals.skipped}건 (멱등성 중복)`);
  console.log(`  실패:    ${totals.failed}건`);
  console.log(`\n${DRY_RUN ? "🔍 DRY RUN 완료" : "✅ backfill 완료"}`);
  process.exit(totals.failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("❌ 스크립트 실패:", err);
  process.exit(1);
});
