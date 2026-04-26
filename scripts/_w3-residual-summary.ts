/**
 * PR-W3: 4/20, 4/22, 4/26 KST 잔존 트랜잭션 점검
 * Dry-run 결과 발견된 잔존 2건의 정체를 정확히 분류한다.
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // 1) 4/20, 4/22, 4/26 KST 트랜잭션 분포
  const [byDate]: any = await conn.query(`
    SELECT
      DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) AS kst_date,
      t.transaction_type,
      t.source_type,
      COUNT(*) AS cnt
    FROM h_inventory_transactions t
    WHERE t.tenant_id = ${TID}
      AND DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) IN ('2026-04-20','2026-04-22','2026-04-26')
    GROUP BY 1,2,3
    ORDER BY 1, 2, 3
  `);
  console.log("=== 4/20, 4/22, 4/26 KST 트랜잭션 분포 ===");
  console.table(byDate);

  // 2) BATCH/batch_completion 중 batch와 매칭 안 되는 고아 행
  const [orphans]: any = await conn.query(`
    SELECT t.id, t.lot_id, t.quantity, t.unit, t.source_type, t.source_id,
           t.reference_type, t.reference_id, t.notes,
           DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) AS kst_date
    FROM h_inventory_transactions t
    LEFT JOIN h_batches b
      ON b.id = COALESCE(t.source_id, t.reference_id)
     AND b.tenant_id = t.tenant_id
    WHERE t.tenant_id = ${TID}
      AND DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) IN ('2026-04-20','2026-04-22','2026-04-26')
      AND t.source_type IN ('BATCH','batch_completion')
      AND b.id IS NULL
    LIMIT 30
  `);
  console.log("\n=== batch 매칭 실패한 BATCH/batch_completion 잔존 행 ===");
  console.table(orphans);

  // 3) 4/22, 4/26 KST 행을 batch 정상 매칭 기준으로 보면 어떻게 되는가?
  const [matched]: any = await conn.query(`
    SELECT t.id, t.lot_id, t.quantity, t.unit, t.source_type, t.source_id,
           DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) AS tx_kst,
           b.id AS bid, b.batch_code,
           COALESCE(DATE(b.completed_at), b.planned_date) AS expected_kst
    FROM h_inventory_transactions t
    JOIN h_batches b
      ON b.id = COALESCE(t.source_id, t.reference_id)
     AND b.tenant_id = t.tenant_id
    WHERE t.tenant_id = ${TID}
      AND DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) IN ('2026-04-20','2026-04-22','2026-04-26')
      AND t.source_type IN ('BATCH','batch_completion')
    ORDER BY t.id
    LIMIT 30
  `);
  console.log("\n=== batch 매칭은 되지만 4/20·22·26 KST에 남은 행 (S1 백필 대상) ===");
  console.table(matched);

  await conn.end();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
