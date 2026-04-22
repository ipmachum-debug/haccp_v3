/**
 * 식품업 표준 9-그룹 계정 분류 적용 스크립트
 *
 * 배경:
 *   2026-04-22 식품 3사 (tenant 1/2/3) 계정과목 통일 완료.
 *   이후 상위계정(그룹) 분류가 일부 "미배정" 상태 → 재무제표 생성·집계 시
 *   그룹별 소계 불가. 표준 9개 그룹으로 재분류하여 K-GAAP 호환 구조 확보.
 *
 * 9-그룹 체계:
 *   자산 (3): #A1 당좌자산 / #A2 기타유동자산 / #A3 재고자산
 *   부채 (2): #L1 매입채무 / #L2 기타유동부채
 *   자본 (1): #E1 자본
 *   수익 (1): #R1 매출
 *   비용 (2): #X1 제조원가 / #X2 판매관리비
 *
 * 동작:
 *   1. 각 tenant 에 9개 그룹 INSERT (이미 있으면 skip — 멱등성)
 *   2. accounting_accounts.account_category_id 를 code 기반 매핑으로 UPDATE
 *   3. 매핑 안 된 계정 (추가로 사용자가 만든 계정 등) 은 그대로 둠
 *
 * 사용법:
 *   # 식품 3사 일괄 적용
 *   npx tsx scripts/apply-food-account-groups.ts 1 2 3
 *
 *   # 미리보기
 *   DRY_RUN=true npx tsx scripts/apply-food-account-groups.ts 1 2 3
 *
 *   # 특정 tenant 1개만
 *   npx tsx scripts/apply-food-account-groups.ts 2
 */

import { getRawConnection } from "../server/db/connection";

const DRY_RUN = process.env.DRY_RUN === "true";

interface GroupDef {
  code: string;
  name: string;
  majorCategory: string;
  minorCategory: string | null;
  accountCodes: string[];
}

const GROUP_STRUCTURE: GroupDef[] = [
  // 자산
  {
    code: "A1", name: "당좌자산", majorCategory: "자산", minorCategory: "유동자산",
    accountCodes: ["1010", "1020", "1030"],
  },
  {
    code: "A2", name: "기타 유동자산", majorCategory: "자산", minorCategory: "유동자산",
    accountCodes: ["1350"],
  },
  {
    code: "A3", name: "재고자산", majorCategory: "자산", minorCategory: "유동자산",
    // 1430 재공품은 PR #43 머지 + seed 실행 후 적용됨 (멱등성이라 안전)
    accountCodes: ["1410", "1420", "1430"],
  },
  // 부채
  {
    code: "L1", name: "매입채무", majorCategory: "부채", minorCategory: "유동부채",
    accountCodes: ["2010", "2020"],
  },
  {
    code: "L2", name: "기타 유동부채", majorCategory: "부채", minorCategory: "유동부채",
    accountCodes: ["2350"],
  },
  // 자본
  {
    code: "E1", name: "자본", majorCategory: "자본", minorCategory: null,
    accountCodes: ["3010", "3020"],
  },
  // 수익
  {
    code: "R1", name: "매출", majorCategory: "수익", minorCategory: null,
    accountCodes: ["4010", "4020", "4030"],
  },
  // 비용
  {
    code: "X1", name: "제조원가", majorCategory: "비용", minorCategory: "매출원가",
    accountCodes: [
      "5030", "5040", "5050", "5060", "5070", "5080", "5090",
      "5100", "5130", "5170", "5210", "5220",
    ],
  },
  {
    code: "X2", name: "판매관리비", majorCategory: "비용", minorCategory: "판관비",
    accountCodes: [
      "5010", "5020", "5110", "5120", "5140", "5150",
      "5160", "5180", "5190", "5200", "5230", "5240",
    ],
  },
];

async function ensureGroup(tenantId: number, group: GroupDef): Promise<{ id: number; created: boolean }> {
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT id FROM account_categories
       WHERE tenant_id = ? AND code = ? LIMIT 1`,
    [tenantId, group.code],
  );
  const existing = (rows as Array<{ id: number }>)[0];
  if (existing) {
    return { id: existing.id, created: false };
  }
  if (DRY_RUN) {
    return { id: -1, created: true };
  }
  const [result] = await conn.execute(
    `INSERT INTO account_categories
       (code, name, major_category, minor_category, is_active, tenant_id)
     VALUES (?, ?, ?, ?, 1, ?)`,
    [group.code, group.name, group.majorCategory, group.minorCategory, tenantId],
  );
  return { id: (result as { insertId: number }).insertId, created: true };
}

async function analyze(tenantId: number) {
  const conn = await getRawConnection();

  // 현재 그룹 상태
  const [groupRows] = await conn.execute(
    `SELECT code, name, major_category FROM account_categories
       WHERE tenant_id = ? AND is_active = 1 ORDER BY code`,
    [tenantId],
  );
  const currentGroups = groupRows as Array<{ code: string; name: string; major_category: string }>;

  // 매핑 대상 계정
  const allCodes = GROUP_STRUCTURE.flatMap(g => g.accountCodes);
  const placeholders = allCodes.map(() => "?").join(",");
  const [acctRows] = await conn.execute(
    `SELECT code, name, category, account_category_id FROM accounting_accounts
       WHERE tenant_id = ? AND is_active = 'Y' AND code IN (${placeholders})`,
    [tenantId, ...allCodes],
  );
  const accounts = acctRows as Array<{
    code: string; name: string; category: string;
    account_category_id: number | null;
  }>;

  // 매핑 안 된 계정 (tenant 가 추가로 만든 것)
  const [extraRows] = await conn.execute(
    `SELECT code, name, category FROM accounting_accounts
       WHERE tenant_id = ? AND is_active = 'Y'
         AND code NOT IN (${placeholders})`,
    [tenantId, ...allCodes],
  );
  const extras = extraRows as Array<{ code: string; name: string; category: string }>;

  return { currentGroups, accounts, extras };
}

async function applyToTenant(tenantId: number) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Tenant ${tenantId} — 9-그룹 분류 적용`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const { currentGroups, accounts, extras } = await analyze(tenantId);

  console.log(`\n[Before]`);
  console.log(`  기존 그룹: ${currentGroups.length}개`);
  console.log(`  매핑 대상 계정 (표준 37개 중): ${accounts.length}개 존재`);
  console.log(`  표준 외 계정 (사용자 추가): ${extras.length}개 — 그대로 유지`);

  // Step 1: 9개 그룹 보장
  console.log(`\n[Step 1: 그룹 생성/확인]`);
  const groupIdMap: Record<string, number> = {};
  for (const group of GROUP_STRUCTURE) {
    const { id, created } = await ensureGroup(tenantId, group);
    groupIdMap[group.code] = id;
    const label = created ? "신규" : "기존";
    console.log(`  [${label}] #${group.code} ${group.name} (${group.majorCategory}) → ${group.accountCodes.length}개 계정 매핑`);
  }

  // Step 2: 계정 매핑
  console.log(`\n[Step 2: 계정 account_category_id UPDATE]`);

  if (DRY_RUN) {
    console.log(`  DRY_RUN → 실제 UPDATE 안 함`);
    let totalUpdated = 0;
    for (const group of GROUP_STRUCTURE) {
      const targets = accounts.filter(a => group.accountCodes.includes(a.code));
      if (targets.length === 0) {
        console.log(`    #${group.code}: 0개 (대상 계정 없음)`);
        continue;
      }
      const needsUpdate = targets.filter(a => a.account_category_id !== groupIdMap[group.code]);
      totalUpdated += needsUpdate.length;
      console.log(`    #${group.code} ${group.name}: ${needsUpdate.length}/${targets.length}개 업데이트 필요`);
    }
    console.log(`\n  DRY_RUN 요약: 총 ${totalUpdated}개 계정 UPDATE 예정`);
  } else {
    const conn = await getRawConnection();
    let totalUpdated = 0;
    for (const group of GROUP_STRUCTURE) {
      const groupId = groupIdMap[group.code];
      for (const accountCode of group.accountCodes) {
        const [result] = await conn.execute(
          `UPDATE accounting_accounts
              SET account_category_id = ?
            WHERE tenant_id = ? AND code = ? AND is_active = 'Y'
              AND (account_category_id IS NULL OR account_category_id <> ?)`,
          [groupId, tenantId, accountCode, groupId],
        );
        const affected = (result as { affectedRows: number }).affectedRows;
        totalUpdated += affected;
      }
    }
    console.log(`  ✅ UPDATE 완료: ${totalUpdated}개 계정`);
  }

  // Step 3: 사후 상태
  if (!DRY_RUN) {
    console.log(`\n[After]`);
    const conn = await getRawConnection();
    const [afterRows] = await conn.execute(
      `SELECT ac.code AS group_code, ac.name AS group_name,
              COUNT(aa.id) AS account_count
         FROM account_categories ac
         LEFT JOIN accounting_accounts aa
           ON aa.account_category_id = ac.id
          AND aa.tenant_id = ac.tenant_id
          AND aa.is_active = 'Y'
        WHERE ac.tenant_id = ? AND ac.is_active = 1
          AND ac.code IN ('A1','A2','A3','L1','L2','E1','R1','X1','X2')
        GROUP BY ac.id, ac.code, ac.name
        ORDER BY ac.code`,
      [tenantId],
    );
    const after = afterRows as Array<{ group_code: string; group_name: string; account_count: number }>;
    for (const r of after) {
      console.log(`  #${r.group_code} ${r.group_name}: ${r.account_count}개 계정`);
    }
  }
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("사용법: npx tsx scripts/apply-food-account-groups.ts <tenantId> [tenantId...]");
    console.error("옵션: DRY_RUN=true");
    process.exit(1);
  }

  const tenantIds = args.map(Number).filter(n => !isNaN(n) && n > 0);
  if (tenantIds.length === 0) {
    console.error("잘못된 tenant ID");
    process.exit(1);
  }

  for (const tid of tenantIds) {
    await applyToTenant(tid);
  }

  console.log(`\n${DRY_RUN ? "🔍 DRY RUN 완료" : "✅ 전체 적용 완료"}`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ 실패:", err);
  process.exit(1);
});
