process.env.DATABASE_URL = 'mysql://root:G0ld3n!T1004%23Sec@127.0.0.1:3306/haccp_tenant_db?charset=utf8mb4';

import { syncCcpRowsToFormRows } from '../server/db/ccpFormRecords';

async function main() {
  const batchIds = [477, 478, 479, 480];
  for (const bid of batchIds) {
    try {
      const result = await syncCcpRowsToFormRows({ batchId: bid, tenantId: 2 });
      console.log(`Batch ${bid}: synced=${result.synced}`);
    } catch (e: any) {
      console.error(`Batch ${bid} error:`, e?.message || e);
    }
  }
  console.log('Done');
  process.exit(0);
}
main();
