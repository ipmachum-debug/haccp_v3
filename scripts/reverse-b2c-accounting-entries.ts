/**
 * B2C 매출 회계 기록 되돌림 스크립트
 *
 * 배경:
 *   2026-04-22 초기 구현에서 B2C 전자상거래 매출을 일반 매출로 취급해
 *   [수금] 분개 + ar_ledger payment 등을 생성했던 이력이 있음.
 *
 *   PR #51 에서 accounting_excluded 플래그를 도입해 B2C 매출은 회계 연동
 *   제외하도록 바뀌었지만, 기존에 쌓인 잘못된 회계 기록은 수동 정리 필요.
 *
 * 동작:
 *   B2C 거래처 (customer_type='b2c_platform' 또는 --partner-name 으로 지정)
 *   의 매출 중 "received" 상태 건에 대해:
 *
 *   1. accounting_sales.accounting_excluded = 1 UPDATE
 *   2. 관련 expense_journal_entries 삭제 ([매출], [수금], [매출원가])
 *   3. 관련 expense_journal_lines 삭제 (위 엔트리 참조분)
 *   4. 관련 ar_ledger 엔트리 삭제 (ref_type='SALE', ref_id=sale.id)
 *   5. accounting_sales.status 유지 (재고는 차감된 상태 그대로)
 *
 * 유지되는 것:
 *   ✅ accounting_sales 레코드 (1,800건 그대로)
 *   ✅ h_inventory_transactions 차감 이력
 *   ✅ h_inventory_lots 차감 상태
 *   ✅ material_ledger_daily 수불부
 *   (재고·출고 기록은 HACCP 법적 의무라 절대 건드리지 않음)
 *
 * 사용법:
 *   # 미리보기 (tenant 2)
 *   DRY_RUN=true npx tsx scripts/reverse-b2c-accounting-entries.ts \
 *     --tenant 2 --partner-name B2C전자상거래
 *
 *   # 실제 실행
 *   npx tsx scripts/reverse-b2c-accounting-entries.ts \
 *     --tenant 2 --partner-name B2C전자상거래
 *
 * 안전장치:
 *   - DRY_RUN 기본 모드
 *   - 각 sale 단위로 withTransaction (원자성)
 *   - 삭제 전 카운트 확인
 */

import "dotenv/config";
import { getRawConnection, withTransaction } from "../server/db";

const DRY_RUN = process.env.DRY_RUN === "true";

interface Args {
  tenantId: number;
  partnerName?: string;
  partnerId?: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let tenantId: number | undefined;
  let partnerName: string | undefined;
  let partnerId: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--tenant": tenantId = Number(v); i++; break;
      case "--partner-name": partnerName = v; i++; break;
      case "--partner-id": partnerId = Number(v); i++; break;
    }
  }

  if (!tenantId) {
    console.error("사용법: npx tsx scripts/reverse-b2c-accounting-entries.ts --tenant <id> (--partner-name <n> | --partner-id <id>)");
    console.error("옵션: DRY_RUN=true");
    process.exit(1);
  }
  if (!partnerName && !partnerId) {
    console.error("⚠️  --partner-name 또는 --partner-id 필수 (전체 실행 방지)");
    process.exit(1);
  }
  return { tenantId, partnerName, partnerId };
}

async function resolvePartnerId(tenantId: number, opts: Args): Promise<number> {
  if (opts.partnerId) return opts.partnerId;
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT id FROM partners
       WHERE tenant_id = ? AND company_name = ? LIMIT 1`,
    [tenantId, opts.partnerName],
  );
  const row = (rows as Array<{ id: number }>)[0];
  if (!row) {
    throw new Error(`partner "${opts.partnerName}" 를 tenant ${tenantId} 에서 찾을 수 없음`);
  }
  return row.id;
}

async function run() {
  const opts = parseArgs();
  const conn = await getRawConnection();

  const partnerId = await resolvePartnerId(opts.tenantId, opts);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  B2C 매출 회계 기록 되돌림`);
  console.log(`  tenant: ${opts.tenantId}, partner_id: ${partnerId}`);
  console.log(`  DRY_RUN=${DRY_RUN}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // 대상 sale 조회
  const [saleRows] = await conn.execute(
    `SELECT id, status, total_amount, transaction_date, item_name, accounting_excluded
       FROM accounting_sales
      WHERE tenant_id = ? AND partner_id = ? AND status = 'received'
      ORDER BY id ASC`,
    [opts.tenantId, partnerId],
  );
  const sales = saleRows as Array<{
    id: number; status: string; total_amount: string;
    transaction_date: string; item_name: string | null;
    accounting_excluded: number;
  }>;

  console.log(`\nreceived 상태 매출: ${sales.length}건`);

  if (sales.length === 0) {
    console.log(`→ 처리 대상 없음`);
    process.exit(0);
  }

  // 정리 필요한 회계 기록 집계
  const saleIds = sales.map(s => s.id);
  const placeholders = saleIds.map(() => "?").join(",");

  // 분개 엔트리 ([매출], [수금], [매출원가] 모두)
  const [jeRows] = await conn.execute(
    `SELECT id, description FROM expense_journal_entries
      WHERE tenant_id = ?
        AND (
          description REGEXP CONCAT('\\\\[(매출|수금|매출원가)\\\\] SALE-(', ?, ')([^0-9]|$)')
        )`,
    [opts.tenantId, saleIds.join("|")],
  );
  const jeEntries = jeRows as Array<{ id: number; description: string }>;

  // ar_ledger
  const [arRows] = await conn.execute(
    `SELECT id, ref_id, amount FROM ar_ledger
      WHERE tenant_id = ? AND ref_type = 'SALE' AND ref_id IN (${placeholders})`,
    [opts.tenantId, ...saleIds],
  );
  const arEntries = arRows as Array<{ id: number; ref_id: number; amount: string }>;

  console.log(`\n연관 회계 기록:`);
  console.log(`  expense_journal_entries: ${jeEntries.length}건`);
  console.log(`  ar_ledger:               ${arEntries.length}건`);

  const totalRevenue = sales.reduce((s, r) => s + Number(r.total_amount), 0);
  console.log(`  매출 총액:                ${totalRevenue.toLocaleString()}원`);

  // 미리보기 (상위 5건)
  console.log(`\n  [대상 매출 상위 5]`);
  for (const s of sales.slice(0, 5)) {
    console.log(`    #${s.id} | ${s.transaction_date} | ${s.item_name ?? ""} | ${Number(s.total_amount).toLocaleString()}원`);
  }
  if (sales.length > 5) console.log(`    ... ${sales.length - 5}건 더`);

  if (DRY_RUN) {
    console.log(`\n[DRY_RUN=true] 실제 실행 안 함.`);
    process.exit(0);
  }

  // 실제 실행 — 단일 트랜잭션
  console.log(`\n[실행]`);

  const result = await withTransaction(async (txConn) => {
    let deletedJE = 0;
    let deletedLines = 0;
    let deletedAR = 0;
    let updatedSales = 0;

    // 1. expense_journal_lines 먼저 삭제 (FK 없지만 논리 순서)
    if (jeEntries.length > 0) {
      const jePlaceholders = jeEntries.map(() => "?").join(",");
      const jeIds = jeEntries.map(e => e.id);
      const [linesRes] = await txConn.execute(
        `DELETE FROM expense_journal_lines
           WHERE tenant_id = ? AND journal_entry_id IN (${jePlaceholders})`,
        [opts.tenantId, ...jeIds],
      );
      deletedLines = (linesRes as { affectedRows: number }).affectedRows;

      const [jeRes] = await txConn.execute(
        `DELETE FROM expense_journal_entries
           WHERE tenant_id = ? AND id IN (${jePlaceholders})`,
        [opts.tenantId, ...jeIds],
      );
      deletedJE = (jeRes as { affectedRows: number }).affectedRows;
    }

    // 2. ar_ledger 삭제
    if (arEntries.length > 0) {
      const [arRes] = await txConn.execute(
        `DELETE FROM ar_ledger
           WHERE tenant_id = ? AND ref_type = 'SALE' AND ref_id IN (${placeholders})`,
        [opts.tenantId, ...saleIds],
      );
      deletedAR = (arRes as { affectedRows: number }).affectedRows;
    }

    // 3. accounting_sales.accounting_excluded=1 + status 유지
    //    (status='received' 은 그대로 — 재고는 차감 상태, 수금 기록도 "플랫폼 정산" 대상으로 남김)
    const [salesRes] = await txConn.execute(
      `UPDATE accounting_sales
          SET accounting_excluded = 1
        WHERE tenant_id = ? AND partner_id = ? AND status = 'received'`,
      [opts.tenantId, partnerId],
    );
    updatedSales = (salesRes as { affectedRows: number }).affectedRows;

    return { deletedJE, deletedLines, deletedAR, updatedSales };
  }, `reverseB2CAccounting:tenant${opts.tenantId}`);

  console.log(`\n✅ 완료:`);
  console.log(`   분개 엔트리 삭제:  ${result.deletedJE}건`);
  console.log(`   분개 라인 삭제:    ${result.deletedLines}건`);
  console.log(`   ar_ledger 삭제:    ${result.deletedAR}건`);
  console.log(`   매출 플래그 설정:  ${result.updatedSales}건`);
  console.log(`\n※ accounting_sales 레코드·재고·LOT 은 그대로 유지됨 (HACCP 의무)`);

  process.exit(0);
}

run().catch((err) => {
  console.error("❌ 실패:", err);
  process.exit(1);
});
