process.env.DATABASE_URL = 'mysql://root:G0ld3n!T1004%23Sec@127.0.0.1:3306/haccp_tenant_db?charset=utf8mb4';
async function main() {
  const { syncCcpRowsToFormRows } = await import('../server/db/ccpFormRecords.ts');
  const { getRawConnection } = await import('../server/db/connection.ts');
  const pool = await getRawConnection();
  const [rows] = await pool.execute(
    `SELECT DISTINCT fr.batch_id FROM h_ccp_form_records fr
     LEFT JOIN h_ccp_form_rows cfr ON cfr.form_record_id = fr.id AND cfr.tenant_id = 2
     WHERE fr.tenant_id = 2 AND cfr.id IS NULL ORDER BY fr.batch_id`, []
  );
  console.log(`Empty records: ${rows.length}`);
  for (const r of rows) {
    const res = await syncCcpRowsToFormRows({ batchId: r.batch_id, tenantId: 2 });
    console.log(`batch ${r.batch_id}: synced ${res.synced}`);
  }
  console.log('Done');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
