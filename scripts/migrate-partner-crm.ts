/**
 * Partner CRM Phase 1~4 — DB 마이그레이션 (idempotent)
 *
 * 신규 테이블:
 *   - partner_contacts (Phase 1)
 *   - partner_activities (Phase 1)
 *   - partner_tags (Phase 1)
 *   - partner_documents (Phase 2)
 *   - partner_scores (Phase 4)
 *
 * 컬럼 추가:
 *   - partners.metadata JSON (Phase 1)
 *   - partner_contacts: department / mobile / notes / created_by / updated_at / is_active (legacy table 보강)
 *
 * 안전 원칙 (idempotent):
 *   - 모든 CREATE TABLE 은 IF NOT EXISTS
 *   - 모든 ALTER TABLE ADD COLUMN 은 헬퍼 (addColumnIfMissing) 통해 Duplicate 감지
 *   - 재실행해도 안전 — 같은 결과 보장
 *
 * 작성: 2026-05-05 (Phase 1~4)
 * 수정: 2026-05-05 (PR #245 — partner_contacts 누락 컬럼 4종 추가 + syntax fix)
 *
 * 실행:
 *   npx tsx scripts/migrate-partner-crm.ts
 */

import { getDb } from "../server/db/connection";
import { sql } from "drizzle-orm";

/**
 * idempotent ALTER TABLE ADD COLUMN — 이미 존재하면 skip
 */
async function addColumnIfMissing(
  db: any,
  table: string,
  column: string,
  type: string,
  comment?: string,
): Promise<void> {
  try {
    const commentClause = comment ? ` COMMENT '${comment.replace(/'/g, "''")}'` : "";
    await db.execute(
      sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${commentClause}`),
    );
    console.log(`    + ${table}.${column} 추가됨`);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.includes("Duplicate column") || msg.includes("already exists")) {
      console.log(`    = ${table}.${column} 이미 존재 — skip`);
    } else {
      throw e;
    }
  }
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  console.log("=== Partner CRM Phase 1~4 마이그레이션 시작 ===\n");

  // ─── 1. partner_contacts ───
  console.log("[1/6] partner_contacts 생성 / 보강...");
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

  // legacy table 보강 — PR #241 이전 partner_contacts 가 이미 존재하던 경우
  // (CREATE IF NOT EXISTS 가 skip 되어 새 컬럼이 추가되지 않음)
  await addColumnIfMissing(db, "partner_contacts", "department", "VARCHAR(100) NULL");
  await addColumnIfMissing(db, "partner_contacts", "mobile", "VARCHAR(50) NULL");
  await addColumnIfMissing(db, "partner_contacts", "notes", "TEXT NULL");
  await addColumnIfMissing(db, "partner_contacts", "created_by", "BIGINT NULL");
  await addColumnIfMissing(db, "partner_contacts", "is_active", "TINYINT NOT NULL DEFAULT 1");
  await addColumnIfMissing(
    db,
    "partner_contacts",
    "updated_at",
    "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  );

  // ─── 2. partner_activities ───
  console.log("[2/6] partner_activities 생성...");
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

  // ─── 3. partner_tags ───
  console.log("[3/6] partner_tags 생성...");
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

  // ─── 4. partners.metadata (JSON) ───
  console.log("[4/6] partners.metadata JSON 컬럼...");
  await addColumnIfMissing(
    db,
    "partners",
    "metadata",
    "JSON NULL",
    "거래처 자유 custom field (CRM Phase 1)",
  );

  // ─── 5. partner_documents (Phase 2) ───
  console.log("[5/6] partner_documents 생성...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS partner_documents (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL,
      partner_id BIGINT NOT NULL,
      doc_type ENUM(
        'contract','tax_invoice','estimate','purchase_order','delivery_note','receipt',
        'quality_cert','iso_cert','haccp_cert','biz_license','nda','other'
      ) NOT NULL,
      title VARCHAR(255) NOT NULL,
      doc_number VARCHAR(100),
      direction ENUM('issued','received') NOT NULL,
      file_url TEXT,
      file_name VARCHAR(255),
      file_size INT,
      issued_at TIMESTAMP NULL,
      received_at TIMESTAMP NULL,
      expires_at TIMESTAMP NULL,
      notes TEXT,
      created_by BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pd_tenant_partner (tenant_id, partner_id),
      INDEX idx_pd_type (partner_id, doc_type),
      INDEX idx_pd_expiry (tenant_id, expires_at),
      CONSTRAINT fk_pd_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ─── 6. partner_scores (Phase 4) ───
  console.log("[6/6] partner_scores 생성...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS partner_scores (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL,
      partner_id BIGINT NOT NULL,
      snapshot_date VARCHAR(10) NOT NULL,
      payment_timeliness_score INT NOT NULL DEFAULT 0,
      credit_utilization_score INT NOT NULL DEFAULT 0,
      activity_frequency_score INT NOT NULL DEFAULT 0,
      transaction_stability_score INT NOT NULL DEFAULT 0,
      total_score INT NOT NULL DEFAULT 0,
      grade VARCHAR(5) NOT NULL,
      breakdown JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ps_tenant_partner (tenant_id, partner_id),
      INDEX idx_ps_snapshot (partner_id, snapshot_date),
      UNIQUE KEY uniq_ps_partner_date (partner_id, snapshot_date),
      CONSTRAINT fk_ps_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log("\n✅ Partner CRM Phase 1~4 마이그레이션 완료\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ 마이그레이션 실패:", e);
  process.exit(1);
});
