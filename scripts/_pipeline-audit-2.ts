import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });
const TID = 2;

async function show(t: string, rows: any[]) {
  console.log(`\n=== ${t} (${rows.length}행) ===`);
  if (rows.length === 0) { console.log("(empty)"); return; }
  console.table(rows.slice(0, 30));
  if (rows.length > 30) console.log(`... +${rows.length - 30}`);
}

(async () => {
  const c = await mysql.createConnection(process.env.DATABASE_URL!);

  // D6 재시도 (lines → \`lines\`)
  const [d6] = await c.query<any[]>(`
    SELECT t.source_id AS batch_id, t.source_type, b.batch_code,
           DATE(b.completed_at) AS batch_completed,
           DATE(b.created_at) AS batch_created,
           DATE(t.transaction_date) AS tx_date_utc,
           COUNT(*) AS \`lines\`,
           SUM(CASE WHEN t.lot_id IS NULL THEN 1 ELSE 0 END) AS lot_null,
           GROUP_CONCAT(DISTINCT t.unit) AS units
    FROM h_inventory_transactions t
    LEFT JOIN h_batches b ON b.id = t.source_id AND b.tenant_id = t.tenant_id
    WHERE t.tenant_id=${TID}
      AND UPPER(t.source_type) IN ('BATCH','BATCH_COMPLETION')
      AND t.transaction_type='usage'
      AND DATE(t.transaction_date) IN ('2026-04-19','2026-04-21','2026-04-25')
    GROUP BY t.source_id, t.source_type, b.batch_code, batch_completed, batch_created, tx_date_utc
    ORDER BY tx_date_utc, batch_id
  `);
  await show("D6: 4/20·4/22·4/26 KST에 잡힌 BATCH usage → 실제 배치 매핑", d6);

  // D2 재시도
  const [d2] = await c.query<any[]>(`
    SELECT l.id AS lot_id, l.lot_number, l.material_id, l.quantity AS lot_qty, l.unit AS lot_unit,
           COALESCE(SUM(CASE WHEN t.transaction_type='usage' THEN t.quantity ELSE 0 END), 0) AS used_qty,
           COALESCE(SUM(CASE WHEN t.transaction_type='receipt' THEN t.quantity ELSE 0 END), 0) AS receipt_qty,
           GROUP_CONCAT(DISTINCT t.unit) AS tx_units,
           GROUP_CONCAT(DISTINCT t.source_type) AS src_types
    FROM h_inventory_lots l
    LEFT JOIN h_inventory_transactions t ON t.lot_id = l.id AND t.tenant_id = l.tenant_id
    WHERE l.tenant_id=${TID} AND l.id IN (747,748,749,750,751,752,753,754,755,756,757,758,759)
    GROUP BY l.id, l.lot_number, l.material_id, l.quantity, l.unit
    ORDER BY l.id
  `);
  await show("D2: 13개 '개' LOT — receipt vs usage", d2);

  // K3 NULL 잔존
  const [k3] = await c.query<any[]>(`
    SELECT
      SUM(CASE WHEN material_id IS NULL THEN 1 ELSE 0 END) AS null_mat,
      SUM(CASE WHEN material_id IS NOT NULL THEN 1 ELSE 0 END) AS has_mat,
      COUNT(*) AS total
    FROM h_inventory_transactions WHERE tenant_id=${TID}
  `);
  await show("K3: material_id NULL 잔존", k3);

  // material_ledger_daily 4/9 정합성
  const [d3] = await c.query<any[]>(`SHOW COLUMNS FROM material_ledger_daily`);
  console.log("\n=== material_ledger_daily 컬럼 ===");
  console.table(d3.map((r: any) => ({ col: r.Field, type: r.Type })));

  // 4/9 ledger row 수
  const [d3b] = await c.query<any[]>(`
    SELECT COUNT(*) AS rows_count
    FROM material_ledger_daily WHERE tenant_id=${TID} AND \`date\`='2026-04-09'
  `);
  await show("D3: 4/9 material_ledger_daily 행수", d3b);

  // source_type=null 인 usage 308건이 어디서 왔는지
  const [d5b] = await c.query<any[]>(`
    SELECT DATE(transaction_date) AS d, transaction_type, COUNT(*) AS cnt,
           SUM(CASE WHEN source_id IS NULL THEN 1 ELSE 0 END) AS no_src,
           MIN(id) AS min_id, MAX(id) AS max_id
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL
    GROUP BY d, transaction_type
    ORDER BY d DESC
    LIMIT 30
  `);
  await show("D5b: source_type NULL 트랜잭션 분포", d5b);

  // 535-541 트랜잭션 상세 (어떤 source_type 인지)
  const [d1b] = await c.query<any[]>(`
    SELECT source_id AS batch_id, source_type, transaction_type,
           DATE(transaction_date) AS tx_d,
           COUNT(*) AS cnt,
           SUM(CASE WHEN lot_id IS NULL THEN 1 ELSE 0 END) AS no_lot
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_id BETWEEN 535 AND 541
    GROUP BY source_id, source_type, transaction_type, tx_d
    ORDER BY source_id, tx_d
  `);
  await show("D1b: 535-541 트랜잭션 상세 (source_type 별)", d1b);

  await c.end();
})().catch(e => { console.error("[ERR]", e.message); process.exit(1); });
