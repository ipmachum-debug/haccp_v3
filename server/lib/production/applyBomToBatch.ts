/**
 * BOM (h_mf_ingredients) → h_batch_inputs 자동 적용 — PR #276
 *
 * 배경:
 *   - 배치 생성 시 h_batch_inputs 가 자동 생성되어야 재고 차감/원료수불 정상 작동
 *   - 누락 시 batch 는 completed 인데 inputs 0 행 → 재고 영향 0 (silent failure)
 *   - 4/2 흑임자 460/461 사고 직접 원인 (Genspark 가 batch 280 BOM × 12.24 배 추정 복원)
 *
 * 기존 코드:
 *   - server/db/production/batchCRUD.ts:92~179 (createBatch 내부)
 *   - server/services/batchHydrator.ts:384 (hydrateBatchInputs)
 *   - 두 구현이 미세하게 다름 (정제수 id=191 처리 불일치)
 *
 * 이 헬퍼는 두 구현을 통합 + 다른 배치 생성 경로에서도 사용 가능.
 *
 * 알고리즘:
 *   1. h_mf_reports.product_id = productId AND tenant_id = tenantId 의 보고서 찾기
 *   2. 최신 APPROVED 버전 (없으면 최신 DRAFT 폴백)
 *   3. h_mf_ingredients 에서 line_no 순 BOM 라인 가져오기
 *   4. (보정 배합비 || 법적 배합비) / 100 * plannedQty 로 plannedQuantity 계산
 *   5. h_batch_inputs INSERT (materialId NULL/isDeductible=0 제외)
 *
 * 멱등성:
 *   - skipIfExists=true (기본): 이미 h_batch_inputs 행이 있으면 SKIP
 *   - false: 강제 적용 (덮어쓰기 안 함, 추가 INSERT 만)
 */

import { getDb } from "../../db";
import { eq, and, desc } from "drizzle-orm";

export interface ApplyBomResult {
  /** 자동 적용 시도 여부 (이미 inputs 있으면 false) */
  attempted: boolean;
  /** 실제 INSERT 된 행 수 */
  insertedCount: number;
  /** 사용된 mf_report_version_id */
  versionId: number | null;
  /** 사용된 버전이 APPROVED 인지 */
  versionApproved: boolean;
  /** 경고 메시지 모음 */
  warnings: string[];
  /** 사용된 BOM 의 mf_report_id */
  mfReportId: number | null;
}

/**
 * 배치에 BOM 자동 적용. 이미 inputs 가 있으면 skip (멱등).
 */
export async function applyBomToBatch(params: {
  batchId: number;
  productId: number;
  plannedQuantity: number;
  tenantId: number;
  /** 이미 inputs 가 있어도 강제 적용 (기본: false — skip) */
  forceWhenExists?: boolean;
}): Promise<ApplyBomResult> {
  const { batchId, productId, plannedQuantity, tenantId, forceWhenExists = false } = params;
  const result: ApplyBomResult = {
    attempted: false,
    insertedCount: 0,
    versionId: null,
    versionApproved: false,
    warnings: [],
    mfReportId: null,
  };

  if (!tenantId) {
    result.warnings.push("[P0 보안] applyBomToBatch: tenantId 누락");
    return result;
  }
  if (!productId) {
    result.warnings.push(`배치 #${batchId}: productId 누락 — BOM 적용 불가`);
    return result;
  }

  const db = await getDb();
  if (!db) {
    result.warnings.push("DB 연결 실패");
    return result;
  }

  const { hMfReports, hMfReportVersions, hMfIngredients, hBatchInputs } = await import(
    "../../../drizzle/schema"
  );
  const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit");

  // ─────────────────────────────────────────────────────
  // 0. 이미 inputs 가 있으면 SKIP (멱등)
  // ─────────────────────────────────────────────────────
  if (!forceWhenExists) {
    const existing = await db
      .select({ id: hBatchInputs.id })
      .from(hBatchInputs)
      .where(and(eq(hBatchInputs.batchId, batchId), eq(hBatchInputs.tenantId, tenantId)))
      .limit(1);
    if (existing.length > 0) {
      // 이미 적용됨 — skip
      return result;
    }
  }
  result.attempted = true;

  // ─────────────────────────────────────────────────────
  // 1. 품목제조보고서 조회
  // ─────────────────────────────────────────────────────
  const mfReport = await db
    .select({ id: hMfReports.id })
    .from(hMfReports)
    .where(and(eq(hMfReports.productId, productId), eq(hMfReports.tenantId, tenantId)))
    .limit(1);

  if (mfReport.length === 0) {
    result.warnings.push(
      `배치 #${batchId} (product=${productId}): 품목제조보고서 미등록 — BOM 적용 불가`,
    );
    return result;
  }
  result.mfReportId = mfReport[0].id;

  // ─────────────────────────────────────────────────────
  // 2. 최신 APPROVED 버전 (없으면 최신 폴백)
  // ─────────────────────────────────────────────────────
  let latestVersion = await db
    .select({ id: hMfReportVersions.id })
    .from(hMfReportVersions)
    .where(
      and(
        eq(hMfReportVersions.mfReportId, mfReport[0].id),
        eq(hMfReportVersions.approvalStatus, "APPROVED"),
      ),
    )
    .orderBy(desc(hMfReportVersions.versionNo))
    .limit(1);

  result.versionApproved = latestVersion.length > 0;

  if (latestVersion.length === 0) {
    latestVersion = await db
      .select({ id: hMfReportVersions.id })
      .from(hMfReportVersions)
      .where(eq(hMfReportVersions.mfReportId, mfReport[0].id))
      .orderBy(desc(hMfReportVersions.versionNo))
      .limit(1);
    if (latestVersion.length > 0) {
      result.warnings.push(
        `배치 #${batchId}: APPROVED 버전 없음, 최신 DRAFT 버전 폴백 사용 (HACCP 감사 시 재검토 필요)`,
      );
    }
  }

  if (latestVersion.length === 0) {
    result.warnings.push(`배치 #${batchId}: BOM 버전 없음 — 적용 불가`);
    return result;
  }
  result.versionId = latestVersion[0].id;

  // ─────────────────────────────────────────────────────
  // 3. BOM 라인 조회 (item_master.base_unit JOIN)
  // ─────────────────────────────────────────────────────
  const ingredients = await db
    .select({
      materialId: hMfIngredients.materialId,
      quantity: hMfIngredients.quantity,
      correctedQuantity: hMfIngredients.correctedQuantity,
      isDeductible: hMfIngredients.isDeductible,
      processGroupId: hMfIngredients.processGroupId,
      materialUnit: itemMaster.baseUnit,
    })
    .from(hMfIngredients)
    .leftJoin(itemMaster, eq(hMfIngredients.materialId, itemMaster.id))
    .where(eq(hMfIngredients.mfReportVersionId, latestVersion[0].id))
    .orderBy(hMfIngredients.lineNo);

  if (ingredients.length === 0) {
    result.warnings.push(`배치 #${batchId}: BOM 라인 0 행 — 적용 불가`);
    return result;
  }

  // ─────────────────────────────────────────────────────
  // 4. INSERT 데이터 생성
  //    - materialId NULL → SKIP (FLAVOR_SPECIFIC 부재료 등 mid 없음)
  //    - isDeductible=0 → SKIP (재고 차감 안 하는 항목 — 회수재료 등)
  // ─────────────────────────────────────────────────────
  const batchInputs = ingredients
    .filter((ing) => ing.materialId !== null && ing.isDeductible !== 0)
    .map((ing) => {
      // 보정 배합비 우선, 없으면 법적 배합비
      const ratio = ing.correctedQuantity
        ? parseFloat(String(ing.correctedQuantity))
        : parseFloat(String(ing.quantity));
      return {
        batchId,
        materialId: ing.materialId!,
        plannedQuantity: ((ratio / 100) * plannedQuantity).toFixed(3),
        unit: ing.materialUnit || "kg",
        processGroupId: ing.processGroupId ?? null,
        tenantId,
      };
    });

  if (batchInputs.length === 0) {
    result.warnings.push(
      `배치 #${batchId}: 모든 BOM 라인이 SKIP 조건 (materialId NULL 또는 isDeductible=0)`,
    );
    return result;
  }

  // ─────────────────────────────────────────────────────
  // 5. INSERT
  // ─────────────────────────────────────────────────────
  await db.insert(hBatchInputs).values(batchInputs as any);
  result.insertedCount = batchInputs.length;
  console.log(
    `[applyBomToBatch] 배치 #${batchId} (product=${productId}): ${batchInputs.length}건 BOM 자동 적용 (version=${latestVersion[0].id}, approved=${result.versionApproved})`,
  );

  return result;
}
