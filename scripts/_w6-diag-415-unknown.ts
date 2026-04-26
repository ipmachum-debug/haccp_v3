import { config } from "dotenv";
import mysql from "mysql2/promise";
config();

const TID = 2;
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  console.log("=== 4/15 KST 알수없음 116건 분포 ===");
  const [byBatch] = await conn.query(`
    SELECT t.source_id AS batch_id, b.batch_code, COUNT(*) AS cnt
    FROM h_inventory_transactions t
    LEFT JOIN h_batches b ON b.id = t.source_id
    WHERE t.transaction_type='usage' AND t.tenant_id=?
      AND DATE(CONVERT_TZ(t.transaction_date,'+00:00','+09:00'))='2026-04-15'
      AND t.lot_id=0
      AND t.source_type IN ('BATCH','batch_completion')
    GROUP BY t.source_id, b.batch_code
    ORDER BY cnt DESC
    LIMIT 20
  `, [TID]);
  console.table(byBatch);

  console.log("\n=== 배치 555의 모든 usage (정상 + 알수없음) ===");
  const [b555] = await conn.query(`
    SELECT t.id AS tx_id, t.lot_id, t.source_line_id,
           t.quantity, t.unit, t.notes,
           bi.id AS bi_id, bi.material_id AS bi_mat, m.material_name,
           bi.actual_quantity, bi.unit AS bi_unit
    FROM h_inventory_transactions t
    LEFT JOIN h_batch_inputs bi ON t.source_type='BATCH' AND t.source_id=bi.batch_id AND t.source_line_id=bi.id
    LEFT JOIN h_materials m ON m.id=bi.material_id
    WHERE t.transaction_type='usage' AND t.tenant_id=?
      AND t.source_id=555 AND t.source_type IN ('BATCH','batch_completion')
    ORDER BY t.lot_id DESC, t.id
  `, [TID]);
  console.table(b555);

  console.log("\n=== 배치 555의 h_batch_inputs ===");
  const [bi555] = await conn.query(`
    SELECT id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted
    FROM h_batch_inputs WHERE batch_id=555 ORDER BY id
  `);
  console.table(bi555);

  console.log("\n=== 알수없음 116건의 source_line_id 매칭 상태 ===");
  const [matchStat] = await conn.query(`
    SELECT 
      CASE WHEN bi.id IS NULL THEN 'orphan(no bi)' ELSE 'bi exists' END AS status,
      COUNT(*) AS cnt
    FROM h_inventory_transactions t
    LEFT JOIN h_batch_inputs bi ON t.source_type='BATCH' AND t.source_id=bi.batch_id AND t.source_line_id=bi.id
    WHERE t.transaction_type='usage' AND t.tenant_id=?
      AND DATE(CONVERT_TZ(t.transaction_date,'+00:00','+09:00'))='2026-04-15'
      AND t.lot_id=0
      AND t.source_type IN ('BATCH','batch_completion')
    GROUP BY status
  `, [TID]);
  console.table(matchStat);

  console.log("\n=== source_line_id가 NULL/0 vs 존재하는 row 분포 ===");
  const [lineIdStat] = await conn.query(`
    SELECT 
      CASE 
        WHEN t.source_line_id IS NULL THEN 'NULL'
        WHEN t.source_line_id=0 THEN '0'
        ELSE 'value'
      END AS line_id_status,
      COUNT(*) AS cnt
    FROM h_inventory_transactions t
    WHERE t.transaction_type='usage' AND t.tenant_id=?
      AND DATE(CONVERT_TZ(t.transaction_date,'+00:00','+09:00'))='2026-04-15'
      AND t.lot_id=0
      AND t.source_type IN ('BATCH','batch_completion')
    GROUP BY line_id_status
  `, [TID]);
  console.table(lineIdStat);

  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });
