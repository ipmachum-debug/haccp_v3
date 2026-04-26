import { config } from "dotenv";
import mysql from "mysql2/promise";
config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  console.log("=== notes에서 material_id 파싱 → h_materials 매칭 ===");
  const [rows] = await conn.query(`
    SELECT 
      CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(t.notes, '#', -1), ' ', 1) AS UNSIGNED) AS parsed_id,
      COUNT(*) AS cnt,
      MIN(m.material_name) AS sample_name
    FROM h_inventory_transactions t
    LEFT JOIN h_materials m 
      ON m.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(t.notes, '#', -1), ' ', 1) AS UNSIGNED)
    WHERE t.transaction_type='usage' AND t.tenant_id=2
      AND t.lot_id=0
      AND t.notes LIKE '원재료 #%자동출고%'
    GROUP BY parsed_id
    ORDER BY parsed_id
  `);
  console.table(rows);

  console.log("\n=== 매칭 통계 (h_materials에 존재 여부) ===");
  const [stat] = await conn.query(`
    SELECT 
      CASE WHEN m.id IS NULL THEN 'NOT FOUND in h_materials' ELSE 'OK' END AS status,
      COUNT(*) AS cnt
    FROM h_inventory_transactions t
    LEFT JOIN h_materials m 
      ON m.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(t.notes, '#', -1), ' ', 1) AS UNSIGNED)
    WHERE t.transaction_type='usage' AND t.tenant_id=2
      AND t.lot_id=0
      AND t.notes LIKE '원재료 #%자동출고%'
    GROUP BY status
  `);
  console.table(stat);

  console.log("\n=== 샘플: parsed_id → 실제 material_name ===");
  const [sample] = await conn.query(`
    SELECT t.id, t.notes,
      CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(t.notes, '#', -1), ' ', 1) AS UNSIGNED) AS parsed_id,
      m.material_name
    FROM h_inventory_transactions t
    LEFT JOIN h_materials m 
      ON m.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(t.notes, '#', -1), ' ', 1) AS UNSIGNED)
    WHERE t.transaction_type='usage' AND t.tenant_id=2
      AND t.lot_id=0
      AND t.notes LIKE '원재료 #%자동출고%'
    LIMIT 10
  `);
  console.table(sample);

  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });
