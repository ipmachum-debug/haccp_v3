/**
 * 품목제조보고서 승인/반려/이력
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
import { getMfReportDetail } from "./mfReportCRUD";
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

export async function bulkExportMfReportsPdf(ids: number[], tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const reports: any[] = [];
  
  for (const id of ids) {
    const report = await getMfReportDetail(id);
    if (report) {
      reports.push(report);
    }
  }
  
  // PDF 생성
  const doc = new PDFDocument({ margin: 50 });
  const fonts = registerKoreanFont(doc);
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

      doc.font(fonts.bold).fontSize(20).text("품목제조보고서", { align: "center" });
      doc.moveDown();
      doc.font(fonts.regular).fontSize(12);
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

// ═══════════════════════════════════════════════════════════════
// 승인 워크플로 (요청, 승인, 반려, 이력)
// ═══════════════════════════════════════════════════════════════

/** 승인 요청 (버전 상태 PENDING + 이력 기록) */
export async function requestMfReportApproval(
  mfReportVersionId: number,
  requestedBy: number,
  comment?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 버전 상태를 PENDING으로 변경
  await db
    .update(hMfReportVersions)
    .set({ approvalStatus: "PENDING" })
    .where(eq(hMfReportVersions.id, mfReportVersionId));
  
  // 승인 이력 추가
  const { hMfReportApprovals } = await import("../../../drizzle/schema/schema_recipe_new");
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
  if (!db) throw new Error("DB 연결 실패");

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
  const { hMfReportApprovals } = await import("../../../drizzle/schema/schema_recipe_new");
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
  reason: string, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
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
  const { hMfReportApprovals } = await import("../../../drizzle/schema/schema_recipe_new");
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
export async function getMfReportApprovalHistory(mfReportVersionId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hMfReportApprovals } = await import("../../../drizzle/schema/schema_recipe_new");
  const { users } = await import("../../../drizzle/schema/schema_main");
  
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


// ═══════════════════════════════════════════════════════════════
// 배치 소요량 계산 및 재고 차감
// ═══════════════════════════════════════════════════════════════

/**
 * 배치 생산량 입력 → g 환산 계산
 * @param versionId 품목제조보고 버전 ID
 * @param batchKg 배치 생산량(kg)
 * @returns 라인별 요구량(g/kg)
 */
