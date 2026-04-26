import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });
const TID = 2;
async function show(t: string, rows: any[], n = 30) {
  console.log(`\n=== ${t} (${rows.length}행) ===`);
  if (rows.length === 0) { console.log("(empty)"); return; }
  console.table(rows.slice(0, n));
  if (rows.length > n) console.log(`... +${rows.length - n}`);
}

(async () => {
  const c = await mysql.createConnection(process.env.DATABASE_URL!);

  // 1) NULL source_type 의 transaction_type 별 + 보조 컬럼
  const [d1] = await c.query<any[]>(`
    SELECT transaction_type, action_type, reference_type,
           COUNT(*) AS cnt,
           MIN(DATE(transaction_date)) AS oldest,
           MAX(DATE(transaction_date)) AS newest,
           MIN(DATE(created_at)) AS created_oldest,
           MAX(DATE(created_at)) AS created_newest,
           SUM(CASE WHEN lot_id IS NULL THEN 1 ELSE 0 END) AS lot_null,
           SUM(CASE WHEN inventory_id IS NULL THEN 1 ELSE 0 END) AS inv_null,
           SUM(CASE WHEN source_id IS NULL THEN 1 ELSE 0 END) AS src_id_null,
           SUM(CASE WHEN reference_id IS NULL THEN 1 ELSE 0 END) AS ref_id_null
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL
    GROUP BY transaction_type, action_type, reference_type
    ORDER BY cnt DESC
  `);
  await show("D1: NULL source_type — transaction_type x action_type x reference_type", d1);

  // 2) created_at 분포 (마이그/대량 INSERT 시점)
  const [d2] = await c.query<any[]>(`
    SELECT DATE(created_at) AS created_d, transaction_type, COUNT(*) AS cnt,
           MIN(id) AS min_id, MAX(id) AS max_id
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL
    GROUP BY created_d, transaction_type
    ORDER BY created_d, transaction_type
  `);
  await show("D2: NULL source_type — created_at 분포", d2, 60);

  // 3) 샘플 행 (전 컬럼)
  const [s1] = await c.query<any[]>(`
    SELECT id, transaction_date, transaction_type, action_type, reference_type, reference_id,
           inventory_id, lot_id, quantity, unit, source_id, source_line_id, purpose,
           DATE(created_at) AS cre_d, performed_by, created_by,
           SUBSTR(notes, 1, 60) AS notes_brief
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL AND transaction_type='usage'
    ORDER BY id DESC LIMIT 20
  `);
  await show("D3: 샘플 — usage", s1);

  const [s2] = await c.query<any[]>(`
    SELECT id, transaction_date, transaction_type, action_type, reference_type, reference_id,
           inventory_id, lot_id, quantity, unit, source_id, source_line_id, purpose,
           DATE(created_at) AS cre_d, performed_by, created_by,
           SUBSTR(notes, 1, 60) AS notes_brief
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL AND transaction_type='outbound'
    ORDER BY id DESC LIMIT 20
  `);
  await show("D4: 샘플 — outbound", s2);

  const [s3] = await c.query<any[]>(`
    SELECT id, transaction_date, transaction_type, action_type, reference_type, reference_id,
           inventory_id, lot_id, quantity, unit, source_id, source_line_id, purpose,
           DATE(created_at) AS cre_d, performed_by, created_by,
           SUBSTR(notes, 1, 60) AS notes_brief
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL AND transaction_type='inbound'
    ORDER BY id DESC LIMIT 10
  `);
  await show("D5: 샘플 — inbound", s3);

  const [s4] = await c.query<any[]>(`
    SELECT id, transaction_date, transaction_type, action_type, reference_type, reference_id,
           inventory_id, lot_id, quantity, unit, source_id, source_line_id, purpose,
           DATE(created_at) AS cre_d, performed_by, created_by,
           SUBSTR(notes, 1, 60) AS notes_brief
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL AND transaction_type='receipt'
    ORDER BY id DESC LIMIT 10
  `);
  await show("D6: 샘플 — receipt", s4);

  // 7) "재고 미등록" 의미 추적 — inventory_id IS NULL or LOT 매핑 끊긴 트랜잭션
  const [s7] = await c.query<any[]>(`
    SELECT
      SUM(CASE WHEN inventory_id IS NULL THEN 1 ELSE 0 END) AS inv_null,
      SUM(CASE WHEN lot_id IS NULL THEN 1 ELSE 0 END) AS lot_null,
      SUM(CASE WHEN inventory_id IS NULL AND lot_id IS NULL THEN 1 ELSE 0 END) AS both_null,
      COUNT(*) AS total
    FROM h_inventory_transactions
    WHERE tenant_id=${TID}
  `);
  await show("D7: 전체에서 inventory_id/lot_id NULL", s7);

  await c.end();
})().catch(e => { console.error("[ERR]", e.message); process.exit(1); });
