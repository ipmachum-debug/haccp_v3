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
 * 문서 승인 파이프라인 테이블 확보
 * ★ 2026-04-15: DB 손실 복구 후 document_instances 누락 이슈 해결
 *   document_types / document_instances / document_approval_history /
 *   document_batch_print_groups / document_batch_print_items /
 *   document_auto_approval_settings
 *
 * 배치 출하 / 승인 / 문서출력 전체 파이프라인의 핵심 테이블들.
 * 40+ 파일에서 직접 SQL 로 참조하지만 Drizzle schema 정식 정의가 없어
 * startup ensure 로만 스키마 보장 가능.
 */
async function ensureDocumentApprovalTables(conn: any) {
  const tables: Array<{ name: string; sql: string }> = [
    {
      name: "document_types",
      sql: `CREATE TABLE IF NOT EXISTS document_types (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(200) NOT NULL,
        category ENUM('production','ccp','inspection','training','hygiene','prerequisite','other') NOT NULL,
        description TEXT,
        template_path VARCHAR(500),
        is_active TINYINT DEFAULT 1 NOT NULL,
        auto_generate_on_batch TINYINT DEFAULT 0 NOT NULL,
        requires_approval TINYINT DEFAULT 1 NOT NULL,
        approval_levels INT DEFAULT 3 NOT NULL,
        created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
        updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) NOT NULL,
        INDEX idx_document_type_code (code),
        INDEX idx_document_type_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "document_instances",
      sql: `CREATE TABLE IF NOT EXISTS document_instances (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        site_id BIGINT NOT NULL,
        document_type_id BIGINT NOT NULL,
        batch_id BIGINT NULL,
        product_id BIGINT NULL,
        work_date DATE NOT NULL,
        status ENUM('draft','pending_review','pending_approval','approved','rejected','cancelled') DEFAULT 'draft' NOT NULL,
        created_by BIGINT NOT NULL,
        created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
        reviewer_id BIGINT NULL,
        reviewed_at TIMESTAMP(3) NULL,
        review_comments TEXT,
        approver_id BIGINT NULL,
        approved_at TIMESTAMP(3) NULL,
        approval_comments TEXT,
        rejected_by BIGINT NULL,
        rejected_at TIMESTAMP(3) NULL,
        rejection_reason TEXT,
        is_auto_generated TINYINT DEFAULT 0 NOT NULL,
        auto_approval_enabled TINYINT DEFAULT 0 NOT NULL,
        document_data JSON,
        pdf_url VARCHAR(500),
        pdf_generated_at TIMESTAMP(3) NULL,
        updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) NOT NULL,
        INDEX idx_di_tenant (tenant_id),
        INDEX idx_di_site (site_id),
        INDEX idx_di_type (document_type_id),
        INDEX idx_di_batch (batch_id),
        INDEX idx_di_work_date (work_date),
        INDEX idx_di_status (status),
        INDEX idx_di_tenant_batch (tenant_id, batch_id),
        INDEX idx_di_tenant_status (tenant_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "document_approval_history",
      sql: `CREATE TABLE IF NOT EXISTS document_approval_history (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        document_instance_id BIGINT NOT NULL,
        action ENUM('created','submitted_for_review','reviewed','submitted_for_approval','approved','rejected','cancelled') NOT NULL,
        actor_id BIGINT NOT NULL,
        actor_role ENUM('creator','reviewer','approver','admin') NOT NULL,
        comments TEXT,
        previous_status VARCHAR(50),
        new_status VARCHAR(50),
        created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
        INDEX idx_dah_tenant (tenant_id),
        INDEX idx_dah_document (document_instance_id),
        INDEX idx_dah_actor (actor_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "document_batch_print_groups",
      sql: `CREATE TABLE IF NOT EXISTS document_batch_print_groups (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        site_id BIGINT NOT NULL,
        work_date DATE NOT NULL,
        group_name VARCHAR(200) NOT NULL,
        description TEXT,
        total_documents INT DEFAULT 0 NOT NULL,
        printed_by BIGINT NULL,
        printed_at TIMESTAMP(3) NULL,
        combined_pdf_url VARCHAR(500),
        pdf_generated_at TIMESTAMP(3) NULL,
        created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
        updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) NOT NULL,
        INDEX idx_dbpg_tenant (tenant_id),
        INDEX idx_dbpg_site (site_id),
        INDEX idx_dbpg_work_date (work_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "document_batch_print_items",
      sql: `CREATE TABLE IF NOT EXISTS document_batch_print_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        batch_print_group_id BIGINT NOT NULL,
        document_instance_id BIGINT NOT NULL,
        sort_order INT DEFAULT 0 NOT NULL,
        created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
        INDEX idx_dbpi_tenant (tenant_id),
        INDEX idx_dbpi_group (batch_print_group_id),
        INDEX idx_dbpi_document (document_instance_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "document_auto_approval_settings",
      sql: `CREATE TABLE IF NOT EXISTS document_auto_approval_settings (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        site_id BIGINT NOT NULL,
        document_type_id BIGINT NOT NULL,
        auto_approval_enabled TINYINT DEFAULT 0 NOT NULL,
        auto_approval_delay_minutes INT DEFAULT 0,
        conditions JSON,
        default_reviewer_id BIGINT NULL,
        default_approver_id BIGINT NULL,
        created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL,
        updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) NOT NULL,
        INDEX idx_daas_tenant (tenant_id),
        INDEX idx_daas_site (site_id),
        INDEX idx_daas_document_type (document_type_id),
        UNIQUE KEY uk_daas_site_type (tenant_id, site_id, document_type_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
  ];

  let created = 0;
  for (const t of tables) {
    try {
      await conn.query(t.sql);
      const [rows] = await conn.query(
        `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        [t.name],
      );
      if ((rows as any[])[0]?.cnt > 0) created++;
    } catch (err: any) {
      console.warn(`[Migration] document table '${t.name}' ensure failed:`, err.message);
    }
  }
  console.log(`[Migration] Document approval tables verified: ${created}/${tables.length} exist`);

  // 기본 document_types 시드 (ON DUPLICATE KEY UPDATE 로 멱등성 보장)
  try {
    await conn.query(`
      INSERT INTO document_types (code, name, category, description, auto_generate_on_batch, requires_approval, approval_levels) VALUES
      ('production_log', '생산일지', 'production', '배치별 생산 기록', 1, 1, 3),
      ('ccp_log', 'CCP 일지', 'ccp', 'CCP 모니터링 기록', 1, 1, 3),
      ('visual_inspection_log', '육안검사 일지', 'inspection', '제품 육안 검사 기록', 1, 1, 3),
      ('training_log', '교육훈련 일지', 'training', '직원 교육 훈련 기록', 0, 1, 3),
      ('hygiene_log', '위생관리 일지', 'hygiene', '위생 점검 및 관리 기록', 1, 1, 3),
      ('prerequisite_log', '선행관리 일지', 'prerequisite', '선행 요구사항 관리 기록', 1, 1, 3),
      ('equipment_cleaning_log', '설비 세척 일지', 'hygiene', '설비 세척 및 소독 기록', 1, 1, 3),
      ('water_quality_log', '수질 검사 일지', 'prerequisite', '용수 수질 검사 기록', 1, 1, 3),
      ('personal_hygiene_log', '개인위생 점검 일지', 'hygiene', '작업자 개인위생 점검 기록', 1, 1, 3),
      ('foreign_material_log', '이물 관리 일지', 'inspection', '이물 발견 및 조치 기록', 1, 1, 3)
      ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category)
    `);
    console.log(`[Migration] document_types seed data ensured`);
  } catch (err: any) {
    console.warn(`[Migration] document_types seed failed:`, err.message);
  }
}

/**
 * 인증/권한/즐겨찾기 관련 테이블 확보
 * ★ 2026-04-15: DB 손실 복구 이후 drizzle 스키마에 정의된 auth 테이블 중
 *   일부가 DB 에 없을 가능성 → 로그인/권한/즐겨찾기 기능이 조용히 실패하는 것 방지
 *
 * drizzle/schema/auth.ts 정의 기반:
 *   - h_employees, h_user_roles, h_rbac_roles, h_rbac_permissions,
 *     h_rbac_role_permissions, h_organization, h_user_widget_settings,
 *     h_user_favorites
 */
async function ensureAuthTables(conn: any) {
  const tables: Array<{ name: string; sql: string }> = [
    {
      name: "h_employees",
      sql: `CREATE TABLE IF NOT EXISTS h_employees (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        site_id BIGINT NOT NULL,
        employee_code VARCHAR(50) NOT NULL,
        employee_name VARCHAR(100) NOT NULL,
        department VARCHAR(100),
        position VARCHAR(100),
        email VARCHAR(320),
        phone VARCHAR(20),
        hire_date TIMESTAMP NULL,
        is_active INT DEFAULT 1 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY uk_employee_code (employee_code),
        INDEX idx_emp_tenant (tenant_id),
        INDEX idx_emp_site (site_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_user_roles",
      sql: `CREATE TABLE IF NOT EXISTS h_user_roles (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        user_id BIGINT NOT NULL,
        role_id BIGINT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        assigned_by BIGINT NULL,
        INDEX idx_ur_tenant (tenant_id),
        INDEX idx_ur_user (user_id),
        INDEX idx_ur_role (role_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_rbac_roles",
      sql: `CREATE TABLE IF NOT EXISTS h_rbac_roles (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        role_name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY uk_rbac_role_name (role_name),
        INDEX idx_rbac_role_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_rbac_permissions",
      sql: `CREATE TABLE IF NOT EXISTS h_rbac_permissions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        permission_name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE KEY uk_rbac_perm_name (permission_name),
        INDEX idx_rbac_perm_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_rbac_role_permissions",
      sql: `CREATE TABLE IF NOT EXISTS h_rbac_role_permissions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        role_id BIGINT NOT NULL,
        permission_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_rrp_tenant (tenant_id),
        INDEX idx_rrp_role (role_id),
        INDEX idx_rrp_perm (permission_id),
        UNIQUE KEY uk_rrp_role_perm (role_id, permission_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_organization",
      sql: `CREATE TABLE IF NOT EXISTS h_organization (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        parent_id BIGINT NULL,
        organization_name VARCHAR(100) NOT NULL,
        level INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_org_tenant (tenant_id),
        INDEX idx_org_parent (parent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_user_widget_settings",
      sql: `CREATE TABLE IF NOT EXISTS h_user_widget_settings (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        user_id BIGINT NOT NULL,
        widget_id VARCHAR(100) NOT NULL,
        is_visible INT DEFAULT 1 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_uws_tenant_user (tenant_id, user_id),
        UNIQUE KEY uk_uws_user_widget (user_id, widget_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_user_favorites",
      sql: `CREATE TABLE IF NOT EXISTS h_user_favorites (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        user_id BIGINT NOT NULL,
        menu_path VARCHAR(255) NOT NULL,
        menu_label VARCHAR(100) NOT NULL,
        menu_icon VARCHAR(50),
        sort_order INT DEFAULT 0 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_fav_tenant_user (tenant_id, user_id),
        UNIQUE KEY uk_fav_user_path (user_id, menu_path)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
  ];

  let created = 0;
  for (const t of tables) {
    try {
      await conn.query(t.sql);
      const [rows] = await conn.query(
        `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        [t.name],
      );
      if ((rows as any[])[0]?.cnt > 0) created++;
    } catch (err: any) {
      console.warn(`[Migration] auth table '${t.name}' ensure failed:`, err.message);
    }
  }
  console.log(`[Migration] Auth/RBAC tables verified: ${created}/${tables.length} exist`);
}

/**
 * account_categories 테이블 확보
 * ★ 2026-04-15: Genspark 커밋 6e808ab 에서 genspark_ai_developer 브랜치로
 *   먼저 반영된 ensure 로직을 우리 브랜치에도 포함 (PR #23 머지 대기)
 *   계정 구조 페이지 10초 로딩의 근본 원인이었던 테이블.
 *
 *   tenant_id NULL 허용 (글로벌 카테고리 지원)
 */
async function ensureAccountCategoriesTable(conn: any) {
  try {
    await conn.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[Migration] account_categories table verified");
  } catch (err: any) {
    console.warn("[Migration] account_categories table creation failed:", err.message);
  }
}

/**
 * accounting_accounts 테이블에 account_category_id 컬럼 ALTER ensure
 * ★ 2026-04-15: scripts/migrate-account-category-fk.ts 수동 실행 대신
 *   서버 시작 시 자동 보장. 컬럼 부재 시 accountingAccounts.list 가
 *   매 요청마다 fallback 2회 왕복 → 10초 로딩 재발 방지.
 */
async function ensureAccountingAccountsColumns(conn: any) {
  try {
    // 1. account_category_id 컬럼 존재 확인
    const [cols]: any = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'accounting_accounts'
         AND COLUMN_NAME = 'account_category_id'`
    );
    if ((cols as any[]).length === 0) {
      await conn.query(
        `ALTER TABLE accounting_accounts
         ADD COLUMN account_category_id BIGINT NULL AFTER parent_id,
         ADD INDEX idx_account_category_id (account_category_id)`
      );
      console.log("[Migration] accounting_accounts: account_category_id column added");
    } else {
      // 이미 존재하면 skip
    }
  } catch (err: any) {
    // 테이블 자체가 없는 경우 (신규 배포) → 다른 ensure 에서 처리됨
    if (err.code !== "ER_NO_SUCH_TABLE") {
      console.warn("[Migration] accounting_accounts ALTER failed:", err.message);
    }
  }

  // 2. system_code 컬럼 확인 (P0 시스템 코드 마이그레이션)
  try {
    const [cols]: any = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'accounting_accounts'
         AND COLUMN_NAME = 'system_code'`
    );
    if ((cols as any[]).length === 0) {
      await conn.query(
        `ALTER TABLE accounting_accounts
         ADD COLUMN system_code VARCHAR(50) NULL AFTER code,
         ADD INDEX idx_system_code (tenant_id, system_code)`
      );
      console.log("[Migration] accounting_accounts: system_code column added");
    }
  } catch (err: any) {
    if (err.code !== "ER_NO_SUCH_TABLE") {
      console.warn("[Migration] accounting_accounts system_code ALTER failed:", err.message);
    }
  }
}

/**
 * accounting_purchases / accounting_sales 테이블에 Drizzle schema 추가 컬럼 ensure
 * ★ 2026-04-15: scripts/migrate-add-material-id-to-purchases.ts 수동 실행 대신
 *   서버 시작 시 자동 보장. 컬럼 부재 시 createPurchase INSERT 가 실패하여
 *   입고 확정 전체 실패하는 문제 방지.
 *
 * Drizzle 에 정의되어 있지만 실제 DB 에 누락 가능한 컬럼:
 *   accounting_purchases:
 *     - material_id BIGINT NULL (2026-04-13 추가)
 *     - account_category_id INT NULL
 *     - posted_at/posted_by/canceled_at/canceled_by (확정/취소 메타)
 *     - evidence_type, evidence_number, source_type, source_id
 *   accounting_sales:
 *     - product_id BIGINT NULL (2026-04-14 추가)
 *     - posted_at/posted_by/canceled_at/canceled_by
 *     - evidence_type, evidence_number, source_type, source_id
 */
async function ensureAccountingTransactionColumns(conn: any) {
  // 컬럼 존재 여부 확인 헬퍼
  const columnExists = async (table: string, column: string): Promise<boolean> => {
    try {
      const [rows]: any = await conn.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column],
      );
      return (rows as any[]).length > 0;
    } catch {
      return false;
    }
  };

  const addColumn = async (table: string, column: string, ddl: string): Promise<boolean> => {
    if (await columnExists(table, column)) return false;
    try {
      await conn.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      console.log(`[Migration] ${table}: added column '${column}'`);
      return true;
    } catch (err: any) {
      if (err.code !== "ER_NO_SUCH_TABLE") {
        console.warn(`[Migration] ${table} ALTER ADD '${column}' failed:`, err.message);
      }
      return false;
    }
  };

  // ─── accounting_purchases ───
  await addColumn("accounting_purchases", "material_id", "material_id BIGINT NULL");
  await addColumn("accounting_purchases", "account_category_id", "account_category_id INT NULL");
  await addColumn("accounting_purchases", "evidence_type", "evidence_type ENUM('tax_invoice','receipt','statement','none') DEFAULT 'none'");
  await addColumn("accounting_purchases", "evidence_number", "evidence_number VARCHAR(100) NULL");
  await addColumn("accounting_purchases", "source_type", "source_type VARCHAR(50) NULL");
  await addColumn("accounting_purchases", "source_id", "source_id BIGINT NULL");
  await addColumn("accounting_purchases", "posted_at", "posted_at TIMESTAMP NULL");
  await addColumn("accounting_purchases", "posted_by", "posted_by BIGINT NULL");
  await addColumn("accounting_purchases", "canceled_at", "canceled_at TIMESTAMP NULL");
  await addColumn("accounting_purchases", "canceled_by", "canceled_by BIGINT NULL");

  // material_id 인덱스
  try {
    const [idxRows]: any = await conn.query(
      `SHOW INDEX FROM accounting_purchases WHERE Key_name = 'idx_purchases_material_id'`,
    );
    if ((idxRows as any[]).length === 0) {
      if (await columnExists("accounting_purchases", "material_id")) {
        await conn.query(`ALTER TABLE accounting_purchases ADD INDEX idx_purchases_material_id (material_id)`);
        console.log(`[Migration] accounting_purchases: added index idx_purchases_material_id`);
      }
    }
  } catch (err: any) {
    if (err.code !== "ER_NO_SUCH_TABLE") {
      console.warn(`[Migration] accounting_purchases index failed:`, err.message);
    }
  }

  // ─── accounting_sales ───
  await addColumn("accounting_sales", "product_id", "product_id BIGINT NULL");
  await addColumn("accounting_sales", "evidence_type", "evidence_type ENUM('tax_invoice','receipt','statement','none') DEFAULT 'none'");
  await addColumn("accounting_sales", "evidence_number", "evidence_number VARCHAR(100) NULL");
  await addColumn("accounting_sales", "source_type", "source_type VARCHAR(50) NULL");
  await addColumn("accounting_sales", "source_id", "source_id BIGINT NULL");
  await addColumn("accounting_sales", "posted_at", "posted_at TIMESTAMP NULL");
  await addColumn("accounting_sales", "posted_by", "posted_by BIGINT NULL");
  await addColumn("accounting_sales", "canceled_at", "canceled_at TIMESTAMP NULL");
  await addColumn("accounting_sales", "canceled_by", "canceled_by BIGINT NULL");

  // product_id 인덱스
  try {
    const [idxRows]: any = await conn.query(
      `SHOW INDEX FROM accounting_sales WHERE Key_name = 'idx_sales_product_id'`,
    );
    if ((idxRows as any[]).length === 0) {
      if (await columnExists("accounting_sales", "product_id")) {
        await conn.query(`ALTER TABLE accounting_sales ADD INDEX idx_sales_product_id (product_id)`);
        console.log(`[Migration] accounting_sales: added index idx_sales_product_id`);
      }
    }
  } catch (err: any) {
    if (err.code !== "ER_NO_SUCH_TABLE") {
      console.warn(`[Migration] accounting_sales index failed:`, err.message);
    }
  }
}

/**
 * 승인/보고서/체크리스트 관련 테이블 확보
 * ★ 2026-04-15: CCP-4P + 일일일지 + 주간일지 AR 미생성 문제의 근본 방지
 *
 * 관련 테이블:
 *   - h_approval_requests (모든 AR 의 중심)
 *   - h_document_approval_settings (작성자/검토자/승인자 설정)
 *   - h_daily_reports (일일 보고서 요약)
 *   - h_generic_checklist_records (일일일지 체크리스트)
 *   - h_holidays (주간/월간 일지 휴무 계산)
 */
async function ensureWorkflowTables(conn: any) {
  const tables: Array<{ name: string; sql: string }> = [
    {
      name: "h_approval_requests",
      sql: `CREATE TABLE IF NOT EXISTS h_approval_requests (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        site_id BIGINT NOT NULL,
        request_type VARCHAR(50) NOT NULL,
        reference_type VARCHAR(50) NULL,
        reference_id BIGINT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        status ENUM('pending_review','pending_approval','pending','approved','rejected','cancelled') DEFAULT 'pending_review',
        priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
        requested_by BIGINT NOT NULL,
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        reviewed_by BIGINT NULL,
        reviewed_at TIMESTAMP NULL,
        review_comments TEXT,
        approved_by BIGINT NULL,
        approved_at TIMESTAMP NULL,
        rejected_by BIGINT NULL,
        rejected_at TIMESTAMP NULL,
        rejection_reason TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_ar_tenant_status (tenant_id, status),
        INDEX idx_ar_tenant_type (tenant_id, request_type),
        INDEX idx_ar_reference (reference_type, reference_id),
        INDEX idx_ar_requested_at (requested_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_document_approval_settings",
      sql: `CREATE TABLE IF NOT EXISTS h_document_approval_settings (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        document_type VARCHAR(100) NOT NULL,
        document_type_name VARCHAR(255) NOT NULL,
        author_employee_id BIGINT NULL,
        reviewer_employee_id BIGINT NULL,
        approver_employee_id BIGINT NULL,
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_das_tenant_type (tenant_id, document_type),
        INDEX idx_das_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_daily_reports",
      sql: `CREATE TABLE IF NOT EXISTS h_daily_reports (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        site_id BIGINT NOT NULL,
        report_date DATE NOT NULL,
        report_type VARCHAR(50),
        summary TEXT,
        pdf_url VARCHAR(500),
        generated_by BIGINT NULL,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_dr_tenant_date (tenant_id, report_date),
        INDEX idx_dr_tenant_type (tenant_id, report_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_generic_checklist_records",
      sql: `CREATE TABLE IF NOT EXISTS h_generic_checklist_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_id INT NOT NULL,
        tenant_id INT NOT NULL DEFAULT 1,
        form_type VARCHAR(100) NOT NULL,
        tenant_seq INT NULL,
        form_date VARCHAR(20) NOT NULL,
        title VARCHAR(500),
        form_data JSON,
        status ENUM('draft','submitted','approved','rejected') DEFAULT 'draft',
        created_by INT NULL,
        updated_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_gcr_tenant_type (tenant_id, form_type),
        INDEX idx_gcr_tenant_date (tenant_id, form_date),
        INDEX idx_gcr_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_holidays",
      sql: `CREATE TABLE IF NOT EXISTS h_holidays (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        site_id BIGINT NULL,
        holiday_date DATE NOT NULL,
        holiday_name VARCHAR(100),
        holiday_type ENUM('national','company','weekend') DEFAULT 'national',
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        INDEX idx_holidays_tenant_date (tenant_id, holiday_date),
        UNIQUE KEY uk_holidays_tenant_date (tenant_id, holiday_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
  ];

  let created = 0;
  for (const t of tables) {
    try {
      await conn.query(t.sql);
      const [rows] = await conn.query(
        `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
        [t.name],
      );
      if ((rows as any[])[0]?.cnt > 0) created++;
    } catch (err: any) {
      console.warn(`[Migration] workflow table '${t.name}' ensure failed:`, err.message);
    }
  }
  console.log(`[Migration] Workflow tables verified: ${created}/${tables.length} exist`);
}

/**
 * Startup 스모크 테스트 — ensure 된 테이블에 실제 접근 가능한지 검증
 * ★ 2026-04-15: ensure 가 성공했다고 보고해도 권한/네트워크 이슈로 실제
 *   SELECT 가 실패할 수 있음. 서버 로그에 한 줄로 요약 출력하여
 *   운영 중 누락 감지 가능.
 */
async function runSmokeTest(conn: any) {
  const criticalTables = [
    // 기본 인프라
    "tenants", "users", "partners",
    // 문서 파이프라인
    "document_types", "document_instances",
    // 인증/권한
    "h_employees", "h_user_favorites",
    // 회계 계정
    "accounting_accounts", "account_categories",
    // 배치 파이프라인
    "h_batches", "h_ccp_instances", "h_ccp_form_records",
    // AI
    "ai_chat_history", "ai_alerts",
    // 재고/매입 (createPurchase 가 의존 — 없으면 입고 확정 실패)
    // ★ 2026-04-15: 이 테이블들은 ensure 하지 않음 (Drizzle 스키마와 정확히 일치 안 할 리스크)
    //   smoke test 로만 감지 → 실패 시 PM2 로그에 노출되어 운영자가 수동 복구
    "h_inventory_lots", "h_material_inspections", "h_stock_alerts",
    "material_ledger_daily", "categories",
  ];

  const results: Array<{ table: string; ok: boolean; error?: string }> = [];
  for (const table of criticalTables) {
    try {
      await conn.query(`SELECT 1 FROM ${table} LIMIT 1`);
      results.push({ table, ok: true });
    } catch (err: any) {
      results.push({ table, ok: false, error: err?.message || String(err) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  const okCount = results.length - failed.length;
  console.log(`[SmokeTest] ${okCount}/${results.length} critical tables accessible`);
  if (failed.length > 0) {
    console.error(
      `[SmokeTest] 🚨 ${failed.length}개 테이블 접근 실패:`,
      failed.map((f) => `${f.table}(${f.error?.substring(0, 50) ?? "?"})`).join(" | "),
    );
  }
  return { okCount, total: results.length, failed };
}

/**
 * ★ 2026-04-16: 오늘의 5분 HACCP (Daily Micro Training) 테이블 + 120일 시드 데이터
 *   DB 손실 복구 후 h_training_topics / h_training_logs / h_training_assignments /
 *   h_training_levels / h_training_monthly_reports 누락 이슈 해결
 */
async function ensureDailyTrainingTables(conn: any) {
  const tables: Array<{ name: string; sql: string }> = [
    {
      name: "h_training_topics",
      sql: `CREATE TABLE IF NOT EXISTS h_training_topics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        day_no INT NOT NULL,
        title VARCHAR(100) NOT NULL,
        question TEXT NOT NULL,
        content TEXT NOT NULL,
        action TEXT NOT NULL,
        category ENUM('BASIC','HYGIENE','PROCESS','CCP','TRACE','RESPONSE') NOT NULL DEFAULT 'BASIC',
        tenant_id INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_dayno_tenant (day_no, tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_training_logs",
      sql: `CREATE TABLE IF NOT EXISTS h_training_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        day_no INT NOT NULL,
        assignment_date DATE NOT NULL,
        status ENUM('DONE','SKIPPED') NOT NULL DEFAULT 'DONE',
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tenant_id INT NOT NULL,
        UNIQUE KEY uq_user_day (user_id, day_no, assignment_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_training_assignments",
      sql: `CREATE TABLE IF NOT EXISTS h_training_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        assignment_date DATE NOT NULL,
        day_no INT NOT NULL,
        tenant_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_date_tenant (assignment_date, tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_training_levels",
      sql: `CREATE TABLE IF NOT EXISTS h_training_levels (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        tenant_id INT NOT NULL,
        score INT NOT NULL DEFAULT 0,
        streak INT NOT NULL DEFAULT 0,
        max_streak INT NOT NULL DEFAULT 0,
        level INT NOT NULL DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_tenant (user_id, tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "h_training_monthly_reports",
      sql: `CREATE TABLE IF NOT EXISTS h_training_monthly_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        year INT NOT NULL,
        month INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        total_days INT NOT NULL DEFAULT 0,
        total_users INT NOT NULL DEFAULT 0,
        total_done INT NOT NULL DEFAULT 0,
        overall_rate INT NOT NULL DEFAULT 0,
        status ENUM('draft','pending','reviewed','approved','rejected') NOT NULL DEFAULT 'draft',
        approval_id INT NULL,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tenant_year_month (tenant_id, year, month)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
  ];

  let created = 0;
  for (const t of tables) {
    try {
      const [rows] = await conn.execute(
        `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [t.name],
      );
      if (rows.length === 0) {
        await conn.execute(t.sql);
        created++;
        console.log(`[Migration] Created table: ${t.name}`);
      }
    } catch (e: any) {
      console.error(`[Migration] Failed to ensure ${t.name}:`, e.message);
    }
  }

  // ── 120일 시드 데이터 삽입 (h_training_topics가 비어있을 때만) ──
  try {
    const [existing] = await conn.execute("SELECT COUNT(*) as cnt FROM h_training_topics WHERE tenant_id = 0");
    if (existing[0].cnt < 120) {
      // 기존 시스템 데이터 삭제 후 재삽입
      await conn.execute("DELETE FROM h_training_topics WHERE tenant_id = 0");
      const topics: [number, string, string, string, string, string][] = [
        [1,"HACCP이란","HACCP은 왜 필요한가?","HACCP은 식품의 위해를 사전에 예방하기 위한 관리 체계이다","오늘 내가 만드는 제품이 고객에게 간다는 점 기억하기","BASIC"],
        [2,"식품사고의 시작","식품사고는 왜 발생할까?","대부분의 사고는 위생, 온도, 시간, 기록 관리 실패에서 시작된다","작업 전 오늘의 위험 요소 한 가지 떠올리기","BASIC"],
        [3,"위해요소 3가지","위해요소는 무엇일까?","위해요소는 생물학적, 화학적, 물리적 위해로 구분된다","내 작업에서 발생 가능한 위해 1가지 생각하기","BASIC"],
        [4,"교차오염","교차오염은 어떻게 생길까?","오염된 손, 도구, 작업대, 원료를 통해 오염이 다른 곳으로 이동한다","작업 시작 전 손과 작업도구 상태 확인하기","BASIC"],
        [5,"온도의 의미","왜 온도를 관리해야 할까?","부적절한 온도는 세균 증식을 빠르게 만든다","냉장 또는 가열 설비의 표시 온도 확인하기","BASIC"],
        [6,"시간의 의미","왜 시간을 관리해야 할까?","식품이 위험 구간에 오래 머물수록 위해 가능성이 커진다","작업 지연 요소를 줄이기","BASIC"],
        [7,"기록의 가치","기록은 왜 중요한가?","기록은 했다는 말이 아니라 실제 관리의 증거다","오늘 해야 할 기록이 무엇인지 먼저 확인하기","BASIC"],
        [8,"기준 준수","기준은 왜 정해져 있을까?","기준은 안전성을 확보하기 위한 최소 조건이다","임의 판단 대신 기준대로 작업하기","BASIC"],
        [9,"작업자의 역할","작업자가 중요한 이유는?","현장에서 실제 위해를 막는 사람은 작업자다","내 공정에서 내가 지키는 기준 1개 떠올리기","BASIC"],
        [10,"작은 실수의 위험","작은 실수도 문제가 될까?","사소한 누락 하나가 큰 품질 문제나 사고로 이어질 수 있다","익숙한 작업일수록 다시 한번 확인하기","BASIC"],
        [11,"고객 관점","고객은 무엇을 기대할까?","고객은 맛뿐 아니라 안전한 제품을 기대한다","오늘 만드는 제품을 가족이 먹는다고 생각하기","BASIC"],
        [12,"위생의 시작점","위생은 어디서 시작될까?","위생은 설비보다 먼저 사람의 습관에서 시작된다","작업 전 개인위생 먼저 점검하기","BASIC"],
        [13,"눈에 안 보이는 위험","깨끗해 보이면 안전할까?","미생물과 일부 위해요소는 눈에 보이지 않아도 존재한다","보이는 것만 믿지 말고 기준대로 행동하기","BASIC"],
        [14,"SOP의 의미","작업표준은 왜 필요할까?","같은 방법으로 작업해야 품질과 안전이 유지된다","내 작업 순서를 SOP와 비교해보기","BASIC"],
        [15,"반복의 힘","왜 반복 교육이 필요할까?","안전은 한 번의 이해보다 반복된 실천으로 만들어진다","오늘 교육 내용을 한 번 더 떠올리기","BASIC"],
        [16,"준비 작업","준비 작업이 중요한 이유는?","준비가 부족하면 작업 중 실수와 오염 가능성이 커진다","작업 전 필요한 도구와 원료를 미리 확인하기","BASIC"],
        [17,"집중력","작업 중 왜 집중해야 할까?","방심은 오기록, 누락, 오염으로 이어질 수 있다","잠깐 멈추고 지금 하는 작업 다시 확인하기","BASIC"],
        [18,"팀의 중요성","HACCP은 혼자 하는 것일까?","한 사람의 실수도 팀 전체의 위험이 된다","이상이 보이면 바로 공유하기","BASIC"],
        [19,"책임감","책임감이 왜 중요할까?","책임감 있는 행동이 품질과 신뢰를 만든다","오늘 내 작업 결과를 끝까지 확인하기","BASIC"],
        [20,"하루 마무리","왜 마무리 점검이 필요할까?","마지막 정리와 확인이 다음 작업의 안전을 만든다","작업 종료 전 정리 상태 확인하기","BASIC"],
        [21,"손 씻기 기본","손은 왜 중요한 오염원일까?","손은 가장 자주 움직이며 가장 많은 오염을 옮기는 부위다","작업 전 30초 손 씻기 실천하기","HYGIENE"],
        [22,"손 씻기 타이밍","언제 손을 씻어야 할까?","작업 전, 화장실 후, 오염 접촉 후에는 반드시 손을 씻어야 한다","오늘 손 씻기 타이밍 놓치지 않기","HYGIENE"],
        [23,"장갑의 오해","장갑만 끼면 안전할까?","오염된 손에 장갑을 끼면 장갑도 오염원이다","장갑 착용 전 손 씻기 하기","HYGIENE"],
        [24,"장갑 교체","장갑은 언제 교체해야 할까?","오염되었거나 다른 작업으로 전환할 때 즉시 교체해야 한다","장갑 상태 자주 확인하기","HYGIENE"],
        [25,"작업복 관리","작업복은 왜 청결해야 할까?","작업복은 외부 오염이 작업장 안으로 들어오는 경로가 될 수 있다","작업복 청결 상태 확인하기","HYGIENE"],
        [26,"마스크 착용","마스크는 왜 필요할까?","비말이 제품이나 작업면에 닿는 것을 줄여준다","작업 중 마스크 올바르게 착용하기","HYGIENE"],
        [27,"위생모 착용","머리카락은 왜 위험할까?","머리카락은 대표적인 이물이며 위생 신뢰를 떨어뜨린다","위생모 착용 상태 점검하기","HYGIENE"],
        [28,"손톱 관리","손톱은 왜 짧아야 할까?","긴 손톱은 오염물과 세균이 남기 쉽다","손톱 상태 확인하기","HYGIENE"],
        [29,"악세서리 금지","악세서리는 왜 안 될까?","이물 혼입과 세척 불량의 원인이 된다","반지, 팔찌, 시계 착용 금지 지키기","HYGIENE"],
        [30,"출입 전 점검","작업장 들어가기 전 무엇을 봐야 할까?","개인위생 상태를 먼저 확인해야 오염 유입을 줄일 수 있다","출입 전 복장과 손 상태 확인하기","HYGIENE"],
        [31,"화장실 후 위생","화장실 후 왜 더 조심해야 할까?","손 오염 가능성이 높아 반드시 재정비가 필요하다","화장실 후 손 씻기와 복장 재점검하기","HYGIENE"],
        [32,"기침과 재채기","기침이나 재채기는 어떻게 해야 할까?","비말은 쉽게 주변을 오염시킬 수 있다","작업 중 이상 시 즉시 가리고 정리하기","HYGIENE"],
        [33,"상처 관리","손 상처가 있으면 왜 위험할까?","상처는 미생물 오염 가능성을 높인다","상처 보호 후 작업 여부 확인하기","HYGIENE"],
        [34,"몸 상태 보고","몸이 좋지 않으면 왜 알려야 할까?","개인 건강 상태는 제품 안전과 연결될 수 있다","이상 증상 있으면 즉시 보고하기","HYGIENE"],
        [35,"음식물 반입 금지","작업장에 음식물을 가져오면 왜 안 될까?","외부 음식은 오염원과 해충 유인 요소가 될 수 있다","작업장 내 음식물 반입 금지 지키기","HYGIENE"],
        [36,"개인 소지품 관리","개인 물건은 왜 구분해야 할까?","불필요한 물건은 오염과 혼입 위험을 높인다","개인 소지품 지정 장소에 두기","HYGIENE"],
        [37,"눈에 보이는 오염","보이는 오염은 어떻게 해야 할까?","즉시 제거하지 않으면 2차 오염으로 이어질 수 있다","작업대와 바닥 상태 즉시 정리하기","HYGIENE"],
        [38,"눈에 안 보이는 오염","보이지 않는 오염은 어떻게 막을까?","습관과 기준 준수가 가장 확실한 예방 방법이다","SOP대로 행동하기","HYGIENE"],
        [39,"위생 점검 습관","왜 매일 점검해야 할까?","위생은 한 번이 아니라 매일 유지해야 의미가 있다","오늘 내 위생상태 스스로 체크하기","HYGIENE"],
        [40,"개인위생의 책임","개인위생은 누구 책임일까?","각자의 개인위생 수준이 전체 품질 수준이 된다","내 행동이 팀 품질을 만든다는 점 기억하기","HYGIENE"],
        [41,"공정 흐름 이해","전체 공정을 왜 알아야 할까?","앞뒤 공정을 알아야 위험 지점과 연결관계를 이해할 수 있다","오늘 공정 흐름을 처음부터 끝까지 떠올리기","PROCESS"],
        [42,"원료 입고 확인","원료 입고 시 무엇을 봐야 할까?","상태, 온도, 포장, 표시사항 확인이 중요하다","입고 원료 상태를 꼼꼼히 보기","PROCESS"],
        [43,"원료 보관","보관이 왜 중요할까?","좋은 원료도 잘못 보관하면 품질이 떨어진다","원료 보관 위치와 조건 확인하기","PROCESS"],
        [44,"해동 관리","해동은 왜 조심해야 할까?","잘못된 해동은 미생물 증식과 품질 저하를 유발한다","정해진 해동 기준 지키기","PROCESS"],
        [45,"세척의 목적","세척은 무엇을 위한 것일까?","오염과 잔여물을 제거해 다음 공정을 안전하게 한다","세척 후 잔여물 남지 않았는지 보기","PROCESS"],
        [46,"칭량의 정확성","왜 정확히 계량해야 할까?","배합 오류는 품질 문제와 공정 이상으로 이어진다","계량값 다시 확인하기","PROCESS"],
        [47,"혼합 공정","혼합 시 무엇이 중요할까?","균일성과 위생, 순서 준수가 중요하다","혼합 순서와 시간 지키기","PROCESS"],
        [48,"가열 공정","가열은 왜 핵심일까?","가열은 위해를 줄이는 매우 중요한 단계다","설정 온도와 시간을 확인하기","PROCESS"],
        [49,"냉각 공정","냉각은 왜 빨라야 할까?","가열 후 적절히 냉각하지 않으면 위해가 다시 커질 수 있다","냉각 지연 없도록 하기","PROCESS"],
        [50,"포장 공정","포장은 왜 중요할까?","최종 단계에서 이물과 오염을 막는 역할을 한다","포장 전 작업면 청결 확인하기","PROCESS"],
        [51,"출고 전 점검","출고 전에 왜 확인해야 할까?","마지막 확인이 불량 출고를 막는다","출고 전 상태와 표시 확인하기","PROCESS"],
        [52,"공정 순서","순서를 바꾸면 왜 위험할까?","순서가 바뀌면 위해관리와 품질 균형이 깨질 수 있다","정해진 공정 순서 지키기","PROCESS"],
        [53,"작업 지연","지연은 왜 문제가 될까?","지연은 품질 저하와 시간-온도 위험을 만든다","지연 원인 발견 시 바로 공유하기","PROCESS"],
        [54,"설비 확인","설비 상태를 왜 봐야 할까?","설비 이상은 제품 이상으로 바로 이어질 수 있다","작업 전 설비 이상 유무 확인하기","PROCESS"],
        [55,"작업 전 세팅","세팅이 중요한 이유는?","시작이 정확해야 중간 실수와 재작업이 줄어든다","오늘 사용할 설비 세팅값 점검하기","PROCESS"],
        [56,"작업 중 확인","작업 중에도 왜 확인해야 할까?","시작만 맞고 중간에 흐트러지면 문제가 생긴다","중간 점검 1회 이상 하기","PROCESS"],
        [57,"공정별 위험","공정마다 위험이 같을까?","각 공정은 다른 위험요소를 가진다","내 공정의 대표 위험 1가지 떠올리기","PROCESS"],
        [58,"원료와 완제품 분리","왜 구분해야 할까?","혼재는 교차오염과 관리 실패를 초래한다","구역과 용기 구분 지키기","PROCESS"],
        [59,"청소와 생산의 관계","청소가 왜 공정 품질과 연결될까?","청소 상태가 불량하면 다음 생산이 위험해진다","작업 후 즉시 정리하기","PROCESS"],
        [60,"공정 이해 점검","공정을 이해하면 무엇이 좋아질까?","이상을 빨리 발견하고 대응할 수 있다","오늘 공정에서 이상 신호 1개 떠올리기","PROCESS"],
        [61,"CCP의 의미","CCP는 무엇일까?","위해를 예방하거나 제거하거나 허용수준으로 낮추는 핵심 관리점이다","내 작업 중 CCP가 어디인지 생각하기","CCP"],
        [62,"왜 CCP가 중요한가","일반 점검과 무엇이 다를까?","CCP는 놓치면 바로 위해로 이어질 가능성이 큰 항목이다","CCP 항목을 우선적으로 확인하기","CCP"],
        [63,"한계기준","한계기준은 왜 필요한가?","합격과 불합격을 판단하는 명확한 기준이기 때문이다","측정값이 기준 안에 있는지 확인하기","CCP"],
        [64,"모니터링","CCP 모니터링은 왜 할까?","기준 이탈을 즉시 발견하기 위해서다","측정 시점 놓치지 않기","CCP"],
        [65,"온도 CCP","온도는 왜 자주 CCP가 될까?","위해 미생물 제어와 직접 연결되기 때문이다","온도 측정값 기록하기","CCP"],
        [66,"시간 CCP","시간도 왜 중요할까?","같은 온도라도 시간이 부족하면 위해가 남을 수 있다","설정 시간 준수하기","CCP"],
        [67,"금속검출","금속검출기는 왜 중요할까?","물리적 위해를 최종 단계에서 차단하는 데 도움을 준다","점검 절차 확인하기","CCP"],
        [68,"금속검출 테스트","테스트는 왜 해야 할까?","설비가 실제로 정상 작동하는지 확인하는 과정이다","시작 전 테스트 여부 확인하기","CCP"],
        [69,"측정 정확성","측정이 부정확하면 어떤 문제가 생길까?","잘못된 측정은 잘못된 안전 판단으로 이어진다","측정 방법 정확히 지키기","CCP"],
        [70,"기록 누락","CCP 기록이 빠지면 괜찮을까?","기록이 없으면 관리한 증거도 없어진다","측정 후 즉시 기록하기","CCP"],
        [71,"이탈의 의미","기준을 벗어나면 왜 심각할까?","위해 통제가 실패했을 가능성을 의미한다","이탈 발견 즉시 보고하기","CCP"],
        [72,"시정조치","이탈 시 왜 바로 조치해야 할까?","늦은 대응은 위해 확산 가능성을 높인다","문제 발견 즉시 조치 따르기","CCP"],
        [73,"재측정의 필요","한 번 더 확인하는 이유는?","오측정인지 실제 이탈인지 구분할 필요가 있다","이상값 발견 시 재확인하기","CCP"],
        [74,"설비 교정","교정은 왜 필요할까?","장비가 맞지 않으면 모든 기록이 흔들린다","사용하는 장비 교정 상태 확인하기","CCP"],
        [75,"CCP 책임","CCP는 누가 책임질까?","담당자뿐 아니라 관련 작업자 모두의 관심이 필요하다","내 역할 범위 안에서 적극 확인하기","CCP"],
        [76,"일반관리와 CCP 차이","둘은 어떻게 다를까?","모든 관리가 중요하지만 CCP는 위해 통제의 핵심 지점이다","CCP를 우선 인지하기","CCP"],
        [77,"가열 CCP 이해","가열 기준이 왜 중요할까?","충분한 가열은 위해 감소의 핵심이다","설정값과 실제값 비교하기","CCP"],
        [78,"냉각 CCP 이해","냉각 기준은 왜 중요할까?","냉각 지연은 위해 증가로 이어질 수 있다","냉각 상태 확인하기","CCP"],
        [79,"CCP 습관화","CCP 관리는 어떻게 잘할 수 있을까?","반복과 즉시 기록 습관이 가장 중요하다","측정 즉시 기록 습관 만들기","CCP"],
        [80,"CCP 마무리 점검","오늘 CCP에서 가장 중요한 것은?","기준, 측정, 기록, 보고가 모두 연결돼야 한다","오늘 기록 누락 없는지 보기","CCP"],
        [81,"LOT의 의미","LOT는 왜 필요할까?","같은 생산 단위를 구분해 추적하기 위해 필요하다","오늘 사용하는 LOT 확인하기","TRACE"],
        [82,"LOT 추적","LOT를 추적하면 무엇이 좋을까?","문제가 생겼을 때 원인과 범위를 빠르게 찾을 수 있다","사용 원료 LOT 기억하기","TRACE"],
        [83,"원료 LOT 확인","왜 원료 LOT를 확인해야 할까?","어떤 원료가 어떤 제품에 쓰였는지 연결돼야 한다","투입 전 원료 LOT 확인하기","TRACE"],
        [84,"완제품 LOT","완제품 LOT는 왜 중요할까?","출고 이후 문제 발생 시 회수 범위를 정하는 기준이 된다","완제품 표기 상태 확인하기","TRACE"],
        [85,"원료수불 개념","원료수불은 왜 관리할까?","들어온 양과 사용한 양이 맞아야 관리 신뢰가 생긴다","사용량 기록 꼼꼼히 하기","TRACE"],
        [86,"입고와 사용 연결","입고 기록과 사용 기록은 왜 연결돼야 할까?","재고, 원가, 추적이 모두 이 연결에 달려 있다","사용한 원료 기록 빠짐없이 남기기","TRACE"],
        [87,"재고 정확성","재고가 왜 정확해야 할까?","재고 불일치는 관리 오류나 누락을 의미할 수 있다","실물과 기록이 맞는지 생각하기","TRACE"],
        [88,"선입선출","왜 먼저 들어온 것을 먼저 써야 할까?","보관기간과 품질 저하 위험을 줄이는 기본 원칙이다","먼저 들어온 원료부터 사용하기","TRACE"],
        [89,"FEFO 개념","유통기한이 빠른 것을 먼저 쓰는 이유는?","폐기와 품질 저하를 줄이기 위해서다","표시된 기한 먼저 확인하기","TRACE"],
        [90,"혼입 방지","원료 혼입은 왜 위험할까?","다른 LOT나 다른 품목이 섞이면 추적이 어려워진다","원료 용기와 표기 다시 확인하기","TRACE"],
        [91,"잘못된 LOT 사용","잘못된 LOT를 쓰면 어떤 문제가 생길까?","추적 오류와 품질 문제를 동시에 만든다","투입 전 품목과 LOT 대조하기","TRACE"],
        [92,"반품 관리","반품도 추적이 필요할까?","반품 제품은 상태 확인과 이력 구분이 필요하다","반품품은 일반 재고와 구분하기","TRACE"],
        [93,"폐기 기록","왜 폐기를 기록해야 할까?","재고 정확성과 원인 분석을 위해 필요하다","폐기 발생 시 즉시 기록하기","TRACE"],
        [94,"이력의 연결","입고-생산-출고가 왜 이어져야 할까?","그래야 전체 흐름이 보이고 문제 대응이 빨라진다","오늘 흐름을 한 번 연결해서 생각하기","TRACE"],
        [95,"데이터의 힘","데이터는 왜 중요한가?","데이터가 있어야 말이 아니라 근거로 설명할 수 있다","기록을 사실대로 남기기","TRACE"],
        [96,"시스템 입력","시스템 입력이 왜 중요할까?","누락 없는 입력이 추적성과 관리 품질을 만든다","입력 전후 한 번 더 확인하기","TRACE"],
        [97,"실수 예방","추적 오류는 어떻게 줄일까?","확인, 대조, 즉시 기록이 가장 효과적이다","투입 전 2초 대조하기","TRACE"],
        [98,"회수 대응","추적이 잘 되면 회수는 어떻게 달라질까?","필요한 범위만 빠르게 대응할 수 있다","LOT 관리의 이유 기억하기","TRACE"],
        [99,"추적 훈련","왜 평소에 추적을 연습해야 할까?","실제 문제 상황에서 빠르게 대응할 수 있다","오늘 제품의 원료 흐름 떠올리기","TRACE"],
        [100,"LOT 마무리","LOT 관리의 핵심은 무엇일까?","정확한 표기와 즉시 기록, 혼입 방지가 핵심이다","오늘 사용한 LOT 누락 없는지 확인하기","TRACE"],
        [101,"이상 발생 인지","이상이 생기면 먼저 무엇을 해야 할까?","빠른 인지와 보고가 피해 확대를 줄인다","이상 발견 시 바로 알리기","RESPONSE"],
        [102,"이탈의 판단","무엇을 이탈이라고 할까?","기준을 벗어난 상태나 절차 미준수는 모두 이탈이 될 수 있다","애매하면 그냥 넘기지 말고 질문하기","RESPONSE"],
        [103,"시정조치의 의미","시정조치는 왜 필요할까?","문제를 바로잡고 추가 피해를 막기 위해 필요하다","문제 발생 시 절차대로 조치하기","RESPONSE"],
        [104,"재발방지","왜 원인까지 봐야 할까?","같은 문제가 반복되지 않게 해야 진짜 개선이다","문제 후 원인 한 가지 생각하기","RESPONSE"],
        [105,"보고 체계","왜 보고가 중요할까?","혼자 판단하면 놓치는 부분이 생길 수 있다","문제는 즉시 상급자에게 보고하기","RESPONSE"],
        [106,"격리의 필요","문제 제품은 왜 격리해야 할까?","정상 제품과 섞이면 범위가 커진다","이상 제품 구분 표시하기","RESPONSE"],
        [107,"보류 판단","바로 사용하거나 출고하면 안 되는 이유는?","확인 전 사용은 위험 확산으로 이어질 수 있다","의심 품목은 보류 처리하기","RESPONSE"],
        [108,"클레임의 의미","고객 불만은 왜 중요할까?","현장의 문제를 알려주는 중요한 신호일 수 있다","클레임 내용을 가볍게 넘기지 않기","RESPONSE"],
        [109,"내부 점검","왜 내부에서 먼저 확인해야 할까?","작은 문제를 초기에 잡으면 큰 사고를 막을 수 있다","오늘 작업 중 이상징후 1개 찾기","RESPONSE"],
        [110,"외부 감사","감사는 왜 받는 걸까?","기준이 실제로 지켜지는지 확인받는 과정이다","평소처럼 기준대로 행동하기","RESPONSE"],
        [111,"질문 대응","감사 질문에 어떻게 답해야 할까?","추측보다 사실과 기록 중심으로 답해야 한다","모르면 기록을 확인하고 말하기","RESPONSE"],
        [112,"기록 검증","기록을 다시 보는 이유는?","누락, 오류, 모순을 사전에 줄일 수 있다","작성 후 1번 더 읽기","RESPONSE"],
        [113,"설비 이상 대응","설비가 이상하면 왜 즉시 알려야 할까?","설비 이상은 제품 이상으로 빠르게 이어질 수 있다","이상 소리나 수치 있으면 보고하기","RESPONSE"],
        [114,"위생 이상 대응","위생 문제가 보이면 어떻게 해야 할까?","눈에 보이는 오염은 바로 조치해야 한다","발견 즉시 정리하고 알리기","RESPONSE"],
        [115,"CCP 이탈 대응","CCP 기준을 벗어나면 어떻게 할까?","즉시 보고, 재확인, 시정조치가 필요하다","이탈 시 혼자 넘기지 않기","RESPONSE"],
        [116,"리콜 이해","리콜은 왜 준비가 필요할까?","실제 상황에서는 빠른 판단과 추적이 중요하다","LOT 관리가 리콜과 연결된다는 점 기억하기","RESPONSE"],
        [117,"팀 커뮤니케이션","왜 정확히 전달해야 할까?","잘못 전달되면 같은 실수가 반복된다","핵심만 짧고 분명하게 전달하기","RESPONSE"],
        [118,"인수인계","교대 시 왜 인수인계가 중요할까?","미완료 사항과 주의점을 공유해야 위험을 줄일 수 있다","다음 작업자에게 핵심 1가지만 꼭 전달하기","RESPONSE"],
        [119,"감사 준비 습관","감사는 특별한 날만 준비할까?","평소 관리가 곧 감사 준비다","오늘 기록과 현장 상태 정돈하기","RESPONSE"],
        [120,"전체 복습","120일 교육의 핵심은 무엇일까?","안전은 기준 준수, 즉시 기록, 빠른 보고, 책임 있는 행동에서 시작된다","오늘도 기준대로 끝까지 확인하기","RESPONSE"],
      ];

      const sql = "INSERT INTO h_training_topics (day_no, title, question, content, action, category, tenant_id) VALUES (?, ?, ?, ?, ?, ?, 0)";
      for (const [dayNo, title, question, content, action, category] of topics) {
        await conn.execute(sql, [dayNo, title, question, content, action, category]);
      }
      console.log(`[Migration] Daily training: seeded ${topics.length} topics`);
    }
  } catch (e: any) {
    console.error("[Migration] Daily training seed failed:", e.message);
  }

  const totalTables = tables.length;
  console.log(`[Migration] Daily training tables verified: ${totalTables}/${totalTables} exist${created > 0 ? ` (${created} created)` : ""}`);
}

/**
 * 고정자산 관리 테이블 ensure (ERP 강화 Phase 2-1)
 */
async function ensureFixedAssetTables(conn: any) {
  const tables = [
    {
      name: "fixed_assets",
      sql: `CREATE TABLE IF NOT EXISTS fixed_assets (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        asset_code VARCHAR(50) NOT NULL,
        asset_name VARCHAR(200) NOT NULL,
        category ENUM('building','machinery','vehicle','furniture','computer','other') NOT NULL DEFAULT 'other',
        acquisition_date DATE NOT NULL,
        acquisition_cost DECIMAL(15,2) NOT NULL,
        useful_life_months INT NOT NULL DEFAULT 60,
        depreciation_method ENUM('straight_line','declining_balance') NOT NULL DEFAULT 'straight_line',
        salvage_value DECIMAL(15,2) NOT NULL DEFAULT 0,
        accumulated_depreciation DECIMAL(15,2) NOT NULL DEFAULT 0,
        accounting_account_id BIGINT NULL,
        location VARCHAR(200),
        notes TEXT,
        status ENUM('active','disposed') NOT NULL DEFAULT 'active',
        disposal_date DATE NULL,
        disposal_amount DECIMAL(15,2) NULL,
        registered_by BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fa_tenant (tenant_id),
        INDEX idx_fa_status (tenant_id, status),
        UNIQUE KEY uq_fa_code (tenant_id, asset_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "fixed_asset_depreciation",
      sql: `CREATE TABLE IF NOT EXISTS fixed_asset_depreciation (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        asset_id BIGINT NOT NULL,
        \`year_month\` VARCHAR(7) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        accumulated_after DECIMAL(15,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_fad_tenant (tenant_id),
        UNIQUE KEY uq_fad_asset_month (tenant_id, asset_id, \`year_month\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
  ];

  for (const t of tables) {
    try {
      await conn.query(t.sql);
    } catch (err: any) {
      console.warn(`[Migration] fixed asset table '${t.name}' ensure failed:`, err.message);
    }
  }
  console.log("[Migration] Fixed asset tables verified");
}

/**
 * 인사관리 테이블 ensure (ERP 강화 Phase 3-2)
 */
async function ensureHRTables(conn: any) {
  const tables = [
    {
      name: "attendance_records",
      sql: `CREATE TABLE IF NOT EXISTS attendance_records (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        employee_id BIGINT NOT NULL,
        work_date DATE NOT NULL,
        clock_in VARCHAR(8),
        clock_out VARCHAR(8),
        work_hours DECIMAL(5,2) DEFAULT 0,
        status ENUM('present','late','absent','half_day','holiday') DEFAULT 'present',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_att (tenant_id, employee_id, work_date),
        INDEX idx_att_date (tenant_id, work_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "leave_requests",
      sql: `CREATE TABLE IF NOT EXISTS leave_requests (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        employee_id BIGINT NOT NULL,
        leave_type ENUM('annual','sick','personal','maternity','other') NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days INT NOT NULL DEFAULT 1,
        reason TEXT,
        status ENUM('pending','approved','rejected','cancelled') DEFAULT 'pending',
        approved_by BIGINT NULL,
        approved_at TIMESTAMP NULL,
        approval_comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_leave_tenant (tenant_id, employee_id),
        INDEX idx_leave_date (tenant_id, start_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: "leave_balances",
      sql: `CREATE TABLE IF NOT EXISTS leave_balances (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        employee_id BIGINT NOT NULL,
        year INT NOT NULL,
        annual_total INT NOT NULL DEFAULT 15,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_lb (tenant_id, employee_id, year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
  ];
  for (const t of tables) {
    try { await conn.query(t.sql); } catch (err: any) {
      console.warn(`[Migration] HR table '${t.name}' failed:`, err.message);
    }
  }
  console.log("[Migration] HR tables verified");
}

/**
 * 급여 관리 테이블 ensure (ERP 강화 Phase 3-1)
 */
async function ensurePayrollTable(conn: any) {
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS payroll_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      employee_id BIGINT NOT NULL,
      \`year_month\` VARCHAR(7) NOT NULL,
      base_salary DECIMAL(15,2) NOT NULL DEFAULT 0,
      overtime DECIMAL(15,2) NOT NULL DEFAULT 0,
      bonus DECIMAL(15,2) NOT NULL DEFAULT 0,
      allowances DECIMAL(15,2) NOT NULL DEFAULT 0,
      gross_pay DECIMAL(15,2) NOT NULL DEFAULT 0,
      national_pension DECIMAL(15,2) NOT NULL DEFAULT 0,
      health_insurance DECIMAL(15,2) NOT NULL DEFAULT 0,
      long_term_care DECIMAL(15,2) NOT NULL DEFAULT 0,
      employment_insurance DECIMAL(15,2) NOT NULL DEFAULT 0,
      income_tax DECIMAL(15,2) NOT NULL DEFAULT 0,
      local_income_tax DECIMAL(15,2) NOT NULL DEFAULT 0,
      total_deductions DECIMAL(15,2) NOT NULL DEFAULT 0,
      net_pay DECIMAL(15,2) NOT NULL DEFAULT 0,
      status ENUM('draft','paid','cancelled') NOT NULL DEFAULT 'draft',
      paid_at TIMESTAMP NULL,
      created_by BIGINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_payroll (tenant_id, employee_id, \`year_month\`),
      INDEX idx_payroll_tenant_month (tenant_id, \`year_month\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log("[Migration] Payroll table verified");
  } catch (err: any) {
    console.warn("[Migration] Payroll table ensure failed:", err.message);
  }
}

/**
 * 예산 관리 테이블 ensure (ERP 강화 Phase 2-2)
 */
async function ensureBudgetTable(conn: any) {
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS budgets (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      account_id BIGINT NOT NULL,
      year INT NOT NULL,
      m1 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m2 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m3 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m4 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m5 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m6 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m7 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m8 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m9 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m10 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m11 DECIMAL(15,2) NOT NULL DEFAULT 0,
      m12 DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_budget (tenant_id, account_id, year),
      INDEX idx_budget_tenant_year (tenant_id, year)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log("[Migration] Budget table verified");
  } catch (err: any) {
    console.warn("[Migration] Budget table ensure failed:", err.message);
  }
}

/**
 * 서버 시작 시 모든 자동 마이그레이션 실행
 */
/**
 * 성능 인덱스 ensure — 대형 테이블 쿼리 최적화
 */
async function ensurePerformanceIndexes(conn: any) {
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_ap_tenant_status ON accounting_purchases(tenant_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_ap_tenant_date ON accounting_purchases(tenant_id, transaction_date)",
    "CREATE INDEX IF NOT EXISTS idx_as_tenant_status ON accounting_sales(tenant_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_as_tenant_date ON accounting_sales(tenant_id, transaction_date)",
    "CREATE INDEX IF NOT EXISTS idx_ejl_tenant_entry ON expense_journal_lines(tenant_id, journal_entry_id)",
    "CREATE INDEX IF NOT EXISTS idx_eje_tenant_date ON expense_journal_entries(tenant_id, entry_date)",
    "CREATE INDEX IF NOT EXISTS idx_bt_tenant_date ON bank_transactions(tenant_id, transaction_date)",
    "CREATE INDEX IF NOT EXISTS idx_bt_tenant_match ON bank_transactions(tenant_id, matching_status)",
    "CREATE INDEX IF NOT EXISTS idx_att_tenant_date ON attendance_records(tenant_id, work_date)",
    "CREATE INDEX IF NOT EXISTS idx_lr_tenant_date ON leave_requests(tenant_id, start_date)",
  ];
  let created = 0;
  for (const sql of indexes) {
    try { await conn.query(sql); created++; } catch (_) {}
  }
  console.log(`[Migration] Performance indexes: ${created}/${indexes.length} verified`);
}

export async function runStartupMigrations() {
  try {
    const conn = await getRawConnection();
    console.log("[Migration] Running startup migrations...");

    await migratePartnersTable(conn);
    await ensureAITables(conn);
    await ensureAccountCategoriesTable(conn);
    await ensureAccountingAccountsColumns(conn);
    await ensureAccountingTransactionColumns(conn);
    await ensureDocumentApprovalTables(conn);
    await ensureAuthTables(conn);
    await ensureWorkflowTables(conn);
    await ensureDailyTrainingTables(conn);
    await ensureFixedAssetTables(conn);
    await ensureBudgetTable(conn);
    await ensurePayrollTable(conn);
    await ensureHRTables(conn);
    await ensurePerformanceIndexes(conn);

    console.log("[Migration] Startup migrations completed");

    // 스모크 테스트로 ensure 결과 검증
    await runSmokeTest(conn);
  } catch (err) {
    console.error("[Migration] Startup migrations failed:", err);
    // 마이그레이션 실패해도 서버는 계속 실행
  }
}
