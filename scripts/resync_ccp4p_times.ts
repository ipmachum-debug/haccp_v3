/**
 * CCP-4P 시간 재배분 스크립트
 * 장비 설정 변경 (08:20~16:20) 반영을 위해 모든 CCP-4P form rows를 재생성
 */
import { syncCcpRowsToFormRows } from "../server/db/ccpFormRecords";
import { getRawConnection } from "../server/db";

async function main() {
  const tenantId = 2;
  const pool = await getRawConnection();
  
  // 각 날짜의 첫 번째 배치 ID 조회
  const [rows] = await pool.execute<any[]>(
    `SELECT fr.id as form_record_id, fr.batch_id, fr.work_date, fr.batch_count
     FROM h_ccp_form_records fr
     WHERE fr.tenant_id = ? AND fr.ccp_type = 'CCP-4P'
     ORDER BY fr.work_date`,
    [tenantId]
  );
  
  console.log(`Found ${(rows as any[]).length} CCP-4P form records to resync`);
  
  for (const row of (rows as any[])) {
    const batchId = row.batch_id;
    const workDate = String(row.work_date).slice(0, 10);
    console.log(`\nResyncing: ${workDate} (batch_id=${batchId}, form_record_id=${row.form_record_id})`);
    
    try {
      const result = await syncCcpRowsToFormRows({ batchId, tenantId });
      console.log(`  -> synced ${result.synced} rows`);
    } catch (err: any) {
      console.error(`  -> ERROR: ${err.message}`);
    }
  }
  
  // Verify
  const [verify] = await pool.execute<any[]>(
    `SELECT fr.work_date, 
            MIN(r.metal_pass_time) as first_sensitivity,
            MAX(r.metal_pass_time) as last_sensitivity,
            MIN(r.pass_time_start) as first_passage,
            MAX(r.pass_time_end) as last_passage,
            COUNT(*) as row_count
     FROM h_ccp_form_rows r
     JOIN h_ccp_form_records fr ON fr.id = r.form_record_id
     WHERE fr.tenant_id = ? AND fr.ccp_type = 'CCP-4P'
     GROUP BY fr.work_date
     ORDER BY fr.work_date DESC
     LIMIT 15`,
    [tenantId]
  );
  
  console.log("\n=== Time Distribution Verification ===");
  for (const v of (verify as any[])) {
    console.log(`${String(v.work_date).slice(0,10)}: sensitivity ${v.first_sensitivity}-${v.last_sensitivity} | passage ${v.first_passage}-${v.last_passage} | ${v.row_count} rows`);
  }
  
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
