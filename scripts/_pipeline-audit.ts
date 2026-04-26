/**
 * 재고 이동 파이프라인 단절 종합 점검
 *
 * 단절 후보:
 *  D1) 배치 → 재고 트랜잭션 단절 (auto-issue 실패)
 *  D2) 재고 트랜잭션 → LOT 차감 단절 (remaining_quantity 미반영)
 *  D3) 재고 트랜잭션 → material_ledger_daily 단절
 *  D4) transaction_date 부정합 (배치 완료일 ≠ 트랜잭션 일자)
 *  D5) source_type 대소문자 불일치 (BATCH vs batch)
 *  D6) "재고 미등록" UI 라벨의 실제 의미 추적
 *  D7) LOT 단위 혼재로 인한 차감 누락 (W2)
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;

async function show(title: string, rows: any[]) {
  console.log(`\n=== ${title} (${rows.length}행) ===`);
  if (rows.length === 0) { console.log("(empty)"); return; }
  console.table(rows.slice(0, 30));
  if (rows.length > 30) console.log(`... 외 ${rows.length - 30}행 생략`);
}

(async () => {
  const c = await mysql.createConnection(process.env.DATABASE_URL!);

  // ---------- D5: source_type 분포 (대소문자) ----------
  const [d5] = await c.query<any[]>(`
    SELECT source_type, transaction_type, COUNT(*) AS cnt
    FROM h_inventory_transactions
    WHERE tenant_id=${TID}
    GROUP BY source_type, transaction_type
    ORDER BY source_type, transaction_type
  `);
  await show("D5: source_type x transaction_type 분포", d5);

  // ---------- D1: 535-541 자동출고 레코드 검사 (소문자/대문자 모두) ----------
  const [d1] = await c.query<any[]>(`
    SELECT b.id AS batch_id, b.batch_code,
           (SELECT COUNT(*) FROM h_batch_inputs bi
            WHERE bi.tenant_id=${TID} AND bi.batch_id=b.id) AS input_lines,
           (SELECT COUNT(*) FROM h_inventory_transactions t
            WHERE t.tenant_id=${TID} AND t.source_id=b.id
              AND UPPER(t.source_type)='BATCH'
              AND t.transaction_type IN ('usage','출고','소모','USAGE','OUTBOUND')) AS usage_tx,
           (SELECT GROUP_CONCAT(DISTINCT t.transaction_type) FROM h_inventory_transactions t
            WHERE t.tenant_id=${TID} AND t.source_id=b.id
              AND UPPER(t.source_type)='BATCH') AS tx_types_seen
    FROM h_batches b
    WHERE b.tenant_id=${TID} AND b.id BETWEEN 535 AND 541
    ORDER BY b.id
  `);
  await show("D1: 535-541 배치 vs 재고트랜잭션", d1);

  // ---------- D4: transaction_date vs 배치 completed_at 비교 ----------
  const [d4] = await c.query<any[]>(`
    SELECT DATE(t.transaction_date) AS tx_d,
           DATE(b.completed_at) AS batch_d,
           DATEDIFF(t.transaction_date, b.completed_at) AS diff_days,
           COUNT(*) AS cnt
    FROM h_inventory_transactions t
    JOIN h_batches b ON b.id = t.source_id AND b.tenant_id = t.tenant_id
    WHERE t.tenant_id=${TID}
      AND UPPER(t.source_type)='BATCH'
      AND t.transaction_type IN ('usage','출고','소모','USAGE')
      AND b.completed_at IS NOT NULL
    GROUP BY tx_d, batch_d, diff_days
    HAVING diff_days <> 0
    ORDER BY ABS(diff_days) DESC, cnt DESC
    LIMIT 20
  `);
  await show("D4: tx_date != batch.completed_at (불일치 케이스)", d4);

  // ---------- D6: 4/26 KST(=4/25 UTC 15:00~) 의 BATCH source_id → 실제 배치 ----------
  const [d6] = await c.query<any[]>(`
    SELECT t.source_id AS batch_id, b.batch_code,
           DATE(b.completed_at) AS batch_completed,
           DATE(b.created_at) AS batch_created,
           DATE(t.transaction_date) AS tx_date_utc,
           COUNT(*) AS lines,
           SUM(CASE WHEN t.lot_id IS NULL THEN 1 ELSE 0 END) AS lot_null_lines,
           GROUP_CONCAT(DISTINCT t.unit) AS units
    FROM h_inventory_transactions t
    LEFT JOIN h_batches b ON b.id = t.source_id AND b.tenant_id = t.tenant_id
    WHERE t.tenant_id=${TID}
      AND UPPER(t.source_type)='BATCH'
      AND t.transaction_type IN ('usage','출고','소모','USAGE')
      AND DATE(t.transaction_date) IN ('2026-04-19','2026-04-21','2026-04-25')
    GROUP BY t.source_id, b.batch_code, batch_completed, batch_created, tx_date_utc
    ORDER BY tx_date_utc, batch_id
  `);
  await show("D6: 4/20·4/22·4/26 KST(=UTC -1d) BATCH 트랜잭션 → 실제 배치 매핑", d6);

  // ---------- D2: LOT remaining_quantity 일관성 (소비 합 vs LOT remaining) ----------
  // h_inventory_lots 에 remaining_quantity 가 없음 → quantity 와 사용량 합으로 추정
  const [d2] = await c.query<any[]>(`
    SELECT l.id AS lot_id, l.lot_number, l.material_id, l.quantity AS lot_qty, l.unit AS lot_unit,
           COALESCE(SUM(CASE WHEN t.transaction_type IN ('usage','출고','소모','USAGE') THEN t.quantity ELSE 0 END), 0) AS used_qty,
           COALESCE(SUM(CASE WHEN t.transaction_type IN ('receipt','입고','RECEIPT') THEN t.quantity ELSE 0 END), 0) AS receipt_qty,
           GROUP_CONCAT(DISTINCT t.unit) AS tx_units
    FROM h_inventory_lots l
    LEFT JOIN h_inventory_transactions t ON t.lot_id = l.id AND t.tenant_id = l.tenant_id
    WHERE l.tenant_id=${TID}
      AND l.id IN (747,748,749,750,751,752,753,754,755,756,757,758,759)
    GROUP BY l.id, l.lot_number, l.material_id, l.quantity, l.unit
    ORDER BY l.id
  `);
  await show("D2: 13개 '개' LOT — receipt vs usage 단위/수량", d2);

  // ---------- D3: material_ledger_daily 정합성 (4/9 535-541) ----------
  const [d3] = await c.query<any[]>(`
    SELECT date, material_id,
           COALESCE(opening_stock, 0) AS opening,
           COALESCE(receipt_qty, 0) AS rcv,
           COALESCE(usage_qty, 0) AS use_q,
           COALESCE(closing_stock, 0) AS closing,
           (COALESCE(opening_stock,0)+COALESCE(receipt_qty,0)-COALESCE(usage_qty,0)) AS calc_close,
           CASE WHEN ABS(COALESCE(closing_stock,0) - (COALESCE(opening_stock,0)+COALESCE(receipt_qty,0)-COALESCE(usage_qty,0))) > 0.001
                THEN 'MISMATCH' ELSE 'OK' END AS status
    FROM material_ledger_daily
    WHERE tenant_id=${TID} AND date='2026-04-09'
    ORDER BY material_id
    LIMIT 30
  `);
  await show("D3: 4/9 material_ledger_daily 정합성", d3);

  // ---------- 추가: K3 매핑 단절 잔존 ----------
  const [k3] = await c.query<any[]>(`
    SELECT
      SUM(CASE WHEN material_id IS NULL THEN 1 ELSE 0 END) AS null_mat,
      SUM(CASE WHEN material_id IS NOT NULL THEN 1 ELSE 0 END) AS has_mat,
      COUNT(*) AS total
    FROM h_inventory_transactions WHERE tenant_id=${TID}
  `);
  await show("K3 잔존: h_inventory_transactions.material_id NULL", k3);

  await c.end();
})().catch(e => { console.error("[ERR]", e.message); process.exit(1); });
