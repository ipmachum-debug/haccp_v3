import { config } from "dotenv";
import mysql from "mysql2/promise";
config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  console.log("=== PR-W6 적용 후 검증 ===");
  const [rows]: any = await conn.query(`
    SELECT 
      DATE(CONVERT_TZ(COALESCE(t.transaction_date, t.created_at), '+00:00', '+09:00')) AS txDate,
      COALESCE(m1.material_name, m2.material_name, m3.material_name, im.item_name) AS materialName,
      COUNT(*) AS cnt
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
    LEFT JOIN h_materials m1 ON m1.id = l.material_id
    LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
    LEFT JOIN h_materials m2 ON m2.id = inv.material_id
    LEFT JOIN h_batch_inputs bi 
      ON bi.id = t.source_line_id AND bi.batch_id = t.source_id AND bi.tenant_id = t.tenant_id
      AND t.source_type IN ('BATCH','batch_completion')
    LEFT JOIN h_materials m3 ON m3.id = bi.material_id
    LEFT JOIN item_master im 
      ON im.tenant_id = t.tenant_id AND im.is_active = 1 
      AND t.notes LIKE '원재료 #%자동출고%'
      AND im.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(t.notes, '#', -1), ' ', 1) AS UNSIGNED)
    WHERE t.transaction_type='usage' AND t.tenant_id=2
      AND DATE(CONVERT_TZ(t.transaction_date,'+00:00','+09:00'))='2026-04-15'
      AND (l.id IS NULL OR l.product_id IS NULL)
      AND (t.reference_type IS NULL OR t.reference_type != 'SALE')
    GROUP BY txDate, materialName
    ORDER BY cnt DESC
  `);
  console.log(`총 ${rows.length}개 그룹`);
  console.table(rows);

  console.log("\n=== 4월 전체 BATCH usage NULL 잔존 확인 ===");
  const [stat]: any = await conn.query(`
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(m1.material_name, m2.material_name, m3.material_name, im.item_name) IS NULL THEN 1 ELSE 0 END) AS still_null
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
    LEFT JOIN h_materials m1 ON m1.id = l.material_id
    LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
    LEFT JOIN h_materials m2 ON m2.id = inv.material_id
    LEFT JOIN h_batch_inputs bi 
      ON bi.id = t.source_line_id AND bi.batch_id = t.source_id AND bi.tenant_id = t.tenant_id
      AND t.source_type IN ('BATCH','batch_completion')
    LEFT JOIN h_materials m3 ON m3.id = bi.material_id
    LEFT JOIN item_master im 
      ON im.tenant_id = t.tenant_id AND im.is_active = 1 
      AND t.notes LIKE '원재료 #%자동출고%'
      AND im.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(t.notes, '#', -1), ' ', 1) AS UNSIGNED)
    WHERE t.transaction_type='usage' AND t.tenant_id=2
      AND DATE(CONVERT_TZ(t.transaction_date,'+00:00','+09:00')) BETWEEN '2026-04-01' AND '2026-04-30'
      AND (l.id IS NULL OR l.product_id IS NULL)
      AND (t.reference_type IS NULL OR t.reference_type != 'SALE')
  `);
  console.table(stat);

  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });
