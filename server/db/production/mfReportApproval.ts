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

/** 한글 폰트 경로 찾기 (서버 배포 환경에서 cwd가 다를 수 있음)
 * ★ 2026-04-14: esbuild ESM 번들 호환 — __dirname 제거 */
function findFontPath(fontName: string): string | null {
  const possiblePaths = [
    path.join(process.cwd(), "fonts", fontName),
    path.join(process.cwd(), "..", "fonts", fontName),
    path.join(process.cwd(), "..", "..", "fonts", fontName),
    path.join(process.cwd(), "..", "..", "..", "fonts", fontName),
    `/root/haccp_v3/fonts/${fontName}`,
    `/home/root/haccp_v3/fonts/${fontName}`,
    `/var/www/haccp_v3/fonts/${fontName}`,
    `/home/user/haccp_v3/fonts/${fontName}`,
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

/**
 * 배합(품목제조보고) 버전 승인 흐름 — 상태를 확인한 뒤에만 바꾼다 (2026-10-20, 신규 회사 시험: 배합 상세에서 승인 연결).
 *   승인 요청: 초안·반려 → 승인 대기
 *   승인    : 초안·승인 대기 → 승인 (반려된 버전은 다시 요청부터)
 *   반려    : 초안·승인 대기 → 반려 (사유 필수)
 * 상태 변경과 이력(h_mf_report_approvals)을 한 트랜잭션으로. 회사 조건을 걸고, 이미 처리된 버전은 바꾸지 않는다
 *   (이전엔 상태와 상관없이 덮어써 승인된 버전을 다시 '대기' 로 돌리거나 이력만 쌓일 수 있었다).
 */
export class MfApprovalStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MfApprovalStateError";
  }
}
const TRANSITIONS = {
  REQUESTED: { from: ["DRAFT", "REJECTED"], to: "PENDING" },
  APPROVED: { from: ["DRAFT", "PENDING"], to: "APPROVED" },
  REJECTED: { from: ["DRAFT", "PENDING"], to: "REJECTED" },
} as const;
const STATUS_TEXT: Record<string, string> = { DRAFT: "초안", PENDING: "승인 대기", APPROVED: "승인", REJECTED: "반려" };

async function transitionMfVersion(action: keyof typeof TRANSITIONS, versionId: number, userId: number, comment: string | undefined, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  if (!tenantId) throw new MfApprovalStateError("회사 정보가 없습니다.");
  const t = TRANSITIONS[action];
  return db.transaction(async (tx: any) => {
    const [cur]: any = await tx.execute(sql`SELECT v.approval_status AS s FROM h_mf_report_versions v JOIN h_mf_reports r ON r.id = v.mf_report_id
      WHERE v.id = ${versionId} AND r.tenant_id = ${tenantId} FOR UPDATE`);
    const now = (cur as any[])[0]?.s;
    if (now == null) throw new MfApprovalStateError("이 회사의 배합 버전이 아닙니다.");
    if (!(t.from as readonly string[]).includes(String(now))) {
      throw new MfApprovalStateError(`지금 상태(${STATUS_TEXT[String(now)] ?? now})에서는 할 수 없습니다 — 화면을 새로 고쳐 상태를 확인하세요.`);
    }
    const set = action === "APPROVED" ? sql`approval_status = 'APPROVED', approved_by = ${userId}, approved_at = NOW()`
      : action === "REJECTED" ? sql`approval_status = 'REJECTED', rejected_by = ${userId}, rejected_at = NOW(), rejection_reason = ${comment ?? null}`
      : sql`approval_status = 'PENDING'`;
    const [res]: any = await tx.execute(sql`UPDATE h_mf_report_versions SET ${set} WHERE id = ${versionId} AND approval_status = ${String(now)}`);
    if (Number(res?.affectedRows ?? 0) !== 1) throw new MfApprovalStateError("다른 사람이 먼저 처리했습니다 — 화면을 새로 고치세요.");
    const { hMfReportApprovals } = await import("../../../drizzle/schema/schema_recipe_new");
    await tx.insert(hMfReportApprovals).values({ mfReportVersionId: versionId, action, actionBy: userId, comment: comment || null });
    return { success: true, status: t.to };
  });
}

/** 승인 요청 (초안·반려 → 승인 대기 + 이력) */
export async function requestMfReportApproval(
  mfReportVersionId: number,
  requestedBy: number,
  comment?: string, tenantId?: number) {
  return transitionMfVersion("REQUESTED", mfReportVersionId, requestedBy, comment, tenantId);
}

/** 승인 처리 (초안·승인 대기 → 승인 + 이력) */
export async function approveMfReportVersion(
  versionId: number,
  approvedBy: number,
  comment?: string, tenantId?: number) {
  return transitionMfVersion("APPROVED", versionId, approvedBy, comment, tenantId);
}

/** 반려 처리 (초안·승인 대기 → 반려 + 사유 + 이력) */
export async function rejectMfReportVersion(
  versionId: number,
  rejectedBy: number,
  reason: string, tenantId: number) {
  if (!reason?.trim()) throw new MfApprovalStateError("반려 사유를 넣으세요.");
  return transitionMfVersion("REJECTED", versionId, rejectedBy, reason.trim(), tenantId);
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
