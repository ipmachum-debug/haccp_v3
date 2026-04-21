/**
 * 배치 생성일 수정 스크립트
 * 엑셀 임포트로 생성된 배치의 created_at을 planned_date로 변경
 *
 * 실행: npx tsx scripts/fix-batch-created-at.ts
 */

import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD || "",
    database: "haccp_tenant_db",
  });

  try {
    // 엑셀 임포트로 생성된 배치의 created_at을 planned_date로 업데이트
    const [result] = (await conn.execute(
      `UPDATE h_batches
       SET created_at = planned_date, updated_at = planned_date
       WHERE notes = '엑셀 임포트' AND DATE(created_at) != DATE(planned_date)`
    )) as any[];

    console.log(`✅ 배치 생성일 수정 완료: ${result.affectedRows}건`);

    // 확인
    const [batches] = (await conn.execute(
      `SELECT batch_code, planned_date, created_at
       FROM h_batches WHERE notes = '엑셀 임포트'
       ORDER BY planned_date LIMIT 10`
    )) as any[];

    console.log("\n수정된 배치 (상위 10건):");
    for (const b of batches) {
      console.log(`  ${b.batch_code} | planned: ${b.planned_date} | created: ${b.created_at}`);
    }
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
