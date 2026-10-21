/**
 * LOT ↔ 재고 묶음 연결 정리 — 미리보기 / 승인 LOT 만 연결 변경 / 되돌리기 (2026-10-21, 단지 재고 정합 1단계)
 *
 * 다른 원료의 재고 묶음(inventory_id)에 연결된 원료 LOT 을 같은 원료 묶음으로 옮긴다. 분류·조건: scripts/_lib/lotRelink.ts
 *   바꾸는 것은 LOT.inventory_id 하나뿐 — 수량·가용·상태·거래·재고 집계는 그대로 (집계 보정은 별도 승인).
 *   READY 로 분류된 LOT 만 적용 후보. 보류(HOLD_*)·보고(REPORT_*)는 이 도구로 바꾸지 않는다.
 *
 * 실행 (Codex, 서버 — 검증 후 CEO 승인):
 *   npx tsx scripts/lot-inventory-relink.ts --tenant=2 --json=relink-preview.json                 # 미리보기 (쓰기 없음)
 *   npx tsx scripts/lot-inventory-relink.ts --tenant=2 --plan=relink-preview.json --only=101,102 \
 *       --apply --backup=relink-before.json                                                       # 승인 LOT 만
 *   npx tsx scripts/lot-inventory-relink.ts --tenant=2 --restore=relink-before.json                # 되돌리기
 *
 *   --apply 는 --plan(미리보기 파일) · --only(승인 LOT id) · --backup(새 파일) 이 모두 있어야 한다. 전체 일괄 적용 금지.
 *     --only 의 LOT 은 모두 plan 에서 READY 여야 한다 (아니면 실행 전 중단).
 *     적용 때 LOT 을 잠그고 다시 분류해, 지금 연결·목적지가 plan 과 같고 여전히 READY 일 때만 바꾼다 (아니면 건너뜀·이유 출력).
 *   --restore 는 백업의 LOT 을 원래 연결로 — 지금 연결이 이 도구가 바꾼 값일 때만.
 *   미리보기·백업 파일에는 LOT·원료 번호가 들어 있다 — 비공개 폴더에만 둔다 (공개 저장소·PR 금지).
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { getRawConnection } from "../server/db/connection";
import { parseOnlyIds } from "./_lib/onlyIds";
import { loadRelinkEntries, relinkFingerprint, approvedFromPlan, applyRelink, restoreRelink, type RelinkPlanFile, type RelinkEntry } from "./_lib/lotRelink";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const APPLY = process.argv.includes("--apply");
const TENANT = Number(arg("tenant"));
const JSON_OUT = arg("json");
const PLAN = arg("plan");
const BACKUP = arg("backup");
const RESTORE = arg("restore");

function summary(entries: RelinkEntry[]): string {
  const by = new Map<string, number>();
  for (const e of entries) by.set(e.category, (by.get(e.category) ?? 0) + 1);
  return Array.from(by.entries()).sort().map(([k, n]) => `${k} ${n}`).join(" · ") || "없음";
}

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  let only: number[] | null;
  try {
    only = parseOnlyIds(process.argv);
  } catch (e: any) {
    console.error(`❌ ${e.message}`);
    process.exit(2);
  }
  if (APPLY && RESTORE) throw new Error("--apply 와 --restore 는 함께 쓸 수 없다");

  // ── 되돌리기 ──
  if (RESTORE) {
    const b = JSON.parse(readFileSync(RESTORE, "utf-8"));
    if (b?.tool !== "lot-inventory-relink" || b.tenant !== TENANT || !Array.isArray(b.items)) throw new Error("이 도구의 같은 회사 백업 파일이 아니다");
    const items = (b.items as any[]).filter((it) => !only || only.includes(it.lotId));
    const { withInventoryTx } = await import("../server/lib/inventory/applyInventoryDelta");
    const res = await restoreRelink(withInventoryTx, TENANT, items);
    for (const r of res) console.log(`  ${r.ok ? "✓" : "– 건너뜀"} LOT#${r.lotId} 연결 ${r.from} → ${r.to} (${r.reason})`);
    console.log(`되돌리기: ${res.filter((r) => r.ok).length}/${res.length}`);
    return;
  }

  if (APPLY && (!only || !BACKUP || !PLAN)) throw new Error("--apply 는 --plan=<미리보기 파일> · --only=<LOT id,…> · --backup=<새 파일> 이 함께 있어야 한다 (전체 일괄 적용 금지)");
  if (APPLY && existsSync(BACKUP!)) throw new Error(`백업 파일이 이미 있습니다: ${BACKUP} — 다른 이름을 쓰세요`);

  const conn = await getRawConnection();
  try {
    // ── 미리보기 ──
    if (!APPLY) {
      const entries = await loadRelinkEntries(conn, TENANT, only ?? []);
      const fp = relinkFingerprint(TENANT, entries);
      console.log(`미리보기: 다른 원료 재고 묶음에 연결된 원료 LOT ${entries.length}개 (tenant ${TENANT}) — ${summary(entries)}`);
      for (const e of entries) {
        console.log(`  LOT#${e.lotId} 원료#${e.materialId} [${e.lotStatus ?? "-"}] 묶음 ${e.fromInventoryId}(원료#${e.fromMaterialId ?? "-"}) → ${e.toInventoryId ?? "-"} · ${e.category} · ${e.reason}`);
      }
      console.log(`READY 지문: ${fp}`);
      if (JSON_OUT) {
        const plan: RelinkPlanFile = { tool: "lot-inventory-relink", tenant: TENANT, generatedAt: new Date().toISOString(), fingerprint: fp, lots: entries };
        writeFileSync(JSON_OUT, JSON.stringify(plan, null, 2));
        console.log(`저장: ${JSON_OUT}`);
      }
      return;
    }

    // ── 적용 (승인 LOT 만) ──
    const plan = JSON.parse(readFileSync(PLAN!, "utf-8")) as RelinkPlanFile;
    const approved = approvedFromPlan(plan, TENANT, only!);

    const [before]: any = await conn.query(`SELECT * FROM h_inventory_lots WHERE tenant_id = ? AND id IN (?)`, [TENANT, approved.map((a) => a.lotId)]);
    writeFileSync(BACKUP!, JSON.stringify({
      tool: "lot-inventory-relink", tenant: TENANT, savedAt: new Date().toISOString(), planFingerprint: plan.fingerprint,
      items: approved.map((a) => ({ lotId: a.lotId, from: a.fromInventoryId, to: a.toInventoryId })),
      rows: before,
    }, null, 2));
    console.log(`백업: ${BACKUP} (${(before as any[]).length}행)`);

    const { withInventoryTx } = await import("../server/lib/inventory/applyInventoryDelta");
    const res = await applyRelink(withInventoryTx, TENANT, approved);
    for (const r of res) console.log(`  ${r.ok ? "✓" : "– 건너뜀"} LOT#${r.lotId} 연결 ${r.from} → ${r.to ?? "-"} (${r.reason})`);
    console.log(`적용: ${res.filter((r) => r.ok).length}/${res.length} — 수량·상태·거래·집계는 바꾸지 않음`);
  } finally {
    await (conn as any).end?.();
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});
