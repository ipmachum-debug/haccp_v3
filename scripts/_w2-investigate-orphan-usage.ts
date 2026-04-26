/**
 * 4/20, 4/22, 4/26 일자에 잡힌 원재료 소모(usage) 트랜잭션 추적.
 * UI: '재고 미등록' = lot_id NULL 또는 LOT 정보 누락 상태.
 * 사용자 의문: 해당 일자에 배치가 없는데 왜 소모가 발생했나?
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

(async () => {
  const c = await mysql.createConnection(process.env.DATABASE_URL!);

  // 1) 4/20, 4/22, 4/26 의 h_batches 존재 여부
  const [batches] = await c.query<any[]>(`
    SELECT id, batch_code, day_batch_group, status, mode,
           DATE(planned_date) AS planned_d,
           DATE(completed_at) AS completed_d,
           DATE(created_at) AS created_d
    FROM h_batches
    WHERE tenant_id=2
      AND (DATE(planned_date) IN ('2026-04-20','2026-04-22','2026-04-26')
        OR DATE(completed_at) IN ('2026-04-20','2026-04-22','2026-04-26')
        OR DATE(created_at) IN ('2026-04-20','2026-04-22','2026-04-26'))
    ORDER BY id
  `);
  console.log(`[1] 4/20·4/22·4/26 h_batches: ${batches.length}개`);
  console.table(batches);

  // 2) 4/20, 4/22, 4/26 일자의 usage 트랜잭션 수
  const [txDays] = await c.query<any[]>(`
    SELECT DATE(transaction_date) AS d, COUNT(*) AS cnt,
           SUM(CASE WHEN lot_id IS NULL THEN 1 ELSE 0 END) AS no_lot,
           SUM(CASE WHEN source_type='batch' THEN 1 ELSE 0 END) AS from_batch,
           SUM(CASE WHEN source_type='material_issue' THEN 1 ELSE 0 END) AS from_issue,
           GROUP_CONCAT(DISTINCT source_type) AS source_types
    FROM h_inventory_transactions
    WHERE tenant_id=2 AND transaction_type IN ('usage','출고','소모')
      AND DATE(transaction_date) IN ('2026-04-20','2026-04-22','2026-04-26')
    GROUP BY d
    ORDER BY d
  `);
  console.log(`\n[2] 해당일 usage 트랜잭션 요약:`);
  console.table(txDays);

  // 3) source_id 분포 — 어떤 batch/issue 가 트리거?
  const [bySource] = await c.query<any[]>(`
    SELECT DATE(transaction_date) AS d, source_type, source_id,
           COUNT(*) AS lines,
           SUM(quantity) AS sum_qty,
           SUM(CASE WHEN lot_id IS NULL THEN 1 ELSE 0 END) AS no_lot_lines
    FROM h_inventory_transactions
    WHERE tenant_id=2 AND transaction_type IN ('usage','출고','소모')
      AND DATE(transaction_date) IN ('2026-04-20','2026-04-22','2026-04-26')
    GROUP BY d, source_type, source_id
    ORDER BY d, source_type, source_id
  `);
  console.log(`\n[3] source 별 그룹:`);
  console.table(bySource);

  // 4) source_id 중 일부 배치를 직접 조회 — 정말로 그 일자에 배치가 있는지
  const sourceIds = bySource
    .filter((r: any) => r.source_type === 'batch')
    .map((r: any) => r.source_id);
  if (sourceIds.length > 0) {
    const [linked] = await c.query<any[]>(`
      SELECT id, batch_code, day_batch_group, status, mode,
             DATE(planned_date) AS planned_d,
             DATE(completed_at) AS completed_d,
             DATE(created_at) AS created_d
      FROM h_batches
      WHERE tenant_id=2 AND id IN (${sourceIds.join(",")})
      ORDER BY id
    `);
    console.log(`\n[4] usage 트랜잭션이 가리키는 batch_id: ${sourceIds.join(",")}`);
    console.table(linked);
  }

  // 5) "재고 미등록" 으로 보이는 행 (lot_id NULL) 자세히
  const [orphans] = await c.query<any[]>(`
    SELECT id, transaction_date, transaction_type, source_type, source_id,
           material_id, lot_id, quantity, unit, notes
    FROM h_inventory_transactions
    WHERE tenant_id=2 AND transaction_type IN ('usage','출고','소모')
      AND DATE(transaction_date) IN ('2026-04-20','2026-04-22','2026-04-26')
      AND lot_id IS NULL
    ORDER BY id
    LIMIT 30
  `);
  console.log(`\n[5] lot_id NULL (재고 미등록) 트랜잭션 sample (${orphans.length}/30):`);
  console.table(orphans);

  // 6) 재고 미등록 상태로 분류되는 다른 후보 — material_id 만 있고 LOT 매칭 실패한 행
  const [missing] = await c.query<any[]>(`
    SELECT t.id, t.transaction_date, t.material_id, t.lot_id, t.quantity, t.unit,
           t.source_type, t.source_id,
           m.material_name,
           (SELECT COUNT(*) FROM h_inventory_lots l WHERE l.tenant_id=2 AND l.material_id=t.material_id) AS lots_for_material
    FROM h_inventory_transactions t
    LEFT JOIN h_materials m ON m.id = t.material_id AND m.tenant_id = t.tenant_id
    WHERE t.tenant_id=2 AND t.transaction_type IN ('usage','출고','소모')
      AND DATE(t.transaction_date) IN ('2026-04-20','2026-04-22','2026-04-26')
      AND t.lot_id IS NULL
    ORDER BY t.material_id, t.id
    LIMIT 30
  `);
  console.log(`\n[6] LOT NULL + 자재 LOT 보유 여부:`);
  console.table(missing);

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
