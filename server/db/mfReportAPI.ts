import { getDb } from "../db";
import {
  hMfReports,
  hMfReportVersions,
  hMfFlavors,
  hMfIngredients,
  hProductsV2,
  hMaterials,
  itemMaster
} from "../../drizzle/schema";
import { eq, and, desc, lte, sql } from "drizzle-orm";

/**
 * 품목제조보고 목록 조회
 */
export async function getMfReports(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const baseQuery = db
    .select({
      id: hMfReports.id,
      productId: hMfReports.productId,
      productName: hProductsV2.productName,
      reportNo: hMfReports.reportNo,
      reportDate: hMfReports.reportDate,
      status: hMfReports.status,
      createdAt: hMfReports.createdAt
    })
    .from(hMfReports)
    .leftJoin(hProductsV2, eq(hMfReports.productId, hProductsV2.id));
  
  // tenantId 필터링
  if (tenantId) {
    return baseQuery
      .where(eq(hMfReports.tenantId, tenantId))
      .orderBy(desc(hMfReports.createdAt));
  }
  
  return baseQuery.orderBy(desc(hMfReports.createdAt));
}

/**
 * 품목제조보고 상세 조회 (최신 버전 포함)
 */
export async function getMfReportDetail(mfReportId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 품목제조보고 기본 정보
  const baseReportQuery = db
    .select({
      id: hMfReports.id,
      productId: hMfReports.productId,
      productName: hProductsV2.productName,
      reportNo: hMfReports.reportNo,
      reportDate: hMfReports.reportDate,
      status: hMfReports.status,
      createdAt: hMfReports.createdAt,
      updatedAt: hMfReports.updatedAt
    })
    .from(hMfReports)
    .leftJoin(hProductsV2, eq(hMfReports.productId, hProductsV2.id));
  
  // tenantId 필터링
  const report = tenantId
    ? await baseReportQuery
        .where(
          and(
            eq(hMfReports.id, mfReportId),
            eq(hMfReports.tenantId, tenantId)
          )
        )
        .limit(1)
    : await baseReportQuery
        .where(eq(hMfReports.id, mfReportId))
        .limit(1);
  
  if (report.length === 0) {
    throw new Error("품목제조보고를 찾을 수 없습니다.");
  }
  
  // 최신 버전 조회
  const latestVersion = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.mfReportId, mfReportId))
    .orderBy(desc(hMfReportVersions.versionNo))
    .limit(1);
  
  // 원재료 함량(배합비) 조회
  let ingredients = [];
  if (latestVersion.length > 0) {
    const ingredientsData = await db
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
        isAdditional: hMfIngredients.isAdditional
      })
      .from(hMfIngredients)
      .leftJoin(itemMaster, eq(hMfIngredients.materialId, itemMaster.id))
      .where(eq(hMfIngredients.mfReportVersionId, latestVersion[0].id))
      .orderBy(hMfIngredients.lineNo);
    
    ingredients = ingredientsData;
  }
  
  return {
    ...report[0],
    latestVersion: latestVersion.length > 0 ? latestVersion[0] : null,
    ingredients
  };
}

/**
 * 품목제조보고 생성 (버전 자동 생성 + 부재료/원재료 구성 저장)
 */
export async function createMfReport(data: {
  productId: number;
  reportNo: string;
  reportDate: string;
  flavorId?: number;
  ingredients?: Array<{
    materialId?: number;
    intermediateId?: number;
    quantity: number;
    unit: string;
    isDeductible: number;
    materialType: "RAW" | "MIXED" | "FLAVOR_SPECIFIC";
    flavorName?: string;
    processGroupId?: number;
    adjustedWeightKg?: number;
    isAdditional?: number;
  }>;
  createdBy?: number;
  yieldBasis?: string;
  unitWeightG?: number;
  batchTargetKg?: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 1. 품목제조보고 마스터 생성
  const [reportResult] = await db.insert(hMfReports).values({
    productId: data.productId,
    reportNo: data.reportNo,
    reportDate: new Date(data.reportDate),
    status: "ACTIVE",
    tenantId: tenantId
  } as any);
  
  const mfReportId = reportResult.insertId;
  
  // 2. 버전 1.0 자동 생성
  const [versionResult] = await db.insert(hMfReportVersions).values({
    mfReportId,
    versionNo: 1,
    effectiveFrom: new Date(data.reportDate),
    changeReason: "초기 버전",
    compositionTotalRule: "100%",
    createdBy: data.createdBy,
    approvalStatus: "DRAFT",
    yieldBasis: data.yieldBasis || "PER_BATCH_KG",
    unitWeightG: data.unitWeightG || null,
    batchTargetKg: data.batchTargetKg || null,
    tenantId: tenantId
  } as any);
  
  const versionId = versionResult.insertId;
  
  // 3. 부재료(Flavor) 저장
  if (data.flavorId) {
    await db.insert(hMfFlavors).values({
      mfReportVersionId: versionId,
      flavorCode: `FLAVOR-${versionId}`,
      flavorName: "부재료",
      appliesToSku: null
    });
  }
  
  // 4. 원재료 구성(Ingredients) 저장
  if (data.ingredients && data.ingredients.length > 0) {
    await db.insert(hMfIngredients).values(
      data.ingredients.map((ing, index) => ({
        mfReportVersionId: versionId,
        lineNo: index + 1,
        materialId: ing.materialId || null,
        intermediateId: ing.intermediateId || null,
        quantity: ing.quantity.toString(),
        unit: ing.unit,
        isDeductible: ing.isDeductible,
        materialType: ing.materialType,
        flavorName: ing.flavorName || null,
        processGroupId: ing.processGroupId || null,
        adjustedWeightKg: ing.adjustedWeightKg ? ing.adjustedWeightKg.toString() : null,
        isAdditional: ing.isAdditional || 0
      }))
    );
  }
  
  return mfReportId;
}

/**
 * 품목제조보고 버전 생성
 */
export async function createMfReportVersion(data: {
  mfReportId: number;
  effectiveFrom: string;
  changeReason?: string;
  compositionTotalRule?: string;
  createdBy?: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 최신 버전 번호 조회
  const latestVersion = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.mfReportId, data.mfReportId))
    .orderBy(desc(hMfReportVersions.versionNo))
    .limit(1);
  
  const nextVersionNo = latestVersion.length > 0 ? latestVersion[0].versionNo + 1 : 1;
  
  const [result] = await db.insert(hMfReportVersions).values({
    mfReportId: data.mfReportId,
    versionNo: nextVersionNo,
    effectiveFrom: new Date(data.effectiveFrom),
    changeReason: data.changeReason,
    compositionTotalRule: data.compositionTotalRule || "100%",
    createdBy: data.createdBy,
    approvalStatus: "DRAFT"
  });
  
  return result.insertId;
}



/**
 * 맛(Flavor) 생성
 */
export async function createMfFlavor(data: {
  mfReportVersionId: number;
  flavorCode: string;
  flavorName: string;
  appliesToSku?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const [result] = await db.insert(hMfFlavors).values(data);
  
  return result.insertId;
}

/**
 * 원재료 구성 추가
 */
export async function addMfIngredient(data: {
  mfReportVersionId: number;
  lineNo: number;
  materialId?: number;
  intermediateId?: number;
  quantity: string;
  unit: string;
  isDeductible: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const [result] = await db.insert(hMfIngredients).values(data);
  
  return result.insertId;
}

/**
 * 품목제조보고 버전 상세 조회 (맛 및 원재료 구성 포함)
 */
export async function getMfReportVersionDetail(versionId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 버전 기본 정보
  const version = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.id, versionId))
    .limit(1);
  
  if (version.length === 0) {
    throw new Error("품목제조보고 버전을 찾을 수 없습니다.");
  }
  
  // 맛 목록 조회
  const flavors = await db
    .select()
    .from(hMfFlavors)
    .where(eq(hMfFlavors.mfReportVersionId, versionId));
  
  // 각 맛별 원재료 구성 조회
  const flavorsWithIngredients = await Promise.all(
    flavors.map(async (flavor) => {
      const ingredients = await db
        .select({
          id: hMfIngredients.id,
          lineNo: hMfIngredients.lineNo,
          materialId: hMfIngredients.materialId,
          materialName: itemMaster.itemName,
          intermediateId: hMfIngredients.intermediateId,
          quantity: hMfIngredients.quantity,
          unit: hMfIngredients.unit,
          isDeductible: hMfIngredients.isDeductible,
          materialType: hMfIngredients.materialType,
          flavorName: hMfIngredients.flavorName,
        processGroupId: hMfIngredients.processGroupId,
        adjustedWeightKg: hMfIngredients.adjustedWeightKg,
        isAdditional: hMfIngredients.isAdditional
        })
        .from(hMfIngredients)
        .leftJoin(itemMaster, eq(hMfIngredients.materialId, itemMaster.id))
        .where(eq(hMfIngredients.mfReportVersionId, version[0].id))
        .orderBy(hMfIngredients.lineNo);
      
      return {
        ...flavor,
        ingredients
      };
    })
  );
  
  return {
    ...version[0],
    flavors: flavorsWithIngredients
  };
}

/**
 * 특정 날짜에 유효한 품목제조보고 버전 조회
 */
export async function getMfReportVersionByDate(mfReportId: number, date: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const version = await db
    .select()
    .from(hMfReportVersions)
    .where(
      and(
        eq(hMfReportVersions.mfReportId, mfReportId),
        sql`${hMfReportVersions.effectiveFrom} <= ${date}`,
        eq(hMfReportVersions.approvalStatus, "APPROVED")
      )
    )
    .orderBy(desc(hMfReportVersions.effectiveFrom))
    .limit(1);
  
  if (version.length === 0) {
    throw new Error("해당 날짜에 유효한 품목제조보고 버전을 찾을 수 없습니다.");
  }
  
  return await getMfReportVersionDetail(version[0].id);
}

/**
 * 품목제조보고 버전 목록 조회
 */
export async function getMfReportVersions(mfReportId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.mfReportId, mfReportId))
    .orderBy(desc(hMfReportVersions.versionNo));
}

/**
 * 원재료 구성 수정
 */
export async function updateMfIngredient(
  ingredientId: number,
  data: {
    percent?: string;
    isDeductible?: number;
    labelNameOverride?: string;
    allergens?: string;
    originNote?: string;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(hMfIngredients)
    .set(data)
    .where(eq(hMfIngredients.id, ingredientId));
  
  return true;
}

/**
 * 원재료 구성 삭제
 */
export async function deleteMfIngredient(ingredientId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .delete(hMfIngredients)
    .where(eq(hMfIngredients.id, ingredientId));
  
  return true;
}

/**
 * 일괄 상태 변경
 */
export async function bulkUpdateMfReportStatus(
  ids: number[],
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED", tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(hMfReports)
    .set({ status })
    .where(sql`${hMfReports.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
  
  return { success: true, count: ids.length };
}

/**
 * 일괄 삭제
 */
export async function bulkDeleteMfReports(ids: number[], tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 관련 버전 및 원재료 구성도 함께 삭제
  for (const id of ids) {
    const versions = await db
      .select({ id: hMfReportVersions.id })
      .from(hMfReportVersions)
      .where(eq(hMfReportVersions.mfReportId, id));
    
    for (const version of versions) {
      await db
        .delete(hMfIngredients)
        .where(eq(hMfIngredients.mfReportVersionId, version.id));
      
      await db
        .delete(hMfFlavors)
        .where(eq(hMfFlavors.mfReportVersionId, version.id));
    }
    
    await db
      .delete(hMfReportVersions)
      .where(eq(hMfReportVersions.mfReportId, id));
  }
  
  await db
    .delete(hMfReports)
    .where(sql`${hMfReports.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
  
  return { success: true, count: ids.length };
}

/**
 * 일괄 PDF 출력
 */
export async function bulkExportMfReportsPdf(ids: number[], tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const PDFDocument = require("pdfkit");
  const reports: any[] = [];
  
  for (const id of ids) {
    const report = await getMfReportDetail(id);
    if (report) {
      reports.push(report);
    }
  }
  
  // PDF 생성
  const path = require("path");
  const fontPath = path.join(process.cwd(), "fonts", "NanumGothic-Regular.ttf");
  const fontBoldPath = path.join(process.cwd(), "fonts", "NanumGothic-Bold.ttf");
  const doc = new PDFDocument({ margin: 50 });
  try { doc.registerFont("NanumGothic", fontPath); doc.registerFont("NanumGothicBold", fontBoldPath); doc.font("NanumGothic"); } catch(e) { console.error("Font registration failed:", e); }
  const chunks: Buffer[] = [];
  
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    
    // 각 보고서를 새 페이지에 출력
    reports.forEach((report, index) => {
      if (index > 0) {
        doc.addPage();
      }
      
      doc.fontSize(20).text("품목제조보고서", { align: "center" });
      doc.moveDown();
      doc.fontSize(12);
      doc.text(`보고서 번호: ${report.reportNo}`);
      doc.text(`제품명: ${report.productName}`);
      doc.text(`보고 날짜: ${new Date(report.reportDate).toLocaleDateString("ko-KR")}`);
      doc.text(`상태: ${report.status}`);
      doc.moveDown();
      doc.text(`생성일: ${new Date(report.createdAt).toLocaleString("ko-KR")}`);
    });
    
    doc.end();
  });
}

/**
 * 승인 요청
 */
export async function requestMfReportApproval(
  mfReportVersionId: number,
  requestedBy: number,
  comment?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 버전 상태를 PENDING으로 변경
  await db
    .update(hMfReportVersions)
    .set({ approvalStatus: "PENDING" })
    .where(eq(hMfReportVersions.id, mfReportVersionId));
  
  // 승인 이력 추가
  const { hMfReportApprovals } = await import("../../drizzle/schema_recipe_new");
  await db.insert(hMfReportApprovals).values({
    mfReportVersionId,
    action: "REQUESTED",
    actionBy: requestedBy,
    comment: comment || null
  });
  
  return { success: true };
}

/**
 * 승인 처리
 */
export async function approveMfReportVersion(
  versionId: number,
  approvedBy: number,
  comment?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 버전 상태를 APPROVED로 변경
  await db
    .update(hMfReportVersions)
    .set({
      approvalStatus: "APPROVED",
      approvedBy,
      approvedAt: new Date()
    })
    .where(eq(hMfReportVersions.id, versionId));
  
  // 승인 이력 추가
  const { hMfReportApprovals } = await import("../../drizzle/schema_recipe_new");
  await db.insert(hMfReportApprovals).values({
    mfReportVersionId: versionId,
    action: "APPROVED",
    actionBy: approvedBy,
    comment: comment || null
  });
  
  return { success: true };
}

/**
 * 반려 처리
 */
export async function rejectMfReportVersion(
  versionId: number,
  rejectedBy: number,
  reason: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 버전 상태를 REJECTED로 변경
  await db
    .update(hMfReportVersions)
    .set({
      approvalStatus: "REJECTED",
      rejectedBy,
      rejectedAt: new Date(),
      rejectionReason: reason
    })
    .where(eq(hMfReportVersions.id, versionId));
  
  // 승인 이력 추가
  const { hMfReportApprovals } = await import("../../drizzle/schema_recipe_new");
  await db.insert(hMfReportApprovals).values({
    mfReportVersionId: versionId,
    action: "REJECTED",
    actionBy: rejectedBy,
    comment: reason
  });
  
  return { success: true };
}

/**
 * 승인 이력 조회
 */
export async function getMfReportApprovalHistory(mfReportVersionId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { hMfReportApprovals } = await import("../../drizzle/schema_recipe_new");
  const { users } = await import("../../drizzle/schema_main");
  
  return db
    .select({
      id: hMfReportApprovals.id,
      action: hMfReportApprovals.action,
      actionBy: hMfReportApprovals.actionBy,
      actionByName: users.name,
      actionAt: hMfReportApprovals.actionAt,
      comment: hMfReportApprovals.comment
    })
    .from(hMfReportApprovals)
    .leftJoin(users, eq(hMfReportApprovals.actionBy, users.id))
    .where(eq(hMfReportApprovals.mfReportVersionId, mfReportVersionId))
    .orderBy(desc(hMfReportApprovals.actionAt));
}


/**
 * 배치 생산량 입력 → g 환산 계산
 * @param versionId 품목제조보고 버전 ID
 * @param batchKg 배치 생산량(kg)
 * @returns 라인별 요구량(g/kg)
 */
export async function calculateBatchRequirements(
  versionId: number,
  batchKg: number, tenantId?: number): Promise<Array<{
  lineNo: number;
  materialType: string;
  materialId?: number;
  intermediateId?: number;
  materialName: string;
  ratioPercent: number;
  requiredKg: number;
  requiredG: number;
  unit: string;
  flavorName?: string;
}>> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 1. 품목제조보고 버전 정보 조회
  const version = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.id, versionId))
    .limit(1);

  if (!version || version.length === 0) {
    throw new Error(`Version ${versionId} not found`);
  }

  // 2. 원재료 구성 조회
  const ingredients = await db
    .select()
    .from(hMfIngredients)
    .where(eq(hMfIngredients.mfReportVersionId, versionId))
    .orderBy(hMfIngredients.lineNo);

  // 3. 라인별 요구량 계산
  const results = [];
  for (const ing of ingredients) {
    // 보정 배합비 사용 (정제수 제외), is_deductible=0이면 스킵
    if (ing.isDeductible === 0) continue; // 정제수 등 차감 제외 원재료 스킵
    const ratioPercent = ing.correctedQuantity 
      ? parseFloat(ing.correctedQuantity) 
      : parseFloat(ing.quantity); // fallback: 법적 배합비
    const requiredKg = batchKg * (ratioPercent / 100);
    const requiredG = requiredKg * 1000;

    // 재료 이름 조회 (itemMaster 기반)
    const { itemMaster: itemMasterTable } = await import("../../drizzle/schema");
    let materialName = "";
    if (ing.materialId) {
      const material = await db
        .select({ itemName: itemMasterTable.itemName })
        .from(itemMasterTable)
        .where(eq(itemMasterTable.id, ing.materialId))
        .limit(1);
      materialName = material[0]?.itemName || "Unknown";
    } else if (ing.intermediateId) {
      const intermediate = await db
        .select({ itemName: itemMasterTable.itemName })
        .from(itemMasterTable)
        .where(eq(itemMasterTable.id, ing.intermediateId))
        .limit(1);
      materialName = intermediate[0]?.itemName || "Unknown";
    }

    results.push({
      lineNo: ing.lineNo,
      materialType: ing.materialType,
      materialId: ing.materialId || undefined,
      intermediateId: ing.intermediateId || undefined,
      materialName,
      ratioPercent,
      requiredKg,
      requiredG,
      unit: ing.unit,
      flavorName: ing.flavorName || undefined
    });
  }

  return results;
}



/**
 * 품목제조보고 기반 재고 차감 정책
 * - 원재료: 직접 차감
 * - 중간재: 중간재 자체만 차감 (구성 요소는 차감하지 않음)
 * - 부재료: 총량만 차감 (맛별로 구분하지 않음)
 */
export async function deductInventoryByMfReport(data: {
  versionId: number;
  batchKg: number;
  productionDate: string;
  producedQuantity: number;
  notes?: string;
  createdBy?: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 1. 배치 소요량 계산
  const requirements = await calculateBatchRequirements(data.versionId, data.batchKg, tenantId);

  // 2. 생산 이력 로그 생성
  const { hProductionLog } = await import("../../drizzle/schema_recipe_new");
  const [productionLogResult] = await db.insert(hProductionLog).values({
    mfReportVersionId: data.versionId,
    productionDate: new Date(data.productionDate),
    batchSizeKg: data.batchKg.toString(),
    producedQuantity: data.producedQuantity,
    notes: data.notes || null,
    createdBy: data.createdBy || null
  });

  const productionLogId = productionLogResult.insertId;

  // 3. 재고 차감 및 로그 생성
  const { hInventoryDeductionLog } = await import("../../drizzle/schema_recipe_new");
  const deductionLogs: Array<{
    productionLogId: number;
    materialId?: number;
    intermediateId?: number;
    materialType: string;
    deductedQuantity: string;
    unit: string;
  }> = [];

  for (const req of requirements) {
    if (req.materialType === "RAW" && req.materialId) {
      // 원재료: 직접 차감
      deductionLogs.push({
        productionLogId,
        materialId: req.materialId,
        intermediateId: undefined,
        materialType: "RAW",
        deductedQuantity: req.requiredG.toString(),
        unit: "g"
      });
    } else if (req.materialType === "MIXED" && req.intermediateId) {
      // 중간재: 중간재 자체만 차감
      deductionLogs.push({
        productionLogId,
        materialId: undefined,
        intermediateId: req.intermediateId,
        materialType: "MIXED",
        deductedQuantity: req.requiredG.toString(),
        unit: "g"
      });
    } else if (req.materialType === "FLAVOR_SPECIFIC" && req.materialId) {
      // 부재료: 총량만 차감
      deductionLogs.push({
        productionLogId,
        materialId: req.materialId,
        intermediateId: undefined,
        materialType: "FLAVOR_SPECIFIC",
        deductedQuantity: req.requiredG.toString(),
        unit: "g"
      });
    }
  }

  // 4. 재고 차감 로그 일괄 삽입
  if (deductionLogs.length > 0) {
    await db.insert(hInventoryDeductionLog).values(deductionLogs);
  }

  return {
    productionLogId,
    deductionCount: deductionLogs.length,
    deductionLogs
  };
}


/**
 * 표시사항 출력 기능 (요약형/상세형)
 * - 요약형: 품목제조보고 그대로 출력
 * - 상세형: BOM 재귀적으로 펼쳐서 출력
 */
export async function generateIngredientLabel(versionId: number, mode: "summary" | "detailed", tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 1. 품목제조보고 버전 조회
  const version = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.id, versionId))
    .limit(1);

  if (version.length === 0) {
    throw new Error("품목제조보고 버전을 찾을 수 없습니다.");
  }

  // 2. 원재료 구성 조회
  const ingredients = await db
    .select()
    .from(hMfIngredients)
    .where(eq(hMfIngredients.mfReportVersionId, versionId))
    .orderBy(hMfIngredients.lineNo);

  const PDFDocument = require("pdfkit");
  const path = require("path");
  const fontPath = path.join(process.cwd(), "fonts", "NanumGothic-Regular.ttf");
  const fontBoldPath = path.join(process.cwd(), "fonts", "NanumGothic-Bold.ttf");
  const doc = new PDFDocument({ margin: 50 });
  try { doc.registerFont("NanumGothic", fontPath); doc.registerFont("NanumGothicBold", fontBoldPath); doc.font("NanumGothic"); } catch(e) { console.error("Font registration failed:", e); }
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  // 제목
  doc.fontSize(20).text("원재료 배합표", { align: "center" });
  doc.moveDown();
  doc.fontSize(12);
  doc.text(`버전: ${version[0].versionNo}`);
  doc.text(`적용일: ${new Date(version[0].effectiveFrom).toLocaleDateString("ko-KR")}`);
  doc.moveDown();

  if (mode === "summary") {
    // 요약형: 품목제조보고 그대로 출력
    doc.text("=== 요약형 배합표 ===");
    doc.moveDown();

    for (const ing of ingredients) {
      let materialName = "";
      if (ing.materialId) {
        const material = await db
          .select()
          .from(hMaterials)
          .where(tenantId ? and(eq(hMaterials.tenantId, tenantId), eq(hMaterials.id, ing.materialId)) : eq(hMaterials.id, ing.materialId))
          .limit(1);
        materialName = material[0]?.materialName || "Unknown";
      } else if (ing.intermediateId) {
        const intermediate = await db
          .select()
          .from(hMaterials)
          .where(tenantId ? and(eq(hMaterials.tenantId, tenantId), eq(hMaterials.id, ing.intermediateId)) : eq(hMaterials.id, ing.intermediateId))
          .limit(1);
        materialName = intermediate[0]?.materialName || "Unknown";
      }

      doc.text(`${ing.lineNo}. ${materialName} - ${ing.quantity}% (${ing.materialType})`);
    }
  } else {
    // 상세형: BOM 재귀적으로 펼쳐서 출력
    doc.text("=== 상세형 배합표 (BOM 펼침) ===");
    doc.moveDown();

    for (const ing of ingredients) {
      const percentage = parseFloat(ing.quantity);

      if (ing.materialType === "RAW" && ing.materialId) {
        // 원재료: 직접 출력
        const material = await db
          .select()
          .from(hMaterials)
          .where(tenantId ? and(eq(hMaterials.tenantId, tenantId), eq(hMaterials.id, ing.materialId)) : eq(hMaterials.id, ing.materialId))
          .limit(1);

        doc.text(`${ing.lineNo}. ${material[0]?.materialName || "Unknown"} - ${percentage}%`);
      } else if (ing.materialType === "MIXED" && ing.intermediateId) {
        // 중간재: 재귀적으로 펼침
        const intermediate = await db
          .select()
          .from(hMaterials)
          .where(tenantId ? and(eq(hMaterials.tenantId, tenantId), eq(hMaterials.id, ing.intermediateId)) : eq(hMaterials.id, ing.intermediateId))
          .limit(1);

        doc.text(`${ing.lineNo}. ${intermediate[0]?.materialName || "Unknown"} - ${percentage}% [중간재]`);

        // 중간재 구성 요소 출력
        const expanded = await expandMixedMaterialForLabel(db, ing.intermediateId, percentage, 1, tenantId);
        for (const item of expanded) {
          doc.text(`  ${"  ".repeat(item.depth)}└ ${item.materialName} - ${item.percentage.toFixed(2)}%`);
        }
      } else if (ing.materialType === "FLAVOR_SPECIFIC" && ing.materialId) {
        // 부재료: 직접 출력
        const material = await db
          .select()
          .from(hMaterials)
          .where(tenantId ? and(eq(hMaterials.tenantId, tenantId), eq(hMaterials.id, ing.materialId)) : eq(hMaterials.id, ing.materialId))
          .limit(1);

        doc.text(`${ing.lineNo}. ${material[0]?.materialName || "Unknown"} (${ing.flavorName || "공통"}) - ${percentage}%`);
      }
    }
  }

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/**
 * 중간재를 재귀적으로 펼쳐서 라벨용 목록 반환
 */
async function expandMixedMaterialForLabel(
  db: any,
  intermediateId: number,
  parentPercentage: number,
  depth: number,
  tenantId?: number
): Promise<Array<{ materialName: string; percentage: number; depth: number }>> {
  const results: Array<{ materialName: string; percentage: number; depth: number }> = [];

  // 중간재 구성 요소 조회
  const { hMixedMaterialComponents } = await import("../../drizzle/schema_recipe_new");
  const components = await db
    .select()
    .from(hMixedMaterialComponents)
    .where(eq(hMixedMaterialComponents.intermediateMaterialId, intermediateId));

  for (const component of components) {
    const percentage = parseFloat(component.percentage);
    const actualPercentage = (parentPercentage * percentage) / 100;

    if (component.materialId) {
      // 원재료: 직접 추가
      const material = await db
        .select()
        .from(hMaterials)
        .where(tenantId ? and(eq(hMaterials.tenantId, tenantId), eq(hMaterials.id, component.materialId)) : eq(hMaterials.id, component.materialId))
        .limit(1);

      results.push({
        materialName: material[0]?.materialName || "Unknown",
        percentage: actualPercentage,
        depth
      });
    } else if (component.subMixedMaterialId) {
      // 중간재 안에 중간재: 재귀 호출
      const subIntermediate = await db
        .select()
        .from(hMaterials)
        .where(tenantId ? and(eq(hMaterials.tenantId, tenantId), eq(hMaterials.id, component.subMixedMaterialId)) : eq(hMaterials.id, component.subMixedMaterialId))
        .limit(1);

      results.push({
        materialName: `${subIntermediate[0]?.materialName || "Unknown"} [중간재]`,
        percentage: actualPercentage,
        depth
      });

      const expanded = await expandMixedMaterialForLabel(db, component.subMixedMaterialId, actualPercentage, depth + 1, tenantId);
      results.push(...expanded);
    }
  }

  return results;
}


// ============================================================
// 보정 배합비 자동 계산 (정제수 제외)
// ============================================================
const WATER_MATERIAL_ID = 191; // 정제수 material_id

export async function calculateAndSaveCorrectedRatios(versionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const ingredients = await db
    .select()
    .from(hMfIngredients)
    .where(eq(hMfIngredients.mfReportVersionId, versionId))
    .orderBy(hMfIngredients.lineNo);
  
  // 정제수 비율 합산
  const waterPct = ingredients
    .filter((i: any) => i.materialId === WATER_MATERIAL_ID)
    .reduce((sum: number, i: any) => sum + parseFloat(i.quantity), 0);
  
  const nonWaterTotal = 100 - waterPct;
  
  // 각 원재료의 보정 배합비 계산 및 저장
  for (const ing of ingredients) {
    const corrected = ing.materialId === WATER_MATERIAL_ID
      ? "0.00"
      : nonWaterTotal > 0
        ? ((parseFloat(ing.quantity) / nonWaterTotal) * 100).toFixed(2)
        : ing.quantity; // 정제수가 없으면 법적 = 보정
    
    await db
      .update(hMfIngredients)
      .set({ correctedQuantity: corrected } as any)
      .where(eq(hMfIngredients.id, ing.id));
  }
  
  return { waterPct, nonWaterTotal, ingredientCount: ingredients.length };
}

// ============================================================
// 오차 분석 API - 배치별 실제 투입량 vs 보정 배합비 비교
// ============================================================
export async function getDeviationAnalysis(versionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const { hBatches, hBatchInputs } = await import("../../drizzle/schema");
  const { itemMaster } = await import("../../drizzle/schema");
  
  // 1. 이 버전의 품목제조보고 정보 조회
  const version = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.id, versionId))
    .limit(1);
  
  if (!version || version.length === 0) {
    throw new Error("Version not found");
  }
  
  // 2. 해당 제품의 배합비 조회 (보정 배합비 포함)
  const ingredients = await db
    .select({
      lineNo: hMfIngredients.lineNo,
      materialId: hMfIngredients.materialId,
      legalPct: hMfIngredients.quantity,
      correctedPct: hMfIngredients.correctedQuantity,
      isDeductible: hMfIngredients.isDeductible,
      materialType: hMfIngredients.materialType,
    })
    .from(hMfIngredients)
    .where(eq(hMfIngredients.mfReportVersionId, versionId))
    .orderBy(hMfIngredients.lineNo);
  
  // 3. 해당 품목제조보고의 제품으로 생성된 배치 목록 조회
  const report = await db
    .select({ id: hMfReports.id, productId: hMfReports.productId })
    .from(hMfReports)
    .where(eq(hMfReports.id, version[0].mfReportId))
    .limit(1);
  
  if (!report || report.length === 0) {
    return { ingredients: [], batches: [], analysis: [] };
  }
  
  const batches = await db
    .select({
      id: hBatches.id,
      batchCode: hBatches.batchCode,
      plannedQuantity: hBatches.plannedQuantity,
      actualQuantity: hBatches.actualQuantity,
      status: hBatches.status,
      plannedDate: hBatches.plannedDate,
    })
    .from(hBatches)
    .where(and(
      eq(hBatches.productId, report[0].productId),
      sql`${hBatches.status} IN ('completed', 'approved', 'shipped', 'archived')`
    ))
    .orderBy(hBatches.plannedDate);
  
  // 4. 각 배치의 원재료 투입 내역 조회
  const batchAnalysis = [];
  for (const batch of batches) {
    const inputs = await db
      .select({
        materialId: hBatchInputs.materialId,
        plannedQuantity: hBatchInputs.plannedQuantity,
        actualQuantity: hBatchInputs.actualQuantity,
      })
      .from(hBatchInputs)
      .where(eq(hBatchInputs.batchId, batch.id));
    
    batchAnalysis.push({
      batchId: batch.id,
      batchCode: batch.batchCode,
      plannedDate: batch.plannedDate,
      batchPlannedKg: parseFloat(batch.plannedQuantity?.toString() || "0"),
      batchActualKg: batch.actualQuantity ? parseFloat(batch.actualQuantity.toString()) : null,
      inputs: inputs.map((inp: any) => ({
        materialId: inp.materialId,
        plannedQty: parseFloat(inp.plannedQuantity?.toString() || "0"),
        actualQty: inp.actualQuantity ? parseFloat(inp.actualQuantity.toString()) : null,
      }))
    });
  }
  
  // 5. 원재료별 오차 통계 계산
  const materialAnalysis = [];
  for (const ing of ingredients) {
    if (!ing.materialId || ing.materialId === WATER_MATERIAL_ID) continue;
    
    // 원재료명 조회
    let materialName = "Unknown";
    try {
      const [mat] = await db
        .select({ itemName: itemMaster.itemName })
        .from(itemMaster)
        .where(eq(itemMaster.id, ing.materialId))
        .limit(1);
      if (mat) materialName = mat.itemName;
    } catch (e) {}
    
    const correctedPct = parseFloat(ing.correctedPct || ing.legalPct);
    const legalPct = parseFloat(ing.legalPct);
    
    // 배치별 실제 비율 수집
    const actualRatios: number[] = [];
    const deviations: number[] = [];
    
    for (const ba of batchAnalysis) {
      const input = ba.inputs.find((i: any) => i.materialId === ing.materialId);
      if (input && input.actualQty !== null && ba.batchActualKg) {
        const actualRatio = (input.actualQty / ba.batchActualKg) * 100;
        actualRatios.push(actualRatio);
        deviations.push(actualRatio - correctedPct);
      }
    }
    
    const batchCount = actualRatios.length;
    const avgActualRatio = batchCount > 0 ? actualRatios.reduce((a, b) => a + b, 0) / batchCount : null;
    const avgDeviation = batchCount > 0 ? deviations.reduce((a, b) => a + b, 0) / batchCount : null;
    const stdDeviation = batchCount > 1
      ? Math.sqrt(deviations.reduce((sum, d) => sum + Math.pow(d - (avgDeviation || 0), 2), 0) / (batchCount - 1))
      : null;
    
    // 신뢰도 등급
    let confidenceLevel = "insufficient"; // 데이터 부족
    if (batchCount >= 20) confidenceLevel = "stable";
    else if (batchCount >= 10) confidenceLevel = "moderate";
    else if (batchCount >= 5) confidenceLevel = "initial";
    
    // 수정 제안 여부
    let suggestion = null;
    if (batchCount >= 10 && avgDeviation !== null && stdDeviation !== null) {
      if (Math.abs(avgDeviation) > 1.0 && stdDeviation < 2.0) {
        const suggestedPct = (legalPct + avgDeviation).toFixed(1);
        suggestion = `법적 ${legalPct}% → 실제 평균 ${avgActualRatio?.toFixed(1)}% (오차 ${avgDeviation > 0 ? '+' : ''}${avgDeviation.toFixed(1)}%, ${batchCount}회 기준) - 수정 검토 권장`;
      }
    }
    
    materialAnalysis.push({
      materialId: ing.materialId,
      materialName,
      lineNo: ing.lineNo,
      legalPct,
      correctedPct,
      batchCount,
      avgActualRatio: avgActualRatio !== null ? parseFloat(avgActualRatio.toFixed(2)) : null,
      avgDeviation: avgDeviation !== null ? parseFloat(avgDeviation.toFixed(2)) : null,
      stdDeviation: stdDeviation !== null ? parseFloat(stdDeviation.toFixed(2)) : null,
      confidenceLevel,
      suggestion,
    });
  }
  
  return {
    versionId,
    totalBatches: batches.length,
    completedBatchesWithActual: batchAnalysis.filter(b => b.batchActualKg !== null).length,
    ingredients: ingredients.map((i: any) => ({
      ...i,
      legalPct: parseFloat(i.legalPct),
      correctedPct: i.correctedPct ? parseFloat(i.correctedPct) : null,
    })),
    batchHistory: batchAnalysis,
    materialAnalysis,
  };
}


// ============================================================
// 공정그룹 재료 매핑 & 배치 배합비 조정 API
// ============================================================

/**
 * 재료-공정 매핑 조회
 */
export async function getIngredientProcessMappings(
  versionId: number,
  tenantId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [rows] = await db.execute(sql`
    SELECT 
      m.id,
      m.ingredient_id,
      m.process_group_id,
      m.process_category,
      m.sort_order,
      i.material_id,
      i.intermediate_id,
      i.quantity,
      i.unit,
      i.material_type,
      i.flavor_name,
      i.line_no,
      pg.name as process_group_name,
      pg.ccp_type
    FROM mf_ingredient_process_mapping m
    JOIN h_mf_ingredients i ON m.ingredient_id = i.id
    LEFT JOIN ccp_process_groups pg ON m.process_group_id = pg.id
    WHERE m.mf_report_version_id = ${versionId}
      AND m.tenant_id = ${tenantId}
    ORDER BY m.process_category, m.sort_order, i.line_no
  `) as any;

  return rows || [];
}

/**
 * 재료-공정 매핑 일괄 저장 (기존 매핑 삭제 후 재생성)
 */
export async function saveIngredientProcessMappings(
  versionId: number,
  tenantId: number,
  mappings: Array<{
    ingredientId: number;
    processGroupId: number | null;
    processCategory: string;
    sortOrder?: number;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.execute(sql`
    DELETE FROM mf_ingredient_process_mapping 
    WHERE mf_report_version_id = ${versionId} AND tenant_id = ${tenantId}
  `);

  if (mappings.length > 0) {
    for (let i = 0; i < mappings.length; i++) {
      const m = mappings[i];
      await db.execute(sql`
        INSERT INTO mf_ingredient_process_mapping 
          (tenant_id, mf_report_version_id, ingredient_id, process_group_id, process_category, sort_order)
        VALUES 
          (${tenantId}, ${versionId}, ${m.ingredientId}, ${m.processGroupId}, ${m.processCategory}, ${m.sortOrder ?? i})
      `);
    }
  }

  return { success: true, count: mappings.length };
}

/**
 * 공정별 조정 파라미터 조회
 */
export async function getProcessAdjustments(
  versionId: number,
  tenantId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [rows] = await db.execute(sql`
    SELECT 
      a.*,
      pg.name as process_group_name,
      pg.ccp_type
    FROM mf_process_adjustments a
    LEFT JOIN ccp_process_groups pg ON a.process_group_id = pg.id
    WHERE a.mf_report_version_id = ${versionId}
      AND a.tenant_id = ${tenantId}
    ORDER BY a.process_category
  `) as any;

  return rows || [];
}

/**
 * 공정별 조정 파라미터 일괄 저장
 */
export async function saveProcessAdjustments(
  versionId: number,
  tenantId: number,
  adjustments: Array<{
    processGroupId: number | null;
    processCategory: string;
    yieldFactor?: number;
    yieldMaterialId?: number | null;
    waterAdditionKg?: number;
    steamAbsorptionPct?: number;
    targetOutputKg?: number | null;
    inputTiming?: string;
    weightChange?: number;
    notes?: string;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.execute(sql`
    DELETE FROM mf_process_adjustments 
    WHERE mf_report_version_id = ${versionId} AND tenant_id = ${tenantId}
  `);

  for (const adj of adjustments) {
    await db.execute(sql`
      INSERT INTO mf_process_adjustments 
        (tenant_id, mf_report_version_id, process_group_id, process_category,
         yield_factor, yield_material_id, water_addition_kg, steam_absorption_pct,
         target_output_kg, input_timing, weight_change, notes)
      VALUES 
        (${tenantId}, ${versionId}, ${adj.processGroupId}, ${adj.processCategory},
         ${adj.yieldFactor ?? 1.0}, ${adj.yieldMaterialId ?? null}, 
         ${adj.waterAdditionKg ?? 0}, ${adj.steamAbsorptionPct ?? 0},
         ${adj.targetOutputKg ?? null}, ${adj.inputTiming ?? "BEFORE_PROCESS"}, 
         ${adj.weightChange ?? 1}, ${adj.notes ?? null})
    `);
  }

  return { success: true, count: adjustments.length };
}

/**
 * 공정그룹 기반 배치 배합비 계산 (핵심 로직)
 * 
 * 매핑된 재료 → 공정별 조정값(수율, 가수, 증기흡수) 반영
 * 미매핑 재료 → 기본 배합비(%) 그대로 배치에 적용
 */
export async function calculateAdjustedBatchFormula(
  versionId: number,
  batchKg: number,
  tenantId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 1. 원재료 구성 조회
  const [ingredientRows] = await db.execute(sql`
    SELECT i.*, 
      COALESCE(
        (SELECT im.item_name FROM item_master im WHERE im.id = i.material_id LIMIT 1),
        (SELECT im.item_name FROM item_master im WHERE im.id = i.intermediate_id LIMIT 1),
        Unknown
      ) as material_name
    FROM h_mf_ingredients i
    WHERE i.mf_report_version_id = ${versionId}
    ORDER BY i.line_no
  `) as any;

  // 2. 재료-공정 매핑 조회
  const [mappingRows] = await db.execute(sql`
    SELECT m.*, pg.name as process_group_name, pg.ccp_type
    FROM mf_ingredient_process_mapping m
    LEFT JOIN ccp_process_groups pg ON m.process_group_id = pg.id
    WHERE m.mf_report_version_id = ${versionId} AND m.tenant_id = ${tenantId}
  `) as any;

  // 3. 공정별 조정 파라미터 조회
  const [adjustmentRows] = await db.execute(sql`
    SELECT * FROM mf_process_adjustments
    WHERE mf_report_version_id = ${versionId} AND tenant_id = ${tenantId}
  `) as any;

  const mappingByIngredient: Record<number, any> = {};
  for (const m of (mappingRows || [])) {
    mappingByIngredient[m.ingredient_id] = m;
  }

  const adjustmentByCategory: Record<string, any> = {};
  for (const a of (adjustmentRows || [])) {
    adjustmentByCategory[a.process_category] = a;
  }

  // 4. 공정별 재료 그룹화
  const processGroups: Record<string, {
    category: string;
    processGroupName: string;
    ccpType: string;
    adjustment: any;
    ingredients: any[];
    totalBaseKg: number;
    totalAdjustedKg: number;
  }> = {};

  const unmappedIngredients: any[] = [];

  for (const ing of (ingredientRows || [])) {
    const mapping = mappingByIngredient[ing.id];
    const ratioPercent = parseFloat(ing.quantity) || 0;
    const baseKg = batchKg * (ratioPercent / 100);

    if (mapping && mapping.process_category !== "NONE") {
      const cat = mapping.process_category;
      if (!processGroups[cat]) {
        const adj = adjustmentByCategory[cat];
        processGroups[cat] = {
          category: cat,
          processGroupName: mapping.process_group_name || cat,
          ccpType: mapping.ccp_type || "",
          adjustment: adj || null,
          ingredients: [],
          totalBaseKg: 0,
          totalAdjustedKg: 0,
        };
      }

      const adj = adjustmentByCategory[cat];
      let adjustedKg = baseKg;

      if (adj && adj.yield_material_id && Number(adj.yield_material_id) === Number(ing.material_id)) {
        adjustedKg = baseKg * parseFloat(adj.yield_factor || "1");
      }

      processGroups[cat].ingredients.push({
        ingredientId: ing.id,
        lineNo: ing.line_no,
        materialId: ing.material_id,
        intermediateId: ing.intermediate_id,
        materialName: ing.material_name,
        materialType: ing.material_type,
        ratioPercent,
        baseKg: Math.round(baseKg * 1000) / 1000,
        adjustedKg: Math.round(adjustedKg * 1000) / 1000,
        unit: "kg",
      });
      processGroups[cat].totalBaseKg += baseKg;
      processGroups[cat].totalAdjustedKg += adjustedKg;
    } else {
      unmappedIngredients.push({
        ingredientId: ing.id,
        lineNo: ing.line_no,
        materialId: ing.material_id,
        intermediateId: ing.intermediate_id,
        materialName: ing.material_name,
        materialType: ing.material_type,
        ratioPercent,
        baseKg: Math.round(baseKg * 1000) / 1000,
        adjustedKg: Math.round(baseKg * 1000) / 1000,
        unit: "kg",
        processCategory: "NONE",
      });
    }
  }

  // 5. 공정별 최종 산출량 계산
  const processResults: any[] = [];
  for (const [cat, group] of Object.entries(processGroups)) {
    const adj = group.adjustment;
    let processOutputKg = group.totalAdjustedKg;

    if (adj) {
      const waterKg = parseFloat(adj.water_addition_kg || "0");
      processOutputKg += waterKg;

      const steamPct = parseFloat(adj.steam_absorption_pct || "0");
      if (steamPct > 0) {
        processOutputKg = processOutputKg * (1 + steamPct / 100);
      }

      if (adj.target_output_kg && parseFloat(adj.target_output_kg) > 0) {
        processOutputKg = parseFloat(adj.target_output_kg);
      }
    }

    processResults.push({
      category: cat,
      processGroupName: group.processGroupName,
      ccpType: group.ccpType,
      ingredients: group.ingredients,
      totalBaseKg: Math.round(group.totalBaseKg * 1000) / 1000,
      totalAdjustedInputKg: Math.round(group.totalAdjustedKg * 1000) / 1000,
      processOutputKg: Math.round(processOutputKg * 1000) / 1000,
      waterAdditionKg: adj ? parseFloat(adj.water_addition_kg || "0") : 0,
      steamAbsorptionPct: adj ? parseFloat(adj.steam_absorption_pct || "0") : 0,
      targetOutputKg: adj?.target_output_kg ? parseFloat(adj.target_output_kg) : null,
      inputTiming: adj?.input_timing || "BEFORE_PROCESS",
      weightChange: adj?.weight_change ?? 1,
    });
  }

  const totalProcessOutputKg = processResults.reduce((sum: number, p: any) => sum + p.processOutputKg, 0);
  const totalUnmappedKg = unmappedIngredients.reduce((sum: number, u: any) => sum + u.adjustedKg, 0);
  const totalBatchOutputKg = totalProcessOutputKg + totalUnmappedKg;

  return {
    batchKg,
    versionId,
    processGroups: processResults,
    unmappedIngredients,
    summary: {
      totalBaseKg: batchKg,
      totalProcessOutputKg: Math.round(totalProcessOutputKg * 1000) / 1000,
      totalUnmappedKg: Math.round(totalUnmappedKg * 1000) / 1000,
      totalBatchOutputKg: Math.round(totalBatchOutputKg * 1000) / 1000,
      differenceKg: Math.round((totalBatchOutputKg - batchKg) * 1000) / 1000,
      differencePercent: Math.round(((totalBatchOutputKg - batchKg) / batchKg) * 10000) / 100,
    },
  };
}

/**
 * 품목제조보고 수정 (기존 보고서의 최신 버전 업데이트)
 */
export async function updateMfReport(data: {
  mfReportId: number;
  reportNo?: string;
  reportDate?: string;
  yieldBasis?: string;
  unitWeightG?: number;
  batchTargetKg?: number;
  ingredients?: Array<{
    materialId?: number;
    intermediateId?: number;
    quantity: number;
    unit: string;
    isDeductible: number;
    materialType: "RAW" | "MIXED" | "FLAVOR_SPECIFIC";
    flavorName?: string;
    processGroupId?: number;
    adjustedWeightKg?: number;
    isAdditional?: number;
  }>;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const mfReportId = data.mfReportId;

  // 1. 보고서 기본 정보 업데이트
  const updateFields: any = {};
  if (data.reportNo) updateFields.reportNo = data.reportNo;
  if (data.reportDate) updateFields.reportDate = new Date(data.reportDate);
  
  if (Object.keys(updateFields).length > 0) {
    if (tenantId) {
      await db.update(hMfReports).set(updateFields)
        .where(and(eq(hMfReports.id, mfReportId), eq(hMfReports.tenantId, tenantId)));
    } else {
      await db.update(hMfReports).set(updateFields)
        .where(eq(hMfReports.id, mfReportId));
    }
  }

  // 2. 최신 버전 찾기
  const latestVersion = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.mfReportId, mfReportId))
    .orderBy(desc(hMfReportVersions.versionNo))
    .limit(1);

  if (latestVersion.length === 0) {
    throw new Error("버전 정보를 찾을 수 없습니다");
  }

  const versionId = latestVersion[0].id;

  // 3. 버전 정보 업데이트 (batchTargetKg, yieldBasis 등)
  const versionUpdate: any = {};
  if (data.yieldBasis) versionUpdate.yieldBasis = data.yieldBasis;
  if (data.unitWeightG !== undefined) versionUpdate.unitWeightG = data.unitWeightG || null;
  if (data.batchTargetKg !== undefined) versionUpdate.batchTargetKg = data.batchTargetKg || null;

  if (Object.keys(versionUpdate).length > 0) {
    await db.update(hMfReportVersions).set(versionUpdate)
      .where(eq(hMfReportVersions.id, versionId));
  }

  // 4. 기존 재료 삭제 후 새로 INSERT
  if (data.ingredients && data.ingredients.length > 0) {
    await db.delete(hMfIngredients)
      .where(eq(hMfIngredients.mfReportVersionId, versionId));

    await db.insert(hMfIngredients).values(
      data.ingredients.map((ing, index) => ({
        mfReportVersionId: versionId,
        lineNo: index + 1,
        materialId: ing.materialId || null,
        intermediateId: ing.intermediateId || null,
        quantity: ing.quantity.toString(),
        unit: ing.unit,
        isDeductible: ing.isDeductible,
        materialType: ing.materialType,
        flavorName: ing.flavorName || null,
        processGroupId: ing.processGroupId || null,
        adjustedWeightKg: ing.adjustedWeightKg ? ing.adjustedWeightKg.toString() : null,
        isAdditional: ing.isAdditional || 0
      }))
    );
  }

  return { success: true, mfReportId, versionId };
}
