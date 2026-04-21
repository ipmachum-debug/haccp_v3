/**
 * CCP-4P 금속검출 기록지 복구 스크립트
 * 
 * 문제: syncCcpRowsToFormRows에서 CCP-4P 기존 행이 있으면 continue로 건너뛰어
 *       첫 번째 배치의 데이터만 기록되고 나머지 일일 배치의 품목이 누락됨
 * 
 * 해결: ccpFormRecords.ts에서 CCP-4P의 continue 가드 제거 후,
 *       이 스크립트로 기존 불완전 레코드를 재동기화
 */

// DATABASE_URL 은 실행 전 env 로 주입 필요 (보안: 하드코딩 제거 2026-04-19)
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL 환경변수 미설정. 실행 예: DATABASE_URL=mysql://... npx tsx scripts/repair_ccp4p_resync.ts');
}

import { getRawConnection } from '../server/db/connection';
import { syncCcpRowsToFormRows } from '../server/db/ccpFormRecords';

const TENANT_ID = 2;

async function main() {
  const pool = await getRawConnection();

  // CCP-4P form rows가 없는 레코드의 batch_id 조회
  const [emptyRecords] = await pool.execute<any[]>(
    `SELECT fr.batch_id, fr.id as form_record_id, 
            DATE_FORMAT(fr.work_date, '%Y-%m-%d') as work_date
     FROM h_ccp_form_records fr
     LEFT JOIN h_ccp_form_rows cfr ON cfr.form_record_id = fr.id AND cfr.tenant_id = fr.tenant_id
     WHERE fr.tenant_id = ? AND fr.ccp_type = 'CCP-4P' AND cfr.id IS NULL
     ORDER BY fr.work_date DESC`,
    [TENANT_ID]
  );

  const batchIds = (emptyRecords as any[]).map((r: any) => r.batch_id);
  console.log(`Found ${batchIds.length} CCP-4P records needing resync`);
  
  if (batchIds.length === 0) {
    console.log('All CCP-4P records are complete. Nothing to do.');
    process.exit(0);
  }

  let success = 0, fail = 0;
  for (const batchId of batchIds) {
    const rec = (emptyRecords as any[]).find((r: any) => r.batch_id === batchId);
    try {
      const result = await syncCcpRowsToFormRows({ batchId, tenantId: TENANT_ID });
      console.log(`  ✅ batch=${batchId} (${rec?.work_date}): synced ${result.synced} rows`);
      success++;
    } catch (err: any) {
      console.log(`  ❌ batch=${batchId} (${rec?.work_date}): ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${success} success, ${fail} failed out of ${batchIds.length} batches`);

  // 검증
  const [verify] = await pool.execute<any[]>(
    `SELECT fr.id, DATE_FORMAT(fr.work_date, '%Y-%m-%d') as work_date,
            (SELECT COUNT(DISTINCT r.product_name) FROM h_ccp_form_rows r 
             WHERE r.form_record_id = fr.id AND r.tenant_id = ? AND r.equipment_type = 'passage') as passage_cnt,
            (SELECT COUNT(DISTINCT b.product_id) FROM h_batches b 
             WHERE b.tenant_id = ? AND b.planned_date = fr.work_date) as daily_cnt
     FROM h_ccp_form_records fr
     WHERE fr.ccp_type = 'CCP-4P' AND fr.tenant_id = ?
     ORDER BY fr.work_date DESC
     LIMIT 15`,
    [TENANT_ID, TENANT_ID, TENANT_ID]
  );

  console.log('\n최근 15일 검증:');
  console.log('날짜\t\t통과품목수\t일일배치품목수\t상태');
  for (const r of verify as any[]) {
    const status = r.passage_cnt >= r.daily_cnt ? '✅' : '❌';
    console.log(`${r.work_date}\t${r.passage_cnt}\t\t${r.daily_cnt}\t\t${status}`);
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
