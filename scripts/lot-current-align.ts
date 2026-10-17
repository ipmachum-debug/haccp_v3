/**
 * LOT 현재수량(current_quantity) → 가용(available_quantity) 맞춤 — 미리보기 / 승인 LOT 만 (2026-10-17, 단지 재고 복구 2단계 ①)
 *
 * 대상: 현재수량 ≠ 가용이면서 가용 = 장부(입고 + 조정 − 사용) 인 LOT 만 (report-lot-integrity 의 CURRENT_DIFF '제안').
 *   가용·장부가 같으니 근거가 있는 값은 가용이다 — 현재수량만 그 값으로. 가용·상태·거래·집계는 바꾸지 않는다.
 *   가용이 장부와 다른 LOT 은 대상이 아니다 (실사 대상).
 *
 * 실행 (Codex, 서버 — 검증 후 CEO 승인):
 *   npx tsx scripts/lot-current-align.ts --tenant=2 [--json=preview.json]                    # 미리보기
 *   npx tsx scripts/lot-current-align.ts --tenant=2 --only=145,153 --apply --backup=lot-cur-before.json
 *   --apply 는 --only(LOT id) 와 --backup(새 파일) 이 모두 있어야 한다. 적용 때 LOT 을 잠그고 조건을 다시 확인한다.
 */
import { writeFileSync, existsSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";
import { parseOnlyIds } from "./_lib/onlyIds";
import { loadLotLedger, classifyLot, same, r3 } from "./_lib/lotLedger";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const APPLY = process.argv.includes("--apply");
const TENANT = Number(arg("tenant"));
const JSON_OUT = arg("json");
const BACKUP = arg("backup");

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  let only: number[] | null;
  try {
    only = parseOnlyIds(process.argv);
  } catch (e: any) {
    console.error(`❌ ${e.message}`);
    process.exit(2);
  }
  if (APPLY && (!only || !BACKUP)) throw new Error("--apply 는 --only=<LOT id,…> 와 --backup=<파일> 이 함께 있어야 한다 (전체 일괄 적용 금지)");
  if (APPLY && BACKUP && existsSync(BACKUP)) throw new Error(`백업 파일이 이미 있습니다: ${BACKUP} — 다른 이름을 쓰세요`);
  const conn = await getRawConnection();
  const all = await loadLotLedger(conn, TENANT, [], only ?? []);
  const targets = all.filter((l) => classifyLot(l).some((c) => c.cat === "CURRENT_DIFF" && c.proposal));
  console.log(`${APPLY ? "적용" : "미리보기"}: 현재수량 → 가용 맞춤 대상 LOT ${targets.length}개 (tenant ${TENANT})`);
  for (const l of targets) {
    console.log(`  LOT#${l.id} ${l.material}(#${l.materialId}) ${l.lot} [${l.status}] 현재 ${l.current} → ${l.available} (차 ${r3(l.available - (l.current ?? 0))}) · 입고 ${l.quantity} · 장부 ${l.ledger}`);
  }
  if (only) {
    const missing = only.filter((id) => !targets.some((t) => t.id === id));
    if (missing.length) console.warn(`⚠️ 대상이 아닌 LOT id (조건 불충족·없음): ${missing.join(",")} — 건너뜀`);
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ tenant: TENANT, generatedAt: new Date().toISOString(), lots: targets }, null, 2));
  if (APPLY && targets.length) {
    const [before]: any = await conn.query(`SELECT * FROM h_inventory_lots WHERE tenant_id = ? AND id IN (?)`, [TENANT, targets.map((t) => t.id)]);
    writeFileSync(BACKUP!, JSON.stringify({ tenant: TENANT, savedAt: new Date().toISOString(), rows: before }, null, 2));
    console.log(`백업: ${BACKUP} (${(before as any[]).length}행)`);
    const { withInventoryTx } = await import("../server/lib/inventory/applyInventoryDelta");
    for (const t of targets) {
      const ok = await withInventoryTx(async (c) => {
        await c.execute(`SELECT id FROM h_inventory_lots WHERE id = ? AND tenant_id = ? FOR UPDATE`, [t.id, TENANT]);
        const [cur] = await loadLotLedger(c, TENANT, [], [t.id]);
        // 잠근 뒤 다시 확인 — 그 사이 출고·입고가 있었으면 건너뜀
        if (!cur || !same(cur.available, cur.ledger) || cur.current == null || same(cur.current, cur.available)) return false;
        await c.execute(`UPDATE h_inventory_lots SET current_quantity = available_quantity WHERE id = ? AND tenant_id = ?`, [t.id, TENANT]);
        return true;
      }, `lot-current-align:${t.id}`);
      console.log(`  ${ok ? "✓" : "– 건너뜀(조건 바뀜)"} LOT#${t.id}`);
    }
  }
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});
