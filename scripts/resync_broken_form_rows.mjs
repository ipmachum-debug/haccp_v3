/**
 * Resync broken CCP form rows - Direct DB approach
 * Imports syncCcpRowsToFormRows from the built dist/index.js
 */
import mysql from 'mysql2/promise';

const DB_URL = 'process.env.DATABASE_URL or set DB_URL env';
const TENANT_ID = 2;

async function main() {
  const pool = await mysql.createPool(DB_URL);
  
  // Get batch IDs with empty form records
  const [rows] = await pool.execute(
    `SELECT DISTINCT fr.batch_id, 
            GROUP_CONCAT(DISTINCT fr.ccp_type) as ccp_types,
            GROUP_CONCAT(DISTINCT fr.product_name) as products,
            GROUP_CONCAT(fr.id) as record_ids
     FROM h_ccp_form_records fr
     LEFT JOIN h_ccp_form_rows cfr ON cfr.form_record_id = fr.id AND cfr.tenant_id = ?
     WHERE fr.tenant_id = ? AND cfr.id IS NULL
     GROUP BY fr.batch_id
     ORDER BY fr.batch_id`,
    [TENANT_ID, TENANT_ID]
  );
  
  console.log(`Found ${rows.length} batches needing resync`);
  
  for (const row of rows) {
    console.log(`  batch ${row.batch_id}: ${row.ccp_types} - ${row.products} (records: ${row.record_ids})`);
  }
  
  await pool.end();
}

main().catch(console.error);
