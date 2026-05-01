/**
 * 마이그레이션: h_nonconformings 테이블 추가 — Nonconforming (부적합) 통합
 *
 * Phase Y-2-1-a (ADR-003 Industry-First Menu / Phase Y 로드맵).
 * Cross-cutting 도메인 — 모든 industry 공통 단일 테이블 + view filter.
 *
 * 적용:
 *   CREATE TABLE IF NOT EXISTS h_nonconformings (...)
 *   + UNIQUE INDEX uniq_nonconforming_tenant_code (tenant_id, code)
 *   + INDEX idx_nonconforming_tenant_industry_status (tenant_id, industry, status)
 *   + INDEX idx_nonconforming_tenant_detection_date (tenant_id, detection_date)
 *   + INDEX idx_nonconforming_tenant_car (tenant_id, corrective_action_id)
 *
 * 안전:
 *   - idempotent (CREATE TABLE IF NOT EXISTS + 중복 인덱스 감지)
 *   - 기존 h_nonconforming_products 테이블 보존 (Strangler Fig)
 *   - 기존 라우터 / UI 동작 유지 — Y-2-1-d/e 에서 deprecated 처리
 *   - 라우터 미등록 (Y-2-1-b 까지) — 운영 영향 0
 *
 * 실행:
 *   npx tsx scripts/migrate-nonconforming-table.ts
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));

  console.log(
    "=== 마이그레이션 시작: h_nonconformings (Nonconforming / Phase Y-2-1-a) ===\n",
  );

  // 1. 테이블 존재 여부 확인
  const [tRows]: any = await conn.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_nonconformings'`,
  );
  const exists = (tRows as any[]).length > 0;

  if (exists) {
    console.log("✅ h_nonconformings 테이블 이미 존재 — 스킵");
  } else {
    console.log("→ h_nonconformings 테이블 생성 중...");
    await conn.execute(`
      CREATE TABLE h_nonconformings (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,

        industry ENUM(
          'food',
          'cosmetic',
          'pharmaceutical',
          'health-functional',
          'medical-device',
          'general-manufacturing'
        ) NOT NULL COMMENT 'Industry view filter (ADR-003 IndustryKey)',

        code VARCHAR(50) NOT NULL COMMENT 'NCR-YYYY-NNNN 자동채번',

        detection_date DATE NOT NULL COMMENT '발견일',

        detection_source ENUM(
          'incoming_inspection',
          'in_process_inspection',
          'final_inspection',
          'customer_complaint',
          'internal_audit',
          'ccp_monitoring',
          'stability_test',
          'other'
        ) NOT NULL,

        nonconformity_type ENUM(
          'physical','chemical','biological','sensory',
          'packaging','labeling','specification','other'
        ) NOT NULL,

        description TEXT NOT NULL COMMENT '부적합 상세 설명',

        item_name VARCHAR(255) NOT NULL COMMENT '제품/원료 식별',
        lot_number VARCHAR(100) NULL COMMENT 'LOT 번호',
        quantity DECIMAL(12,3) NOT NULL COMMENT '부적합 수량',
        unit VARCHAR(20) NOT NULL,

        root_cause TEXT NULL COMMENT '근본 원인 (조사 후)',
        cause_category ENUM(
          'material','process','equipment','human_error',
          'environment','method','other'
        ) NULL,

        disposal_method ENUM(
          'pending','rework','downgrade','alternative_use',
          'disposal','return_to_supplier','customer_return'
        ) NOT NULL DEFAULT 'pending',
        disposal_date DATE NULL,
        disposal_details TEXT NULL,
        disposal_cost DECIMAL(12,2) NULL,

        detected_by INT NOT NULL COMMENT '발견자 user_id',
        responsible_person INT NULL,
        approved_by INT NULL,
        approved_at TIMESTAMP NULL,

        corrective_action_id BIGINT NULL
          COMMENT '연계 CAPA ID (Y-2-2 후 활성)',

        preventive_actions TEXT NULL COMMENT '재발 방지 대책',

        status ENUM(
          'detected','under_investigation','pending_disposal',
          'disposed','closed','cancelled'
        ) NOT NULL DEFAULT 'detected',

        notes TEXT NULL,

        industry_metadata JSON NULL COMMENT 'Industry-specific 확장 필드',

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='부적합 (Nonconforming) — 모든 industry 공통 cross-cutting (Phase Y-2-1-a)'
    `);
    console.log("✅ h_nonconformings 테이블 생성 완료");
  }

  // 2. 인덱스 idempotent 추가
  const indexes: Array<{ name: string; columns: string; unique?: boolean }> = [
    {
      name: "uniq_nonconforming_tenant_code",
      columns: "tenant_id, code",
      unique: true,
    },
    {
      name: "idx_nonconforming_tenant_industry_status",
      columns: "tenant_id, industry, status",
    },
    {
      name: "idx_nonconforming_tenant_detection_date",
      columns: "tenant_id, detection_date",
    },
    {
      name: "idx_nonconforming_tenant_car",
      columns: "tenant_id, corrective_action_id",
    },
  ];

  for (const idx of indexes) {
    const [existsRows]: any = await conn.execute(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'h_nonconformings'
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
      `CREATE ${uniqueKw}INDEX ${idx.name} ON h_nonconformings (${idx.columns})`,
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
