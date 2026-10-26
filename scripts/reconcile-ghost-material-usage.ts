/**
 * 원재료 유령 usage 재조정 (단절2 과거분) — canonical resolver 기반
 * ============================================================================
 * 배경 (전수 진단):
 *   배치완료 시 autoMaterialIssue(구 FEFO)가 inventory_id 로만 LOT 을 찾다가 실패하면
 *   lot_id NULL/0 의 "유령" usage tx 만 쓰고 실제 LOT 은 안 깎았음.
 *   전 기간(2026-04~07) 221배치·1,228건·71재료·약 28.4t. #408(FEFO 완화)로 미래분은
 *   차단됨. 이 스크립트가 '과거' 유령을 실제 LOT 에 소급 차감(canonical id 기준).
 *
 *   ★ 핵심: 유령의 material_id 다수가 name=NULL 인 구(舊) id 라, 그 id 로는 재고 LOT 이
 *   0. resolveMaterialIds(FK-우선)로 canonical h_materials.id 로 매핑해야 실제 재고를
 *   찾는다. 이 스크립트는 dry-run 에서 그 canonical 매핑 결과까지 시뮬레이션한다.
 *
 * 타겟: source_type='BATCH' & transaction_type='usage' & (lot_id IS NULL OR lot_id=0).
 *   (완료·LOT없음 배치가 아니라 '유령 tx' 자체를 독립 타겟 — #406 Part B 구조결함 수정)
 *
 * 멱등: lot_id 채워진 tx 는 제외. 커밋 시 tx.lot_id 를 실제 LOT 로 채워 재처리 방지.
 * 안전: tx 1건씩 개별 트랜잭션. 가용부족(SHORT)은 skip+집계. 순차 차감(경합 없음).
 *
 * 실행 (Genspark 서버):
 *   npx tsx scripts/reconcile-ghost-material-usage.ts            # DRY-RUN (canonical 매핑 포함)
 *   npx tsx scripts/reconcile-ghost-material-usage.ts --commit   # 실제 재차감
 * 옵션: --tenant=2
 * ============================================================================
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";

config();
function arg(name: string, def?: string) { const h = process.argv.find(a => a.startsWith(`--${name}=`)); return h ? h.split("=")[1] : def; }
const COMMIT = process.argv.includes("--commit");
const TENANT = Number(arg("tenant", "2"));
const EPS = 0.001;

interface Canon { canonicalId: number; source: string; name: string | null; }

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 미설정");
  const conn = await mysql.createConnection(url);
  console.log(`\n=== 원재료 유령 usage 재조정 (${COMMIT ? "COMMIT" : "DRY-RUN"}) tenant=${TENANT} ===\n`);

  const { resolveMaterialIds } = await import("../server/lib/production/materialIdResolver");

  // 1) 유령 usage tx
  //   ★ 안전 가드: 실제 생산이 일어난 배치만(취소/미시작 제외). cancelled/planned 배치의
  //   유령을 재차감하면 없는 소비를 만들어 재고를 잘못 깎음(lot_id NULL 이라 원래 안 깎였고
  //   취소면 되돌릴 것도 없음). 존재하지 않는 배치(삭제) 도 JOIN 으로 자동 제외.
  const [ghostRows]: any = await conn.execute(
    `SELECT t.id, t.source_id AS batch_id, t.material_id, t.quantity, t.unit
       FROM h_inventory_transactions t
       JOIN h_batches b ON b.id = t.source_id AND b.tenant_id = t.tenant_id
      WHERE t.tenant_id=? AND t.source_type='BATCH' AND t.transaction_type='usage'
        AND (t.lot_id IS NULL OR t.lot_id=0)
        AND b.status NOT IN ('cancelled', 'planned')
      ORDER BY t.id`,
    [TENANT],
  );
  const ghosts = ghostRows as Array<{ id: number; batch_id: number; material_id: number; quantity: string; unit: string }>;
  console.log(`[유령 tx] ${ghosts.length}건 / 배치 ${new Set(ghosts.map(g => g.batch_id)).size} / 재료 ${new Set(ghosts.map(g => g.material_id)).size}종`);
  if (ghosts.length === 0) { await conn.end(); console.log("대상 없음."); process.exit(0); }

  // 2) canonical 해석(캐시) + canonical 별 needed 집계
  const resolveCache = new Map<number, Canon>();
  async function canon(rawId: number): Promise<Canon> {
    let c = resolveCache.get(rawId);
    if (!c) {
      const r: any = await resolveMaterialIds(Number(rawId), TENANT, conn as any);
      c = { canonicalId: Number(r.canonicalId), source: r.source, name: r.materialName };
      resolveCache.set(rawId, c);
    }
    return c;
  }

  const byCanon = new Map<number, { needed: number; txCount: number; rawIds: Set<number>; name: string | null; sources: Set<string> }>();
  for (const g of ghosts) {
    const c = await canon(g.material_id);
    const key = c.canonicalId;
    if (!byCanon.has(key)) byCanon.set(key, { needed: 0, txCount: 0, rawIds: new Set(), name: c.name, sources: new Set() });
    const e = byCanon.get(key)!;
    e.needed += parseFloat(g.quantity || "0");
    e.txCount++;
    e.rawIds.add(g.material_id);
    e.sources.add(c.source);
  }

  // 3) canonical 별 가용 재고
  let okMats = 0, shortMats = 0, okQty = 0, shortQty = 0;
  const report: Array<{ canonicalId: number; name: string | null; needed: number; avail: number; ok: boolean; txCount: number; rawIds: string; sources: string }> = [];
  for (const [canonicalId, e] of byCanon) {
    const [av]: any = await conn.execute(
      `SELECT COALESCE(SUM(available_quantity),0) AS avail FROM h_inventory_lots
        WHERE tenant_id=? AND material_id=? AND status='available' AND available_quantity>?`,
      [TENANT, canonicalId, EPS],
    );
    const avail = parseFloat(av[0]?.avail || "0");
    const ok = avail + EPS >= e.needed;
    if (ok) { okMats++; okQty += e.needed; } else { shortMats++; shortQty += e.needed; }
    report.push({ canonicalId, name: e.name, needed: Math.round(e.needed * 1000) / 1000, avail: Math.round(avail * 1000) / 1000, ok, txCount: e.txCount, rawIds: [...e.rawIds].join(","), sources: [...e.sources].join(",") });
  }
  report.sort((a, b) => b.needed - a.needed);

  console.log(`\n[canonical 매핑 후] 재차감 가능 ${okMats}종(${Math.round(okQty)}kg) / 가용부족 ${shortMats}종(${Math.round(shortQty)}kg)`);
  console.log(`\n  canonical  needed      avail       판정  tx   rawIds(원본) / resolver`);
  for (const r of report.slice(0, 60)) {
    console.log(`  ${String(r.canonicalId).padEnd(9)}${String(r.needed).padStart(10)}${String(r.avail).padStart(12)}   ${r.ok ? "OK  " : "SHORT"} ${String(r.txCount).padStart(3)}   ${r.name ?? "(name null)"} [${r.rawIds}] ${r.sources}`);
  }

  if (!COMMIT) {
    console.log(`\nDRY-RUN — 위 canonical 매핑 결과 확인 후 --commit. SHORT 종은 재고 자체가 없어 수동 조사 필요.`);
    await conn.end();
    process.exit(0);
  }

  // 4) COMMIT — tx 1건씩 개별 트랜잭션으로 FEFO 재차감
  console.log(`\n[COMMIT] 유령 tx 재차감 시작...`);
  let fixed = 0, skipShort = 0, skipUnresolved = 0, failed = 0, fixedQty = 0;
  for (const g of ghosts) {
    const c = await canon(g.material_id);
    if (c.source === "not_found") { skipUnresolved++; continue; }
    const need = parseFloat(g.quantity || "0");
    if (need <= 0) { continue; }
    try {
      await conn.beginTransaction();
      // 멱등 재검증 + FEFO LOT 잠금
      const [txRow]: any = await conn.execute(
        `SELECT lot_id FROM h_inventory_transactions WHERE id=? AND tenant_id=? FOR UPDATE`, [g.id, TENANT]);
      if (txRow[0] && txRow[0].lot_id != null && Number(txRow[0].lot_id) > 0) { await conn.rollback(); continue; }
      const [lots]: any = await conn.execute(
        `SELECT id, available_quantity, quantity FROM h_inventory_lots
          WHERE tenant_id=? AND material_id=? AND status='available' AND available_quantity>?
          ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC, id ASC FOR UPDATE`,
        [TENANT, c.canonicalId, EPS]);
      const avail = (lots as any[]).reduce((s, l) => s + parseFloat(l.available_quantity || "0"), 0);
      if (avail + EPS < need) { await conn.rollback(); skipShort++; continue; }

      let remaining = need, firstLot = 0;
      for (const lot of lots as any[]) {
        if (remaining <= EPS) break;
        const take = Math.min(parseFloat(lot.available_quantity || "0"), remaining);
        if (take <= 0) continue;
        await conn.execute(
          `UPDATE h_inventory_lots
              SET available_quantity=GREATEST(0, available_quantity-?),
                  current_quantity=GREATEST(0, COALESCE(current_quantity, quantity)-?),
                  status=CASE WHEN GREATEST(0, available_quantity-?)<=? THEN 'used' ELSE status END,
                  updated_at=NOW()
            WHERE id=? AND tenant_id=?`,
          [take, take, take, EPS, lot.id, TENANT]);
        if (!firstLot) firstLot = Number(lot.id);
        remaining -= take;
      }
      // 유령 tx → 실제 LOT 연결 + canonical material_id 정정 + 표식
      await conn.execute(
        `UPDATE h_inventory_transactions
            SET lot_id=?, material_id=?, notes=CONCAT(COALESCE(notes,''),' [ghost-reconcile: 실LOT 재차감]')
          WHERE id=? AND tenant_id=?`,
        [firstLot, c.canonicalId, g.id, TENANT]);
      // batch_inputs 플래그 보정(있으면)
      await conn.execute(
        `UPDATE h_batch_inputs SET inventory_deducted=1
          WHERE tenant_id=? AND batch_id=? AND material_id=? AND inventory_deducted=0`,
        [TENANT, g.batch_id, g.material_id]);
      await conn.commit();
      fixed++; fixedQty += need;
    } catch (e: any) {
      try { await conn.rollback(); } catch {}
      failed++;
      if (failed <= 10) console.error(`  tx#${g.id} 실패: ${String(e?.message || e).slice(0, 100)}`);
    }
  }
  console.log(`\n[결과] 재차감 ${fixed}건(${Math.round(fixedQty)}kg) / 가용부족 skip ${skipShort} / 미해결 skip ${skipUnresolved} / 실패 ${failed}`);

  // 사후검증
  const [[after]]: any = await conn.query(
    `SELECT COUNT(*) AS remaining FROM h_inventory_transactions
      WHERE tenant_id=? AND source_type='BATCH' AND transaction_type='usage' AND (lot_id IS NULL OR lot_id=0)`,
    [TENANT]);
  console.log(`[검증] 남은 유령 usage(전체): ${after.remaining}건 (SHORT + 미해결 + cancelled/planned/삭제배치 만 잔존해야 정상)`);

  await conn.end();
  console.log(`\n=== 종료 ===\n`);
  process.exit(0);
})().catch((e) => { console.error("재조정 실패:", e); process.exit(1); });
