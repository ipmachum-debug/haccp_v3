/**
 * Find which 2 usage rows on 4/22 KST will remain after S1 backfill.
 * These are batches where completed_at AND planned_date are both null,
 * so backfill cannot determine a proper date.
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";

config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // Mirror the S1 backfill condition from the script
  const [rows] = await conn.query(`
    SELECT t.id, t.lot_id, t.quantity, t.unit,
           t.transaction_date,
           DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) AS kst_date,
           t.source_type, t.source_id, t.reference_type, t.reference_id,
           t.notes,
           b.id AS batch_id, b.batch_code, b.completed_at, b.planned_date,
           DATE(COALESCE(CONVERT_TZ(b.completed_at, '+00:00', '+09:00'), b.planned_date)) AS resolved_date
    FROM h_inventory_transactions t
    LEFT JOIN h_batches b ON b.id = COALESCE(t.source_id, t.reference_id) AND b.tenant_id = t.tenant_id
    WHERE t.tenant_id = 2
      AND t.transaction_type = 'usage'
      AND DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) IN ('2026-04-22','2026-04-20','2026-04-26')
      AND (
        b.id IS NULL
        OR (b.completed_at IS NULL AND b.planned_date IS NULL)
        OR DATE(COALESCE(CONVERT_TZ(b.completed_at, '+00:00', '+09:00'), b.planned_date))
           = DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00'))
      )
    ORDER BY t.transaction_date DESC
  `);
  console.log('Rows that will REMAIN on 4/20·4/22·4/26 after S1 backfill:', (rows as any[]).length);
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });
