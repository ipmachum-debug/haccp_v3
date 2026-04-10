import { syncCcpRowsToFormRows } from '../server/db/ccpFormRecords';

async function main() {
  console.log('Triggering CCP resync for 2026-04-06 batches...');
  
  // Resync batch 477 first (triggers CCP-4P daily integration with all 4 products)
  console.log('Resyncing batch 477 (CCP-1B 다이스인절미 + CCP-4P 금속검출 통합)...');
  const result = await syncCcpRowsToFormRows({ batchId: 477, tenantId: 2 });
  console.log(`  CCP-4P resync: synced=${result.synced}`);
  
  // Resync batches 478-480 (CCP-1B form rows)
  for (const bId of [478, 479, 480]) {
    console.log(`Resyncing batch ${bId}...`);
    const r = await syncCcpRowsToFormRows({ batchId: bId, tenantId: 2 });
    console.log(`  result: synced=${r.synced}`);
  }
  
  console.log('Done!');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
