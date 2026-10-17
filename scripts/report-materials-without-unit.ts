/**
 * 기준 단위가 비어 있는 원재료 — 대조표 (읽기 전용, 2026-10-17, CEO 결정 6)
 *
 * 왜: 입고는 원재료 기준 단위가 있어야 한다 (환산 근거). 비어 있는 원재료는 입고가 막힌다.
 *     단위는 규격·기존 LOT·거래 단위를 보고 사람이 정한다 — 전부 kg 로 채우거나 이름만 바꾸는 보정은 하지 않는다.
 *     기존 수량을 환산해야 하는 원재료는 별도 대상으로 분리한다.
 * 이 스크립트는 SELECT 만 한다. 결과를 보고 원재료 정보 화면(또는 승인된 개별 수정)으로 지정한다.
 *
 * 실행: npx tsx scripts/report-materials-without-unit.ts --tenant=2
 */
import { getRawConnection } from "../server/db/connection";

const tenant = Number(process.argv.find((a) => a.startsWith("--tenant="))?.split("=")[1]);

async function main() {
  if (!Number.isSafeInteger(tenant) || tenant <= 0) throw new Error("--tenant=<id> 필수");
  const conn = await getRawConnection();
  const [mats]: any = await conn.execute(
    `SELECT id, material_code, material_name, unit, specification
       FROM h_materials WHERE tenant_id = ? AND (unit IS NULL OR TRIM(unit) = '') ORDER BY id`,
    [tenant],
  ).catch(async () => conn.execute(
    `SELECT id, material_code, material_name, unit, NULL AS specification
       FROM h_materials WHERE tenant_id = ? AND (unit IS NULL OR TRIM(unit) = '') ORDER BY id`, [tenant],
  ));
  console.log(`기준 단위 없는 원재료 ${(mats as any[]).length}개 (tenant ${tenant})`);
  for (const m of mats as any[]) {
    const q = async (sql: string, p: any[]) => ((await conn.execute(sql, p)) as any)[0] as any[];
    const lotUnits = await q(
      `SELECT unit, status, COUNT(*) AS n, ROUND(SUM(available_quantity), 3) AS avail FROM h_inventory_lots
        WHERE tenant_id = ? AND material_id = ? GROUP BY unit, status ORDER BY n DESC`, [tenant, m.id]);
    const txUnits = await q(
      `SELECT unit, transaction_type, COUNT(*) AS n FROM h_inventory_transactions
        WHERE tenant_id = ? AND material_id = ? GROUP BY unit, transaction_type ORDER BY n DESC`, [tenant, m.id]);
    const purUnits = await q(
      `SELECT unit, COUNT(*) AS n FROM accounting_purchases WHERE tenant_id = ? AND material_id = ? GROUP BY unit ORDER BY n DESC`, [tenant, m.id]);
    const inputUnits = await q(
      `SELECT unit, COUNT(*) AS n FROM h_batch_inputs WHERE tenant_id = ? AND material_id = ? GROUP BY unit ORDER BY n DESC`, [tenant, m.id]);
    const im = await q(
      `SELECT id, base_unit, purchase_unit, purchase_conversion_rate FROM item_master WHERE tenant_id = ? AND legacy_material_id = ?`, [tenant, m.id]);
    const units = new Set<string>([...lotUnits, ...txUnits, ...purUnits, ...inputUnits].map((r) => String(r.unit ?? "").trim()).filter(Boolean));
    console.log(`\n#${m.id} ${m.material_code ?? ""} ${m.material_name}${m.specification ? ` (규격 ${m.specification})` : ""}`);
    console.log(`  LOT: ${lotUnits.map((r) => `${r.unit}/${r.status} ${r.n}개 가용 ${r.avail}`).join(", ") || "없음"}`);
    console.log(`  원장: ${txUnits.map((r) => `${r.unit}/${r.transaction_type} ${r.n}`).join(", ") || "없음"}`);
    console.log(`  매입: ${purUnits.map((r) => `${r.unit} ${r.n}`).join(", ") || "없음"} / 배치 투입: ${inputUnits.map((r) => `${r.unit} ${r.n}`).join(", ") || "없음"}`);
    console.log(`  품목 마스터: ${im.map((r) => `#${r.id} 기본 ${r.base_unit} 구매 ${r.purchase_unit ?? "-"} ×${r.purchase_conversion_rate}`).join(", ") || "연결 없음"}`);
    const imBase = [...new Set(im.map((r) => String(r.base_unit ?? "").trim()).filter(Boolean))];
    const only = units.size === 1 ? [...units][0] : null;
    const conflict = only && imBase.length > 0 && !imBase.some((b) => b.toLowerCase() === only.toLowerCase());
    const verdict = units.size === 0 ? "거래 없음 — 규격으로 지정"
      : units.size > 1 ? `단위 여러 개(${[...units].join(", ")}) — 수량 환산 필요, 별도 대상`
      : conflict ? `거래 단위 '${only}' ≠ 품목 마스터 기본 단위 '${imBase.join(", ")}' — 기준을 '${only}' 로 할지, '${imBase[0]}' 로 두고 포장 환산(1${only} = N${imBase[0]})·기존 LOT 수량 환산을 할지 결정 필요 (별도 대상)`
      : `단일 단위 '${only}' — 그대로 지정 후보`;
    console.log(`  → 판단: ${verdict}`);
  }
  await (conn as any).end?.();
}

main().catch((e) => { console.error("❌", e?.message || e); process.exit(1); });
