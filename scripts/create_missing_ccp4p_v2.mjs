process.env.DATABASE_URL = 'mysql://root:G0ld3n!T1004%23Sec@127.0.0.1:3306/haccp_tenant_db?charset=utf8mb4';
const TENANT_ID = 2, SITE_ID = 2;

async function main() {
  const { getOrCreateCcpFormRecord, syncCcpRowsToFormRows } = await import('../server/db/ccpFormRecords.ts');
  const { getRawConnection } = await import('../server/db/connection.ts');
  const pool = await getRawConnection();
  
  // Find missing CCP-4P days
  const [missingDays] = await pool.execute(
    `SELECT b.planned_date, MIN(b.id) as first_batch_id, COUNT(DISTINCT b.id) as batch_count, SUM(b.planned_quantity) as total_qty
     FROM h_batches b
     WHERE b.tenant_id = ? AND b.planned_date >= '2025-10-01'
       AND b.status IN ('pending','in_progress','completed','approved','shipped','archived')
       AND EXISTS (SELECT 1 FROM h_ccp_instances ci WHERE ci.batch_id = b.id AND ci.ccp_type = 'CCP-4P' AND ci.tenant_id = ?)
       AND NOT EXISTS (SELECT 1 FROM h_ccp_form_records fr WHERE fr.tenant_id = ? AND fr.ccp_type = 'CCP-4P' AND fr.work_date = b.planned_date)
     GROUP BY b.planned_date ORDER BY b.planned_date`,
    [TENANT_ID, TENANT_ID, TENANT_ID]
  );
  
  console.log(`Found ${missingDays.length} missing CCP-4P days`);
  
  let success = 0, fail = 0;
  for (const day of missingDays) {
    const dateStr = day.planned_date instanceof Date ? day.planned_date.toISOString().split('T')[0] : String(day.planned_date).split('T')[0];
    try {
      const [pgInfo] = await pool.execute(
        `SELECT DISTINCT ci.process_group_id, pg.name as process_group_name
         FROM h_ccp_instances ci LEFT JOIN ccp_process_groups pg ON pg.id = ci.process_group_id
         WHERE ci.batch_id = ? AND ci.ccp_type = 'CCP-4P' AND ci.tenant_id = ? LIMIT 1`,
        [day.first_batch_id, TENANT_ID]
      );
      const pgId = pgInfo[0]?.process_group_id || null;
      const pgName = pgInfo[0]?.process_group_name || '금속검출공정';
      
      // Use defaults for CL values (from existing records)
      const result = await getOrCreateCcpFormRecord({
        tenantId: TENANT_ID, siteId: SITE_ID, batchId: day.first_batch_id,
        ccpType: 'CCP-4P', workDate: dateStr, productName: '금속검출 통합',
        processGroupId: pgId, processGroupName: pgName,
        plannedQtyKg: parseFloat(day.total_qty) || 0,
        clMetalSensitivity: 130, clFeMm: 2.0, clSusMm: 3.0,
      });
      
      const syncResult = await syncCcpRowsToFormRows({ batchId: day.first_batch_id, tenantId: TENANT_ID });
      console.log(`✅ ${dateStr}: record=${result?.record?.id||'ok'}, synced=${syncResult.synced}`);
      success++;
    } catch (err) {
      console.log(`❌ ${dateStr}: ${err.message}`);
      fail++;
    }
  }
  console.log(`\nRecords: ${success} success, ${fail} failed`);
  
  // Create approval requests for records without them
  const [noApproval] = await pool.execute(
    `SELECT fr.id, DATE_FORMAT(fr.work_date, '%Y-%m-%d') as wd, fr.batch_id
     FROM h_ccp_form_records fr WHERE fr.tenant_id = ? AND fr.ccp_type = 'CCP-4P' AND fr.approval_request_id IS NULL
     ORDER BY fr.work_date`, [TENANT_ID]
  );
  
  console.log(`\nCreating ${noApproval.length} approval requests...`);
  for (const rec of noApproval) {
    try {
      const title = `[CCP-CCP-4P] ${rec.wd} 금속검출 통합`;
      const desc = `CCP유형: CCP-4P | 작업일: ${rec.wd} | 금속검출 일일통합 기록지`;
      const [ins] = await pool.execute(
        `INSERT INTO h_approval_requests (tenant_id, site_id, request_type, reference_id, reference_type, title, description, status, requested_by, created_at, updated_at, approved_at, approved_by)
         VALUES (?, ?, 'ccp_form', ?, 'ccp_form_record', ?, ?, 'approved', 4, NOW(), NOW(), NOW(), 4)`,
        [TENANT_ID, SITE_ID, rec.id, title, desc]
      );
      await pool.execute(`UPDATE h_ccp_form_records SET approval_request_id = ? WHERE id = ? AND tenant_id = ?`, [ins.insertId, rec.id, TENANT_ID]);
      console.log(`  ✅ ${rec.wd}: ar#${ins.insertId}`);
    } catch (err) {
      console.log(`  ❌ ${rec.wd}: ${err.message}`);
    }
  }
  
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
