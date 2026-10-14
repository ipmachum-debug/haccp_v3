/**
 * 생산 시작 직전 서버 재검증 (UI/UX 개편 P-2, 2026-10-14) — 명세 14 §7-3
 *
 * "③ 재고 확인과 ④ 시작 사이에 다른 생산지시가 같은 LOT 를 썼을 수 있다" → 화면 검증만으로 부족하다.
 * 시작 버튼을 누른 그 순간에 서버가 자동출고와 **같은 기준**으로 다시 센다.
 *   - 투입 계획: h_batch_inputs (자동출고 v1 과 같은 SELECT)
 *   - 이미 출고된 투입 제외: inventory_deducted=1 또는 출고 기록 있음 (#483 getIssuedBatchLineIds)
 *   - 자재 ID: 투입의 material_id 를 toInventoryMaterialId 로 재고 자재(h_materials.id)로 변환 (자동출고와 동일)
 *   - 가용량: 그 자재의 가용 LOT available_quantity 합
 *   - 같은 자재가 여러 줄이면 필요량을 합쳐서 비교
 *   - 정제수는 재고 관리 대상이 아니므로 부족 판정에서 뺀다 (자동출고의 isWaterMaterial 과 같은 기준)
 *
 * 부족해도 막지 않는다 — 기존 음수 재고 정책(negativeStockPolicy)을 바꾸지 않는다 (명세 §7-3).
 * 대신 시작 API 가 부족 목록을 돌려주고, 사용자가 확인해야 시작되며 그 확인을 배치 메모에 남긴다.
 */
import { getRawConnection } from "../../db/connection";
import { toInventoryMaterialId } from "../identity/itemIdentityService";
import { getIssuedBatchLineIds } from "./issuedBatchLines";
import { isNegativeStockAllowed } from "../inventory/negativeStockPolicy";

const EPS = 0.001;

export type StartLine = {
  inputId: number;
  canonicalMaterialId: number;
  materialName: string;
  unit: string;
  required: number;
  alreadyIssued: boolean;
  isWater: boolean;
};

export type StartShortage = { materialId: number; materialName: string; unit: string; required: number; available: number; shortage: number };

export function isWaterMaterial(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes("정제수") || n.includes("purified water");
}

/** 순수 계산 — 아직 출고 안 된 투입을 자재별로 합쳐 가용량과 비교 (테스트 대상) */
export function computeShortages(lines: readonly StartLine[], available: ReadonlyMap<number, number>): { shortages: StartShortage[]; pendingLines: number; issuedLines: number; unissuedLines: number } {
  const need = new Map<number, { name: string; unit: string; required: number }>();
  let pendingLines = 0, issuedLines = 0, unissuedLines = 0;
  for (const l of lines) {
    if (l.alreadyIssued) { issuedLines++; continue; }
    pendingLines++;
    if (l.isWater || !(l.required > 0)) continue;
    unissuedLines++; // 출고 대상인데 아직 출고 기록이 없는 줄 (정제수·0 수량 제외)
    const cur = need.get(l.canonicalMaterialId) ?? { name: l.materialName, unit: l.unit, required: 0 };
    cur.required += l.required;
    need.set(l.canonicalMaterialId, cur);
  }
  const shortages: StartShortage[] = [];
  for (const [materialId, n] of need) {
    const avail = available.get(materialId) ?? 0;
    const shortage = n.required - avail;
    if (shortage > EPS) {
      shortages.push({
        materialId, materialName: n.name, unit: n.unit,
        required: round3(n.required), available: round3(avail), shortage: round3(shortage),
      });
    }
  }
  shortages.sort((a, b) => b.shortage - a.shortage);
  return { shortages, pendingLines, issuedLines, unissuedLines };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function validateBatchStart(batchId: number, tenantId: number) {
  const conn = await getRawConnection();
  const [rows] = await conn.execute<any[]>(
    `SELECT bi.id, bi.material_id, bi.planned_quantity, bi.unit, bi.inventory_deducted,
            COALESCE(m.material_name, im.item_name) AS material_name
       FROM h_batch_inputs bi
       LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
       LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
      WHERE bi.batch_id = ? AND bi.tenant_id = ?
      ORDER BY bi.id`,
    [batchId, tenantId],
  );
  const issued = await getIssuedBatchLineIds(batchId, tenantId);

  const lines: StartLine[] = [];
  for (const r of rows as any[]) {
    const raw = Number(r.material_id);
    let canonical = raw;
    try { canonical = (await toInventoryMaterialId(raw, tenantId, conn)).id; } catch { /* 변환 실패 — 원래 ID 로 (자동출고와 같은 폴백) */ }
    const name = r.material_name || `원재료 #${raw}`;
    lines.push({
      inputId: Number(r.id),
      canonicalMaterialId: canonical,
      materialName: name,
      unit: r.unit || "kg",
      required: parseFloat(String(r.planned_quantity ?? "0")) || 0,
      alreadyIssued: Number(r.inventory_deducted) === 1 || issued.has(Number(r.id)),
      isWater: isWaterMaterial(name),
    });
  }

  const ids = [...new Set(lines.filter((l) => !l.alreadyIssued && !l.isWater).map((l) => l.canonicalMaterialId))];
  const available = new Map<number, number>();
  if (ids.length > 0) {
    const [avail] = await conn.execute<any[]>(
      `SELECT material_id, COALESCE(SUM(available_quantity), 0) AS avail
         FROM h_inventory_lots
        WHERE tenant_id = ? AND material_id IN (${ids.map(() => "?").join(",")})
          AND COALESCE(status, 'available') = 'available' AND available_quantity > 0
        GROUP BY material_id`,
      [tenantId, ...ids],
    );
    for (const a of avail as any[]) available.set(Number(a.material_id), parseFloat(String(a.avail)) || 0);
  }

  const { shortages, pendingLines, issuedLines, unissuedLines } = computeShortages(lines, available);
  return {
    totalLines: lines.length,
    pendingLines,
    issuedLines,
    /** 출고 대상인데 아직 출고 기록이 없는 줄 — 진행 중 배치에서 >0 이면 자동출고 누락(재출고 필요) */
    unissuedLines,
    shortages,
    /** 기존 정책 — true: 부족분은 최근 LOT 에 음수 차감 / false: 출고 기록만 남고 재고는 차감되지 않음 */
    allowNegative: isNegativeStockAllowed(tenantId),
  };
}

/** 부족을 확인하고 시작한 기록 — 배치 메모에 한 줄 추가 (배치 화면에서 바로 보이도록. 감사 로그에도 함께 남는다) */
export function shortageAckNote(opts: { userName: string; userId: number; at: string; shortages: readonly StartShortage[]; allowNegative: boolean }): string {
  const list = opts.shortages.map((s) => `${s.materialName} 부족 ${s.shortage}${s.unit}(필요 ${s.required}/가용 ${s.available})`).join(", ");
  const policy = opts.allowNegative ? "부족분 음수 차감(다음 입고 시 상쇄)" : "부족분 출고 기록만(재고 미차감)";
  return `[생산 시작 · 재고 부족 확인] ${opts.at} ${opts.userName}(#${opts.userId}) — ${list} — 정책: ${policy}`;
}
