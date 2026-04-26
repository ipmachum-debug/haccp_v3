/**
 * Check residual usage transactions on 4/20, 4/22, 4/26 KST after dry-run
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";

config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.query(`
    SELECT t.id, t.lot_id, t.quantity, t.unit,
           t.transaction_date,
           DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) AS kst_date,
           t.source_type, t.source_id, t.reference_type, t.reference_id,
           t.notes, t.created_at,
           b.id AS batch_id, b.batch_code, b.completed_at, b.planned_date
    FROM h_inventory_transactions t
    LEFT JOIN h_batches b ON b.id = COALESCE(t.source_id, t.reference_id) AND b.tenant_id = t.tenant_id
    WHERE t.tenant_id = 2
      AND t.transaction_type = 'usage'
      AND DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) IN ('2026-04-22','2026-04-20','2026-04-26')
    ORDER BY t.transaction_date DESC
    LIMIT 50
  `);
  console.log('Residual rows on 4/20, 4/22, 4/26 KST:', (rows as any[]).length);
  console.log(JSON.stringify(rows, null, 2));
  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });
