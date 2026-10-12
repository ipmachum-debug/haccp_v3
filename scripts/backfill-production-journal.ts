/**
 * 생산완료 분개 백필 — 전기 시작일 이후 완료됐는데 전표가 없는 배치에 전기한다.
 *
 * 배포 시각과 전기 시작일(PRODUCTION_JOURNAL_START_DATE) 사이에 완료된 배치, 또는 훅이
 * 실패한 배치를 잡는 용도. 멱등 (postProductionCompletionJournal 이 'already' 로 건너뜀).
 *
 * 실행:
 *   npx tsx scripts/backfill-production-journal.ts --tenant 2            # DRY RUN (기본)
 *   npx tsx scripts/backfill-production-journal.ts --tenant 2 --apply    # 실제 전기
 *   PRODUCTION_JOURNAL_START_DATE=2026-10-15 npx tsx ... 로 시작일 지정 가능
 */
import { getRawConnection } from "../server/db/connection";
import { postProductionCompletionJournal, productionJournalStartDate, journalMarker } from "../server/lib/production/productionCompletionJournal";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const tIdx = args.indexOf("--tenant");
const TENANT = tIdx >= 0 ? Number(args[tIdx + 1]) : NaN;
const USER_ID = Number(process.env.BACKFILL_USER_ID ?? 1);

async function main() {
  if (!Number.isFinite(TENANT) || TENANT <= 0) throw new Error("--tenant <id> 필수");
  const start = productionJournalStartDate();
  const pool = await getRawConnection();

  const [rows] = await pool.execute<any[]>(
    `SELECT b.id, b.batch_code, DATE(b.completed_at) AS d, b.material_cost,
            (SELECT COALESCE(SUM(total_price), 0) FROM h_batch_inputs bi WHERE bi.batch_id = b.id AND bi.tenant_id = b.tenant_id) AS inputs_total
       FROM h_batches b
      WHERE b.tenant_id = ? AND b.status = 'completed' AND DATE(b.completed_at) >= ?
        AND NOT EXISTS (SELECT 1 FROM expense_journal_entries e WHERE e.tenant_id = b.tenant_id AND e.description LIKE ?)
      ORDER BY b.completed_at ASC`,
    [TENANT, start, `${journalMarker(0).replace("BATCH-0", "BATCH-")}%`],
  );
  const targets = rows as any[];
  console.log(`tenant=${TENANT} start=${start} 대상 ${targets.length}건 (${APPLY ? "APPLY" : "DRY RUN"})`);
  for (const r of targets.slice(0, 20)) {
    console.log(`  batch#${r.id} ${r.batch_code} ${r.d} material_cost=${r.material_cost} inputs=${Number(r.inputs_total).toFixed(2)}`);
  }
  if (targets.length > 20) console.log(`  ... 외 ${targets.length - 20}건`);
  if (!APPLY) return;

  const counts: Record<string, number> = {};
  for (const r of targets) {
    const res = await postProductionCompletionJournal({ batchId: Number(r.id), tenantId: TENANT, userId: USER_ID });
    const key = res.posted ? "posted" : res.reason;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  console.log("결과:", counts);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
