/**
 * 진단: "재고미등록" 라벨로 표시되는 배치 원재료가 어떤 ID 인지
 *
 * 화면: 배치#579, #580, #581 의 원재료들이 "원재료 #198", "원재료 #177" 등 ID 로만 표시
 *
 * 후보 원인:
 *  - h_batch_inputs.material_id 가 어떤 master 테이블 id 인지 결정 필요
 *  - getConsumptionSummary 두번째 SELECT 의 JOIN 이 h_materials 인데
 *    실제 master 가 h_material_master 일 수 있음 (K3 PK 통일 이슈)
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // 1) 화면에 보이는 배치 579~581 의 input
  const [inputs]: any = await conn.query(`
    SELECT bi.id, bi.batch_id, bi.material_id, bi.planned_quantity, bi.actual_quantity, bi.unit,
           b.batch_code, b.completed_at, b.tenant_id AS b_tid, bi.tenant_id AS bi_tid
    FROM h_batch_inputs bi
    JOIN h_batches b ON b.id = bi.batch_id
    WHERE b.id IN (579, 580, 581)
      AND bi.tenant_id = ${TID}
    ORDER BY bi.batch_id, bi.id
  `);
  console.log(`=== 배치 579~581 의 input (${inputs.length}건) ===`);
  console.table(inputs.slice(0, 10));

  // 2) 그 material_id 들이 h_materials 에 존재하는지
  const [matsCheck]: any = await conn.query(`
    SELECT bi.material_id,
           m.id AS in_h_materials,
           m.material_name AS h_materials_name,
           mm.id AS in_h_material_master,
           mm.material_name AS h_master_name
    FROM (SELECT DISTINCT material_id FROM h_batch_inputs
          WHERE tenant_id = ${TID} AND batch_id IN (579,580,581)) bi
    LEFT JOIN h_materials m ON m.id = bi.material_id
    LEFT JOIN h_material_master mm ON mm.id = bi.material_id
    ORDER BY bi.material_id
  `);
  console.log(`\n=== 배치 579~581 material_id 가 마스터에 존재하는가 ===`);
  console.table(matsCheck);

  // 3) 전체 NULL/매칭 실패 분포
  const [missDist]: any = await conn.query(`
    SELECT
      CASE
        WHEN m.id IS NULL AND mm.id IS NULL THEN '둘 다 없음 (orphan)'
        WHEN m.id IS NOT NULL AND mm.id IS NULL THEN 'h_materials 만 있음'
        WHEN m.id IS NULL AND mm.id IS NOT NULL THEN 'h_material_master 만 있음'
        WHEN m.id IS NOT NULL AND mm.id IS NOT NULL THEN '둘 다 있음'
      END AS status,
      COUNT(*) AS cnt
    FROM h_batch_inputs bi
    LEFT JOIN h_materials m ON m.id = bi.material_id
    LEFT JOIN h_material_master mm ON mm.id = bi.material_id
    WHERE bi.tenant_id = ${TID}
    GROUP BY 1
  `);
  console.log(`\n=== 전체 h_batch_inputs.material_id 매칭 분포 ===`);
  console.table(missDist);

  // 4) 두 master 테이블 row count 비교
  const [hm]: any = await conn.query(
    `SELECT COUNT(*) AS cnt FROM h_materials WHERE tenant_id = ${TID}`,
  );
  const [hmm]: any = await conn.query(
    `SELECT COUNT(*) AS cnt FROM h_material_master WHERE tenant_id = ${TID}`,
  );
  console.log(`\n=== master 테이블 행수 ===`);
  console.log(`h_materials:        ${hm[0].cnt}`);
  console.log(`h_material_master:  ${hmm[0].cnt}`);

  // 5) "원재료 #198" 처럼 보이는 ID 가 실존? — h_material_master 에서 #198 직접 조회
  const [check198]: any = await conn.query(`
    SELECT 'h_materials' AS src, id, material_name FROM h_materials
    WHERE id = 198 AND tenant_id = ${TID}
    UNION ALL
    SELECT 'h_material_master' AS src, id, material_name FROM h_material_master
    WHERE id = 198 AND tenant_id = ${TID}
  `);
  console.log(`\n=== material_id = 198 의 마스터 존재 여부 ===`);
  console.table(check198);

  await conn.end();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
