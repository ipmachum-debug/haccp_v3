/**
 * 화면(원재료-소모 탭, 4/17) 의 배치#579~581 행이 어디서 나오는지 정확히 식별
 *
 * 화면 행 텍스트: "배치#579   원재료 #198 자동출고 (재고미등록)"
 * → "원재료 #198" 의 198 은 lot_id 일 가능성 높음
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // 1) getConsumptionSummary 첫 SELECT: 4/17 KST 배치 579~581 의 transactions
  const [tx]: any = await conn.query(`
    SELECT
      t.id, t.lot_id, t.source_id AS batch_id, t.quantity, t.unit, t.notes,
      DATE(CONVERT_TZ(t.transaction_date, '+00:00', '+09:00')) AS kst_date,
      l.id AS l_id, l.material_id AS l_mat, l.product_id AS l_prod,
      m1.material_name AS m_name_via_lot,
      inv.id AS inv_id, inv.material_id AS inv_mat,
      m2.material_name AS m_name_via_inv
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
    LEFT JOIN h_materials m1 ON m1.id = l.material_id
    LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
    LEFT JOIN h_materials m2 ON m2.id = inv.material_id
    WHERE t.tenant_id = ${TID}
      AND t.transaction_type = 'usage'
      AND t.source_id IN (579, 580, 581)
    ORDER BY t.source_id, t.id
  `);
  console.log(`=== 배치 579~581 의 usage transactions (${tx.length}건) ===`);
  console.table(tx);

  // 2) lot_id 의 정체 확인 — 0 또는 미존재 lot 인지?
  const [lotCheck]: any = await conn.query(`
    SELECT t.lot_id,
           CASE WHEN t.lot_id = 0 THEN 'lot_id=0 (재고미등록 표식)'
                WHEN l.id IS NULL THEN 'lot 행 없음'
                ELSE 'lot 정상' END AS lot_status,
           COUNT(*) AS cnt
    FROM h_inventory_transactions t
    LEFT JOIN h_inventory_lots l ON l.id = t.lot_id
    WHERE t.tenant_id = ${TID}
      AND t.transaction_type = 'usage'
      AND t.source_id IN (579, 580, 581)
    GROUP BY 1, 2
  `);
  console.log(`\n=== lot_id 상태 ===`);
  console.table(lotCheck);

  // 3) 화면 두번째 SELECT (h_batch_inputs) 가 4/17 에 통과하는가?
  // 첫번째 SELECT 가 이미 transaction 으로 잡혀 있다면 NOT EXISTS 로 제외돼야 함
  const [biPath]: any = await conn.query(`
    SELECT
      bi.id, bi.batch_id, bi.material_id, bi.planned_quantity, bi.actual_quantity,
      bi.input_time, b.start_time, b.created_at, bi.created_at AS bi_ca,
      m.material_name,
      EXISTS(
        SELECT 1 FROM h_inventory_transactions tx
        WHERE tx.source_type IN ('BATCH','batch_completion')
          AND tx.source_id = bi.batch_id
          AND tx.source_line_id = bi.id
          AND tx.transaction_type = 'usage'
          AND tx.tenant_id = ${TID}
      ) AS already_in_tx
    FROM h_batch_inputs bi
    JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = bi.tenant_id
    LEFT JOIN h_materials m ON m.id = bi.material_id
    WHERE bi.tenant_id = ${TID}
      AND bi.batch_id IN (579, 580, 581)
      AND b.status IN ('in_progress','completed')
      AND bi.inventory_deducted = 1
    ORDER BY bi.batch_id, bi.id
  `);
  console.log(`\n=== 배치 579~581 의 h_batch_inputs (${biPath.length}건, already_in_tx=1 이면 첫 SELECT 가 우선) ===`);
  console.table(biPath);

  // 4) 두 SELECT 의 union 결과를 그대로 만들어 봄 (UI 가 받는 것)
  const [unionRows]: any = await conn.query(`
    (
      SELECT
        DATE(CONVERT_TZ(COALESCE(t.transaction_date, t.created_at), '+00:00', '+09:00')) AS txDate,
        COALESCE(m1.material_name, m2.material_name) AS materialName,
        COALESCE(m1.id, m2.id) AS materialId,
        ABS(t.quantity) AS quantity,
        t.unit,
        t.source_type AS sourceType,
        t.source_id AS sourceId,
        l.lot_number AS lotNumber,
        t.notes,
        'transaction' AS dataSource
      FROM h_inventory_transactions t
      LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND t.lot_id > 0
      LEFT JOIN h_materials m1 ON m1.id = l.material_id
      LEFT JOIN h_inventory inv ON inv.id = t.inventory_id
      LEFT JOIN h_materials m2 ON m2.id = inv.material_id
      WHERE t.transaction_type = 'usage'
        AND t.tenant_id = ${TID}
        AND t.source_id IN (579, 580, 581)
        AND (l.id IS NULL OR l.product_id IS NULL)
        AND (t.reference_type IS NULL OR t.reference_type != 'SALE')
    )
    UNION ALL
    (
      SELECT
        DATE(COALESCE(bi.input_time, b.start_time, b.created_at)) AS txDate,
        m.material_name AS materialName,
        bi.material_id AS materialId,
        ROUND(COALESCE(bi.actual_quantity, bi.planned_quantity), 3) AS quantity,
        COALESCE(bi.unit, m.unit, 'kg') AS unit,
        'BATCH' AS sourceType,
        bi.batch_id AS sourceId,
        b.batch_code AS lotNumber,
        CONCAT('배치 ', COALESCE(b.batch_code, b.id), ' 투입') AS notes,
        'batch_input' AS dataSource
      FROM h_batch_inputs bi
      JOIN h_batches b ON bi.batch_id = b.id AND b.tenant_id = bi.tenant_id
      JOIN h_materials m ON bi.material_id = m.id
      WHERE bi.tenant_id = ${TID}
        AND bi.batch_id IN (579, 580, 581)
        AND b.status IN ('in_progress','completed')
        AND bi.inventory_deducted = 1
        AND NOT EXISTS (
          SELECT 1 FROM h_inventory_transactions tx
          WHERE tx.source_type IN ('BATCH','batch_completion')
            AND tx.source_id = bi.batch_id
            AND tx.source_line_id = bi.id
            AND tx.transaction_type = 'usage'
            AND tx.tenant_id = ${TID}
        )
    )
    ORDER BY txDate DESC, materialName ASC
  `);
  console.log(`\n=== UI 가 받는 union 결과 (${unionRows.length}건) ===`);
  console.table(unionRows);

  await conn.end();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
