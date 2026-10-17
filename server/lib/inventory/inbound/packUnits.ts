/**
 * 포장 단위 환산 (2026-10-17, CEO 결정) — 회사·원료·포장 단위별 '1 포장 = N 기준 단위' (예: 쌀 1포대 = 20kg).
 *
 * - 발주·매입 수량은 포장 단위(포대), 재고·LOT·수불부는 원료 기준 단위(kg).
 * - 환산 설정이 없으면 입고 차단 — 임의 1:1 금지. 매입 단위 = 기준 단위일 때만 배율 1.
 * - 입고 줄은 그때 쓴 설정 id·배율을 보존 (나중에 설정을 바꿔도 과거 입고는 그대로).
 * - 불림 수율(전처리 배율) 과는 별개 — 생쌀 20kg 입고는 재고도 20kg. 불림은 생산 공정 투입량에만.
 */
const normUnit = (u: unknown) => String(u ?? "").trim().toLowerCase();
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface PackResolution {
  baseUnit: string;          // 원료 기준 단위 (원문)
  factor: number;            // 1 매입 단위 = factor 기준 단위
  conversionId: number | null; // 설정 id (같은 단위면 null)
  stockQuantity: number;     // 매입 수량 × factor
}

/** 매입 수량·단위 → 재고 수량(기준 단위). 환산 근거가 없으면 throw. */
export async function resolvePackConversion(
  conn: any, tenantId: number, materialId: number, purchaseUnit: string, purchaseQuantity: number, label: string,
): Promise<PackResolution> {
  const [m]: any = await conn.execute(`SELECT unit FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [materialId, tenantId]);
  const baseRaw = (m as any[])[0]?.unit;
  const base = normUnit(baseRaw);
  if (!base) throw new Error(`${label}: 원재료 기준 단위가 비어 있어 입고할 수 없습니다 — 원재료 정보에 단위를 먼저 지정하세요.`);
  if (normUnit(purchaseUnit) === base) {
    return { baseUnit: String(baseRaw), factor: 1, conversionId: null, stockQuantity: round3(purchaseQuantity) };
  }
  const [rows]: any = await conn.execute(
    `SELECT id, base_qty, base_unit FROM material_pack_units
      WHERE tenant_id = ? AND material_id = ? AND LOWER(TRIM(pack_unit)) = ? AND is_active = 1 LIMIT 1`,
    [tenantId, materialId, normUnit(purchaseUnit)],
  );
  const r = (rows as any[])[0];
  if (!r) throw new Error(`${label}: '${purchaseUnit}' → ${baseRaw} 환산 설정이 없습니다 — 포장 단위 환산(1${purchaseUnit} = N${baseRaw}) 을 먼저 등록하세요.`);
  if (normUnit(r.base_unit) !== base) throw new Error(`${label}: 환산 설정의 기준 단위(${r.base_unit}) 가 원재료 기준 단위(${baseRaw}) 와 다릅니다 — 환산 설정을 다시 확인하세요.`);
  const factor = Number(r.base_qty);
  if (!(factor > 0)) throw new Error(`${label}: 환산 배율이 올바르지 않습니다.`);
  return { baseUnit: String(baseRaw), factor, conversionId: Number(r.id), stockQuantity: round3(purchaseQuantity * factor) };
}

export async function listPackUnits(conn: any, tenantId: number, materialId?: number | null) {
  const [rows]: any = await conn.execute(
    `SELECT p.id, p.material_id, m.material_name, p.pack_unit, p.base_qty, p.base_unit, p.is_active, p.updated_at
       FROM material_pack_units p LEFT JOIN h_materials m ON m.id = p.material_id AND m.tenant_id = p.tenant_id
      WHERE p.tenant_id = ? ${materialId ? "AND p.material_id = ?" : ""}
      ORDER BY m.material_name, p.pack_unit`,
    materialId ? [tenantId, materialId] : [tenantId],
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id), materialId: Number(r.material_id), materialName: r.material_name, packUnit: r.pack_unit,
    baseQty: Number(r.base_qty), baseUnit: r.base_unit, isActive: Number(r.is_active) === 1,
  }));
}

/** 환산 설정 저장 — 원료 기준 단위로만. 같은 포장 단위가 있으면 배율 갱신 (과거 입고는 줄에 보존된 배율 그대로). */
export async function upsertPackUnit(conn: any, p: { tenantId: number; userId: number; materialId: number; packUnit: string; baseQty: number }) {
  const pack = String(p.packUnit ?? "").trim();
  if (!pack || pack.length > 20) throw new Error("포장 단위 이름이 필요합니다 (20자 이하).");
  if (!(p.baseQty > 0)) throw new Error("1 포장의 기준 단위 수량은 0 보다 커야 합니다.");
  const [m]: any = await conn.execute(`SELECT unit FROM h_materials WHERE id = ? AND tenant_id = ? LIMIT 1`, [p.materialId, p.tenantId]);
  const mat = (m as any[])[0];
  if (!mat) throw new Error("원재료를 찾을 수 없습니다.");
  if (!normUnit(mat.unit)) throw new Error("원재료 기준 단위가 비어 있습니다 — 원재료 정보에 단위를 먼저 지정하세요.");
  if (normUnit(pack) === normUnit(mat.unit)) throw new Error("기준 단위와 같은 포장 단위는 등록할 필요가 없습니다 (배율 1).");
  await conn.execute(
    `INSERT INTO material_pack_units (tenant_id, material_id, pack_unit, base_qty, base_unit, is_active, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE base_qty = VALUES(base_qty), base_unit = VALUES(base_unit), is_active = 1, updated_by = VALUES(updated_by)`,
    [p.tenantId, p.materialId, pack, p.baseQty, mat.unit, p.userId, p.userId],
  );
  return listPackUnits(conn, p.tenantId, p.materialId);
}

export async function deactivatePackUnit(conn: any, tenantId: number, userId: number, id: number) {
  const [r]: any = await conn.execute(
    `UPDATE material_pack_units SET is_active = 0, updated_by = ? WHERE id = ? AND tenant_id = ?`, [userId, id, tenantId],
  );
  if (Number(r?.affectedRows ?? 0) !== 1) throw new Error("환산 설정을 찾을 수 없습니다.");
  return { success: true };
}
