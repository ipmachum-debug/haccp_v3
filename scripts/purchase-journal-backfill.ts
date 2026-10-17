/**
 * 확정됐는데 분개가 없는 매입 — 분개만 보충 (2026-10-17, 입고 정본화 PR-0 / CEO 결정 "분개만 보충 경로 분리")
 *
 * 왜: PR-0 부터 확정(postPurchase) 은 대기(pending) 매입만 받는다 (승인·지급 매입 재확정 = 재고 이중 입고, 운영 10건).
 *     그래서 '승인인데 분개 없음' 매입(10/16 사본 70건)은 재확정이 아니라 이 도구로 **분개만** 만든다.
 * 하는 일: backfillPurchaseJournal — 차변 원재료(상품)+부가세대급금 / 대변 외상매입금, 거래일자 기준.
 *   재고·LOT·원장·입고전표·수불부·매입 상태는 건드리지 않는다. 같은 매입은 한 번만 (분개 존재 확인 + 행 잠금).
 *
 * 실행 (Codex, 서버 — CEO 승인 후):
 *   npx tsx scripts/purchase-journal-backfill.ts --tenant=2                        # 미리보기 (쓰기 없음)
 *   npx tsx scripts/purchase-journal-backfill.ts --tenant=2 --only=301 --apply     # 1건 시험 적용
 *   npx tsx scripts/purchase-journal-backfill.ts --tenant=2 --only=301,302 --apply # 승인된 목록만
 *   --apply 는 --only 가 있어야 한다 (전체 일괄 적용 금지). BACKFILL_USER_ID=4 → posted_by.
 */
import { getRawConnection } from "../server/db/connection";
import { backfillPurchaseJournal } from "../server/lib/accounting/purchasePost";
import { parseOnlyIds } from "./_lib/onlyIds";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const APPLY = process.argv.includes("--apply");
const TENANT = Number(arg("tenant"));
const USER_ID = Number(process.env.BACKFILL_USER_ID ?? 4);

async function main() {
  let only: number[] | null;
  try {
    only = parseOnlyIds(process.argv);
  } catch (e: any) {
    console.error(`❌ ${e.message}`);
    process.exit(2);
  }
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  if (APPLY && !only) throw new Error("--apply 는 --only=<매입 id,…> 와 함께만 (전체 일괄 적용 금지)");

  const pool = await getRawConnection();
  const [rows]: any = await pool.execute(
    `SELECT p.id FROM accounting_purchases p
      WHERE p.tenant_id = ? AND p.status IN ('approved', 'paid')
        AND NOT EXISTS (SELECT 1 FROM expense_journal_entries j
                         WHERE j.tenant_id = p.tenant_id AND j.voucher_id = p.id
                           AND (j.description = CONCAT('[매입] PURCHASE-', p.id) OR j.description LIKE CONCAT('[매입] PURCHASE-', p.id, ' %')))
      ORDER BY p.transaction_date, p.id`,
    [TENANT],
  );
  let ids = (rows as any[]).map((r) => Number(r.id));
  if (only) {
    const missing = only.filter((id) => !ids.includes(id));
    if (missing.length) console.warn(`⚠️ 대상(확정·분개 없음)이 아닌 id: ${missing.join(",")} — 건너뜀`);
    ids = ids.filter((id) => only!.includes(id));
  }
  console.log(`${APPLY ? "적용" : "미리보기"}: 매입 ${ids.length}건 (tenant ${TENANT})`);
  let total = 0;
  for (const id of ids) {
    const r = await backfillPurchaseJournal(id, TENANT, USER_ID, { apply: APPLY });
    if (r.status === "skip") {
      console.log(`  #${id} 건너뜀 (${r.reason}${r.detail ? `: ${r.detail}` : ""})`);
      continue;
    }
    total += r.amount;
    console.log(`  #${id} ${r.entryDate} ${r.itemName ?? ""} ${r.amount.toLocaleString()}원 재고기록=${r.hasStock ? "있음" : "없음"} → ${r.status}${r.journalEntryId ? ` (분개 #${r.journalEntryId})` : ""}`);
  }
  console.log(`합계 ${total.toLocaleString()}원`);
  await pool.end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});
