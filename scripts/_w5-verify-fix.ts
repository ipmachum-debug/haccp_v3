/**
 * PR-W5 수정된 SQL 패턴 검증
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  const [rows]: any = await conn.query(`
    SELECT
      DATE(CONVERT_TZ(COALESCE(t.transaction_date, t.created_at), '+00:00', '+09:00')) AS txDate,
      COALESCE(m1.material_name, m2.material_name, m3.material_name) AS materialName,
      COALESCE(m1.id, m2.id, m3.id) AS materialId,
      ABS(t.quantity) AS quantity,
      t.unit,
      t.source_id AS batchId,
      t.notes
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
    LEFT JOIN h_materials m1 ON m1.id = l.material_id
    LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
    LEFT JOIN h_materials m2 ON m2.id = inv.material_id
    LEFT JOIN h_batch_inputs bi
      ON bi.id = t.source_line_id
     AND bi.batch_id = t.source_id
     AND bi.tenant_id = t.tenant_id
     AND t.source_type IN ('BATCH','batch_completion')
    LEFT JOIN h_materials m3 ON m3.id = bi.material_id
    WHERE t.transaction_type = 'usage'
      AND t.tenant_id = ${TID}
      AND t.source_id IN (579, 580, 581)
      AND (l.id IS NULL OR l.product_id IS NULL)
      AND (t.reference_type IS NULL OR t.reference_type != 'SALE')
    ORDER BY t.source_id, t.id
  `);
  console.log(`=== PR-W5 수정 후 결과 (${rows.length}건) ===`);
  console.table(rows);

  // null 카운트
  const nullCnt = rows.filter((r: any) => r.materialName === null).length;
  console.log(`\nmaterialName null: ${nullCnt} / ${rows.length}`);

  // 전체 4월 기준 null 비율 확인
  const [aprAll]: any = await conn.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(m1.material_name, m2.material_name, m3.material_name) IS NULL THEN 1 ELSE 0 END) AS still_null
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
    LEFT JOIN h_materials m1 ON m1.id = l.material_id
    LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
    LEFT JOIN h_materials m2 ON m2.id = inv.material_id
    LEFT JOIN h_batch_inputs bi
      ON bi.id = t.source_line_id
     AND bi.batch_id = t.source_id
     AND bi.tenant_id = t.tenant_id
     AND t.source_type IN ('BATCH','batch_completion')
    LEFT JOIN h_materials m3 ON m3.id = bi.material_id
    WHERE t.transaction_type = 'usage'
      AND t.tenant_id = ${TID}
      AND COALESCE(t.transaction_date, t.created_at) >= '2026-04-01'
      AND COALESCE(t.transaction_date, t.created_at) < '2026-05-01'
      AND (l.id IS NULL OR l.product_id IS NULL)
      AND (t.reference_type IS NULL OR t.reference_type != 'SALE')
  `);
  console.log(`\n=== 4월 전체 (BATCH usage, SALE 제외) materialName null 잔존 ===`);
  console.table(aprAll);

  await conn.end();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
