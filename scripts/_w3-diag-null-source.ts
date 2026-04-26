/**
 * W3 진단: source_type=NULL 308 (usage) + 414 (outbound) + 67 (receipt) 추적
 *
 * 가설:
 *  (a) 레거시 데이터 — 초기 마이그레이션 시 source_type 누락
 *  (b) 수동 입력 — UI 에서 직접 등록 (ad-hoc)
 *  (c) 코드 INSERT 중 source_type 누락
 */
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

  // 컬럼 확인 — reference_type/action_type 존재?
  const [cols] = await c.query<any[]>(`SHOW COLUMNS FROM h_inventory_transactions`);
  console.log("=== h_inventory_transactions 컬럼 ===");
  console.log(cols.map((r: any) => r.Field).join(", "));

  // 1) source_type=NULL 의 transaction_type x 시간대
  const [d1] = await c.query<any[]>(`
    SELECT transaction_type,
           COUNT(*) AS cnt,
           MIN(DATE(transaction_date)) AS oldest,
           MAX(DATE(transaction_date)) AS newest,
           MIN(id) AS min_id, MAX(id) AS max_id,
           SUM(CASE WHEN lot_id IS NULL THEN 1 ELSE 0 END) AS lot_null,
           SUM(CASE WHEN material_id IS NULL THEN 1 ELSE 0 END) AS mat_null,
           SUM(CASE WHEN source_id IS NULL THEN 1 ELSE 0 END) AS src_id_null
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL
    GROUP BY transaction_type
    ORDER BY cnt DESC
  `);
  await show("D1: source_type NULL — transaction_type 별", d1);

  // 2) created_at 분포 (마이그레이션 시점 추정)
  const colNames = cols.map((r: any) => r.Field);
  if (colNames.includes("created_at")) {
    const [d2] = await c.query<any[]>(`
      SELECT DATE(created_at) AS created_d, transaction_type,
             COUNT(*) AS cnt
      FROM h_inventory_transactions
      WHERE tenant_id=${TID} AND source_type IS NULL
      GROUP BY created_d, transaction_type
      ORDER BY created_d, transaction_type
      LIMIT 50
    `);
    await show("D2: source_type NULL — created_at 일자별", d2, 50);
  }

  // 3) reference_type / action_type 같은 보조 컬럼 분포 (있으면)
  const auxCols: string[] = [];
  for (const cand of ["reference_type", "action_type", "type", "ref_type", "category", "notes"]) {
    if (colNames.includes(cand)) auxCols.push(cand);
  }
  console.log(`\n[보조 컬럼] 발견: ${auxCols.join(", ") || "(없음)"}`);
  if (auxCols.length > 0) {
    const colExpr = auxCols.map(c => `\`${c}\``).join(", ");
    const [d3] = await c.query<any[]>(`
      SELECT ${colExpr}, transaction_type, COUNT(*) AS cnt
      FROM h_inventory_transactions
      WHERE tenant_id=${TID} AND source_type IS NULL
      GROUP BY ${colExpr}, transaction_type
      ORDER BY cnt DESC
      LIMIT 50
    `);
    await show("D3: source_type NULL — 보조 컬럼별", d3, 50);
  }

  // 4) sample 30건 (실제 행)
  const sampleCols = ["id", "transaction_date", "transaction_type", "material_id", "lot_id", "quantity", "unit"];
  for (const c2 of ["source_id", "source_type"].concat(auxCols)) {
    if (colNames.includes(c2)) sampleCols.push(c2);
  }
  if (colNames.includes("notes")) sampleCols.push("notes");
  const [sample] = await c.query<any[]>(`
    SELECT ${sampleCols.join(", ")}
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL
      AND transaction_type IN ('usage','outbound')
    ORDER BY id DESC
    LIMIT 30
  `);
  await show("D4: 최신 NULL source 샘플 30건 (usage + outbound)", sample);

  // 5) outbound 414 의 패턴 — material_id 별
  const [d5] = await c.query<any[]>(`
    SELECT material_id,
           COUNT(*) AS cnt,
           SUM(quantity) AS total_qty,
           MIN(DATE(transaction_date)) AS oldest,
           MAX(DATE(transaction_date)) AS newest
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL AND transaction_type='outbound'
    GROUP BY material_id
    ORDER BY cnt DESC
    LIMIT 30
  `);
  await show("D5: outbound NULL — material_id 별 TOP30", d5);

  // 6) usage 308 의 패턴
  const [d6] = await c.query<any[]>(`
    SELECT material_id,
           COUNT(*) AS cnt,
           SUM(quantity) AS total_qty,
           MIN(DATE(transaction_date)) AS oldest,
           MAX(DATE(transaction_date)) AS newest
    FROM h_inventory_transactions
    WHERE tenant_id=${TID} AND source_type IS NULL AND transaction_type='usage'
    GROUP BY material_id
    ORDER BY cnt DESC
    LIMIT 30
  `);
  await show("D6: usage NULL — material_id 별 TOP30", d6);

  await c.end();
})().catch(e => { console.error("[ERR]", e.message); process.exit(1); });
