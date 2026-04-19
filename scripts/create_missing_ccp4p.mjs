/**
 * Create missing CCP-4P daily form records
 * For production days that have CCP-4P instances but no form records
 */
process.env.DATABASE_URL = 'process.env.DATABASE_URL or set DB_URL env';

const TENANT_ID = 2;
const SITE_ID = 2;

async function main() {
  const { getOrCreateCcpFormRecord } = await import('../server/db/ccpFormRecords.ts');
  const { getRawConnection } = await import('../server/db/connection.ts');
  const { syncCcpRowsToFormRows } = await import('../server/db/ccpFormRecords.ts');
  
  const pool = await getRawConnection();
  
  // Find days with CCP-4P instances but no form records
  const [missingDays] = await pool.execute(
    `SELECT b.planned_date,
            MIN(b.id) as first_batch_id,
            COUNT(DISTINCT b.id) as batch_count,
            SUM(b.planned_quantity) as total_qty
     FROM h_batches b
     WHERE b.tenant_id = ?
       AND b.planned_date >= '2025-10-01'
       AND b.status IN ('pending','in_progress','completed','approved','shipped','archived')
       AND EXISTS (
         SELECT 1 FROM h_ccp_instances ci
         WHERE ci.batch_id = b.id AND ci.ccp_type = 'CCP-4P' AND ci.tenant_id = ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM h_ccp_form_records fr
         WHERE fr.tenant_id = ? AND fr.ccp_type = 'CCP-4P' AND fr.work_date = b.planned_date
       )
     GROUP BY b.planned_date
     ORDER BY b.planned_date`,
    [TENANT_ID, TENANT_ID, TENANT_ID]
  );
  
  console.log(`Found ${missingDays.length} days needing CCP-4P form records`);
  
  let success = 0, fail = 0;
  for (const day of missingDays) {
    const dateStr = day.planned_date instanceof Date 
      ? day.planned_date.toISOString().split('T')[0]
      : String(day.planned_date).split('T')[0];
    
    try {
      // Get CCP-4P process group info from instances
      const [pgInfo] = await pool.execute(
        `SELECT DISTINCT ci.process_group_id, pg.name as pg_name,
                pg.name as process_group_name
         FROM h_ccp_instances ci
         LEFT JOIN ccp_process_groups pg ON pg.id = ci.process_group_id
         WHERE ci.batch_id = ? AND ci.ccp_type = 'CCP-4P' AND ci.tenant_id = ?
         LIMIT 1`,
        [day.first_batch_id, TENANT_ID]
      );
      const pgId = (pgInfo[0])?.process_group_id || null;
      const pgName = (pgInfo[0])?.process_group_name || '금속검출공정';
      
      // Get CL values from equipment
      const [equipInfo] = await pool.execute(
        `SELECT e.metal_sensitivity, e.metal_fe_mm, e.metal_sus_mm
         FROM equipments e
         WHERE e.tenant_id = ? AND e.type = '금속검출기' AND e.status = 'active'
         LIMIT 1`,
        [TENANT_ID]
      );
      const clMetalSensitivity = equipInfo[0]?.metal_sensitivity || 130;
      const clFeMm = parseFloat(equipInfo[0]?.metal_fe_mm) || 2.0;
      const clSusMm = parseFloat(equipInfo[0]?.metal_sus_mm) || 3.0;
      
      const result = await getOrCreateCcpFormRecord({
        tenantId: TENANT_ID,
        siteId: SITE_ID,
        batchId: day.first_batch_id,
        ccpType: 'CCP-4P',
        workDate: dateStr,
        productName: '금속검출 통합',
        processGroupId: pgId,
        processGroupName: pgName,
        plannedQtyKg: parseFloat(day.total_qty) || 0,
        clMetalSensitivity,
        clFeMm,
        clSusMm,
      });
      
      console.log(`✅ ${dateStr}: created record ${result?.record?.id || 'OK'}, batches=${day.batch_count}, qty=${day.total_qty}kg`);
      
      // Sync rows
      const syncResult = await syncCcpRowsToFormRows({ batchId: day.first_batch_id, tenantId: TENANT_ID });
      console.log(`   synced ${syncResult.synced} rows`);
      
      success++;
    } catch (err) {
      console.log(`❌ ${dateStr}: ${err.message}`);
      fail++;
    }
  }
  
  console.log(`\nDone: ${success} success, ${fail} failed`);
  
  // Also create approval requests for the new records
  const [newRecords] = await pool.execute(
    `SELECT fr.id, fr.work_date, fr.batch_id
     FROM h_ccp_form_records fr
     WHERE fr.tenant_id = ? AND fr.ccp_type = 'CCP-4P'
       AND fr.approval_request_id IS NULL
     ORDER BY fr.work_date`,
    [TENANT_ID]
  );
  
  console.log(`\nCreating approval requests for ${newRecords.length} CCP-4P records...`);
  
  for (const rec of newRecords) {
    try {
      const dateStr = rec.work_date instanceof Date 
        ? rec.work_date.toISOString().split('T')[0]
        : String(rec.work_date).split('T')[0];
      
      // Get batch number
      const [batchRow] = await pool.execute(
        `SELECT batch_number FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [rec.batch_id, TENANT_ID]
      );
      const batchNumber = batchRow[0]?.batch_number || `BATCH-${rec.batch_id}`;
      
      // Create approval request
      const title = `[CCP-CCP-4P] ${dateStr} 금속검출 통합`;
      const description = `CCP유형: CCP-4P | 작업일: ${dateStr} | 금속검출 일일통합 기록지`;
      
      const [insertResult] = await pool.execute(
        `INSERT INTO h_approval_requests 
         (tenant_id, site_id, request_type, reference_id, reference_type, title, description, 
          status, requested_by, created_at, updated_at, approved_at, approved_by)
         VALUES (?, ?, 'ccp_form', ?, 'ccp_form_record', ?, ?, 
                 'approved', 4, NOW(), NOW(), NOW(), 4)`,
        [TENANT_ID, SITE_ID, rec.id, title, description]
      );
      
      const arId = insertResult.insertId;
      await pool.execute(
        `UPDATE h_ccp_form_records SET approval_request_id = ? WHERE id = ? AND tenant_id = ?`,
        [arId, rec.id, TENANT_ID]
      );
      console.log(`  ✅ ${dateStr}: approval #${arId}`);
    } catch (err) {
      console.log(`  ❌ ${rec.work_date}: ${err.message}`);
    }
  }
  
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
