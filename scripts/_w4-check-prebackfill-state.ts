/**
 * 백필 전(w3_tx_backup_2026_04_26)과 현재 상태에서 4/16 KST SALE 행이
 * 가드를 통과했는지 비교
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // 백업 (백필 전) — 4/16 KST 의 SALE 행이 source_type/reference_type 어떤 상태였는지
  const [bk]: any = await conn.query(`
    SELECT id, source_type, reference_type, transaction_date,
           DATE(CONVERT_TZ(transaction_date, '+00:00', '+09:00')) AS kst_date
    FROM w3_tx_backup_2026_04_26
    WHERE tenant_id = ${TID}
      AND transaction_type = 'usage'
      AND lot_id IN (
        SELECT id FROM h_inventory_lots
        WHERE product_id IS NOT NULL AND product_id > 0
      )
      AND DATE(CONVERT_TZ(transaction_date, '+00:00', '+09:00')) IN ('2026-04-16','2026-04-10')
    ORDER BY id
  `);
  console.log(`=== 백필 전(w3 백업) 4/10·16 KST product LOT usage 행 ===`);
  console.log(`총 ${bk.length} 행`);
  const dist: Record<string, number> = {};
  for (const r of bk) {
    const k = `kst=${typeof r.kst_date === 'object' ? r.kst_date.toISOString().slice(0,10) : r.kst_date}, source_type=${r.source_type ?? "NULL"}, ref_type=${r.reference_type ?? "NULL"}`;
    dist[k] = (dist[k] || 0) + 1;
  }
  console.table(dist);

  // 백필 전 가드 통과 시뮬레이션:
  //   가드: (l.id IS NULL OR l.product_id IS NULL) AND (t.reference_type IS NULL OR t.reference_type != 'SALE')
  //   → product LOT 일 경우: l.product_id IS NULL 이 false 이므로 가드 1차 차단
  //   → 그러나 reference_type 이 NULL 또는 'SALE' 이 아닐 때 어떻게 되는지 확인
  console.log(`\n=== 백필 전 가드 통과 행 (실제 화면에 보였던 SALE 들) ===`);
  const [thru]: any = await conn.query(`
    SELECT bk.id, bk.source_type, bk.reference_type,
           DATE(CONVERT_TZ(bk.transaction_date, '+00:00', '+09:00')) AS kst_date,
           bk.notes,
           l.product_id, l.material_id, l.lot_number
    FROM w3_tx_backup_2026_04_26 bk
    LEFT JOIN h_inventory_lots l ON l.id = bk.lot_id AND bk.lot_id > 0
    WHERE bk.tenant_id = ${TID}
      AND bk.transaction_type = 'usage'
      AND DATE(CONVERT_TZ(bk.transaction_date, '+00:00', '+09:00')) IN ('2026-04-16','2026-04-10')
      AND (l.id IS NULL OR l.product_id IS NULL)              -- 가드 1
      AND (bk.reference_type IS NULL OR bk.reference_type != 'SALE')  -- 가드 2
      AND (bk.notes LIKE '%매출%' OR bk.notes LIKE '%SALE%')
    ORDER BY bk.id
    LIMIT 30
  `);
  console.log(`백필 전 가드를 회피해 화면에 노출됐던 SALE 의심 행: ${thru.length}건`);
  console.table(thru);

  await conn.end();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
