/**
 * 배치 생성 때 원물·공정·완제품 기준 스냅샷을 기록한다 (2026-10-16, 수율 기준 PR B)
 *
 * 회사가 PRODUCTION_MASS_BASIS 를 선택했고(tenant_feature_settings), 배치가 쓰는 품목제조보고 버전
 * (selectBomVersion — 배치 투입·CCP 와 같은 버전)이 mass_basis_enabled=1 일 때만
 * h_batch_mass_basis 에 버전·기준 완제품 kg·행별 원물/공정 kg 를 고정한다. 꺼진 버전은 아무것도 하지 않는다.
 * 이 PR 에서는 기록만 한다 — 원료 출고·CCP·원가는 아직 기존 계산 (연결은 PR C).
 * 실패해도 배치 생성은 막지 않는다 (경고 로그). 같은 배치에 다시 부르면 기존 스냅샷을 유지한다.
 */
import { getRawConnection } from "../connection";
import { selectBomVersion } from "../../lib/identity/itemIdentityService";
import { buildMassBasisSnapshot, type MassBasisSnapshot } from "../../../shared/production/massBasisPlan";
import { isTenantFeatureEnabled, MASS_BASIS_FEATURE } from "../../lib/production/massBasisPolicy";

export async function recordBatchMassBasis(
  batchId: number,
  tenantId: number,
  productId: number,
  plannedFinishedKg: number,
): Promise<{ recorded: boolean; reason?: string; snapshot?: MassBasisSnapshot }> {
  const conn = await getRawConnection();
  // 회사가 이 방식을 선택하지 않았으면 기록하지 않음 → 기존 계산 (massBasisPolicy)
  if (!(await isTenantFeatureEnabled(conn, tenantId, MASS_BASIS_FEATURE))) return { recorded: false, reason: "tenant-disabled" };
  const pick = await selectBomVersion(productId, tenantId, conn);
  if (!pick) return { recorded: false, reason: "no-version" };
  const [vRows]: any = await conn.execute(
    `SELECT id, reference_finished_kg, reference_raw_total_kg, mass_basis_enabled
       FROM h_mf_report_versions WHERE id = ?`,
    [pick.versionId],
  );
  const v = vRows?.[0];
  if (!v || Number(v.mass_basis_enabled) !== 1) return { recorded: false, reason: "disabled" };
  const [iRows]: any = await conn.execute(
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
  if (!built.ok) {
    console.warn(`[batchMassBasis] batch=${batchId} version=${pick.versionId} 스냅샷 생략: ${built.reason}`);
    return { recorded: false, reason: built.reason };
  }
  const s = built.snapshot;
  await conn.execute(
    `INSERT IGNORE INTO h_batch_mass_basis
       (batch_id, tenant_id, mf_report_version_id, calc_version, reference_finished_kg, planned_finished_kg,
        multiplier, total_raw_kg, total_process_kg, rows_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batchId, tenantId, s.versionId, s.calcVersion, s.referenceFinishedKg, s.plannedFinishedKg,
     s.multiplier, s.totalRawKg, s.totalProcessKg, JSON.stringify(s.rows)],
  );
  return { recorded: true, snapshot: s };
}
