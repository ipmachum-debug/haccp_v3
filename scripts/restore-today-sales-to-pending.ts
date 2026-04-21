/**
 * 오늘 일괄업로드된 매출을 pending 으로 되돌리는 스크립트
 *
 * 배경:
 *   - `createSale()` 이 status='approved' 로 INSERT 하지만 productSalePost() 호출 없음
 *   - 결과: 재고/LOT/분개 실제 반영 없이 "상태만 승인됨" 인 반쪽 상태
 *   - 2026-04-21 수정 전까지 올라간 오늘의 146건을 pending 으로 복구
 *   - 이후 사용자가 승인 버튼 클릭 시 productSalePost() 가 실제 반영 수행
 *
 * 실행:
 *   npx tsx scripts/restore-today-sales-to-pending.ts
 *
 * 안전장치:
 *   - DRY_RUN=true 면 UPDATE 실행하지 않고 영향 건수만 출력
 *   - tenantId 지정 가능 (기본: 전체)
 *   - 오늘(KST) 생성된 건만 대상
 */
import { getRawConnection } from "../server/db/connection";

const DRY_RUN = process.env.DRY_RUN === "true";
const TENANT_ID = process.env.TENANT_ID ? Number(process.env.TENANT_ID) : null;

async function run() {
  const conn = await getRawConnection();

  // 오늘 (KST) 의 범위
  const todayKST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  console.log(`[restore-today-sales] 대상 날짜 (KST): ${todayKST}`);
  console.log(`[restore-today-sales] DRY_RUN=${DRY_RUN}, TENANT_ID=${TENANT_ID ?? "ALL"}`);

  const tenantFilter = TENANT_ID ? `AND tenant_id = ${TENANT_ID}` : "";

  // 1. 대상 건수 미리 확인
  const [countRows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM accounting_sales
     WHERE status = 'approved'
       AND DATE(CONVERT_TZ(created_at, '+00:00', '+09:00')) = ?
       ${tenantFilter}`,
    [todayKST],
  );
  const cnt = (countRows as Array<{ cnt: number }>)[0]?.cnt ?? 0;
  console.log(`[restore-today-sales] 복구 대상: ${cnt}건`);

  if (cnt === 0) {
    console.log(`[restore-today-sales] 대상 없음. 종료.`);
    process.exit(0);
  }

  // 샘플 출력
  const [sampleRows] = await conn.execute(
    `SELECT id, transaction_date, item_name, quantity, total_amount, status, created_at
     FROM accounting_sales
     WHERE status = 'approved'
       AND DATE(CONVERT_TZ(created_at, '+00:00', '+09:00')) = ?
       ${tenantFilter}
     ORDER BY id ASC
     LIMIT 5`,
    [todayKST],
  );
  console.log(`[restore-today-sales] 샘플 5건:`);
  for (const r of sampleRows as any[]) {
    console.log(`  #${r.id} ${r.transaction_date} ${r.item_name} qty=${r.quantity} ₩${r.total_amount}`);
  }

  if (DRY_RUN) {
    console.log(`[restore-today-sales] DRY_RUN=true — 실제 UPDATE 하지 않음. 종료.`);
    process.exit(0);
  }

  // 2. 실제 UPDATE
  const [result] = await conn.execute(
    `UPDATE accounting_sales
     SET status = 'pending'
     WHERE status = 'approved'
       AND DATE(CONVERT_TZ(created_at, '+00:00', '+09:00')) = ?
       ${tenantFilter}`,
    [todayKST],
  );
  const affected = (result as { affectedRows: number }).affectedRows;
  console.log(`[restore-today-sales] 완료. ${affected}건 pending 으로 복구됨.`);

  process.exit(0);
}

run().catch((err) => {
  console.error(`[restore-today-sales] 실패:`, err);
  process.exit(1);
});
