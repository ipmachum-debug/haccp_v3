/**
 * 품목제조보고 승인 API - BOM(h_mf_report_versions) 기반
 *
 * 기존 h_recipes 테이블의 approvalStatus 대신
 * h_mf_report_versions.approval_status를 사용합니다.
 *
 * 기존 API 시그니처(recipeId 등)는 호환성을 위해 유지하되,
 * 내부적으로 mfReportId -> 최신 버전의 approvalStatus를 조작합니다.
 */
import { getDb } from "../connection";
import {
  hMfReports,
  hMfReportVersions,
} from "../../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼
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

/** BOM 보고서+버전을 기존 recipe 형태로 변환 */
function toRecipeApprovalShape(report: any, version: any) {
  return {
    id: Number(report.id),
    tenantId: report.tenantId,
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
    // BOM 전용 필드 (프론트엔드에서 필요 시 사용)
    _mfReportVersionId: version?.id || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// 공개 API
// ═══════════════════════════════════════════════════════════════

/**
 * 승인 대기 중인 품목제조보고 목록 조회
 * BOM에서는 최신 버전의 approvalStatus가 "DRAFT"인 보고서를 반환
 */
export async function getPendingRecipes(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 해당 테넌트의 모든 활성 보고서 조회
  const reports = await db
    .select()
    .from(hMfReports)
    .where(
      and(
        eq(hMfReports.tenantId, tenantId),
        eq(hMfReports.status, "ACTIVE"),
      ),
    )
    .orderBy(hMfReports.createdAt);

  // 각 보고서의 최신 버전이 DRAFT인 것만 필터
  const pendingRecipes = [];
  for (const report of reports) {
    const version = await getLatestVersion(db, report.id);
    if (version && version.approvalStatus === "DRAFT") {
      pendingRecipes.push(toRecipeApprovalShape(report, version));
    }
  }

  return pendingRecipes;
}

/**
 * 품목제조보고 승인
 * BOM 최신 버전의 approvalStatus를 "APPROVED"로 변경
 */
export async function approveRecipe(
  tenantId: number,
  input: { recipeId: number; userId: number },
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 보고서 존재 확인
  const [report] = await db
    .select()
    .from(hMfReports)
    .where(
      and(
        eq(hMfReports.tenantId, tenantId),
        eq(hMfReports.id, input.recipeId),
      ),
    )
    .limit(1);

  if (!report) {
    throw new Error("품목제조보고를 찾을 수 없습니다.");
  }

  // 최신 버전 조회
  const version = await getLatestVersion(db, report.id);
  if (!version) {
    throw new Error("품목제조보고 버전을 찾을 수 없습니다.");
  }

  if (version.approvalStatus !== "DRAFT") {
    throw new Error("승인 대기 중인 품목제조보고만 승인할 수 있습니다.");
  }

  // 승인 처리
  await db
    .update(hMfReportVersions)
    .set({
      approvalStatus: "APPROVED",
      approvedBy: input.userId,
      approvedAt: new Date(),
    })
    .where(eq(hMfReportVersions.id, version.id));

  // 승인 이력 기록
  try {
    const { hMfReportApprovals } = await import(
      "../../../drizzle/schema/schema_recipe_new"
    );
    await db.insert(hMfReportApprovals).values({
      mfReportVersionId: version.id,
      action: "APPROVED",
      actionBy: input.userId,
      comment: null,
    });
  } catch {
    // 승인 이력 테이블이 없어도 승인 자체는 성공
  }

  return { success: true, message: "품목제조보고가 승인되었습니다." };
}

/**
 * 품목제조보고 반려
 * BOM 최신 버전의 approvalStatus를 "REJECTED"로 변경
 */
export async function rejectRecipe(
  tenantId: number,
  input: { recipeId: number; userId: number; reason: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 보고서 존재 확인
  const [report] = await db
    .select()
    .from(hMfReports)
    .where(
      and(
        eq(hMfReports.tenantId, tenantId),
        eq(hMfReports.id, input.recipeId),
      ),
    )
    .limit(1);

  if (!report) {
    throw new Error("품목제조보고를 찾을 수 없습니다.");
  }

  // 최신 버전 조회
  const version = await getLatestVersion(db, report.id);
  if (!version) {
    throw new Error("품목제조보고 버전을 찾을 수 없습니다.");
  }

  if (version.approvalStatus !== "DRAFT") {
    throw new Error("승인 대기 중인 품목제조보고만 반려할 수 있습니다.");
  }

  // 반려 처리
  await db
    .update(hMfReportVersions)
    .set({
      approvalStatus: "REJECTED",
      rejectedBy: input.userId,
      rejectedAt: new Date(),
      rejectionReason: input.reason,
    })
    .where(eq(hMfReportVersions.id, version.id));

  // 반려 이력 기록
  try {
    const { hMfReportApprovals } = await import(
      "../../../drizzle/schema/schema_recipe_new"
    );
    await db.insert(hMfReportApprovals).values({
      mfReportVersionId: version.id,
      action: "REJECTED",
      actionBy: input.userId,
      comment: input.reason,
    });
  } catch {
    // 이력 테이블이 없어도 반려 자체는 성공
  }

  return { success: true, message: "품목제조보고가 반려되었습니다." };
}

/**
 * 품목제조보고 상세 조회 (승인 정보 포함)
 */
export async function getRecipeWithApprovalInfo(
  tenantId: number,
  recipeId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [report] = await db
    .select()
    .from(hMfReports)
    .where(
      and(
        eq(hMfReports.tenantId, tenantId),
        eq(hMfReports.id, recipeId),
      ),
    )
    .limit(1);

  if (!report) {
    throw new Error("품목제조보고를 찾을 수 없습니다.");
  }

  const version = await getLatestVersion(db, report.id);
  return toRecipeApprovalShape(report, version);
}

/**
 * 품목제조보고 승인 이력 조회
 */
export async function getRecipeApprovalHistory(
  tenantId: number,
  filters?: {
    approvalStatus?: string;
    startDate?: string;
    endDate?: string;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 해당 테넌트의 모든 보고서 조회
  const reports = await db
    .select()
    .from(hMfReports)
    .where(eq(hMfReports.tenantId, tenantId))
    .orderBy(desc(hMfReports.createdAt));

  const results = [];
  for (const report of reports) {
    const version = await getLatestVersion(db, report.id);
    if (!version) continue;

    // 필터 적용
    if (filters?.approvalStatus && version.approvalStatus !== filters.approvalStatus) {
      continue;
    }

    // DRAFT 상태 제외 (이미 승인/반려된 것만)
    if (
      version.approvalStatus === "APPROVED" ||
      version.approvalStatus === "REJECTED"
    ) {
      results.push(toRecipeApprovalShape(report, version));
    }
  }

  return results;
}
