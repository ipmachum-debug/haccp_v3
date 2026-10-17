/**
 * 원재료 흐름 역대조 — 검증된 배치를 고정 기준으로 소요량을 다시 계산해 기록과 비교 (읽기 전용, 2026-10-17)
 *
 * CEO 확정 기준: 배치의 생산일·제품·총생산량은 그대로(검증됨). 원재료는 배치량 × 올바른 BOM·수율로 소요량을 계산해
 *   입고·차감 기록과 대조한다. 재고 숫자에 맞춰 배치를 바꾸지 않고, 검증된 배치에 맞게 재고 장부를 바로잡는다.
 *
 * 소요량 = 배치 실적량(없으면 계획량) × 그 배치 날짜에 적용되던 승인 BOM 버전의 행 비율(보정 비율 우선, %) ÷ 100 — 차감 대상 행만.
 *   (createBatch 와 같은 식. 버전은 '최신 승인' 이 아니라 effective_from ≤ 배치일 인 승인 버전 중 가장 최근)
 *   올바른 BOM 이 시스템 버전과 다르면 --bom-override CSV 로 덮는다: 제품ID(h_products_v2),시작일,종료일,원료ID(h_materials),완제품1kg당원료kg
 *   (쌀 등 불림 원료는 건조 원물 기준 kg — 불어난 무게를 원료에서 빼지 않는다)
 * 원료 id 는 ItemIdentityService(toInventoryMaterialId) 로만 바꾼다 — 이름 일치로 찾지 않는다.
 */
import { resolveBomProductIds, inPlaceholders } from "../../server/lib/production/bomProductResolver";
import { toInventoryMaterialId } from "../../server/lib/identity/itemIdentityService";

export const EPS = 0.0005;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

export type BomOverride = { productId: number; from: string; to: string; materialId: number; kgPerKg: number };

export type BatchNeed = {
  batchId: number; batchCode: string; date: string; productId: number; product: string | null; output: number;
  versionId: number | null; versionNote: string | null;
  lines: Array<{ materialId: number; required: number; unit: string | null; source: "version" | "override" }>;
};

const versionCache = new Map<string, { versionId: number | null; note: string | null; rows: any[] }>();

/** 배치 날짜에 적용되던 승인 버전 (없으면 가장 이른 승인 버전 + 표시) */
async function versionAt(conn: any, tenantId: number, productId: number, date: string) {
  const key = `${productId}|${date}`;
  if (versionCache.has(key)) return versionCache.get(key)!;
  const ids = await resolveBomProductIds(productId, tenantId, conn);
  const [reps]: any = await conn.execute(
    `SELECT id FROM h_mf_reports WHERE tenant_id = ? AND product_id IN (${inPlaceholders(ids)}) ORDER BY (product_id = ?) DESC, id ASC LIMIT 1`,
    [tenantId, ...ids, productId],
  );
  const reportId = Number((reps as any[])[0]?.id ?? 0);
  let out: { versionId: number | null; note: string | null; rows: any[] } = { versionId: null, note: "품목제조보고 없음", rows: [] };
  if (reportId) {
    const [vs]: any = await conn.execute(
      `SELECT id, DATE_FORMAT(effective_from, '%Y-%m-%d') AS ef FROM h_mf_report_versions
        WHERE mf_report_id = ? AND approval_status = 'APPROVED' ORDER BY effective_from, version_no, id`,
      [reportId],
    );
    const list = vs as any[];
    const at = [...list].reverse().find((v) => v.ef && v.ef <= date);
    const v = at ?? list[0];
    if (v) {
      const [rows]: any = await conn.execute(
        `SELECT i.id, i.material_id, i.quantity + 0 AS q, i.corrected_quantity + 0 AS cq, i.is_deductible, im.base_unit
           FROM h_mf_ingredients i LEFT JOIN item_master im ON im.id = i.material_id AND im.tenant_id = ?
          WHERE i.mf_report_version_id = ? AND i.material_id IS NOT NULL`,
        [tenantId, v.id],
      );
      out = { versionId: Number(v.id), note: at ? null : `배치일 이전 승인 버전 없음 — 첫 승인 버전(${v.ef}) 사용`, rows: rows as any[] };
    } else out = { versionId: null, note: "승인 버전 없음", rows: [] };
  }
  versionCache.set(key, out);
  return out;
}

export async function batchNeeds(conn: any, tenantId: number, from: string, to: string, overrides: BomOverride[] = []): Promise<BatchNeed[]> {
  const [bs]: any = await conn.query(
    `SELECT b.id, b.batch_code, b.product_id, p.product_name, DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS d,
            COALESCE(b.actual_quantity, b.planned_quantity) + 0 AS outq
       FROM h_batches b LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
      WHERE b.tenant_id = ? AND b.status IN ('completed', 'shipped', 'archived') AND b.planned_date BETWEEN ? AND ?
      ORDER BY b.planned_date, b.id`,
    [tenantId, from, to],
  );
  const idCache = new Map<number, number>();
  const canon = async (raw: number) => {
    if (!idCache.has(raw)) idCache.set(raw, (await toInventoryMaterialId(raw, tenantId, conn)).id);
    return idCache.get(raw)!;
  };
  const out: BatchNeed[] = [];
  for (const b of bs as any[]) {
    const pid = Number(b.product_id);
    const outQ = Number(b.outq);
    const ov = overrides.filter((o) => o.productId === pid && o.from <= b.d && b.d <= o.to);
    const v = await versionAt(conn, tenantId, pid, b.d);
    const lines: BatchNeed["lines"] = [];
    // 이 제품·기간에 바로잡은 BOM 이 있으면 그것만 쓴다 (시스템 버전과 섞지 않음)
    for (const o of ov) lines.push({ materialId: o.materialId, required: r3(o.kgPerKg * outQ), unit: "kg", source: "override" });
    for (const r of ov.length ? [] : v.rows) {
      if (Number(r.is_deductible) === 0) continue;
      const mid = await canon(Number(r.material_id));
      const ratio = r.cq != null && Number(r.cq) > 0 ? Number(r.cq) : Number(r.q);
      lines.push({ materialId: mid, required: r3((ratio / 100) * outQ), unit: r.base_unit ?? null, source: "version" });
    }
    out.push({ batchId: Number(b.id), batchCode: b.batch_code, date: b.d, productId: pid, product: b.product_name, output: outQ, versionId: v.versionId, versionNote: ov.length ? "바로잡은 BOM(--bom-override)" : v.note, lines });
  }
  return out;
}

/** 배치별·원료별 기록된 차감 (reference·source·batch_input 세 형식, 거래 id 중복 제거) */
export async function recordedUsage(conn: any, tenantId: number, batchIds: number[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!batchIds.length) return out;
  const [rows]: any = await conn.query(
    `SELECT t.id, t.material_id, t.quantity + 0 AS q,
            COALESCE(CASE WHEN t.reference_type = 'batch' THEN t.reference_id END,
                     CASE WHEN t.source_type IN ('BATCH', 'batch_completion') THEN t.source_id END,
                     bi.batch_id) AS batch_id
       FROM h_inventory_transactions t
       LEFT JOIN h_batch_inputs bi ON t.reference_type = 'batch_input' AND bi.id = t.reference_id AND bi.tenant_id = t.tenant_id
      WHERE t.tenant_id = ? AND t.transaction_type = 'usage' AND t.material_id IS NOT NULL
        AND ( (t.reference_type = 'batch' AND t.reference_id IN (?))
           OR (t.source_type IN ('BATCH', 'batch_completion') AND t.source_id IN (?))
           OR (t.reference_type = 'batch_input' AND bi.batch_id IN (?)) )`,
    [tenantId, batchIds, batchIds, batchIds],
  );
  const seen = new Set<number>();
  for (const r of rows as any[]) {
    if (seen.has(Number(r.id))) continue;
    seen.add(Number(r.id));
    const k = `${r.batch_id}|${r.material_id}`;
    out.set(k, r3((out.get(k) ?? 0) + Number(r.q)));
  }
  return out;
}

/** 배치 줄 분류 */
export function classifyNeed(required: number, recorded: number): string | null {
  if (required <= EPS && recorded <= EPS) return null;
  if (required <= EPS) return "BOM 외 차감";
  if (recorded <= EPS) return "미차감";
  const ratio = recorded / required;
  if (Math.abs(ratio - 2) <= 0.02) return "이중 차감 의심(약 2배)";
  if (Math.abs(ratio - 1) <= 0.02) return null; // 반올림 범위
  return ratio > 1 ? `과다 차감(${r3(recorded - required)})` : `과소 차감(${r3(required - recorded)})`;
}
