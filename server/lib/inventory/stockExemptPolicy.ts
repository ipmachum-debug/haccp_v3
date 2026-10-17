/**
 * 재고 차감 제외 원료 (2026-10-17, CEO 결정 — 정제수는 재고 차감에서 제외)
 *
 * 회사·원료별 설정(h_materials.stock_exempt) — 이름으로 정하지 않는다 (정책 데이터). 켜진 원료는:
 *   - 배치 자동출고: 투입은 기록(수량·원가)하되 LOT·재고 거래·집계·수불부는 건드리지 않는다
 *   - 생산 시작 부족 판정에서 뺀다
 * 기존 LOT·과거 차감은 바꾸지 않는다 (소급 없음 — 남은 음수 LOT 은 별도 정정).
 */
type Conn = { execute: (sql: string, params?: any[]) => Promise<any> };

export async function getStockExemptMaterialIds(conn: Conn, tenantId: number, materialIds: number[]): Promise<Set<number>> {
  const ids = [...new Set(materialIds.filter((x) => Number.isSafeInteger(x) && x > 0))];
  if (!ids.length) return new Set();
  const [rows]: any = await conn.execute(
    `SELECT id FROM h_materials WHERE tenant_id = ? AND stock_exempt = 1 AND id IN (${ids.map(() => "?").join(",")})`,
    [tenantId, ...ids],
  );
  return new Set((rows as any[]).map((r) => Number(r.id)));
}

export async function listStockExemptMaterials(conn: Conn, tenantId: number) {
  const [rows]: any = await conn.execute(
    `SELECT id, material_name, unit FROM h_materials WHERE tenant_id = ? AND stock_exempt = 1 ORDER BY material_name`, [tenantId],
  );
  return (rows as any[]).map((r) => ({ materialId: Number(r.id), materialName: r.material_name, unit: r.unit }));
}

export async function setMaterialStockExempt(conn: Conn, p: { tenantId: number; materialId: number; exempt: boolean }) {
  const [r]: any = await conn.execute(
    `UPDATE h_materials SET stock_exempt = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
    [p.exempt ? 1 : 0, p.materialId, p.tenantId],
  );
  if (Number(r?.affectedRows ?? 0) !== 1) throw new Error("원재료를 찾을 수 없습니다.");
}
