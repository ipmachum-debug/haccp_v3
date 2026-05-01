/**
 * 마이그레이션: h_trainings 테이블 — Training (Phase Y-3)
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));
  console.log("=== 마이그레이션 시작: h_trainings (Training / Phase Y-3) ===\n");

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_trainings'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_trainings 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_trainings 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_trainings (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'TR-YYYY-NNNN 자동채번',
        type ENUM('internal','external','on_the_job','regulatory') NOT NULL,

        title VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL COMMENT '교육 주제 / 영역',
        description TEXT NOT NULL,

        trainer_name VARCHAR(100) NOT NULL,
        trainer_type ENUM('internal','external') NOT NULL,
        trainer_user_id INT NULL COMMENT 'internal 시 user.id',

        scheduled_date DATE NOT NULL,
        actual_date DATE NULL,
        duration_minutes INT NOT NULL DEFAULT 60,

        attendees JSON NOT NULL COMMENT 'TrainingAttendee[]',
        materials JSON NOT NULL COMMENT 'TrainingMaterial[]',

        effectiveness_assessment TEXT NULL,

        approved_by INT NULL,
        approved_at TIMESTAMP NULL,
        closed_at TIMESTAMP NULL,

        status ENUM(
          'planned','scheduled','in_progress','completed','archived','cancelled'
        ) NOT NULL DEFAULT 'planned',

        industry_metadata JSON NULL,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Training (교육/훈련) — internal/external/OJT/regulatory (Phase Y-3)'
    `);
    console.log("✅ h_trainings 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    { name: "uniq_training_tenant_code", columns: "tenant_id, code", unique: true },
    { name: "idx_training_tenant_industry_status", columns: "tenant_id, industry, status" },
    { name: "idx_training_tenant_scheduled_date", columns: "tenant_id, scheduled_date" },
    { name: "idx_training_tenant_type_status", columns: "tenant_id, type, status" },
    { name: "idx_training_tenant_trainer", columns: "tenant_id, trainer_user_id, status" },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_trainings' AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_trainings (${idx.columns})`,
    );
    console.log(`✅ 인덱스 ${idx.name} 생성 완료`);
  }

  console.log("\n=== 마이그레이션 완료 ===");
  await conn.end();
}

migrate().catch((err) => {
  console.error("치명 오류:", err);
  process.exit(1);
});
