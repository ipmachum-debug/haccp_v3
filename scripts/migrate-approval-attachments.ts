/**
 * h_approval_attachments 테이블 생성 — PR #265
 *
 * 작성자 사전 검토 (pending_writer) 단계의 사진/문서 업로드용.
 *
 * 실행:
 *   npx tsx scripts/migrate-approval-attachments.ts
 */

import { getDb } from "../server/db/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  console.log("=== h_approval_attachments 테이블 생성 ===\n");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS h_approval_attachments (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      tenant_id INT NOT NULL,
      approval_request_id BIGINT NOT NULL,
      file_url VARCHAR(1000) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size BIGINT,
      mime_type VARCHAR(100),
      attachment_type ENUM('photo','document','other') NOT NULL DEFAULT 'photo',
      caption TEXT,
      uploaded_by BIGINT NOT NULL,
      uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_aa_tenant_request (tenant_id, approval_request_id),
      INDEX idx_aa_uploaded (uploaded_at),
      CONSTRAINT fk_aa_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log("✅ h_approval_attachments 테이블 생성 완료\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ 마이그레이션 실패:", e);
  process.exit(1);
});
