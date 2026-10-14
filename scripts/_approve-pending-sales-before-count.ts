/**
 * 일회성 — 실사 전 대기(pending) 매출 일괄 확정 (2026-10-14, CEO 결정 "대기 매출은 처리하는 게 맞다")
 *
 * 왜: 실사로 재고를 실제값에 맞춘 뒤에 옛 대기 매출을 확정하면, 맞춘 재고에서 다시 빠진다.
 *     그래서 실사 **전에** 대기 매출을 정식 확정 로직으로 모두 처리한다.
 *
 * 방법: 화면의 "승인" 버튼과 같은 dispatchPostSale → postProductSale 을 매출 1건씩 호출 (상태 필드를 DB 로
 *       직접 바꾸지 않는다 — 재고 차감·LOT·원장·분개가 함께 처리돼야 하므로).
 *  - 회계 제외(B2C) 매출: 재고만 차감, 분개 없음 (기존 정책)
 *  - 회계 포함 매출: 재고 차감 + 매출·부가세·매출원가 분개 (거래일자 기준)
 *  - 제품 출고 화면에서 만든 매출(source_type product_outbound + 출고 LOT 있음): 이미 출고 때 차감 → 재고는 건드리지 않고 원가만 (#484)
 *  - 재고 부족: 음수 차감 (#483) — 실사 때 정리
 *  - 매출 거래일자 오래된 순, 같은 날은 id 순
 *
 * 실행 (Codex, 서버):
 *   npx tsx scripts/_approve-pending-sales-before-count.ts --tenant 2 --dry-run              # 대상 집계만 (쓰기 없음)
 *   npx tsx scripts/_approve-pending-sales-before-count.ts --tenant 2 --until 2026-10-14     # 그 날짜까지 실행
 *   npx tsx scripts/_approve-pending-sales-before-count.ts --tenant 2 --until 2026-10-14 --limit 50   # 처음엔 50건만
 *   APPROVE_USER_ID=4 → posted_by 에 기록될 사용자 (기본 4 = 대표)
 *
 * 안전: 1건씩 독립 트랜잭션. 실패한 매출은 pending 그대로 남고 사유를 출력. 같은 스크립트를 다시 돌려도
 *       이미 확정된 매출은 대상에서 빠진다 (멱등).
 */
import { getRawConnection } from "../server/db/connection";

const args = process.argv.slice(2);
const getArg = (k: string): string | null => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const DRY = args.includes("--dry-run");
const TENANT_ID = Number(getArg("--tenant"));
const UNTIL = getArg("--until");
const LIMIT = getArg("--limit") ? Number(getArg("--limit")) : null;
const USER_ID = Number(process.env.APPROVE_USER_ID ?? 4);

async function main() {
  if (!TENANT_ID) throw new Error("--tenant <id> 필수");
  if (!DRY && !UNTIL) throw new Error("실행 시 --until YYYY-MM-DD 필수 (실사일 이전까지만 처리)");
  const pool = await getRawConnection();

  const cond = `tenant_id = ? AND status = 'pending'${UNTIL ? " AND transaction_date <= ?" : ""}`;
  const params: any[] = UNTIL ? [TENANT_ID, UNTIL] : [TENANT_ID];

  // 1. 집계
  const [summary] = await pool.execute<any[]>(
    `SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS ym,
            COALESCE(source_type, 'manual') AS src,
            COALESCE(accounting_excluded, 0) AS excluded,
            COUNT(*) AS n, ROUND(SUM(total_amount)) AS amount
     FROM accounting_sales WHERE ${cond}
     GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
    params,
  );
  console.log(`대상 대기 매출 (tenant ${TENANT_ID}${UNTIL ? `, ~${UNTIL}` : ""}):`);
  console.table(summary);
  const total = (summary as any[]).reduce((s, r) => s + Number(r.n), 0);
  console.log(`합계 ${total}건${LIMIT ? ` (이번 실행 ${LIMIT}건 제한)` : ""}`);

  // 출고 화면 매출 중 이미 LOT 차감된 건 (확정 시 재고 생략 대상)
  const [ob] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS n FROM accounting_sales s
     JOIN h_product_outbound o ON o.id = s.source_id AND o.tenant_id = s.tenant_id
     WHERE s.tenant_id = ? AND s.status = 'pending'${UNTIL ? " AND s.transaction_date <= ?" : ""}
       AND s.source_type = 'product_outbound' AND o.lot_id IS NOT NULL AND o.status <> 'cancelled'`,
    params,
  );
  console.log(`  └ 제품 출고 화면에서 이미 LOT 차감된 매출: ${(ob as any[])[0].n}건 (확정 시 재고 차감 생략, 원가만)`);

  if (DRY) {
    console.log("\n--dry-run: 쓰기 없음. 실행하려면 --until YYYY-MM-DD 를 주고 --dry-run 을 빼세요.");
    process.exit(0);
  }

  // 2. 실행 — 1건씩 정식 확정 로직
  const [rows] = await pool.execute<any[]>(
    `SELECT id, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS d, item_name
     FROM accounting_sales WHERE ${cond}
     ORDER BY transaction_date ASC, id ASC${LIMIT ? ` LIMIT ${Math.max(1, Math.floor(LIMIT))}` : ""}`,
    params,
  );
  const { dispatchPostSale } = await import("../server/lib/accounting/postDispatcher");
  let ok = 0;
  const failures: Array<{ id: number; d: string; item: string; message: string }> = [];
  for (const r of rows as any[]) {
    try {
      await dispatchPostSale(Number(r.id), USER_ID);
      ok++;
      if (ok % 100 === 0) console.log(`  … ${ok}건 확정`);
    } catch (e: any) {
      failures.push({ id: Number(r.id), d: r.d, item: String(r.item_name ?? ""), message: String(e?.message ?? e) });
    }
  }

  console.log(`\n확정 ${ok}건 / 실패 ${failures.length}건`);
  if (failures.length > 0) {
    console.log("실패 목록 (pending 그대로 남음):");
    console.table(failures.slice(0, 50));
    if (failures.length > 50) console.log(`… 외 ${failures.length - 50}건`);
  }

  // 3. 확인
  const [left] = await pool.execute<any[]>(`SELECT COUNT(*) AS n FROM accounting_sales WHERE ${cond}`, params);
  const [neg] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS n FROM h_inventory_lots WHERE tenant_id = ? AND available_quantity < -0.001`,
    [TENANT_ID],
  );
  console.log(`남은 대기 매출: ${(left as any[])[0].n}건 / 현재 음수 LOT: ${(neg as any[])[0].n}개 (실사 때 정리)`);
  process.exit(0);
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
