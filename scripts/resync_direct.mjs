/**
 * Direct resync of broken CCP form rows
 * Sets up DATABASE_URL and calls syncCcpRowsToFormRows directly
 */
process.env.DATABASE_URL = 'process.env.DATABASE_URL or set DB_URL env';

const TENANT_ID = 2;

async function main() {
  // Dynamic import of the sync function (using the built source)
  const { syncCcpRowsToFormRows } = await import('../server/db/ccpFormRecords.ts');
  const { getRawConnection } = await import('../server/db/connection.ts');
  
  const pool = await getRawConnection();
  
  // Get batch IDs with empty form records
  const [rows] = await pool.execute(
    `SELECT DISTINCT fr.batch_id
     FROM h_ccp_form_records fr
     LEFT JOIN h_ccp_form_rows cfr ON cfr.form_record_id = fr.id AND cfr.tenant_id = ?
     WHERE fr.tenant_id = ? AND cfr.id IS NULL
     ORDER BY fr.batch_id`,
    [TENANT_ID, TENANT_ID]
  );
  
  const batchIds = rows.map(r => r.batch_id);
  console.log(`Found ${batchIds.length} batches needing resync`);
  
  let success = 0, fail = 0;
  for (const batchId of batchIds) {
    try {
      const result = await syncCcpRowsToFormRows({ batchId, tenantId: TENANT_ID });
      console.log(`✅ batch ${batchId}: synced ${result.synced} rows`);
      success++;
    } catch (err) {
      console.log(`❌ batch ${batchId}: ${err.message}`);
      fail++;
    }
  }
  
  console.log(`\nDone: ${success} success, ${fail} failed out of ${batchIds.length} batches`);
  
  // Verify results
  const [verifyRows] = await pool.execute(
    `SELECT fr.ccp_type, COUNT(*) as records_count,
            SUM(CASE WHEN cfr_cnt > 0 THEN 1 ELSE 0 END) as with_rows,
            SUM(CASE WHEN cfr_cnt = 0 THEN 1 ELSE 0 END) as without_rows
     FROM h_ccp_form_records fr
     LEFT JOIN (
       SELECT form_record_id, COUNT(*) as cfr_cnt
       FROM h_ccp_form_rows WHERE tenant_id = ?
       GROUP BY form_record_id
     ) cfr ON cfr.form_record_id = fr.id
     WHERE fr.tenant_id = ?
     GROUP BY fr.ccp_type`,
    [TENANT_ID, TENANT_ID]
  );
  console.log('\nVerification:');
  for (const r of verifyRows) {
    console.log(`  ${r.ccp_type}: ${r.records_count} records (${r.with_rows} with rows, ${r.without_rows} without)`);
  }
  
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
