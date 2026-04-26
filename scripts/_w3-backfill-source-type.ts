/**
 * PR-W3 (데이터 백필 #2): h_inventory_transactions.source_type NULL 복구
 *
 * 진단 결과 (837건 NULL):
 *   transaction_type | reference_type           | 건수 | 원인 / 복구 방안
 *   ─────────────────┼──────────────────────────┼──────┼────────────────────────────────────
 *   outbound         | NULL                     | 414  | "제품출고 B2C (자동임포트)" → 'SALE'
 *   usage            | 'batch'                  | 301  | 레거시 배치 → 'batch_completion'
 *                                                       (reference_id = batch_id 활용)
 *   inbound          | NULL                     |  48  | "LOT 보강 생성" → 'lot_reinforcement'
 *   receipt          | 'batch'                  |  45  | 레거시 배치 receipt → 'batch_completion'
 *   receipt          | 'PURCHASE'               |  14  | 13개 '개' LOT 등 → 'accounting_purchases'
 *   receipt          | 'historical_correction'  |   8  | 'historical_correction' (기존 문자열 그대로 source_type 으로)
 *   usage            | 'fefo_split'             |   7  | FEFO 분할 → 'fefo_split'
 *
 * 추가 보정:
 *   usage 'batch' 301 + receipt 'batch' 45 → source_id 도 NULL 이라 reference_id 를 source_id 로 복사
 *
 * 안전장치: DDL 트랜잭션 분리, 백업, dry-run, 검증
 *
 * 실행:
 *   npx tsx scripts/_w3-backfill-source-type.ts --dry-run
 *   npx tsx scripts/_w3-backfill-source-type.ts --commit
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;
const COMMIT = process.argv.includes("--commit");
const DRY_RUN = !COMMIT;

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  console.log(`\n=== PR-W3: source_type NULL 복구 (${DRY_RUN ? "DRY-RUN" : "COMMIT"}) ===\n`);

  // ---- 1) DDL 백업 (트랜잭션 외부) ----
  console.log(`[Step 1] DDL — 백업 테이블 생성`);
  await conn.query(`DROP TABLE IF EXISTS w3_backfill_source_type_backup_2026_04_26`);
  await conn.query(`
    CREATE TABLE w3_backfill_source_type_backup_2026_04_26 AS
    SELECT * FROM h_inventory_transactions
    WHERE tenant_id = ${TID} AND source_type IS NULL
  `);
  const [[bk]]: any = await conn.query(`SELECT COUNT(*) AS n FROM w3_backfill_source_type_backup_2026_04_26`);
  console.log(`  → 백업: ${bk.n}건\n`);

  // BEFORE 분포
  const [before] = await conn.query<any[]>(`
    SELECT transaction_type, reference_type, COUNT(*) AS cnt
    FROM h_inventory_transactions
    WHERE tenant_id = ${TID} AND source_type IS NULL
    GROUP BY transaction_type, reference_type
    ORDER BY cnt DESC
  `);
  console.log(`[BEFORE] NULL source_type 분포:`);
  console.table(before);

  // ---- 2) BEGIN TRANSACTION ----
  await conn.beginTransaction();
  try {
    let totalUpdated = 0;

    // (a) outbound NULL → 'SALE' (414건)
    const [r1]: any = await conn.execute(`
      UPDATE h_inventory_transactions
      SET source_type = 'SALE'
      WHERE tenant_id = ${TID} AND source_type IS NULL
        AND transaction_type = 'outbound'
    `);
    console.log(`(a) outbound → SALE: ${r1.affectedRows}`);
    totalUpdated += r1.affectedRows;

    // (b) usage reference_type='batch' → 'batch_completion' + source_id 복사
    const [r2a]: any = await conn.execute(`
      UPDATE h_inventory_transactions
      SET source_type = 'batch_completion',
          source_id   = COALESCE(source_id, reference_id)
      WHERE tenant_id = ${TID} AND source_type IS NULL
        AND transaction_type = 'usage' AND reference_type = 'batch'
    `);
    console.log(`(b) usage 'batch' → batch_completion: ${r2a.affectedRows}`);
    totalUpdated += r2a.affectedRows;

    // (c) receipt reference_type='batch' → 'batch_completion' + source_id 복사
    const [r2b]: any = await conn.execute(`
      UPDATE h_inventory_transactions
      SET source_type = 'batch_completion',
          source_id   = COALESCE(source_id, reference_id)
      WHERE tenant_id = ${TID} AND source_type IS NULL
        AND transaction_type = 'receipt' AND reference_type = 'batch'
    `);
    console.log(`(c) receipt 'batch' → batch_completion: ${r2b.affectedRows}`);
    totalUpdated += r2b.affectedRows;

    // (d) inbound NULL → 'lot_reinforcement'
    const [r3]: any = await conn.execute(`
      UPDATE h_inventory_transactions
      SET source_type = 'lot_reinforcement'
      WHERE tenant_id = ${TID} AND source_type IS NULL
        AND transaction_type = 'inbound'
    `);
    console.log(`(d) inbound → lot_reinforcement: ${r3.affectedRows}`);
    totalUpdated += r3.affectedRows;

    // (e) receipt 'PURCHASE' → 'accounting_purchases'
    const [r4]: any = await conn.execute(`
      UPDATE h_inventory_transactions
      SET source_type = 'accounting_purchases'
      WHERE tenant_id = ${TID} AND source_type IS NULL
        AND transaction_type = 'receipt' AND reference_type = 'PURCHASE'
    `);
    console.log(`(e) receipt 'PURCHASE' → accounting_purchases: ${r4.affectedRows}`);
    totalUpdated += r4.affectedRows;

    // (f) receipt 'historical_correction' → 'historical_correction'
    const [r5]: any = await conn.execute(`
      UPDATE h_inventory_transactions
      SET source_type = 'historical_correction'
      WHERE tenant_id = ${TID} AND source_type IS NULL
        AND transaction_type = 'receipt' AND reference_type = 'historical_correction'
    `);
    console.log(`(f) receipt 'historical_correction' → historical_correction: ${r5.affectedRows}`);
    totalUpdated += r5.affectedRows;

    // (g) usage 'fefo_split' → 'fefo_split'
    const [r6]: any = await conn.execute(`
      UPDATE h_inventory_transactions
      SET source_type = 'fefo_split'
      WHERE tenant_id = ${TID} AND source_type IS NULL
        AND transaction_type = 'usage' AND reference_type = 'fefo_split'
    `);
    console.log(`(g) usage 'fefo_split' → fefo_split: ${r6.affectedRows}`);
    totalUpdated += r6.affectedRows;

    console.log(`\n[TOTAL] ${totalUpdated}건 정정 (예상: 837)`);

    // AFTER 검증
    const [after] = await conn.query<any[]>(`
      SELECT transaction_type, reference_type, COUNT(*) AS cnt
      FROM h_inventory_transactions
      WHERE tenant_id = ${TID} AND source_type IS NULL
      GROUP BY transaction_type, reference_type
      ORDER BY cnt DESC
    `);
    console.log(`\n[AFTER] 잔존 NULL source_type:`);
    if (after.length === 0) console.log("  (empty — 목표 달성 ✅)");
    else console.table(after);

    // source_type 전체 분포
    const [dist] = await conn.query<any[]>(`
      SELECT source_type, transaction_type, COUNT(*) AS cnt
      FROM h_inventory_transactions WHERE tenant_id = ${TID}
      GROUP BY source_type, transaction_type
      ORDER BY source_type, transaction_type
    `);
    console.log(`\n[VERIFY] 전체 source_type x transaction_type:`);
    console.table(dist);

    if (DRY_RUN) {
      console.log(`\n[DRY-RUN] ROLLBACK`);
      await conn.rollback();
    } else {
      console.log(`\n[COMMIT] 변경 영구 적용`);
      await conn.commit();
    }
  } catch (e: any) {
    console.error(`[ERROR] ${e.message}`);
    await conn.rollback();
    process.exit(1);
  } finally {
    await conn.end();
  }

  console.log(`\n=== W3 source_type 백필 완료 ===\n`);
})().catch(e => { console.error(e); process.exit(1); });
