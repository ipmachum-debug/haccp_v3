// DATABASE_URL 은 실행 전 env 로 주입 필요 (보안: 하드코딩 제거 2026-04-19)
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL 환경변수 미설정');
}

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
