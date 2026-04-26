import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });
(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows]: any = await conn.query(`
    SELECT t.source_type, t.source_id, t.lot_id, t.source_line_id, t.notes,
           DATE(CONVERT_TZ(COALESCE(t.transaction_date, t.created_at), '+00:00', '+09:00')) AS kst,
           COUNT(*) AS cnt
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
    LEFT JOIN h_materials m1 ON m1.id = l.material_id
    LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
    LEFT JOIN h_materials m2 ON m2.id = inv.material_id
    LEFT JOIN h_batch_inputs bi
      ON bi.id = t.source_line_id AND bi.batch_id = t.source_id
     AND bi.tenant_id = t.tenant_id AND t.source_type IN ('BATCH','batch_completion')
    LEFT JOIN h_materials m3 ON m3.id = bi.material_id
    WHERE t.transaction_type = 'usage' AND t.tenant_id = 2
      AND COALESCE(t.transaction_date, t.created_at) >= '2026-04-01'
      AND COALESCE(t.transaction_date, t.created_at) < '2026-05-01'
      AND (l.id IS NULL OR l.product_id IS NULL)
      AND (t.reference_type IS NULL OR t.reference_type != 'SALE')
      AND COALESCE(m1.material_name, m2.material_name, m3.material_name) IS NULL
    GROUP BY t.source_type, t.source_id, t.lot_id, t.source_line_id, t.notes, kst
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.table(rows);
  await conn.end();
})();
