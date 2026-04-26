/**
 * Find the 2 residual rows on 4/22 KST (usage) that remain after S1 backfill.
 * These have transaction_date='2026-04-21T15:00:00.000Z' (UTC) and either:
 *   - source_type NOT IN ('BATCH','batch_completion'), or
 *   - source_id has no matching batch.
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // Final state simulation: rows that won't be touched by S1
  const [rows]: any = await conn.query(`
    SELECT t.id, t.lot_id, t.quantity, t.unit, t.transaction_date,
           t.source_type, t.source_id, t.reference_type, t.reference_id, t.notes,
           b.id AS bid, b.batch_code, b.completed_at, b.planned_date
    FROM h_inventory_transactions t
    LEFT JOIN h_batches b
      ON b.id = COALESCE(t.source_id, t.reference_id)
     AND b.tenant_id = t.tenant_id
    WHERE t.tenant_id = ${TID}
      AND t.transaction_type = 'usage'
      AND DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) = '2026-04-22'
      AND (
        t.source_type NOT IN ('BATCH','batch_completion')
        OR b.id IS NULL
        OR (DATE(b.completed_at) IS NULL AND b.planned_date IS NULL)
      )
    ORDER BY t.id
  `);
  console.log(`=== 4/22 KST usage 행 중 S1이 못 잡는 행 (${rows.length}건) ===`);
  console.table(rows);

  await conn.end();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
