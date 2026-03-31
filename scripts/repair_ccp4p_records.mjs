/**
 * Repair CCP-4P form rows by directly calling MySQL
 * 
 * The fix removes the `if (CCP-4P && existingSeqs.size > 0) continue;` guard
 * in syncCcpRowsToFormRows, so now CCP-4P records are always rebuilt.
 * 
 * This script triggers the resync by calling the running server's API
 * via internal curl to localhost, or alternatively we can use a session cookie.
 *
 * Simpler approach: We just need to delete the existing CCP-4P form_rows
 * for the incomplete records. The deployed server code will now rebuild them
 * the next time syncCcpRowsToFormRows is called (which happens on:
 * - batch completion/approval
 * - CCP form record access via ccpForm.getFormRows  
 * - manual resync via ccpForm.resyncFormRows)
 * 
 * BEST approach: Delete form_rows for all incomplete CCP-4P records.
 * Then trigger resync for each via API or the next access will rebuild them.
 */

import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: 'G0ld3n!T1004#Sec',
  database: 'haccp_tenant_db',
  charset: 'utf8mb4',
});

const TENANT_ID = 2;

async function main() {
  const conn = await pool.getConnection();
  try {
    // 1. Find all CCP-4P form records where passage products < daily products
    const [incompleteRecords] = await conn.execute(`
      SELECT fr.id as form_record_id, fr.work_date, fr.batch_id,
             (SELECT COUNT(DISTINCT r.product_name) 
              FROM h_ccp_form_rows r 
              WHERE r.form_record_id = fr.id AND r.tenant_id = ? AND r.equipment_type = 'passage') as passage_cnt,
             (SELECT COUNT(DISTINCT b.product_id) 
              FROM h_batches b 
              WHERE b.tenant_id = ? AND b.planned_date = fr.work_date) as daily_cnt
      FROM h_ccp_form_records fr
      WHERE fr.ccp_type = 'CCP-4P' AND fr.tenant_id = ?
      ORDER BY fr.work_date DESC
    `, [TENANT_ID, TENANT_ID, TENANT_ID]);

    const toFix = incompleteRecords.filter(r => r.passage_cnt < r.daily_cnt);
    console.log(`Found ${toFix.length} CCP-4P records needing repair out of ${incompleteRecords.length} total`);

    // 2. Delete form_rows for incomplete records (they will be rebuilt on next access)
    let deleted = 0;
    for (const rec of toFix) {
      const [result] = await conn.execute(
        `DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`,
        [rec.form_record_id, TENANT_ID]
      );
      deleted += result.affectedRows;
      console.log(`  Deleted rows for form_record=${rec.form_record_id} (${rec.work_date}): ${result.affectedRows} rows removed`);
    }
    console.log(`\nTotal deleted: ${deleted} form rows from ${toFix.length} records`);

    // 3. Also delete related new-table data for those dates
    const datesToFix = [...new Set(toFix.map(r => r.work_date))];
    for (const d of datesToFix) {
      const dateStr = typeof d === 'string' ? d : d.toISOString().slice(0,10);
      try {
        await conn.execute(
          `DELETE FROM h_ccp_batch_process_runs WHERE tenant_id = ? AND work_date = ?`,
          [TENANT_ID, dateStr]
        );
      } catch(e) { /* table may not exist */ }
      try {
        await conn.execute(
          `DELETE FROM h_ccp_metal_sku_slots WHERE tenant_id = ? AND batch_process_run_id IN (
            SELECT id FROM h_ccp_batch_process_runs WHERE tenant_id = ? AND work_date = ?
          )`,
          [TENANT_ID, TENANT_ID, dateStr]
        );
      } catch(e) { /* ignore */ }
    }

    console.log(`\nRepair complete. Form rows will be rebuilt on next access to each CCP-4P record.`);
    console.log(`Affected dates: ${datesToFix.map(d => typeof d === 'string' ? d : d.toISOString().slice(0,10)).join(', ')}`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
