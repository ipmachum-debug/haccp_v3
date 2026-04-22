/**
 * 계정과목 복제 스크립트 — source tenant → target tenant
 *
 * 용도:
 *   - 같은 업종 테넌트끼리 계정과목 체계 통일
 *   - 신규 테넌트 온보딩 시 기존 테넌트 계정체계 복사
 *
 * 동작:
 *   1. Target 에 없고 Source 에 있는 계정 → INSERT (신규 복사)
 *   2. Target 에도 있고 Source 에도 있는 동일 code → name/category/system_code UPDATE
 *   3. Target 에만 있고 Source 에 없는 계정:
 *      - expense_journal_lines 에서 참조 중이면 → 보존 (is_active 유지)
 *      - 참조 없으면 → deactivate 옵션으로 is_active='N' 설정 가능
 *
 * 멱등성:
 *   - 여러 번 실행해도 안전. 동일 code 는 UPDATE 로 덮어씀.
 *
 * 사용법:
 *   npx tsx scripts/clone-accounts-from-tenant.ts <sourceTenantId> <targetTenantId>
 *
 *   # 비활성화 포함 (target 의 고유 계정 중 미사용은 is_active='N' 설정)
 *   DEACTIVATE_UNIQUE=true npx tsx scripts/clone-accounts-from-tenant.ts 2 1
 *
 *   # 미리보기
 *   DRY_RUN=true npx tsx scripts/clone-accounts-from-tenant.ts 2 1
 *
 *   # INSERT 만 (UPDATE 단계 skip) — 같은 code 가 tenant 별로 다른 의미일 때 안전
 *   # 예: 5100 이 tenant 1=급여, tenant 2=세금과공과 처럼 완전히 다른 경우
 *   INSERT_ONLY=true npx tsx scripts/clone-accounts-from-tenant.ts 2 1
 */

import "dotenv/config";

import { getRawConnection } from "../server/db/connection";

const DRY_RUN = process.env.DRY_RUN === "true";
const DEACTIVATE_UNIQUE = process.env.DEACTIVATE_UNIQUE === "true";
const INSERT_ONLY = process.env.INSERT_ONLY === "true";

async function getAdminUserId(tenantId: number): Promise<number> {
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT id FROM users
       WHERE tenant_id = ? AND role IN ('admin', 'super_admin') AND is_active = 1
       ORDER BY id ASC LIMIT 1`,
    [tenantId],
  );
  const r = (rows as Array<{ id: number }>)[0];
  return r?.id ?? 1; // fallback
}

async function reportAccounts(tenantId: number, label: string) {
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN is_active = 'Y' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN system_code IS NOT NULL THEN 1 ELSE 0 END) AS with_system_code
       FROM accounting_accounts WHERE tenant_id = ?`,
    [tenantId],
  );
  const r = (rows as Array<{ total: number; active: number; with_system_code: number }>)[0];
  console.log(`  [${label}] tenant=${tenantId}: total=${r.total}, active=${r.active}, system_code=${r.with_system_code}`);
}

async function analyzePlan(sourceTenantId: number, targetTenantId: number) {
  const conn = await getRawConnection();

  // 1. Source 에 있고 Target 에 없는 code (신규 INSERT 대상)
  const [newRows] = await conn.execute(
    `SELECT code, name, category, system_code
       FROM accounting_accounts s
      WHERE s.tenant_id = ? AND s.is_active = 'Y'
        AND NOT EXISTS (
          SELECT 1 FROM accounting_accounts t
          WHERE t.tenant_id = ? AND t.code = s.code
        )
      ORDER BY s.code`,
    [sourceTenantId, targetTenantId],
  );
  const toInsert = newRows as Array<{ code: string; name: string; category: string; system_code: string | null }>;

  // 2. 양쪽에 모두 있는 code (UPDATE 대상 — 이름·카테고리·system_code 차이 있을 때)
  const [diffRows] = await conn.execute(
    `SELECT t.code AS t_code, t.name AS t_name, t.category AS t_cat, t.system_code AS t_sys,
            s.name AS s_name, s.category AS s_cat, s.system_code AS s_sys
       FROM accounting_accounts t
       INNER JOIN accounting_accounts s
         ON s.tenant_id = ? AND s.code = t.code AND s.is_active = 'Y'
      WHERE t.tenant_id = ? AND t.is_active = 'Y'
        AND (t.name <> s.name OR t.category <> s.category OR COALESCE(t.system_code, '') <> COALESCE(s.system_code, ''))
      ORDER BY t.code`,
    [sourceTenantId, targetTenantId],
  );
  const toUpdate = diffRows as Array<{
    t_code: string; t_name: string; t_cat: string; t_sys: string | null;
    s_name: string; s_cat: string; s_sys: string | null;
  }>;

  // 3. Target 에만 있는 code (source 에 없음)
  const [uniqueRows] = await conn.execute(
    `SELECT t.id, t.code, t.name,
            (SELECT COUNT(*) FROM expense_journal_lines WHERE account_id = t.id) AS usage_count
       FROM accounting_accounts t
      WHERE t.tenant_id = ? AND t.is_active = 'Y'
        AND NOT EXISTS (
          SELECT 1 FROM accounting_accounts s
          WHERE s.tenant_id = ? AND s.code = t.code AND s.is_active = 'Y'
        )
      ORDER BY t.code`,
    [targetTenantId, sourceTenantId],
  );
  const targetUnique = uniqueRows as Array<{ id: number; code: string; name: string; usage_count: number }>;

  return { toInsert, toUpdate, targetUnique };
}

async function clone(sourceTenantId: number, targetTenantId: number) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  계정과목 복제: tenant ${sourceTenantId} → tenant ${targetTenantId}`);
  console.log(`  DRY_RUN=${DRY_RUN}, DEACTIVATE_UNIQUE=${DEACTIVATE_UNIQUE}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  console.log(`\n[Before]`);
  await reportAccounts(sourceTenantId, "source");
  await reportAccounts(targetTenantId, "target");

  const plan = await analyzePlan(sourceTenantId, targetTenantId);

  console.log(`\n[계획]`);
  console.log(`  신규 INSERT: ${plan.toInsert.length}개`);
  if (INSERT_ONLY) {
    console.log(`  UPDATE: ${plan.toUpdate.length}개 ⚠️  INSERT_ONLY=true → 전부 skip`);
  } else {
    console.log(`  UPDATE (이름/카테고리/system_code 차이): ${plan.toUpdate.length}개`);
  }
  console.log(`  Target 고유 계정: ${plan.targetUnique.length}개`);
  const unused = plan.targetUnique.filter(u => u.usage_count === 0).length;
  const used = plan.targetUnique.length - unused;
  console.log(`    - 사용 중 (분개 참조): ${used}개 (보존)`);
  console.log(`    - 미사용: ${unused}개 ${DEACTIVATE_UNIQUE ? "(비활성화 예정)" : "(보존)"}`);

  if (plan.toInsert.length > 0) {
    console.log(`\n  [INSERT 대상 상위 10]`);
    plan.toInsert.slice(0, 10).forEach(r => {
      console.log(`    ${r.code}  ${r.name}  [${r.category}] ${r.system_code ?? ""}`);
    });
  }

  if (plan.toUpdate.length > 0) {
    console.log(`\n  [UPDATE 대상 상위 10] (code: target → source)`);
    plan.toUpdate.slice(0, 10).forEach(r => {
      const changes: string[] = [];
      if (r.t_name !== r.s_name) changes.push(`name: "${r.t_name}" → "${r.s_name}"`);
      if (r.t_cat !== r.s_cat) changes.push(`cat: ${r.t_cat} → ${r.s_cat}`);
      if ((r.t_sys ?? "") !== (r.s_sys ?? "")) changes.push(`sys: ${r.t_sys ?? "∅"} → ${r.s_sys ?? "∅"}`);
      console.log(`    ${r.t_code}  ${changes.join(", ")}`);
    });
  }

  if (plan.targetUnique.length > 0 && DEACTIVATE_UNIQUE) {
    const deactivateCandidates = plan.targetUnique.filter(u => u.usage_count === 0);
    if (deactivateCandidates.length > 0) {
      console.log(`\n  [비활성화 예정 상위 10] (target 에만 있고 미사용)`);
      deactivateCandidates.slice(0, 10).forEach(r => {
        console.log(`    ${r.code}  ${r.name}  (usage=0)`);
      });
    }
  }

  if (DRY_RUN) {
    console.log(`\n[DRY_RUN=true] 실제 변경 안 함. 계획만 출력.`);
    return;
  }

  const effectiveUpdates = INSERT_ONLY ? 0 : plan.toUpdate.length;
  if (plan.toInsert.length === 0 && effectiveUpdates === 0 && !DEACTIVATE_UNIQUE) {
    console.log(`\n→ 변경 사항 없음. skip.`);
    return;
  }

  const conn = await getRawConnection();
  const adminUserId = await getAdminUserId(targetTenantId);
  console.log(`\n[실행]  target admin user id = ${adminUserId}`);

  // 1. INSERT
  if (plan.toInsert.length > 0) {
    for (const row of plan.toInsert) {
      await conn.execute(
        `INSERT INTO accounting_accounts
           (tenant_id, category, code, name, system_code, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, 'Y', ?)`,
        [targetTenantId, row.category, row.code, row.name, row.system_code, adminUserId],
      );
    }
    console.log(`  ✅ INSERT 완료: ${plan.toInsert.length}개`);
  }

  // 2. UPDATE (INSERT_ONLY 면 skip)
  if (plan.toUpdate.length > 0) {
    if (INSERT_ONLY) {
      console.log(`  ⏭  UPDATE skip: ${plan.toUpdate.length}개 (INSERT_ONLY=true)`);
    } else {
      for (const row of plan.toUpdate) {
        await conn.execute(
          `UPDATE accounting_accounts
              SET name = ?, category = ?, system_code = ?
            WHERE tenant_id = ? AND code = ?`,
          [row.s_name, row.s_cat, row.s_sys, targetTenantId, row.t_code],
        );
      }
      console.log(`  ✅ UPDATE 완료: ${plan.toUpdate.length}개`);
    }
  }

  // 3. 비활성화 (옵션)
  if (DEACTIVATE_UNIQUE) {
    const deactivateIds = plan.targetUnique.filter(u => u.usage_count === 0).map(u => u.id);
    if (deactivateIds.length > 0) {
      const placeholders = deactivateIds.map(() => "?").join(",");
      await conn.execute(
        `UPDATE accounting_accounts SET is_active = 'N' WHERE id IN (${placeholders})`,
        deactivateIds,
      );
      console.log(`  ✅ 비활성화 완료: ${deactivateIds.length}개`);
    }
  }

  console.log(`\n[After]`);
  await reportAccounts(sourceTenantId, "source");
  await reportAccounts(targetTenantId, "target");
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("사용법: npx tsx scripts/clone-accounts-from-tenant.ts <sourceTenantId> <targetTenantId>");
    console.error("옵션: DRY_RUN=true / DEACTIVATE_UNIQUE=true");
    process.exit(1);
  }

  const sourceId = Number(args[0]);
  const targetId = Number(args[1]);
  if (isNaN(sourceId) || isNaN(targetId) || sourceId === targetId) {
    console.error("잘못된 tenant ID");
    process.exit(1);
  }

  await clone(sourceId, targetId);

  console.log(`\n${DRY_RUN ? "🔍 DRY RUN 완료" : "✅ 복제 완료"}`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ 실패:", err);
  process.exit(1);
});
