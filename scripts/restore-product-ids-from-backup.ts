/**
 * restore-product-ids-from-backup.ts
 * 
 * 백업 SQL 파일에서 원래 product_id를 추출하여 이중 변환된 데이터를 복원합니다.
 * 
 * 문제: 마이그레이션 스크립트가 이미 v2 ID였던 product_id를 v1 ID로 오인하고 이중 변환함
 * 해결: 마이그레이션 전 백업에서 원래 product_id를 가져와 복원
 * 
 * Usage:
 *   DRY_RUN=true npx tsx scripts/restore-product-ids-from-backup.ts
 *   npx tsx scripts/restore-product-ids-from-backup.ts
 */

import fs from 'fs';
import mysql from 'mysql2/promise';

const DRY_RUN = process.env.DRY_RUN === 'true';
const BACKUP_FILE = process.env.BACKUP_FILE || '/root/backup_20260410_101612.sql';
const TENANT_ID = parseInt(process.env.TENANT_ID || '2');

const DB_URL = process.env.DATABASE_URL || 'mysql://root:G0ld3n%21T1004%23Sec@127.0.0.1:3306/haccp_tenant_db?charset=utf8mb4';

interface BackupRow {
  id: number;
  product_id: number | null;
}

function parseInsertValues(sqlContent: string, tableName: string, productIdColumnIndex: number, idColumnIndex: number = 0): BackupRow[] {
  const results: BackupRow[] = [];
  
  // Match INSERT statements for the table
  const regex = new RegExp(`INSERT INTO \`${tableName}\` VALUES\\s*(.+?);`, 'gs');
  let match;
  
  while ((match = regex.exec(sqlContent)) !== null) {
    const valuesBlock = match[1];
    
    // Parse individual rows - handle nested parentheses and quoted strings
    let depth = 0;
    let inQuote = false;
    let escaped = false;
    let rowStart = -1;
    
    for (let i = 0; i < valuesBlock.length; i++) {
      const ch = valuesBlock[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      
      if (ch === "'" && !escaped) {
        inQuote = !inQuote;
        continue;
      }
      
      if (inQuote) continue;
      
      if (ch === '(') {
        if (depth === 0) rowStart = i + 1;
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0 && rowStart >= 0) {
          const rowStr = valuesBlock.substring(rowStart, i);
          
          // Parse the values
          const vals: string[] = [];
          let valInQuote = false;
          let valEscaped = false;
          let current = '';
          
          for (let j = 0; j < rowStr.length; j++) {
            const c = rowStr[j];
            if (valEscaped) { valEscaped = false; current += c; continue; }
            if (c === '\\') { valEscaped = true; current += c; continue; }
            if (c === "'" && !valEscaped) { valInQuote = !valInQuote; current += c; continue; }
            if (c === ',' && !valInQuote) { vals.push(current.trim()); current = ''; continue; }
            current += c;
          }
          vals.push(current.trim());
          
          const id = parseInt(vals[idColumnIndex]);
          const pidStr = vals[productIdColumnIndex];
          const product_id = pidStr === 'NULL' ? null : parseInt(pidStr);
          
          if (!isNaN(id)) {
            results.push({ id, product_id });
          }
          
          rowStart = -1;
        }
      }
    }
  }
  
  return results;
}

async function main() {
  console.log(`\n=== product_id 복원 스크립트 ===`);
  console.log(`모드: ${DRY_RUN ? 'DRY RUN (변경 없음)' : '실행 모드'}`);
  console.log(`백업 파일: ${BACKUP_FILE}`);
  console.log(`테넌트: ${TENANT_ID}\n`);

  // Read backup file
  console.log('백업 파일 읽는 중...');
  const sqlContent = fs.readFileSync(BACKUP_FILE, 'utf8');
  console.log(`백업 파일 크기: ${(sqlContent.length / 1024 / 1024).toFixed(1)} MB`);

  // Table definitions: [tableName, productIdColumnIndex, idColumnIndex, hastenantFilter]
  // Column indices verified from INFORMATION_SCHEMA.COLUMNS
  const tables: [string, number, number, boolean][] = [
    ['h_batches', 5, 0, true],              // id=col0, product_id=col5, tenant_id=col36
    ['h_mf_reports', 1, 0, true],            // id=col0, product_id=col1, tenant_id=col7
    ['h_ccp_instances', 6, 0, true],         // id=col0, product_id=col6, tenant_id=col16
    ['h_ccp_form_records', 6, 0, true],      // id=col0, product_id=col6, tenant_id=col1
    ['h_recipe_headers', 3, 0, true],        // id=col0, recipe_code=col1, product_id=col3, tenant_id=col11
    ['h_inventory_lots', 5, 0, true],        // id=col0, inventory_id=col1, product_id=col5, tenant_id=col22
    ['ccp_process_group_products', 3, 0, false], // id=col0, tenant_id=col1, process_group_id=col2, product_id=col3
  ];

  const conn = await mysql.createConnection(DB_URL);
  
  let totalRestored = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [tableName, pidIdx, idIdx, hasTenant] of tables) {
    console.log(`\n--- ${tableName} ---`);
    
    // Parse backup data
    const backupRows = parseInsertValues(sqlContent, tableName, pidIdx, idIdx);
    console.log(`  백업에서 ${backupRows.length}개 행 파싱됨`);
    
    if (backupRows.length === 0) {
      console.log(`  ⚠️ 백업에서 데이터를 찾지 못함, 스킵`);
      continue;
    }

    // Get current DB values
    let currentRows: any[];
    try {
      if (tableName === 'ccp_process_group_products') {
        [currentRows] = await conn.execute(
          `SELECT id, tenant_id, process_group_id, product_id FROM ${tableName} WHERE tenant_id = ?`,
          [TENANT_ID]
        ) as any[];
      } else {
        [currentRows] = await conn.execute(
          `SELECT id, product_id FROM ${tableName}${hasTenant ? ' WHERE tenant_id = ?' : ''}`,
          hasTenant ? [TENANT_ID] : []
        ) as any[];
      }
    } catch (e: any) {
      console.log(`  ❌ 테이블 조회 실패: ${e.message}`);
      totalErrors++;
      continue;
    }

    const currentMap = new Map<number, number | null>();
    for (const row of currentRows) {
      currentMap.set(Number(row.id), row.product_id);
    }

    // Compare and generate UPDATE statements
    let changedCount = 0;
    let unchangedCount = 0;
    
    for (const backupRow of backupRows) {
      const currentPid = currentMap.get(backupRow.id);
      
      if (currentPid === undefined) continue; // row doesn't exist in current DB (might be different tenant)
      
      if (currentPid === backupRow.product_id) {
        unchangedCount++;
        continue;
      }

      if (backupRow.product_id === null) continue;

      changedCount++;
      
      if (changedCount <= 5) {
        console.log(`  변경: id=${backupRow.id}, 현재=${currentPid} → 원본=${backupRow.product_id}`);
      }

      if (!DRY_RUN) {
        try {
          await conn.execute(
            `UPDATE ${tableName} SET product_id = ? WHERE id = ?`,
            [backupRow.product_id, backupRow.id]
          );
        } catch (e: any) {
          console.log(`  ❌ UPDATE 실패 (id=${backupRow.id}): ${e.message}`);
          totalErrors++;
        }
      }
    }
    
    if (changedCount > 5) {
      console.log(`  ... 외 ${changedCount - 5}건 더`);
    }
    
    console.log(`  결과: ${changedCount}건 변경${DRY_RUN ? ' 예정' : ' 완료'}, ${unchangedCount}건 동일`);
    totalRestored += changedCount;
    totalSkipped += unchangedCount;
  }

  await conn.end();

  console.log(`\n=== 요약 ===`);
  console.log(`총 복원: ${totalRestored}건`);
  console.log(`변경 없음: ${totalSkipped}건`);
  console.log(`오류: ${totalErrors}건`);
  console.log(`모드: ${DRY_RUN ? 'DRY RUN (실제 변경 없음)' : '실행 완료'}`);
}

main().catch(e => {
  console.error('스크립트 오류:', e);
  process.exit(1);
});
