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
 * 서버 시작 시 모든 자동 마이그레이션 실행
 */
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

    console.log("[Migration] Startup migrations completed");

    // 스모크 테스트로 ensure 결과 검증
    await runSmokeTest(conn);
  } catch (err) {
    console.error("[Migration] Startup migrations failed:", err);
    // 마이그레이션 실패해도 서버는 계속 실행
  }
}
