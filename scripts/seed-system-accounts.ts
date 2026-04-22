/**
 * 시스템 계정 시드 실행 스크립트 (tenant 단위)
 *
 * 배경:
 *   2026-04-22 매출 승인 시 `resolveSystemAccount` 경고 발생
 *   → 특정 tenant 의 accounting_accounts 에 system_code 매핑 누락
 *   → fallback 으로 동작 중이지만 명시적 시드 권장
 *
 * 사용법:
 *   # 특정 tenant 1개 시드
 *   npx tsx scripts/seed-system-accounts.ts <tenantId> [userId]
 *
 *   # 모든 활성 tenant 시드
 *   npx tsx scripts/seed-system-accounts.ts --all
 *
 *   # 시드 전 미리보기 (dry run)
 *   DRY_RUN=true npx tsx scripts/seed-system-accounts.ts <tenantId>
 *
 * 동작:
 *   - ensureSystemAccounts(tenantId, userId) 호출
 *   - system_code 가 이미 있으면 skip
 *   - 같은 code 가 있으면 system_code 만 UPDATE
 *   - 없으면 INSERT
 *   - 멱등성 보장 — 여러 번 실행해도 안전
 */

import { getRawConnection } from "../server/db/connection";
import { ensureSystemAccounts } from "../server/db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../drizzle/schema/accountingAccounts";

const DRY_RUN = process.env.DRY_RUN === "true";

async function reportTenantStatus(tenantId: number) {
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT code, name, system_code
       FROM accounting_accounts
      WHERE tenant_id = ?
        AND is_active = 'Y'
      ORDER BY code`,
    [tenantId],
  );

  const accounts = rows as Array<{ code: string; name: string; system_code: string | null }>;
  const mapped = accounts.filter(a => a.system_code);
  const unmapped = accounts.filter(a => !a.system_code);

  console.log(`  전체 계정: ${accounts.length}개`);
  console.log(`  system_code 매핑됨: ${mapped.length}개`);
  console.log(`  매핑 안 된 계정: ${unmapped.length}개`);

  // system_code 필수 집합에서 누락된 것
  const expectedCodes = Object.values(SYSTEM_ACCOUNTS);
  const existingSystemCodes = new Set(mapped.map(a => a.system_code));
  const missing = expectedCodes.filter(c => !existingSystemCodes.has(c));

  if (missing.length > 0) {
    console.log(`  ⚠️  누락된 system_code: ${missing.join(", ")}`);
  } else {
    console.log(`  ✅ 모든 system_code 매핑 완료`);
  }
  return { total: accounts.length, mapped: mapped.length, unmapped: unmapped.length, missing };
}

async function seedOne(tenantId: number, userId: number) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Tenant ${tenantId} — 시스템 계정 시드`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n[Before]`);
  const before = await reportTenantStatus(tenantId);

  if (before.missing.length === 0) {
    console.log(`\n→ skip (이미 모든 system_code 매핑됨)`);
    return;
  }

  if (DRY_RUN) {
    console.log(`\n[DRY_RUN=true] 실제 INSERT/UPDATE 수행 안 함`);
    return;
  }

  console.log(`\n[시드 실행]`);
  await ensureSystemAccounts(tenantId, userId);
  console.log(`→ ensureSystemAccounts(${tenantId}, ${userId}) 완료`);

  console.log(`\n[After]`);
  await reportTenantStatus(tenantId);
}

async function run() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("사용법: npx tsx scripts/seed-system-accounts.ts <tenantId> [userId]");
    console.error("       npx tsx scripts/seed-system-accounts.ts --all");
    process.exit(1);
  }

  const conn = await getRawConnection();

  if (args[0] === "--all") {
    // 모든 활성 tenant 조회
    const [rows] = await conn.execute(
      `SELECT id, name FROM tenants WHERE status = 'active' ORDER BY id`,
    );
    const tenants = rows as Array<{ id: number; name: string }>;
    console.log(`활성 테넌트 ${tenants.length}개 발견\n`);

    for (const t of tenants) {
      await seedOne(t.id, 1);
    }
  } else {
    const tenantId = Number(args[0]);
    const userId = Number(args[1] ?? 1);
    if (isNaN(tenantId) || tenantId < 1) {
      console.error(`잘못된 tenantId: ${args[0]}`);
      process.exit(1);
    }
    await seedOne(tenantId, userId);
  }

  console.log(`\n${DRY_RUN ? "🔍 DRY RUN 완료" : "✅ 시드 완료"}`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ 실패:", err);
  process.exit(1);
});
