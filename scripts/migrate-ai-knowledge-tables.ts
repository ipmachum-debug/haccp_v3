/**
 * AI 지식베이스 테이블 마이그레이션 스크립트
 *
 * 생성 테이블:
 * 1. ai_knowledge_documents - 문서 관리
 * 2. ai_knowledge_chunks - 청크 + 벡터 임베딩
 *
 * 실행: npx tsx scripts/migrate-ai-knowledge-tables.ts
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM 호환 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파일 로드
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "haccp_v3",
    multipleStatements: true,
  });

  console.log("🔗 DB 연결 완료");

  try {
    // ============================================================
    // 1. ai_knowledge_documents - 지식베이스 문서
    // ============================================================
    console.log("📋 1/2 ai_knowledge_documents 테이블 생성...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        doc_type ENUM('regulation', 'standard', 'sop', 'manual', 'guideline', 'training', 'template', 'faq', 'internal', 'custom') NOT NULL,
        content LONGTEXT NOT NULL,
        source_url VARCHAR(1000),
        source_file VARCHAR(500),
        chunk_count INT DEFAULT 0,
        total_tokens INT DEFAULT 0,
        language VARCHAR(10) DEFAULT 'ko',
        status ENUM('uploaded', 'chunking', 'embedding', 'ready', 'error') NOT NULL DEFAULT 'uploaded',
        is_active TINYINT NOT NULL DEFAULT 1,
        is_global TINYINT NOT NULL DEFAULT 0,
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT NOW(),
        updated_at DATETIME NOT NULL DEFAULT NOW(),
        INDEX idx_ai_kb_docs_tenant (tenant_id),
        INDEX idx_ai_kb_docs_type (tenant_id, doc_type),
        INDEX idx_ai_kb_docs_status (status),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  ✅ ai_knowledge_documents 생성 완료");

    // ============================================================
    // 2. ai_knowledge_chunks - 청크 + 벡터 임베딩
    // ============================================================
    console.log("📋 2/2 ai_knowledge_chunks 테이블 생성...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        document_id BIGINT NOT NULL,
        chunk_index INT NOT NULL,
        content TEXT NOT NULL,
        token_count INT DEFAULT 0,
        embedding JSON,
        metadata JSON,
        created_at DATETIME NOT NULL DEFAULT NOW(),
        INDEX idx_ai_kb_chunks_tenant (tenant_id),
        INDEX idx_ai_kb_chunks_doc (document_id),
        INDEX idx_ai_kb_chunks_idx (document_id, chunk_index),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("  ✅ ai_knowledge_chunks 생성 완료");

    console.log("\n🎉 AI 지식베이스 테이블 마이그레이션 완료!");
    console.log("   - ai_knowledge_documents: 문서 관리 (법규, 기준서, SOP 등)");
    console.log("   - ai_knowledge_chunks: 청크 + 벡터 임베딩 (시맨틱 검색)");

  } catch (error: any) {
    console.error("❌ 마이그레이션 실패:", error.message);
    throw error;
  } finally {
    await connection.end();
    console.log("🔌 DB 연결 종료");
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
