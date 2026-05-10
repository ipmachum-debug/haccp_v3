/**
 * 혼합 mfReport → sku_bundles 자동 동기화 — PR #299
 *
 * 사용:
 *   - mfReport.create / update 후 호출 (reportType='MIXED' 일 때만)
 *   - 트랜잭션 외부 (mfReport 저장은 이미 완료된 상태)
 *
 * 흐름:
 *   1. mfReport.product_id → product_skus (default SKU) 룩업 — parent SKU 결정
 *   2. mfReport 의 latest version 의 ingredients 조회 (CHILD_SKU 타입만)
 *   3. 각 ingredient.child_sku_id + quantity (%) → sku_bundles UPSERT
 *   4. 합계 100% 검증 (위반 시 경고 로그, 저장은 계속)
 *
 * 정책:
 *   - mfReport 가 진실의 원천 (sku_bundles 는 자동 생성/갱신)
 *   - sku_bundles 직접 편집은 가능하지만 다음 mfReport 저장 시 덮어씀
 *   - 사용자가 mfReport UI 만 사용하면 자동 일관성 유지
 */

import { getDb, getRawConnection } from "../../db";

export interface SyncResult {
  parentSkuId: number | null;
  bundleCount: number;
  totalRatio: number;
  warnings: string[];
}

export async function syncMfReportToBundles(
  mfReportId: number,
  tenantId: number,
): Promise<SyncResult> {
  const result: SyncResult = {
    parentSkuId: null,
    bundleCount: 0,
    totalRatio: 0,
    warnings: [],
  };

  const conn = await getRawConnection();
  if (!conn) {
    result.warnings.push("DB 연결 실패");
    return result;
  }

  // ─────────────────────────────────────────────────────
  // 1. mfReport 조회 + product_id → default SKU 매핑
  // ─────────────────────────────────────────────────────
  const [mfRows]: any = await conn.execute(
    `SELECT product_id, report_type FROM h_mf_reports
       WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [mfReportId, tenantId],
  );
  const mf = (mfRows as any[])[0];
  if (!mf) {
    result.warnings.push(`mfReport ${mfReportId} 을 찾을 수 없습니다`);
    return result;
  }
  if (mf.report_type !== "MIXED") {
    // BASIC 이면 sku_bundles 정리만 (혹시 이전에 MIXED 였다가 BASIC 으로 전환된 경우)
    await conn.execute(
      `DELETE sb FROM sku_bundles sb
        JOIN product_skus ps ON ps.id = sb.parent_sku_id
        WHERE ps.tenant_id = ? AND ps.item_id = ?`,
      [tenantId, mf.product_id],
    );
    return result;
  }

  // 기본 SKU 결정 — item_id = product_id 인 SKU 중 isDefault=1
  const [parentRows]: any = await conn.execute(
    `SELECT id FROM product_skus
       WHERE tenant_id = ? AND item_id = ? AND is_active = 1
       ORDER BY is_default DESC, id ASC
       LIMIT 1`,
    [tenantId, mf.product_id],
  );
  const parent = (parentRows as any[])[0];
  if (!parent) {
    result.warnings.push(
      `parent SKU 미등록 — product_id=${mf.product_id} 에 SKU 등록 필요. 단품마스터에서 등록 후 mfReport 재저장하세요.`,
    );
    return result;
  }
  result.parentSkuId = Number(parent.id);

  // ─────────────────────────────────────────────────────
  // 2. 최신 version 의 child SKU ingredients 조회
  // ─────────────────────────────────────────────────────
  const [versionRows]: any = await conn.execute(
    `SELECT id FROM h_mf_report_versions
       WHERE mf_report_id = ? AND tenant_id = ?
       ORDER BY version_no DESC, id DESC
       LIMIT 1`,
    [mfReportId, tenantId],
  );
  const version = (versionRows as any[])[0];
  if (!version) {
    result.warnings.push("최신 버전 없음");
    return result;
  }

  const [ingRows]: any = await conn.execute(
    `SELECT child_sku_id, quantity, piece_count, piece_weight_g, line_no
       FROM h_mf_ingredients
       WHERE mf_report_version_id = ?
         AND child_sku_id IS NOT NULL
         AND material_type = 'CHILD_SKU'
       ORDER BY line_no ASC, id ASC`,
    [version.id],
  );
  const ingredients = (ingRows as any[]) ?? [];

  // ─────────────────────────────────────────────────────
  // 3. sku_bundles UPSERT (DELETE + INSERT 패턴)
  // ─────────────────────────────────────────────────────
  await conn.execute(
    `DELETE FROM sku_bundles WHERE tenant_id = ? AND parent_sku_id = ?`,
    [tenantId, result.parentSkuId],
  );

  if (ingredients.length === 0) {
    result.warnings.push("CHILD_SKU 타입 ingredient 가 없음 — sku_bundles 비어있음");
    return result;
  }

  let totalRatio = 0;
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i];
    const ratio = parseFloat(ing.quantity) || 0;
    if (ratio <= 0) {
      result.warnings.push(`line ${ing.line_no}: 비율이 0 이하 — 스킵`);
      continue;
    }
    totalRatio += ratio;

    await conn.execute(
      `INSERT INTO sku_bundles
         (tenant_id, parent_sku_id, child_sku_id, default_ratio,
          child_pieces, child_piece_weight_g, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        result.parentSkuId,
        Number(ing.child_sku_id),
        ratio,
        ing.piece_count ?? null,
        ing.piece_weight_g ?? null,
        i,
      ],
    );
    result.bundleCount++;
  }
  result.totalRatio = Math.round(totalRatio * 100) / 100;

  if (Math.abs(totalRatio - 100) > 0.01) {
    result.warnings.push(
      `합계 비율이 100% 가 아닙니다: ${totalRatio.toFixed(2)}% — 매출 분해 시 일부 부정확할 수 있음`,
    );
  }

  console.log(
    `[syncMfReportToBundles] mfReport #${mfReportId} → sku_bundles ${result.bundleCount}건 (parent=${result.parentSkuId}, total=${result.totalRatio}%)`,
  );

  return result;
}
