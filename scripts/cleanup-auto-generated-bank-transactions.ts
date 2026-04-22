/**
 * 매출 수금 자동 생성된 bank_transactions 정리 스크립트
 *
 * 배경:
 *   2026-04-22 초기 구현에서 markSaleReceived / backfill 이 수금 처리 시
 *   bank_transactions 를 자동 생성하는 오류 설계였음.
 *
 *   관심사 분리 원칙 위반:
 *     - bank_transactions = 실제 은행 CSV/API 데이터만
 *     - 매출 수금 = AR 원장에만 기록
 *     - 매칭은 별도 UI 에서 사용자가 수행
 *
 *   특히 B2C 다건 매출 (하루 1,000건+) 의 경우 통장 입금은 플랫폼별 주/월
 *   정산으로 N:1 매칭이라 1:1 자동 생성은 재앙.
 *
 * 이 스크립트가 삭제하는 것:
 *   matched_ledger_type = 'ar' AND description LIKE '%[수금] SALE-%'
 *
 *   = 매출 수금 자동생성분만 (수동 업로드 통장거래는 건드리지 않음)
 *
 * 사용법:
 *   # 미리보기
 *   DRY_RUN=true npx tsx scripts/cleanup-auto-generated-bank-transactions.ts --tenant 2
 *
 *   # 실제 삭제
 *   npx tsx scripts/cleanup-auto-generated-bank-transactions.ts --tenant 2
 *
 *   # 전체 활성 tenant
 *   npx tsx scripts/cleanup-auto-generated-bank-transactions.ts --all
 *
 * 영향 없는 것:
 *   - ar_ledger payment 엔트리 유지 (수금 자체는 정상 기록)
 *   - expense_journal_entries [수금] 엔트리 유지 (분개 유지)
 *   - accounting_sales.status='received' 유지
 */

import "dotenv/config";
import { getRawConnection } from "../server/db/connection";

const DRY_RUN = process.env.DRY_RUN === "true";

interface Args {
  tenantId?: number;
  all: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let tenantId: number | undefined;
  let all = false;

  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--tenant": tenantId = Number(v); i++; break;
      case "--all": all = true; break;
    }
  }

  if (!all && !tenantId) {
    console.error("사용법: npx tsx scripts/cleanup-auto-generated-bank-transactions.ts --tenant <id> | --all");
    console.error("옵션: DRY_RUN=true");
    process.exit(1);
  }
  return { tenantId, all };
}

async function processTenant(tenantId: number) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Tenant ${tenantId} — 매출 수금 자동생성 bank_transactions 정리`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const conn = await getRawConnection();

  // 대상 조회
  const [rows] = await conn.execute(
    `SELECT id, tx_date, amount, description, matched_ledger_id
       FROM bank_transactions
      WHERE tenant_id = ?
        AND matched_ledger_type = 'ar'
        AND description LIKE '%[수금] SALE-%'
      ORDER BY id ASC`,
    [tenantId],
  );
  const targets = rows as Array<{
    id: number; tx_date: Date; amount: string;
    description: string; matched_ledger_id: number;
  }>;

  console.log(`\n대상: ${targets.length}건`);
  if (targets.length === 0) {
    console.log(`→ skip (삭제 대상 없음)`);
    return 0;
  }

  const totalAmount = targets.reduce((s, t) => s + Number(t.amount), 0);
  console.log(`총 금액: ${totalAmount.toLocaleString()} 원`);

  console.log(`\n  [대상 상위 10]`);
  for (const t of targets.slice(0, 10)) {
    console.log(`    #${t.id} | ${Number(t.amount).toLocaleString()}원 | ${t.description.substring(0, 60)}`);
  }
  if (targets.length > 10) console.log(`    ... ${targets.length - 10}건 더`);

  if (DRY_RUN) {
    console.log(`\n[DRY_RUN=true] 실제 삭제 안 함.`);
    return targets.length;
  }

  // 실제 삭제
  const ids = targets.map(t => t.id);
  const placeholders = ids.map(() => "?").join(",");
  const [result] = await conn.execute(
    `DELETE FROM bank_transactions WHERE id IN (${placeholders})`,
    ids,
  );
  const affected = (result as { affectedRows: number }).affectedRows;
  console.log(`\n✅ 삭제 완료: ${affected}건`);

  return affected;
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

  let total = 0;
  for (const tid of tenantIds) {
    total += await processTenant(tid);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${DRY_RUN ? "🔍 DRY RUN" : "✅ 정리"} 완료: ${total}건`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ 실패:", err);
  process.exit(1);
});
