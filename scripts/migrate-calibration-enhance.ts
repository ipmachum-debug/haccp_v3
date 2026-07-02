/**
 * 검교정 강화 마이그레이션 (idempotent)
 * ═══════════════════════════════════════════════════════════════
 * calibration_equipment / calibration_records 에 컬럼 추가:
 *   [equipment] calibration_cycle_months  — 교정 주기(개월). 다음교정일 자동계산 근거
 *   [records]   calibration_institution    — 교정기관
 *               certificate_number         — 성적서 번호
 *               calibrated_by              — 교정자
 *               result                     — 판정 (pass/fail/conditional_pass)
 *               results_json               — 항목별 보정값(JSON). 폼이 수집하나 유실되던 데이터 영속화
 *               certificate_file           — 성적서 첨부(base64, LONGTEXT)
 *
 * 실행: npx tsx scripts/migrate-calibration-enhance.ts
 * 안전: 각 컬럼을 information_schema 로 존재 확인 후에만 ADD (재실행 안전).
 * ═══════════════════════════════════════════════════════════════
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function columnExists(conn: mysql.Connection, table: string, column: string): Promise<boolean> {
  const [rows]: any = await conn.execute(
    `SELECT COUNT(*) AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return Number(rows[0]?.c || 0) > 0;
}

async function addColumn(conn: mysql.Connection, table: string, column: string, ddl: string) {
  if (await columnExists(conn, table, column)) {
    console.log(`  · ${table}.${column} 이미 존재 — 건너뜀`);
    return;
  }
  await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`  ✅ ${table}.${column} 추가`);
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "haccpone",
  });

  console.log("검교정 강화 마이그레이션 시작...");
  try {
    await conn.beginTransaction();

    // 설비: 교정 주기(개월)
    await addColumn(
      conn,
      "calibration_equipment",
      "calibration_cycle_months",
      "calibration_cycle_months INT NULL COMMENT '교정 주기(개월)' AFTER equipment_type",
    );

    // 기록: 성적서/판정/보정값
    await addColumn(conn, "calibration_records", "calibration_institution",
      "calibration_institution VARCHAR(200) NULL COMMENT '교정기관' AFTER regular_calibration_date");
    await addColumn(conn, "calibration_records", "certificate_number",
      "certificate_number VARCHAR(100) NULL COMMENT '성적서 번호' AFTER calibration_institution");
    await addColumn(conn, "calibration_records", "calibrated_by",
      "calibrated_by VARCHAR(200) NULL COMMENT '교정자' AFTER certificate_number");
    await addColumn(conn, "calibration_records", "result",
      "result ENUM('pass','fail','conditional_pass') NULL COMMENT '판정' AFTER calibrated_by");
    await addColumn(conn, "calibration_records", "results_json",
      "results_json JSON NULL COMMENT '항목별 보정값(JSON)' AFTER result");
    await addColumn(conn, "calibration_records", "certificate_file",
      "certificate_file LONGTEXT NULL COMMENT '성적서 첨부(base64)' AFTER results_json");

    await conn.commit();
    console.log("✅ 마이그레이션 완료");
  } catch (err) {
    await conn.rollback();
    console.error("❌ 마이그레이션 실패 (롤백):", err);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
