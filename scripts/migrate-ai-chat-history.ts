/**
 * AI 챗봇 대화 히스토리 영속화 테이블 마이그레이션
 * P9-2: 서버 재시작 시 대화 유지
 *
 * 실행: npx tsx scripts/migrate-ai-chat-history.ts
 */

import { getRawConnection } from "../server/db/connection";

async function migrate() {
  console.log("[Migration] ai_chat_history 테이블 생성 시작...");
  const conn = await getRawConnection();

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ai_chat_history (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      conversation_id VARCHAR(100) NOT NULL,
      user_id VARCHAR(100),
      role ENUM('user', 'assistant', 'system') NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

      INDEX idx_conv (tenant_id, conversation_id, created_at),
      INDEX idx_cleanup (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log("[Migration] ai_chat_history 테이블 생성 완료");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("[Migration] 실패:", err);
  process.exit(1);
});
