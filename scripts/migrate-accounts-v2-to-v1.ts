/**
 * P2-2 마이그레이션: accounting_accounts_v2 → accounting_accounts 통합
 * 
 * 실행: npx tsx scripts/migrate-accounts-v2-to-v1.ts
 * 
 * 작업 내용:
 * 1. accounting_accounts_v2의 계정을 accounting_accounts로 복사 (없는 것만)
 * 2. ap_ledger.accounting_account_id FK를 accounting_accounts.id로 재매핑
 * 3. ar_ledger.accounting_account_id FK를 accounting_accounts.id로 재매핑
 * 4. bank_transactions.accounting_account_id FK를 accounting_accounts.id로 재매핑
 * 
 * 주의: 이 스크립트는 idempotent (재실행 가능)
 */

import mysql from "mysql2/promise";

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "haccp_db",
  });

  console.log("=== P2-2: accounting_accounts_v2 → accounting_accounts 통합 마이그레이션 ===\n");

  try {
    // 1. accounting_accounts_v2가 존재하는지 확인
    const [tables] = await conn.execute(
      `SHOW TABLES LIKE 'accounting_accounts_v2'`
    );
    if ((tables as any[]).length === 0) {
      console.log("✅ accounting_accounts_v2 테이블이 없습니다. 이미 마이그레이션 완료된 것 같습니다.");
      await conn.end();
      return;
    }

    // 2. v2 계정 목록 조회
    const [v2Accounts] = await conn.execute(
      `SELECT id, tenant_id, code, name, account_type, parent_id, is_active, sort_order
       FROM accounting_accounts_v2`
    );
    console.log(`📋 accounting_accounts_v2에서 ${(v2Accounts as any[]).length}개 계정 발견`);

    // 3. 각 v2 계정에 대해 accounting_accounts에 대응하는 계정 찾기/생성
    const idMap: Record<number, number> = {}; // v2.id → v1.id
    
    // category 매핑: v2의 account_type → v1의 category
    const categoryMap: Record<string, string> = {
      asset: "assets",
      liability: "liabilities",
      equity: "equity",
      revenue: "revenue",
      expense: "expenses",
    };

    for (const v2 of v2Accounts as any[]) {
      // 먼저 같은 tenant + code 조합으로 v1에서 찾기
      const [existing] = await conn.execute(
        `SELECT id FROM accounting_accounts WHERE tenant_id = ? AND code = ? LIMIT 1`,
        [v2.tenant_id, v2.code]
      );
      
      if ((existing as any[]).length > 0) {
        idMap[v2.id] = (existing as any[])[0].id;
        console.log(`  🔗 v2#${v2.id} (${v2.code} ${v2.name}) → v1#${(existing as any[])[0].id} (기존)`);
      } else {
        // 새로 생성
        const category = categoryMap[v2.account_type] || "expenses";
        const [result] = await conn.execute(
          `INSERT INTO accounting_accounts (tenant_id, category, code, name, parent_id, is_active, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [v2.tenant_id, category, v2.code, v2.name, v2.parent_id, v2.is_active === 1 ? 'Y' : 'N']
        );
        idMap[v2.id] = (result as any).insertId;
        console.log(`  ✨ v2#${v2.id} (${v2.code} ${v2.name}) → v1#${(result as any).insertId} (신규 생성)`);
      }
    }

    // 4. ap_ledger.accounting_account_id 재매핑
    const [apRows] = await conn.execute(
      `SELECT id, accounting_account_id FROM ap_ledger WHERE accounting_account_id IS NOT NULL`
    );
    let apUpdated = 0;
    for (const row of apRows as any[]) {
      const newId = idMap[row.accounting_account_id];
      if (newId && newId !== row.accounting_account_id) {
        await conn.execute(
          `UPDATE ap_ledger SET accounting_account_id = ? WHERE id = ?`,
          [newId, row.id]
        );
        apUpdated++;
      }
    }
    console.log(`\n📊 ap_ledger: ${apUpdated}/${(apRows as any[]).length}개 재매핑`);

    // 5. ar_ledger.accounting_account_id 재매핑
    const [arRows] = await conn.execute(
      `SELECT id, accounting_account_id FROM ar_ledger WHERE accounting_account_id IS NOT NULL`
    );
    let arUpdated = 0;
    for (const row of arRows as any[]) {
      const newId = idMap[row.accounting_account_id];
      if (newId && newId !== row.accounting_account_id) {
        await conn.execute(
          `UPDATE ar_ledger SET accounting_account_id = ? WHERE id = ?`,
          [newId, row.id]
        );
        arUpdated++;
      }
    }
    console.log(`📊 ar_ledger: ${arUpdated}/${(arRows as any[]).length}개 재매핑`);

    // 6. bank_transactions.accounting_account_id 재매핑
    const [btRows] = await conn.execute(
      `SELECT id, accounting_account_id FROM bank_transactions WHERE accounting_account_id IS NOT NULL`
    );
    let btUpdated = 0;
    for (const row of btRows as any[]) {
      const newId = idMap[row.accounting_account_id];
      if (newId && newId !== row.accounting_account_id) {
        await conn.execute(
          `UPDATE bank_transactions SET accounting_account_id = ? WHERE id = ?`,
          [newId, row.id]
        );
        btUpdated++;
      }
    }
    console.log(`📊 bank_transactions: ${btUpdated}/${(btRows as any[]).length}개 재매핑`);

    // 7. 매핑 결과 요약
    console.log("\n=== 마이그레이션 완료 ===");
    console.log(`ID 매핑: ${Object.keys(idMap).length}개`);
    console.log("v2 → v1 매핑 테이블:");
    console.table(
      Object.entries(idMap).map(([v2Id, v1Id]) => ({
        "v2 ID": v2Id,
        "v1 ID": v1Id,
      }))
    );
    console.log("\n⚠️ accounting_accounts_v2 테이블은 유지됩니다 (수동 삭제 필요 시 DROP TABLE 실행)");

  } catch (error) {
    console.error("❌ 마이그레이션 실패:", error);
    throw error;
  } finally {
    await conn.end();
  }
}

migrate().catch(console.error);
