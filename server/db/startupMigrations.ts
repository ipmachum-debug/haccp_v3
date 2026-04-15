/**
 * 서버 시작 시 실행되는 자동 마이그레이션
 * Drizzle 스키마와 실제 DB 테이블 간 누락된 컬럼을 자동으로 추가
 */

import { getRawConnection } from "./connection";

/**
 * partners 테이블에 누락된 컬럼 추가
 * schema_main.ts에 정의되어 있지만 실제 DB에 없는 컬럼들
 */
async function migratePartnersTable(conn: any) {
  const missingColumns = [
    { name: "contact_person", sql: "ALTER TABLE partners ADD COLUMN contact_person VARCHAR(100) NULL" },
    { name: "biz_type", sql: "ALTER TABLE partners ADD COLUMN biz_type VARCHAR(255) NULL" },
    { name: "biz_item", sql: "ALTER TABLE partners ADD COLUMN biz_item VARCHAR(255) NULL" },
    { name: "fax", sql: "ALTER TABLE partners ADD COLUMN fax VARCHAR(50) NULL" },
    { name: "bank_name", sql: "ALTER TABLE partners ADD COLUMN bank_name VARCHAR(50) NULL" },
    { name: "bank_account", sql: "ALTER TABLE partners ADD COLUMN bank_account VARCHAR(50) NULL" },
  ];

  // biz_no varchar(20) → varchar(50) 확장 (스키마와 일치)
  const columnFixes = [
    { name: "biz_no_expand", sql: "ALTER TABLE partners MODIFY COLUMN biz_no VARCHAR(50) NULL" },
  ];

  for (const col of missingColumns) {
    try {
      await conn.query(col.sql);
      console.log(`[Migration] partners: added column '${col.name}'`);
    } catch (err: any) {
      if (err.code === "ER_DUP_FIELDNAME" || err.message?.includes("Duplicate column")) {
        // 이미 존재하는 컬럼 - 정상
      } else {
        console.warn(`[Migration] partners: failed to add '${col.name}':`, err.message);
      }
    }
  }

  for (const fix of columnFixes) {
    try {
      await conn.query(fix.sql);
      console.log(`[Migration] partners: applied fix '${fix.name}'`);
    } catch (err: any) {
      console.warn(`[Migration] partners: failed to apply '${fix.name}':`, err.message);
    }
  }
}

/**
 * AI 관련 테이블이 존재하지 않으면 생성
 * 챗봇, 규칙엔진, 지식베이스, 이상탐지 등에 필요한 테이블
 */
async function ensureAITables(conn: any) {
  const tables: Array<{ name: string; sql: string }> = [
    {
      name: "ai_chat_history",
      sql: `CREATE TABLE IF NOT EXISTS ai_chat_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        conversation_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(100),
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_chat_tenant_conv (tenant_id, conversation_id),
        INDEX idx_chat_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "ai_alerts",
      sql: `CREATE TABLE IF NOT EXISTS ai_alerts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        rule_code VARCHAR(100) NOT NULL,
        title VARCHAR(500),
        message TEXT,
        severity ENUM('low','medium','high','critical') DEFAULT 'medium',
        entity_type VARCHAR(100),
        entity_id INT,
        entity_code VARCHAR(255),
        context_data JSON,
        status VARCHAR(50) DEFAULT 'active',
        acknowledged_by INT,
        acknowledged_at TIMESTAMP NULL,
        resolved_by INT,
        resolved_at TIMESTAMP NULL,
        resolved_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        INDEX idx_alerts_tenant (tenant_id, status),
        INDEX idx_alerts_severity (severity),
        INDEX idx_alerts_entity (entity_type, entity_id),
        INDEX idx_alerts_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "ai_audit_logs",
      sql: `CREATE TABLE IF NOT EXISTS ai_audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        input_data JSON,
        reference_data JSON,
        output_data JSON,
        output_text TEXT,
        user_modified TINYINT(1) DEFAULT 0,
        model_used VARCHAR(100),
        tokens_used INT,
        latency_ms INT,
        user_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_tenant (tenant_id),
        INDEX idx_audit_action (action_type),
        INDEX idx_audit_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "ai_standards",
      sql: `CREATE TABLE IF NOT EXISTS ai_standards (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(300) NOT NULL,
        standard_type VARCHAR(100),
        content MEDIUMTEXT,
        parsed_items JSON,
        status VARCHAR(50) DEFAULT 'uploaded',
        version VARCHAR(50),
        effective_date DATE,
        is_active TINYINT(1) DEFAULT 1,
        generated_template_id INT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_standards_tenant (tenant_id),
        INDEX idx_standards_type (standard_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "ai_rules",
      sql: `CREATE TABLE IF NOT EXISTS ai_rules (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        code VARCHAR(100) NOT NULL,
        name VARCHAR(200),
        description TEXT,
        rule_type VARCHAR(50),
        entity_type VARCHAR(50),
        conditions JSON,
        severity ENUM('low','medium','high','critical') DEFAULT 'medium',
        notify_roles JSON,
        is_active TINYINT(1) DEFAULT 1,
        is_system TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rules_tenant (tenant_id),
        INDEX idx_rules_code (code),
        UNIQUE KEY uk_rules_tenant_code (tenant_id, code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "ai_knowledge_documents",
      sql: `CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        doc_type VARCHAR(100),
        content MEDIUMTEXT,
        source_url VARCHAR(1000),
        source_file VARCHAR(500),
        chunk_count INT DEFAULT 0,
        total_tokens INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'chunking',
        is_active TINYINT(1) DEFAULT 1,
        is_global TINYINT(1) DEFAULT 0,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_kbdocs_tenant (tenant_id),
        INDEX idx_kbdocs_type (doc_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "ai_knowledge_chunks",
      sql: `CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        document_id BIGINT NOT NULL,
        chunk_index INT DEFAULT 0,
        content TEXT NOT NULL,
        token_count INT DEFAULT 0,
        embedding JSON,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_kbchunks_tenant (tenant_id),
        INDEX idx_kbchunks_doc (document_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "ai_batch_summaries",
      sql: `CREATE TABLE IF NOT EXISTS ai_batch_summaries (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        batch_id INT,
        summary_date DATE,
        risk_level VARCHAR(50) DEFAULT 'low',
        risk_score DECIMAL(5,2),
        yield_deviation DECIMAL(5,2),
        ccp_deviation_count INT DEFAULT 0,
        checklist_missing_count INT DEFAULT 0,
        summary_data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_batchsum_tenant (tenant_id),
        INDEX idx_batchsum_date (summary_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "ai_parse_corrections",
      sql: `CREATE TABLE IF NOT EXISTS ai_parse_corrections (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        input_alias VARCHAR(300),
        normalized_alias VARCHAR(300),
        product_id INT,
        product_name VARCHAR(300),
        default_quantity_kg DECIMAL(10,2),
        use_count INT DEFAULT 1,
        corrected_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_parsecorr_tenant (tenant_id),
        UNIQUE KEY uk_parsecorr (tenant_id, normalized_alias)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "ai_parse_history",
      sql: `CREATE TABLE IF NOT EXISTS ai_parse_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        input_text TEXT,
        parse_method VARCHAR(100),
        confirmed_result JSON,
        correction_count INT DEFAULT 0,
        total_items INT DEFAULT 0,
        accuracy DECIMAL(5,4),
        user_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_parsehist_tenant (tenant_id),
        INDEX idx_parsehist_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
  ];

  let created = 0;
  for (const t of tables) {
    try {
      await conn.query(t.sql);
      // IF NOT EXISTS이므로 이미 존재하면 무시됨
      const [rows] = await conn.query(`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`, [t.name]);
      if ((rows as any[])[0]?.cnt > 0) created++;
    } catch (err: any) {
      console.warn(`[Migration] AI table '${t.name}' creation failed:`, err.message);
    }
  }
  console.log(`[Migration] AI tables verified: ${created}/${tables.length} exist`);
}

/**
 * 계정 카테고리(상위계정 그룹) 테이블 자동 생성
 * ★ 2026-04-15: account_categories 테이블 미존재 시 계정 과목 관리 페이지가
 *   매 요청마다 에러 → 폴백 → 10초 로딩 문제 발생
 */
async function ensureAccountCategoriesTable(conn: any) {
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS account_categories (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(100) NOT NULL,
        major_category VARCHAR(50) NOT NULL,
        minor_category VARCHAR(50) DEFAULT NULL,
        description TEXT DEFAULT NULL,
        is_active TINYINT NOT NULL DEFAULT 1,
        tenant_id INT DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_active (tenant_id, is_active),
        INDEX idx_major_category (major_category),
        INDEX idx_code (code)
      )
    `);
    console.log("[Migration] account_categories table verified");
  } catch (err: any) {
    console.warn("[Migration] account_categories table creation failed:", err.message);
  }
}

/**
 * 서버 시작 시 모든 자동 마이그레이션 실행
 */
export async function runStartupMigrations() {
  try {
    const conn = await getRawConnection();
    console.log("[Migration] Running startup migrations...");
    
    await migratePartnersTable(conn);
    await ensureAITables(conn);
    await ensureAccountCategoriesTable(conn);
    
    console.log("[Migration] Startup migrations completed");
  } catch (err) {
    console.error("[Migration] Startup migrations failed:", err);
    // 마이그레이션 실패해도 서버는 계속 실행
  }
}
