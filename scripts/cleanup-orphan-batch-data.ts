/**
 * 삭제된 배치의 orphan 재고 데이터 청소 (기존 damage 정리)
 * ============================================================================
 * 배경: 과거 deleteBatch 가 h_inventory_lots(제품 LOT)·h_inventory_transactions
 *   (usage/inbound)를 안 지워, 삭제된 배치의 데이터가 orphan 으로 남음:
 *     (a) phantom 제품 LOT (batch_id 가 h_batches 에 없음) — 재고 부풀림 + lot_number 충돌원
 *     (b) BATCH_DELETED 유령 usage/inbound tx (source_id 배치가 없음)
 *   코드는 #414(deleteBatch 근본수정)로 미래분 차단. 이 스크립트가 '과거' orphan 청소.
 *
 * 처리 (=#414 deleteBatch 와 동일 원칙, 배치가 이미 없는 케이스):
 *   · orphan 제품 LOT: 미출고(available==quantity)면 삭제 + 그 inbound tx 삭제.
 *                      이미 출고/소비(available<quantity)면 보존 + 경고(수동 확인).
 *   · orphan usage tx: lot_id>0(실차감)이면 그 자재 LOT 복원 후 삭제, 유령(NULL/0)이면 삭제.
 *   · orphan 기타 BATCH tx(inbound 등): 삭제.
 *   · 영향 자재 집계(h_inventory) 재계산.
 *
 * 실행 (Genspark 서버):
 *   npx tsx scripts/cleanup-orphan-batch-data.ts            # DRY-RUN
 *   npx tsx scripts/cleanup-orphan-batch-data.ts --commit   # 실제 청소
 * 옵션: --tenant=2
 * ============================================================================
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";

config();
function arg(n: string, d?: string) { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split("=")[1] : d; }
const COMMIT = process.argv.includes("--commit");
const TENANT = Number(arg("tenant", "2"));
const EPS = 0.001;

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 미설정");
  const conn = await mysql.createConnection(url);
  console.log(`\n=== 삭제배치 orphan 청소 (${COMMIT ? "COMMIT" : "DRY-RUN"}) tenant=${TENANT} ===\n`);

  // ── 진단 ──
  const [[opl]]: any = await conn.query(
    `SELECT COUNT(*) AS n, ROUND(COALESCE(SUM(quantity),0),2) AS qty,
            SUM(available_quantity + ? < quantity) AS shipped
       FROM h_inventory_lots l
      WHERE l.tenant_id=? AND l.product_id IS NOT NULL AND l.batch_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM h_batches b WHERE b.id=l.batch_id AND b.tenant_id=l.tenant_id)`,
    [EPS, TENANT]);
  const [[otx]]: any = await conn.query(
    `SELECT COUNT(*) AS n,
            SUM(transaction_type='usage') AS usage_cnt,
            SUM(transaction_type='usage' AND lot_id>0) AS usage_real,
            SUM(transaction_type<>'usage') AS other_cnt
       FROM h_inventory_transactions t
      WHERE t.tenant_id=? AND t.source_type='BATCH' AND t.source_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM h_batches b WHERE b.id=t.source_id AND b.tenant_id=t.tenant_id)`,
    [TENANT]);
  console.log(`[orphan 제품 LOT] ${opl.n}건 / ${opl.qty} (출고돼 보존할 것 ${opl.shipped ?? 0}건)`);
  console.log(`[orphan BATCH tx] ${otx.n}건 (usage ${otx.usage_cnt} 중 실차감 ${otx.usage_real} / 기타 ${otx.other_cnt})`);

  if (!COMMIT) {
    console.log(`\nDRY-RUN — --commit 시: 미출고 orphan LOT 삭제 + orphan tx 정리(실차감 usage 는 자재 복원 후 삭제).`);
    await conn.end(); process.exit(0);
  }

  // ── COMMIT ──
  const affectedMaterials = new Set<number>();

  // (A) orphan usage tx 복원+삭제 / 유령 삭제
  const [usageRows]: any = await conn.query(
    `SELECT t.id, t.lot_id, t.quantity FROM h_inventory_transactions t
      WHERE t.tenant_id=? AND t.source_type='BATCH' AND t.transaction_type='usage'
        AND t.source_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM h_batches b WHERE b.id=t.source_id AND b.tenant_id=t.tenant_id)`,
    [TENANT]);
  let restored = 0, ghostDel = 0;
  for (const t of usageRows as any[]) {
    const lotId = Number(t.lot_id || 0), q = parseFloat(t.quantity || "0");
    await conn.beginTransaction();
    try {
      if (lotId > 0 && q > 0) {
        await conn.execute(
          `UPDATE h_inventory_lots SET available_quantity=available_quantity+?,
              current_quantity=COALESCE(current_quantity,quantity)+?,
              status=CASE WHEN status IN ('used','disposed','expired') THEN 'available' ELSE status END,
              updated_at=NOW()
            WHERE id=? AND tenant_id=?`, [q, q, lotId, TENANT]);
        const [[m]]: any = await conn.query(`SELECT material_id FROM h_inventory_lots WHERE id=?`, [lotId]);
        if (m?.material_id) affectedMaterials.add(Number(m.material_id));
        restored++;
      } else { ghostDel++; }
      await conn.execute(`DELETE FROM h_inventory_transactions WHERE id=? AND tenant_id=?`, [t.id, TENANT]);
      await conn.commit();
    } catch (e: any) { await conn.rollback(); console.error(`  usage tx#${t.id} 실패: ${String(e?.message||e).slice(0,80)}`); }
  }

  // (B) orphan 기타 BATCH tx (inbound 등) 삭제 — 삭제될 제품 LOT 의 입고기록 등
  const [delOther]: any = await conn.execute(
    `DELETE FROM h_inventory_transactions
      WHERE tenant_id=? AND source_type='BATCH' AND transaction_type<>'usage' AND source_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM h_batches b WHERE b.id=h_inventory_transactions.source_id AND b.tenant_id=?)`,
    [TENANT, TENANT]);

  // (C) orphan 제품 LOT 삭제(미출고만) + 그 inbound tx
  const [orphanLots]: any = await conn.query(
    `SELECT id, quantity, available_quantity FROM h_inventory_lots l
      WHERE l.tenant_id=? AND l.product_id IS NOT NULL AND l.batch_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM h_batches b WHERE b.id=l.batch_id AND b.tenant_id=l.tenant_id)`,
    [TENANT]);
  let lotDel = 0, lotKept = 0;
  for (const l of orphanLots as any[]) {
    const q = parseFloat(l.quantity||"0"), av = parseFloat(l.available_quantity||"0");
    if (av + EPS < q) { lotKept++; console.warn(`  제품 LOT#${l.id} 출고됨(av ${av}/q ${q}) — 보존(수동 확인)`); continue; }
    await conn.beginTransaction();
    try {
      await conn.execute(`DELETE FROM h_inventory_transactions WHERE lot_id=? AND tenant_id=?`, [l.id, TENANT]);
      await conn.execute(`DELETE FROM h_inventory_lots WHERE id=? AND tenant_id=?`, [l.id, TENANT]);
      await conn.commit(); lotDel++;
    } catch (e: any) { await conn.rollback(); console.error(`  제품 LOT#${l.id} 삭제 실패: ${String(e?.message||e).slice(0,80)}`); }
  }

  // (D) 영향 자재 집계 재계산
  for (const mid of affectedMaterials) {
    try {
      const { recomputeAggregateFromLots } = await import("../server/lib/inventory/applyInventoryDelta");
      await recomputeAggregateFromLots(conn as any, { tenantId: TENANT, subject: { materialId: mid } });
    } catch (e: any) { console.error(`  자재#${mid} 집계 재계산 실패: ${String(e?.message||e).slice(0,60)}`); }
  }

  console.log(`\n[결과] usage 복원 ${restored} / 유령삭제 ${ghostDel} / 기타tx삭제 ${(delOther as any).affectedRows ?? 0} / 제품LOT삭제 ${lotDel}(보존 ${lotKept}) / 자재집계 ${affectedMaterials.size}`);

  // 사후검증
  const [[a1]]: any = await conn.query(
    `SELECT COUNT(*) AS n FROM h_inventory_lots l WHERE l.tenant_id=? AND l.product_id IS NOT NULL AND l.batch_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM h_batches b WHERE b.id=l.batch_id AND b.tenant_id=l.tenant_id)`, [TENANT]);
  const [[a2]]: any = await conn.query(
    `SELECT COUNT(*) AS n FROM h_inventory_transactions t WHERE t.tenant_id=? AND t.source_type='BATCH' AND t.source_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM h_batches b WHERE b.id=t.source_id AND b.tenant_id=t.tenant_id)`, [TENANT]);
  console.log(`[검증] 남은 orphan 제품 LOT ${a1.n}건(출고보존분만), orphan BATCH tx ${a2.n}건`);

  await conn.end();
  console.log(`\n=== 종료 ===\n`);
  process.exit(0);
})().catch(e => { console.error("청소 실패:", e); process.exit(1); });
