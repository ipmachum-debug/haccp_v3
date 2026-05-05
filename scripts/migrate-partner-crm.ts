/**
 * Partner CRM Phase 1 — DB 마이그레이션
 *
 * 신규 테이블 3개 생성:
 *   - partner_contacts
 *   - partner_activities
 *   - partner_tags
 *
 * partners 테이블에 metadata JSON 컬럼 추가 (자유 custom field 용)
 *
 * 실행:
 *   npx tsx scripts/migrate-partner-crm.ts
 *
 * 작성: 2026-05-05
 */

import { getDb } from "../server/db/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  console.log("=== Partner CRM Phase 1 마이그레이션 시작 ===\n");

  // 1. partner_contacts
  console.log("[1/4] partner_contacts 생성...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS partner_contacts (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL,
      partner_id BIGINT NOT NULL,
      name VARCHAR(100) NOT NULL,
      role VARCHAR(100),
      department VARCHAR(100),
      phone VARCHAR(50),
      mobile VARCHAR(50),
      email VARCHAR(320),
      is_primary TINYINT NOT NULL DEFAULT 0,
      is_active TINYINT NOT NULL DEFAULT 1,
      notes TEXT,
      created_by BIGINT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pc_tenant_partner (tenant_id, partner_id),
      INDEX idx_pc_primary (partner_id, is_primary),
      CONSTRAINT fk_pc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 2. partner_activities
  console.log("[2/4] partner_activities 생성...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS partner_activities (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL,
      partner_id BIGINT NOT NULL,
      contact_id BIGINT,
      activity_type ENUM(
        'call','email','meeting','visit','note',
        'quote_sent','contract_signed','payment_received','payment_overdue',
        'task','other'
      ) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      outcome ENUM('info','follow_up','won','lost','blocked'),
      occurred_at TIMESTAMP NOT NULL,
      duration_minutes INT,
      ref_type VARCHAR(50),
      ref_id BIGINT,
      attachments_url TEXT,
      created_by BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pa_tenant_partner (tenant_id, partner_id),
      INDEX idx_pa_occurred (partner_id, occurred_at),
      INDEX idx_pa_type (partner_id, activity_type),
      INDEX idx_pa_ref (ref_type, ref_id),
      CONSTRAINT fk_pa_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 3. partner_tags
  console.log("[3/4] partner_tags 생성...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS partner_tags (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL,
      partner_id BIGINT NOT NULL,
      tag VARCHAR(50) NOT NULL,
      color VARCHAR(20),
      created_by BIGINT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pt_tenant_partner (tenant_id, partner_id),
      INDEX idx_pt_tag (tenant_id, tag),
      CONSTRAINT fk_pt_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 4. partners.metadata (JSON) — 자유 custom field
  console.log("[4/4] partners.metadata JSON 컬럼 추가...");
  try {
    await db.execute(sql`
      ALTER TABLE partners
      ADD COLUMN metadata JSON NULL COMMENT '거래처 자유 custom field (CRM Phase 1)'
    `);
    console.log("  → metadata 컬럼 추가됨");
  } catch (e: any) {
    if (e?.message?.includes("Duplicate column")) {
      console.log("  → metadata 이미 존재 — skip");
    } else throw e;
  }

  console.log("\n✅ Partner CRM Phase 1 마이그레이션 완료\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ 마이그레이션 실패:", e);
  process.exit(1);
});
