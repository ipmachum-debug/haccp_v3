/**
 * 진단: 원재료-소모 탭에 매출(SALE)이 섞여 나옴
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // 1) 4/10, 4/16 KST usage 분포
  const [byDay]: any = await conn.query(`
    SELECT
      DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) AS kst_date,
      t.source_type,
      COUNT(*) AS cnt
    FROM h_inventory_transactions t
    WHERE t.tenant_id = ${TID}
      AND t.transaction_type = 'usage'
      AND DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) IN ('2026-04-10','2026-04-16')
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);
  console.log("=== 4/10, 4/16 KST usage 분포 ===");
  console.table(byDay);

  // 2) 4/16 KST SALE usage 가 가리키는 LOT (product LOT 인지 material LOT 인지)
  const [saleSample]: any = await conn.query(`
    SELECT t.id, t.lot_id, t.quantity, t.unit, t.source_type, t.source_id,
           t.notes,
           il.lot_number, il.material_id, il.product_id, il.sku_name,
           CASE
             WHEN il.product_id IS NOT NULL AND il.product_id > 0 THEN 'PRODUCT'
             WHEN il.material_id IS NOT NULL AND il.material_id > 0 THEN 'MATERIAL'
             ELSE 'NONE'
           END AS lot_kind,
           mm.material_name, mm.category
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots il ON il.id = t.lot_id
    LEFT JOIN h_material_master mm ON mm.id = il.material_id
    WHERE t.tenant_id = ${TID}
      AND t.transaction_type = 'usage'
      AND t.source_type = 'SALE'
      AND DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) = '2026-04-16'
    ORDER BY t.id
    LIMIT 20
  `);
  console.log("\n=== 4/16 KST SALE usage 행이 가리키는 LOT 종류 ===");
  console.table(saleSample);

  // 3) SALE/SALE_LEGACY 가 어떤 LOT 종류를 가리키는지 전체 분포
  const [byKind]: any = await conn.query(`
    SELECT
      t.source_type,
      CASE
        WHEN il.product_id IS NOT NULL AND il.product_id > 0 THEN 'PRODUCT'
        WHEN il.material_id IS NOT NULL AND il.material_id > 0 THEN 'MATERIAL'
        ELSE 'NONE/UNKNOWN'
      END AS lot_kind,
      COUNT(*) AS cnt
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots il ON il.id = t.lot_id
    WHERE t.tenant_id = ${TID}
      AND t.transaction_type = 'usage'
      AND t.source_type IN ('SALE','SALE_LEGACY')
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);
  console.log("\n=== SALE/SALE_LEGACY usage → LOT 종류 분포 ===");
  console.table(byKind);

  // 4) 화면 제보: SALE 16건이 4/10 에 있다 함 — 그 16건 모두 PRODUCT LOT 인지?
  const [sale410]: any = await conn.query(`
    SELECT t.id, t.lot_id, t.quantity, t.source_type, t.source_id,
           il.material_id, il.product_id, il.sku_name,
           mm.material_name
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots il ON il.id = t.lot_id
    LEFT JOIN h_material_master mm ON mm.id = il.material_id
    WHERE t.tenant_id = ${TID}
      AND t.transaction_type = 'usage'
      AND t.source_type IN ('SALE','SALE_LEGACY')
      AND DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) = '2026-04-10'
    ORDER BY t.id
  `);
  console.log("\n=== 4/10 KST SALE usage 전수 ===");
  console.table(sale410);

  await conn.end();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
