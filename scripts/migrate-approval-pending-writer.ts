/**
 * h_approval_requests.status enum 에 'pending_writer' 추가 — PR #264
 *
 * 사용자 결정: 자동 배치 생성 후 작성자가 사전 검토/수정/사진 업로드 단계 추가.
 *
 * 변경:
 *   기존: pending_review → pending_approval → approved
 *   신규: pending_writer (★) → pending_review → pending_approval → approved
 *
 * 실행:
 *   npx tsx scripts/migrate-approval-pending-writer.ts
 *
 * 안전성:
 *   - MODIFY COLUMN ENUM 으로 새 값만 추가 (기존 값 보존)
 *   - INFORMATION_SCHEMA 조회로 idempotent
 */

import { getDb } from "../server/db/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  console.log("=== h_approval_requests.status: 'pending_writer' 추가 ===\n");

  const showResult: any = await db.execute(sql`
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'h_approval_requests' AND COLUMN_NAME = 'status'
  `);
  const rows = ((showResult as any)?.[0] ?? showResult) as any[];
  const currentType = rows[0]?.COLUMN_TYPE ?? "";
  console.log("현재 enum:", currentType);

  if (currentType.includes("pending_writer")) {
    console.log("✓ 'pending_writer' 이미 존재 — skip\n");
    process.exit(0);
  }

  console.log("\nALTER TABLE 실행...");
  await db.execute(sql`
    ALTER TABLE h_approval_requests MODIFY COLUMN status ENUM(
      'pending_writer',
      'pending_review',
      'pending_approval',
      'pending',
      'approved',
      'rejected',
      'cancelled'
    ) DEFAULT 'pending_review'
  `);

  const verifyResult: any = await db.execute(sql`
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'h_approval_requests' AND COLUMN_NAME = 'status'
  `);
  const newType = (((verifyResult as any)?.[0] ?? verifyResult) as any[])[0]?.COLUMN_TYPE ?? "";
  console.log("\n변경 후 enum:", newType);

  if (newType.includes("pending_writer")) {
    console.log("\n✅ 마이그레이션 완료\n");
  } else {
    console.error("\n❌ 검증 실패");
    process.exit(1);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ 마이그레이션 실패:", e);
  process.exit(1);
});
