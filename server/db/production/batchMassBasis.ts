/**
 * 배치 원물·공정·완제품 기준 스냅샷 (2026-10-16, 수율 기준 PR B·C)
 *
 * 회사가 PRODUCTION_MASS_BASIS 를 선택했고(tenant_feature_settings), 배치가 쓰는 품목제조보고 버전
 * (selectBomVersion — 배치 투입·CCP 와 같은 버전)이 mass_basis_enabled=1 일 때만 기준 계산을 쓴다.
 *
 * prepareBatchMassBasis 결과 (Codex #546 배포 검토 P1 — 켜진 버전의 실패를 기존 계산으로 덮지 않는다):
 *   legacy : 회사 꺼짐 / 버전 없음 / 버전 꺼짐 → 기존 계산 (배합비 × 생산량)
 *   basis  : 스냅샷 계산 성공 → 투입 계획·CCP 는 스냅샷
 *   error  : 버전은 켜졌는데 계산 불가 (기준값 누락·단위 등) → 배치 생성을 실패시킨다 (과다 차감 방지)
 * 스냅샷은 배치 생성 때 한 번 고정한다. 같은 배치를 다시 저장하려 하면 저장된 값을 돌려준다 (P2-4).
 * CCP 기록지 한 행의 기준량(batch_target_kg) 도 함께 고정한다 (P2-3 — 이후 레시피 변경과 무관).
 */
import { getRawConnection } from "../connection";
import { selectBomVersion } from "../../lib/identity/itemIdentityService";
import { buildMassBasisSnapshot, type MassBasisSnapshot } from "../../../shared/production/massBasisPlan";
import { isTenantFeatureEnabled, MASS_BASIS_FEATURE } from "../../lib/production/massBasisPolicy";

export type MassBasisPlan =
  | { mode: "legacy"; reason: string }
  | { mode: "basis"; snapshot: MassBasisSnapshot; subBatchKg: number | null }
  | { mode: "error"; reason: string; versionId: number };

export interface StoredMassBasis {
  snapshot: MassBasisSnapshot;
  subBatchKg: number | null;
}

export async function prepareBatchMassBasis(
  tenantId: number,
  productId: number,
  plannedFinishedKg: number,
  conn?: any,
): Promise<MassBasisPlan> {
  const c = conn ?? (await getRawConnection());
  if (!(await isTenantFeatureEnabled(c, tenantId, MASS_BASIS_FEATURE))) return { mode: "legacy", reason: "tenant-disabled" };
  const pick = await selectBomVersion(productId, tenantId, c);
  if (!pick) return { mode: "legacy", reason: "no-version" };
  const [vRows]: any = await c.execute(
    `SELECT id, reference_finished_kg, reference_raw_total_kg, mass_basis_enabled, batch_target_kg
       FROM h_mf_report_versions WHERE id = ?`,
    [pick.versionId],
  );
  const v = vRows?.[0];
  if (!v || Number(v.mass_basis_enabled) !== 1) return { mode: "legacy", reason: "disabled" };
  const [iRows]: any = await c.execute(
    `SELECT id, material_id, process_group_id, is_deductible, is_additional, quantity, unit, basis_raw_kg, pretreatment_factor
       FROM h_mf_ingredients WHERE mf_report_version_id = ? ORDER BY line_no, id`,
    [pick.versionId],
  );
  const built = buildMassBasisSnapshot(
    { id: Number(v.id), referenceFinishedKg: v.reference_finished_kg, referenceRawTotalKg: v.reference_raw_total_kg, massBasisEnabled: v.mass_basis_enabled },
    (iRows as any[]).map((r) => ({
      id: Number(r.id), materialId: r.material_id != null ? Number(r.material_id) : null,
      processGroupId: r.process_group_id != null ? Number(r.process_group_id) : null,
      isDeductible: r.is_deductible, isAdditional: r.is_additional,
      quantity: r.quantity, unit: r.unit, basisRawKg: r.basis_raw_kg, pretreatmentFactor: r.pretreatment_factor,
    })),
    plannedFinishedKg,
  );
  if (!built.ok) return { mode: "error", reason: built.reason, versionId: pick.versionId };
  const subBatchKg = v.batch_target_kg != null && Number(v.batch_target_kg) > 0 ? Number(v.batch_target_kg) : null;
  return { mode: "basis", snapshot: built.snapshot, subBatchKg };
}

/**
 * 스냅샷 원물 kg → 투입 계획 수량 (원료 기본 단위). kg/빈값은 그대로, g 는 ×1000.
 * 그 밖의 단위(EA·L 등)는 kg 에서 바꿀 근거가 없으므로 null — 호출부는 배치를 만들지 않는다.
 */
export function rawKgToMaterialUnit(rawKg: number, materialUnit: string | null | undefined): { qty: number; unit: string } | null {
  const u = String(materialUnit ?? "").trim().toLowerCase();
  if (u === "" || u === "kg") return { qty: rawKg, unit: "kg" };
  if (u === "g") return { qty: rawKg * 1000, unit: "g" };
  return null;
}

/** 저장된 스냅샷 (없으면 null) */
export async function loadBatchMassBasis(conn: any, batchId: number, tenantId: number): Promise<StoredMassBasis | null> {
  const [rows]: any = await conn.execute(
    `SELECT mf_report_version_id, calc_version, reference_finished_kg, planned_finished_kg, multiplier,
            total_raw_kg, total_process_kg, rows_json, sub_batch_kg
       FROM h_batch_mass_basis WHERE batch_id = ? AND tenant_id = ? LIMIT 1`,
    [batchId, tenantId],
  );
  const r = rows?.[0];
  if (!r) return null;
  return {
    snapshot: {
      calcVersion: String(r.calc_version),
      versionId: Number(r.mf_report_version_id),
      referenceFinishedKg: Number(r.reference_finished_kg),
      plannedFinishedKg: Number(r.planned_finished_kg),
      multiplier: Number(r.multiplier),
      totalRawKg: Number(r.total_raw_kg),
      totalProcessKg: Number(r.total_process_kg),
      rows: typeof r.rows_json === "string" ? JSON.parse(r.rows_json) : r.rows_json,
    },
    subBatchKg: r.sub_batch_kg != null ? Number(r.sub_batch_kg) : null,
  };
}

/**
 * 스냅샷 저장 — 이미 있으면 저장된 값을 돌려준다 (다시 계산한 값이 아니라). 버전이 다르면 오류.
 */
export async function saveBatchMassBasis(
  conn: any,
  batchId: number,
  tenantId: number,
  snapshot: MassBasisSnapshot,
  subBatchKg: number | null,
): Promise<StoredMassBasis> {
  const s = snapshot;
  const [res]: any = await conn.execute(
    `INSERT IGNORE INTO h_batch_mass_basis
       (batch_id, tenant_id, mf_report_version_id, calc_version, reference_finished_kg, planned_finished_kg,
        multiplier, total_raw_kg, total_process_kg, rows_json, sub_batch_kg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batchId, tenantId, s.versionId, s.calcVersion, s.referenceFinishedKg, s.plannedFinishedKg,
     s.multiplier, s.totalRawKg, s.totalProcessKg, JSON.stringify(s.rows), subBatchKg],
  );
  if (Number(res?.affectedRows ?? 0) === 1) return { snapshot: s, subBatchKg };
  const stored = await loadBatchMassBasis(conn, batchId, tenantId);
  if (!stored) throw new Error(`[batchMassBasis] batch=${batchId} 스냅샷 저장 실패`);
  if (stored.snapshot.versionId !== s.versionId) {
    throw new Error(`[batchMassBasis] batch=${batchId} 이미 다른 버전(${stored.snapshot.versionId}) 기준이 고정돼 있습니다 (요청 ${s.versionId})`);
  }
  return stored;
}

/** prepare + save (테스트·도구용). legacy/error 면 기록하지 않음. */
export async function recordBatchMassBasis(
  batchId: number,
  tenantId: number,
  productId: number,
  plannedFinishedKg: number,
): Promise<{ recorded: boolean; reason?: string; snapshot?: MassBasisSnapshot }> {
  const conn = await getRawConnection();
  const plan = await prepareBatchMassBasis(tenantId, productId, plannedFinishedKg, conn);
  if (plan.mode !== "basis") return { recorded: false, reason: plan.reason };
  const stored = await saveBatchMassBasis(conn, batchId, tenantId, plan.snapshot, plan.subBatchKg);
  return { recorded: true, snapshot: stored.snapshot };
}
