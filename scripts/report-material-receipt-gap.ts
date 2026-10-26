/**
 * 원재료 입고 누락 리포트 (READ-ONLY) — "쓴 만큼 안 들어온" 자재 목록
 * ============================================================================
 * 배경: 유령 재차조정(#412) 후 SHORT 로 남은 자재들 = canonical 매핑해도 재고가 없음
 *   = "생산에 썼는데 그만큼 입고 기록이 없다". 이건 차감 버그가 아니라 입고 데이터 공백.
 *   이 리포트가 '무엇을 얼마나 입고 입력해야 하는지'를 자재별로 보여준다(읽기전용).
 *
 * 각 자재: 총소모(usage) vs 총입고(receipt/LOT) vs 현재고 → 부족분(=입력해야 할 입고량).
 *   + 이름 유사 자재에 재고가 있으면 표시(= id 파편화라 다른 id 로 들어왔을 가능성).
 *
 * 실행: npx tsx scripts/report-material-receipt-gap.ts   (옵션 --tenant=2)
 * ============================================================================
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";

config();
function arg(n: string, d?: string) { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split("=")[1] : d; }
const TENANT = Number(arg("tenant", "2"));

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  console.log(`\n=== 원재료 입고 누락 리포트 (READ-ONLY) tenant=${TENANT} ===\n`);

  // 자재별 총소모(usage) / 현재 가용재고(available LOT) / 총입고(receipt tx)
  const [rows]: any = await conn.query(
    `SELECT m.id AS material_id, m.material_name,
            ROUND(COALESCE(u.used,0),2)   AS used,
            ROUND(COALESCE(a.avail,0),2)  AS avail,
            ROUND(COALESCE(r.recv,0),2)   AS received
       FROM h_materials m
       LEFT JOIN (SELECT material_id, SUM(quantity) used FROM h_inventory_transactions
                   WHERE tenant_id=? AND transaction_type='usage' GROUP BY material_id) u ON u.material_id=m.id
       LEFT JOIN (SELECT material_id, SUM(available_quantity) avail FROM h_inventory_lots
                   WHERE tenant_id=? AND status='available' GROUP BY material_id) a ON a.material_id=m.id
       LEFT JOIN (SELECT material_id, SUM(quantity) recv FROM h_inventory_transactions
                   WHERE tenant_id=? AND transaction_type='receipt' GROUP BY material_id) r ON r.material_id=m.id
      WHERE m.tenant_id=?
      HAVING used > 0 AND (received + 0.001 < used)
      ORDER BY (used - received) DESC`,
    [TENANT, TENANT, TENANT, TENANT]);

  if ((rows as any[]).length === 0) { console.log("입고 누락 자재 없음 ✅"); await conn.end(); process.exit(0); }

  console.log(`입고 누락(소모 > 입고) 자재: ${(rows as any[]).length}종\n`);
  console.log(`  자재                     소모     입고    현재고   부족(입력필요)   유사자재재고?`);
  let totalGap = 0;
  for (const r of rows as any[]) {
    const gap = Math.round((r.used - r.received) * 100) / 100;
    totalGap += gap;
    // 이름 유사 자재(같은 첫 두 글자)에 재고가 있는지 — id 파편화 힌트
    const short = String(r.material_name || "").slice(0, 2);
    const [sim]: any = await conn.query(
      `SELECT m.id, m.material_name, ROUND(SUM(l.available_quantity),1) AS av
         FROM h_materials m JOIN h_inventory_lots l ON l.material_id=m.id AND l.status='available'
        WHERE m.tenant_id=? AND m.id<>? AND l.available_quantity>0.001 AND m.material_name LIKE ?
        GROUP BY m.id HAVING av>0 ORDER BY av DESC LIMIT 2`,
      [TENANT, r.material_id, `${short}%`]);
    const hint = (sim as any[]).length > 0
      ? (sim as any[]).map((s) => `${s.material_name}#${s.id}:${s.av}`).join(", ")
      : "-";
    console.log(`  ${String(r.material_name||"?").padEnd(22)}${String(r.used).padStart(9)}${String(r.received).padStart(8)}${String(r.avail).padStart(9)}${String(gap).padStart(14)}   ${hint}`);
  }
  console.log(`\n총 부족(입력해야 할 입고량 추정): ${Math.round(totalGap)} (단위 혼합)`);
  console.log(`\n판독:`);
  console.log(`  · '유사자재재고?' 에 값이 있으면 → 그 자재가 '다른 id 로 입고'된 것(id 파편화). 병합/재매핑 대상.`);
  console.log(`  · '-' 면 → 진짜 입고 미기록. 실제 입고 전표를 입력해야 재고가 맞음.`);

  await conn.end();
  console.log(`\n=== 끝 ===\n`);
  process.exit(0);
})().catch(e => { console.error("리포트 실패:", e); process.exit(1); });
