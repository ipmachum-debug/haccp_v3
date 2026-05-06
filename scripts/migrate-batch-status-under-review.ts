/**
 * h_batches.status enum 에 'under_review' 추가 — PR #261
 *
 * 사용자 피드백: 승인 로직 실패
 *   Failed query: UPDATE h_batches SET status = 'under_review' ...
 *   파라미터: 583, 2 → tenant 2 의 batch 583
 *
 * 원인: enum 에 'under_review' 가 없어서 invalid value 로 거부.
 * 코드 (genericChecklist.router.ts, batch.lifecycle.router.ts, batchApproval.router.ts)
 * 는 이미 'under_review' 사용 중 — DB enum 만 누락된 상태.
 *
 * 실행:
 *   npx tsx scripts/migrate-batch-status-under-review.ts
 *
 * 안전성:
 *   - MODIFY COLUMN ENUM 에 새 값만 추가 (기존 값 그대로)
 *   - 재실행 안전 (이미 추가된 경우 SHOW CREATE TABLE 로 확인)
 */

import { getDb } from "../server/db/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  console.log("=== h_batches.status enum migration: 'under_review' 추가 ===\n");

  // 현재 enum 정의 조회
  const showResult: any = await db.execute(sql`
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'h_batches' AND COLUMN_NAME = 'status'
  `);
  const rows = ((showResult as any)?.[0] ?? showResult) as any[];
  const currentType = rows[0]?.COLUMN_TYPE ?? "";
  console.log("현재 enum:", currentType);

  if (currentType.includes("under_review")) {
    console.log("✓ 'under_review' 이미 존재 — skip\n");
    process.exit(0);
  }

  // ALTER TABLE — 모든 기존 값 + under_review 추가
  console.log("\nALTER TABLE 실행...");
  await db.execute(sql`
    ALTER TABLE h_batches MODIFY COLUMN status ENUM(
      'planned',
      'in_progress',
      'paused',
      'completed',
      'under_review',
      'failed',
      'cancelled',
      'shipped',
      'archived'
    ) NOT NULL DEFAULT 'planned'
  `);

  // 검증
  const verifyResult: any = await db.execute(sql`
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'h_batches' AND COLUMN_NAME = 'status'
  `);
  const newType = (((verifyResult as any)?.[0] ?? verifyResult) as any[])[0]?.COLUMN_TYPE ?? "";
  console.log("\n변경 후 enum:", newType);

  if (newType.includes("under_review")) {
    console.log("\n✅ 마이그레이션 완료\n");
  } else {
    console.error("\n❌ 검증 실패 — 'under_review' 가 enum 에 추가되지 않음");
    process.exit(1);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ 마이그레이션 실패:", e);
  process.exit(1);
});
