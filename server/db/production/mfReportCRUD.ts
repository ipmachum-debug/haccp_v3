/**
 * 품목제조보고서 CRUD
 * mfReportAPI.ts에서 분할
 */
// ═══════════════════════════════════════════════════════════════
// mfReportAPI.ts - 품목제조보고(BOM) DB 함수
// 보고서 CRUD, 버전 관리, 원재료 배합비, 맛(Flavor),
// 승인 워크플로, PDF 출력, 보정 배합비, 오차 분석,
// 공정그룹 매핑, 배치 배합비 조정 계산
// ═══════════════════════════════════════════════════════════════
import { getDb } from "../connection";
import {
  hMfReports,
  hMfReportVersions,
  hMfFlavors,
  hMfIngredients,
  hProductsV2,
  hMaterials,
  itemMaster
} from "../../../drizzle/schema";
import { eq, and, desc, lte, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import * as path from "path";
import * as fs from "fs";

// ═══════════════════════════════════════════════════════════════
// PDF 한글 폰트 유틸리티
// ═══════════════════════════════════════════════════════════════

/** 한글 폰트 경로 찾기 (서버 배포 환경에서 cwd가 다를 수 있음) */
function findFontPath(fontName: string): string | null {
  const possiblePaths = [
    path.join(process.cwd(), "fonts", fontName),
    path.join(process.cwd(), "..", "fonts", fontName),
    path.join(process.cwd(), "..", "..", "fonts", fontName),
    path.join(__dirname, "..", "..", "fonts", fontName),
    path.join(__dirname, "..", "..", "..", "fonts", fontName),
    `/root/haccp_v3/fonts/${fontName}`,
    `/home/root/haccp_v3/fonts/${fontName}`,
  ];
  for (const p of possiblePaths) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

/**
 * PDFDocument에 한글 폰트 등록 (NanumGothic)
 */
function registerKoreanFont(doc: any): { regular: string; bold: string } {
  const regularPath = findFontPath("NanumGothic-Regular.ttf");
  const boldPath = findFontPath("NanumGothic-Bold.ttf");

  if (regularPath) {
    doc.registerFont("NanumGothic", regularPath);
    doc.font("NanumGothic");
  } else {
    console.error("[PDF] NanumGothic-Regular.ttf not found! Korean text will be broken. Searched paths:", [
      path.join(process.cwd(), "fonts"),
      path.join(process.cwd(), "..", "fonts"),
    ]);
  }
  if (boldPath) {
    doc.registerFont("NanumGothicBold", boldPath);
  }

  return {
    regular: regularPath ? "NanumGothic" : "Helvetica",
    bold: boldPath ? "NanumGothicBold" : "Helvetica-Bold",
  };
}

// ═══════════════════════════════════════════════════════════════
// 품목제조보고 CRUD (h_mf_reports)
// ═══════════════════════════════════════════════════════════════

/** 품목제조보고 목록 조회 (tenantId 필터) */

export async function getMfReports(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return db
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
    .leftJoin(hProductsV2, eq(hMfReports.productId, hProductsV2.id))
    .where(eq(hMfReports.tenantId, tenantId))
    .orderBy(desc(hMfReports.createdAt));
}

/**
 * 품목제조보고 상세 조회 (최신 버전 포함)
 */
export async function getMfReportDetail(mfReportId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 품목제조보고 기본 정보
  const report = await db
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
    .leftJoin(hProductsV2, eq(hMfReports.productId, hProductsV2.id))
    .where(
      and(
        eq(hMfReports.id, mfReportId),
        eq(hMfReports.tenantId, tenantId as number)
      )
    )
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
  let ingredients: any[] = [];
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
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

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

// ═══════════════════════════════════════════════════════════════
// 버전 관리 (h_mf_report_versions)
// ═══════════════════════════════════════════════════════════════

/** 품목제조보고 버전 생성 (자동 버전 번호 증가) */
export async function createMfReportVersion(data: {
  mfReportId: number;
  effectiveFrom: string;
  changeReason?: string;
  compositionTotalRule?: string;
  createdBy?: number;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
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



// ═══════════════════════════════════════════════════════════════
// 맛(Flavor) 및 원재료 구성 관리
// ═══════════════════════════════════════════════════════════════

/** 맛(Flavor) 생성 */
export async function createMfFlavor(data: {
  mfReportVersionId: number;
  flavorCode: string;
  flavorName: string;
  appliesToSku?: string;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
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
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const [result] = await db.insert(hMfIngredients).values(data);
  
  return result.insertId;
}

/**
 * 품목제조보고 버전 상세 조회 (맛 및 원재료 구성 포함)
 */
export async function getMfReportVersionDetail(versionId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
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
export async function getMfReportVersionByDate(mfReportId: number, date: string, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
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
export async function getMfReportVersions(mfReportId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
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
  }, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  await db
    .update(hMfIngredients)
    .set(data)
    .where(eq(hMfIngredients.id, ingredientId));
  
  return true;
}

/**
 * 원재료 구성 삭제
 */
export async function deleteMfIngredient(ingredientId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
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
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED", tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  await db
    .update(hMfReports)
    .set({ status })
    .where(sql`${hMfReports.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
  
  return { success: true, count: ids.length };
}

/**
 * 일괄 삭제
 */
export async function bulkDeleteMfReports(ids: number[], tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
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

// ═══════════════════════════════════════════════════════════════
// 일괄 처리 (상태 변경, 삭제, PDF)
// ═══════════════════════════════════════════════════════════════

/** 일괄 PDF 출력 (여러 보고서를 한 PDF로 결합) */
