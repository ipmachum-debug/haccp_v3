/**
 * UI 의 getConsumptionSummary 쿼리를 그대로 재현하여
 * 4월에 SALE 행이 통과되는지 확인
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  const startDate = "2026-04-01";
  const endDate = "2026-05-01";

  // outboundManagement.ts 의 첫번째 SELECT 그대로 재현 + source_type/lot 디버그 컬럼 추가
  const [rows]: any = await conn.query(`
    SELECT
      DATE(CONVERT_TZ(COALESCE(t.transaction_date, t.created_at), '+00:00', '+09:00')) AS txDate,
      COALESCE(m1.material_name, m2.material_name) AS materialName,
      COALESCE(m1.id, m2.id) AS materialId,
      ABS(t.quantity) AS quantity,
      t.unit,
      t.source_type AS sourceType,
      t.reference_type AS refType,
      t.notes,
      l.id AS lotId,
      l.product_id AS lotProductId,
      l.material_id AS lotMaterialId,
      l.lot_number AS lotNumber
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
    LEFT JOIN h_materials m1 ON m1.id = l.material_id
    LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
    LEFT JOIN h_materials m2 ON m2.id = inv.material_id
    WHERE t.transaction_type = 'usage'
      AND t.tenant_id = ${TID}
      AND COALESCE(t.transaction_date, t.created_at) >= '${startDate}'
      AND COALESCE(t.transaction_date, t.created_at) < '${endDate}'
      AND (l.id IS NULL OR l.product_id IS NULL)
      AND (t.reference_type IS NULL OR t.reference_type != 'SALE')
    ORDER BY txDate DESC, t.id ASC
  `);
  console.log(`총 ${rows.length} 행 통과 (4월)`);
  // source_type 별 분포
  const dist: Record<string, number> = {};
  for (const r of rows) {
    const k = `${r.sourceType ?? "NULL"} / lotProductId=${r.lotProductId ?? "NULL"} / lotMaterialId=${r.lotMaterialId ?? "NULL"} / refType=${r.refType ?? "NULL"}`;
    dist[k] = (dist[k] || 0) + 1;
  }
  console.log("\n=== 통과 행 분류 ===");
  console.table(dist);

  // SALE 통과 샘플
  const saleRows = rows.filter((r: any) => r.sourceType === "SALE" || r.notes?.includes("매출"));
  console.log(`\n=== SALE 통과 샘플 ${saleRows.length}건 (가드 회피) ===`);
  console.table(saleRows.slice(0, 10));

  await conn.end();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
