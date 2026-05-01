/**
 * 마이그레이션: h_corrective_actions 테이블 추가 — CAPA (Phase Y-2-2)
 *
 * Cross-cutting 도메인 — 모든 industry 공통 단일 테이블 + view filter.
 * Nonconforming (h_nonconformings, Y-2-1-a) 와 양방향 연계.
 *
 * 안전:
 *   - idempotent (CREATE TABLE IF NOT EXISTS + 인덱스 중복 감지)
 *   - 기존 데이터 영향 0 (신규 테이블)
 *   - 라우터 등록은 본 PR 의 server/routers 변경에서 동시 적용
 *
 * 실행:
 *   npx tsx scripts/migrate-corrective-action-table.ts
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));

  console.log(
    "=== 마이그레이션 시작: h_corrective_actions (CAPA / Phase Y-2-2) ===\n",
  );

  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_corrective_actions'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_corrective_actions 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_corrective_actions 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_corrective_actions (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food','cosmetic','pharmaceutical',
          'health-functional','medical-device','general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'CAR-YYYY-NNNN 자동채번',

        type ENUM('corrective','preventive') NOT NULL,
        priority ENUM('critical','high','medium','low') NOT NULL DEFAULT 'medium',

        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,

        nonconforming_id BIGINT NULL
          COMMENT 'h_nonconformings.id 연계 (preventive 시 NULL)',

        assigned_to INT NOT NULL COMMENT '담당자 user_id',
        due_date DATE NOT NULL COMMENT '마감일',

        action_plan TEXT NOT NULL COMMENT '조치 계획',
        execution_details TEXT NULL COMMENT '실행 상세 (in_progress)',

        effectiveness_criteria TEXT NULL COMMENT '효과성 검증 기준',
        effectiveness_result TEXT NULL COMMENT '효과성 검증 결과',

        verified_by INT NULL COMMENT '검증자 user_id',
        verified_at TIMESTAMP NULL,
        closed_at TIMESTAMP NULL COMMENT '종결일 (closed)',

        status ENUM(
          'planned','in_progress','effectiveness_check',
          'closed','cancelled'
        ) NOT NULL DEFAULT 'planned',

        industry_metadata JSON NULL,

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='CAPA (Corrective + Preventive Action) — cross-cutting (Phase Y-2-2)'
    `);
    console.log("✅ h_corrective_actions 테이블 생성 완료");
  }

  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    {
      name: "uniq_corrective_action_tenant_code",
      columns: "tenant_id, code",
      unique: true,
    },
    {
      name: "idx_corrective_action_tenant_industry_status",
      columns: "tenant_id, industry, status",
    },
    {
      name: "idx_corrective_action_tenant_due_date",
      columns: "tenant_id, due_date",
    },
    {
      name: "idx_corrective_action_tenant_assignee",
      columns: "tenant_id, assigned_to, status",
    },
    {
      name: "idx_corrective_action_tenant_nonconforming",
      columns: "tenant_id, nonconforming_id",
    },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'h_corrective_actions'
         AND INDEX_NAME = ?`,
      [idx.name],
    );
    if ((existsRows as any[]).length > 0) {
      console.log(`✅ 인덱스 ${idx.name} 이미 존재 — 스킵`);
      continue;
    }
    const uniqueKw = idx.unique ? "UNIQUE " : "";
    console.log(`→ 인덱스 생성: ${idx.name}`);
    await conn.execute(
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_corrective_actions (${idx.columns})`,
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
