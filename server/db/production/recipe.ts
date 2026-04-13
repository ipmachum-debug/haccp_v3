/**
 * 레시피 관리 모듈 - BOM(h_mf_reports / h_mf_report_versions / h_mf_ingredients) 기반
 *
 * h_recipes 테이블에서 BOM 시스템으로 완전 전환.
 * API 응답 형태(shape)는 기존과 동일하게 유지하여 프론트엔드 호환성 보장.
 *
 * 매핑:
 *   h_recipes.id          -> h_mf_reports.id
 *   h_recipes.productId   -> h_mf_reports.product_id
 *   h_recipes.recipeName  -> h_mf_reports.report_no (보고서 번호를 이름으로 사용)
 *   h_recipes.version     -> h_mf_report_versions.version_no (문자열 "1.0" -> 정수)
 *   h_recipes.batchSize   -> h_mf_report_versions.batch_target_kg
 *   h_recipes.batchUnit   -> 항상 "kg"
 *   h_recipes.isActive    -> h_mf_reports.status ("ACTIVE" = 1, else 0)
 *   h_recipes.approvalStatus -> h_mf_report_versions.approval_status
 *   recipe_lines          -> h_mf_ingredients
 *   recipe_versions       -> h_mf_report_versions (네이티브 버전 관리)
 */
import { getDb } from "../connection";
import {
  hMfReports,
  hMfReportVersions,
  hMfIngredients,
  itemMaster,
} from "../../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼: BOM 데이터를 기존 recipe 응답 형태로 변환
// ─────────────────────────────────────────────────────────────

interface RecipeShape {
  id: number;
  tenantId: number;
  productId: number;
  recipeName: string;
  version: string;
  description: string | null;
  batchSize: string;
  batchUnit: string;
  yieldRate: string | null;
  preparationTime: number | null;
  cookingTime: number | null;
  totalTime: number | null;
  isActive: number;
  approvalStatus: string;
  approvedBy: number | null;
  approvedAt: Date | null;
  rejectedBy: number | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RecipeLineShape {
  id: number;
  recipeId: number;
  materialId: number;
  quantity: string;
  unit: string;
  percentage: string | null;
  sortOrder: number;
  notes: string | null;
  createdAt: Date;
}

function toRecipeShape(
  report: any,
  version: any | null,
  tenantId: number,
): RecipeShape {
  return {
    id: Number(report.id),
    tenantId,
    productId: Number(report.productId),
    recipeName: report.reportNo || `BOM-${report.id}`,
    version: version ? `${version.versionNo}.0` : "1.0",
    description: version?.changeReason || null,
    batchSize: version?.batchTargetKg?.toString() || "0",
    batchUnit: "kg",
    yieldRate: null,
    preparationTime: null,
    cookingTime: null,
    totalTime: null,
    isActive: report.status === "ACTIVE" ? 1 : 0,
    approvalStatus: version?.approvalStatus || "DRAFT",
    approvedBy: version?.approvedBy ? Number(version.approvedBy) : null,
    approvedAt: version?.approvedAt || null,
    rejectedBy: version?.rejectedBy ? Number(version.rejectedBy) : null,
    rejectedAt: version?.rejectedAt || null,
    rejectionReason: version?.rejectionReason || null,
    createdBy: version?.createdBy ? Number(version.createdBy) : null,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt || report.createdAt,
  };
}

function toLineShape(ing: any, reportId: number): RecipeLineShape {
  return {
    id: Number(ing.id),
    recipeId: reportId,
    materialId: Number(ing.materialId || 0),
    quantity: ing.correctedQuantity || ing.quantity || "0",
    unit: ing.unit || "kg",
    percentage: ing.quantity || null, // 원래 배합비(%)
    sortOrder: ing.lineNo || 0,
    notes: ing.flavorName || null,
    createdAt: ing.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────
// 최신 버전 조회 헬퍼
// ─────────────────────────────────────────────────────────────

async function getLatestVersion(db: any, mfReportId: number) {
  const versions = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.mfReportId, mfReportId))
    .orderBy(desc(hMfReportVersions.versionNo))
    .limit(1);
  return versions.length > 0 ? versions[0] : null;
}

async function getIngredientsByVersionId(db: any, versionId: number) {
  return db
    .select({
      id: hMfIngredients.id,
      lineNo: hMfIngredients.lineNo,
      materialId: hMfIngredients.materialId,
      materialName: itemMaster.itemName,
      intermediateId: hMfIngredients.intermediateId,
      quantity: hMfIngredients.quantity,
      unit: hMfIngredients.unit,
      isDeductible: hMfIngredients.isDeductible,
      correctedQuantity: hMfIngredients.correctedQuantity,
      materialType: hMfIngredients.materialType,
      flavorName: hMfIngredients.flavorName,
      processGroupId: hMfIngredients.processGroupId,
      adjustedWeightKg: hMfIngredients.adjustedWeightKg,
      isAdditional: hMfIngredients.isAdditional,
      createdAt: hMfIngredients.createdAt,
    })
    .from(hMfIngredients)
    .leftJoin(itemMaster, eq(hMfIngredients.materialId, itemMaster.id))
    .where(eq(hMfIngredients.mfReportVersionId, versionId))
    .orderBy(hMfIngredients.lineNo);
}

// ═══════════════════════════════════════════════════════════════
// 공개 API (기존 recipe.ts와 동일한 함수명 및 시그니처)
// ═══════════════════════════════════════════════════════════════

/**
 * 레시피(BOM) 목록 조회
 */
export async function getRecipes(filters: {
  productId?: number;
  isActive?: boolean;
  tenantId: number;
}): Promise<RecipeShape[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [eq(hMfReports.tenantId, filters.tenantId)];
  if (filters.productId) {
    conditions.push(eq(hMfReports.productId, filters.productId));
  }
  if (filters.isActive !== undefined) {
    conditions.push(
      eq(hMfReports.status, filters.isActive ? "ACTIVE" : "INACTIVE"),
    );
  }

  const reports = await db
    .select()
    .from(hMfReports)
    .where(and(...conditions))
    .orderBy(desc(hMfReports.createdAt));

  // 각 보고서의 최신 버전 정보 포함
  const results: RecipeShape[] = [];
  for (const report of reports) {
    const version = await getLatestVersion(db, report.id);
    results.push(toRecipeShape(report, version, filters.tenantId));
  }
  return results;
}

/**
 * 레시피(BOM) 상세 조회 (라인 포함)
 */
export async function getRecipeById(
  recipeId: number,
  tenantId?: number,
): Promise<(RecipeShape & { lines: RecipeLineShape[] }) | null> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [eq(hMfReports.id, recipeId)];
  if (tenantId) {
    conditions.push(eq(hMfReports.tenantId, tenantId));
  }

  const reports = await db
    .select()
    .from(hMfReports)
    .where(and(...conditions))
    .limit(1);

  if (!reports || reports.length === 0) return null;
  const report = reports[0];

  const version = await getLatestVersion(db, report.id);
  const recipe = toRecipeShape(report, version, tenantId || report.tenantId);

  let lines: RecipeLineShape[] = [];
  if (version) {
    const ingredients = await getIngredientsByVersionId(db, version.id);
    lines = ingredients.map((ing: any) => toLineShape(ing, report.id));
  }

  return { ...recipe, lines };
}

/**
 * 제품별 레시피(BOM) 조회
 */
export async function getRecipesByProductId(
  productId: number,
  tenantId?: number,
): Promise<RecipeShape[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [
    eq(hMfReports.productId, productId),
    eq(hMfReports.status, "ACTIVE"),
  ];
  if (tenantId) {
    conditions.push(eq(hMfReports.tenantId, tenantId));
  }

  const reports = await db
    .select()
    .from(hMfReports)
    .where(and(...conditions))
    .orderBy(desc(hMfReports.createdAt));

  const results: RecipeShape[] = [];
  for (const report of reports) {
    const version = await getLatestVersion(db, report.id);
    results.push(toRecipeShape(report, version, tenantId || report.tenantId));
  }
  return results;
}

/**
 * 레시피(BOM) 생성
 * h_mf_reports + h_mf_report_versions + h_mf_ingredients 동시 생성
 */
export async function createRecipe(data: {
  productId: number;
  recipeName: string;
  version: string;
  description?: string;
  batchSize: string;
  batchUnit: string;
  yieldRate?: string;
  preparationTime?: number;
  cookingTime?: number;
  totalTime?: number;
  createdBy: number;
  tenantId: number;
  lines: Array<{
    materialId: number;
    quantity: string;
    unit: string;
    percentage?: string;
    sortOrder: number;
    notes?: string;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 보고서 마스터 생성
  const [reportResult] = await db.insert(hMfReports).values({
    productId: data.productId,
    reportNo: data.recipeName,
    reportDate: new Date(),
    status: "ACTIVE",
    tenantId: data.tenantId,
  } as any);
  const mfReportId = Number(reportResult.insertId);

  // 2. 버전 생성
  const versionNo = parseVersionNo(data.version);
  const [versionResult] = await db.insert(hMfReportVersions).values({
    mfReportId,
    versionNo,
    effectiveFrom: new Date(),
    changeReason: data.description || "초기 버전",
    compositionTotalRule: "100%",
    createdBy: data.createdBy,
    approvalStatus: "DRAFT",
    yieldBasis: "PER_BATCH_KG",
    batchTargetKg: data.batchSize || null,
    tenantId: data.tenantId,
  } as any);
  const versionId = Number(versionResult.insertId);

  // 3. 원재료 구성 생성
  if (data.lines && data.lines.length > 0) {
    await db.insert(hMfIngredients).values(
      data.lines.map((line, index) => ({
        mfReportVersionId: versionId,
        lineNo: line.sortOrder || index + 1,
        materialId: line.materialId,
        quantity: line.percentage || line.quantity,
        correctedQuantity: line.quantity,
        unit: line.unit,
        isDeductible: 1,
        materialType: "RAW" as const,
        flavorName: line.notes || null,
      })),
    );
  }

  return { id: mfReportId, success: true };
}

/**
 * 레시피(BOM) 수정
 * 보고서 헤더 및 최신 버전의 원재료 구성 업데이트
 */
export async function updateRecipe(
  recipeId: number,
  data: Partial<{
    recipeName: string;
    version: string;
    description: string;
    batchSize: string;
    batchUnit: string;
    yieldRate: string;
    preparationTime: number;
    cookingTime: number;
    totalTime: number;
    isActive: number;
  }>,
  lines?: Array<{
    id?: number;
    materialId: number;
    quantity: string;
    unit: string;
    percentage?: string;
    sortOrder: number;
    notes?: string;
  }>,
  tenantId?: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [eq(hMfReports.id, recipeId)];
  if (tenantId) {
    conditions.push(eq(hMfReports.tenantId, tenantId));
  }

  // 보고서 헤더 수정
  const reportUpdates: any = {};
  if (data.recipeName !== undefined) reportUpdates.reportNo = data.recipeName;
  if (data.isActive !== undefined) {
    reportUpdates.status = data.isActive ? "ACTIVE" : "INACTIVE";
  }
  if (Object.keys(reportUpdates).length > 0) {
    await db.update(hMfReports).set(reportUpdates).where(and(...conditions));
  }

  // 최신 버전 수정
  const version = await getLatestVersion(db, recipeId);
  if (version) {
    const versionUpdates: any = {};
    if (data.batchSize !== undefined) versionUpdates.batchTargetKg = data.batchSize;
    if (data.description !== undefined) versionUpdates.changeReason = data.description;
    if (Object.keys(versionUpdates).length > 0) {
      await db
        .update(hMfReportVersions)
        .set(versionUpdates)
        .where(eq(hMfReportVersions.id, version.id));
    }

    // 원재료 구성 교체 (기존 삭제 후 재생성)
    if (lines) {
      await db
        .delete(hMfIngredients)
        .where(eq(hMfIngredients.mfReportVersionId, version.id));

      if (lines.length > 0) {
        await db.insert(hMfIngredients).values(
          lines.map((line, index) => ({
            mfReportVersionId: version.id,
            lineNo: line.sortOrder || index + 1,
            materialId: line.materialId,
            quantity: line.percentage || line.quantity,
            correctedQuantity: line.quantity,
            unit: line.unit,
            isDeductible: 1,
            materialType: "RAW" as const,
            flavorName: line.notes || null,
          })),
        );
      }
    }
  }

  return { success: true };
}

/**
 * 레시피(BOM) 삭제 (소프트 삭제 - status를 INACTIVE로 변경)
 */
export async function deleteRecipe(recipeId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [eq(hMfReports.id, recipeId)];
  if (tenantId) {
    conditions.push(eq(hMfReports.tenantId, tenantId));
  }

  await db
    .update(hMfReports)
    .set({ status: "INACTIVE" })
    .where(and(...conditions));
  return { success: true };
}

/**
 * 레시피(BOM) 버전 이력 생성
 * BOM에서는 h_mf_report_versions에 새 버전을 추가하는 것이 네이티브.
 */
export async function createRecipeVersion(
  data: {
    recipeId: number;
    version: string;
    changeDescription?: string;
    createdBy: number;
  },
  tenantId?: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 현재 최신 버전 조회
  const latestVersion = await getLatestVersion(db, data.recipeId);
  const nextVersionNo = latestVersion ? latestVersion.versionNo + 1 : 1;

  // 새 버전 생성
  const [result] = await db.insert(hMfReportVersions).values({
    mfReportId: data.recipeId,
    versionNo: nextVersionNo,
    effectiveFrom: new Date(),
    changeReason: data.changeDescription || "버전 갱신",
    compositionTotalRule: "100%",
    createdBy: data.createdBy,
    approvalStatus: "DRAFT",
    yieldBasis: latestVersion?.yieldBasis || "PER_BATCH_KG",
    batchTargetKg: latestVersion?.batchTargetKg || null,
    tenantId: tenantId || undefined,
  } as any);

  const newVersionId = Number(result.insertId);

  // 기존 버전의 원재료 구성 복사
  if (latestVersion) {
    const oldIngredients = await db
      .select()
      .from(hMfIngredients)
      .where(eq(hMfIngredients.mfReportVersionId, latestVersion.id))
      .orderBy(hMfIngredients.lineNo);

    if (oldIngredients.length > 0) {
      await db.insert(hMfIngredients).values(
        oldIngredients.map((ing: any) => ({
          mfReportVersionId: newVersionId,
          lineNo: ing.lineNo,
          materialId: ing.materialId,
          intermediateId: ing.intermediateId,
          quantity: ing.quantity,
          correctedQuantity: ing.correctedQuantity,
          unit: ing.unit,
          isDeductible: ing.isDeductible,
          materialType: ing.materialType,
          flavorName: ing.flavorName,
          processGroupId: ing.processGroupId,
          adjustedWeightKg: ing.adjustedWeightKg,
          isAdditional: ing.isAdditional,
        })),
      );
    }
  }

  return { success: true };
}

/**
 * 레시피(BOM) 버전 이력 조회
 */
export async function getRecipeVersions(
  recipeId: number,
  tenantId?: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: any[] = [eq(hMfReportVersions.mfReportId, recipeId)];
  if (tenantId) {
    conditions.push(eq(hMfReportVersions.tenantId, tenantId));
  }

  const versions = await db
    .select()
    .from(hMfReportVersions)
    .where(and(...conditions))
    .orderBy(desc(hMfReportVersions.versionNo));

  // 기존 recipeVersions 형태로 변환
  return versions.map((v: any) => ({
    id: v.id,
    recipeId: v.mfReportId,
    version: `${v.versionNo}.0`,
    changeDescription: v.changeReason,
    snapshotData: JSON.stringify({
      approvalStatus: v.approvalStatus,
      batchTargetKg: v.batchTargetKg,
      effectiveFrom: v.effectiveFrom,
    }),
    createdBy: v.createdBy,
    createdAt: v.createdAt,
    tenantId: v.tenantId,
  }));
}

/**
 * 레시피(BOM) 복제
 */
export async function duplicateRecipe(
  recipeId: number,
  newRecipeName: string,
  createdBy: number,
  tenantId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 기존 BOM 상세 조회
  const existing = await getRecipeById(recipeId, tenantId);
  if (!existing) throw new Error("Recipe not found");

  // 새 BOM 생성
  return await createRecipe({
    productId: existing.productId,
    recipeName: newRecipeName,
    version: "1.0",
    description: `${existing.recipeName}에서 복제`,
    batchSize: existing.batchSize,
    batchUnit: existing.batchUnit,
    createdBy,
    tenantId,
    lines: existing.lines.map((line) => ({
      materialId: line.materialId,
      quantity: line.quantity,
      unit: line.unit,
      percentage: line.percentage || undefined,
      sortOrder: line.sortOrder,
      notes: line.notes || undefined,
    })),
  });
}

/**
 * 감사 로그 (호환성 스텁)
 */
export async function createAuditLog(_data: any, _tenantId?: number) {
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────────────────────

/** "1.0", "2.0" 등의 버전 문자열을 정수로 변환 */
function parseVersionNo(version: string): number {
  const parsed = parseInt(version, 10);
  return isNaN(parsed) ? 1 : parsed;
}
