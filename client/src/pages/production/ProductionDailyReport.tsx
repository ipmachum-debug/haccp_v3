import { useState, useRef, useCallback } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import type { RouterOutput } from "@/lib/trpcTypes";

// 일일 보고서 도메인 타입 — 서버는 summary JSON 을 any 로 반환하므로 프론트에서 실사용 shape 정의
type ReportListRow = RouterOutput["dailyReport"]["listReports"][number];

type ReportCcpDetail = {
  ccpType?: string;
  ccpName?: string;
  status?: string;
  passCount?: number;
  failCount?: number;
  rowCount?: number;
  deviationCount?: number;
  recordCount?: number;
};

type ReportBatch = {
  id: number;
  batchCode?: string;
  productName?: string;
  status?: string;
  plannedQuantity?: number | string;
  actualQuantity?: number | string;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  approvedAt?: string | Date | null;
  ccpDetails?: ReportCcpDetail[];
  [key: string]: unknown;
};

type ReportIssue = {
  type?: string;
  severity?: string;
  title?: string;
  description?: string;
  batchCode?: string;
  productName?: string;
  ccpType?: string;
  measuredAt?: string | Date;
  note?: string;
  detectedAt?: string | Date;
  [key: string]: unknown;
};

type ReportCcpSummary = {
  totalRecords?: number;
  normalCount?: number;
  deviationCount?: number;
  complianceRate?: number;
  [key: string]: unknown;
};

type ReportSummary = {
  totalBatches?: number;
  completedBatches?: number;
  totalPlanned?: number;
  totalActual?: number;
  completionRate?: number;
  batches?: ReportBatch[];
  issues?: ReportIssue[];
  ccp?: ReportCcpSummary;
  [key: string]: unknown;
};

type ReportApprovalInfo = {
  authorName?: string;
  approverName?: string;
  reviewerName?: string;
  requesterName?: string;
  requestedAt?: string | Date;
  reviewedAt?: string | Date;
  approvedAt?: string | Date;
  authorSealDate?: string | Date;
  approverSealDate?: string | Date;
  reviewerSealDate?: string | Date;
  [key: string]: unknown;
};
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Download, FileText, AlertCircle, CheckCircle2,
  RefreshCw, Factory, ShieldCheck, Loader2, Info,
  Eye, Printer, ChevronLeft, ChevronRight, Trash2, Send, ArrowLeft, Package, Timer, Calendar
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ApprovalSeal } from "@/components/SealGenerator";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

// ===========================================================================
// Status helpers
// ===========================================================================
const BATCH_STATUS_MAP: Record<string, { label: string; color: string }> = {
  planned: { label: "계획", color: "text-gray-600 bg-gray-50 border-gray-300" },
  in_progress: { label: "진행중", color: "text-blue-700 bg-blue-50 border-blue-200" },
  completed: { label: "완료", color: "text-green-700 bg-green-50 border-green-200" },
  rejected: { label: "반려", color: "text-red-700 bg-red-50 border-red-200" },
  production: { label: "생산중", color: "text-blue-700 bg-blue-50 border-blue-200" },
  approved: { label: "승인", color: "text-blue-700 bg-blue-50 border-blue-200" },
  paused: { label: "일시중지", color: "text-gray-600 bg-gray-50 border-gray-200" },
  failed: { label: "실패", color: "text-red-700 bg-red-50 border-red-200" },
  cancelled: { label: "취소", color: "text-red-600 bg-red-50 border-red-200" },
  shipped: { label: "출하", color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
};

const APPROVAL_STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color?: string }> = {
  pending_review: { label: "승인요청", variant: "secondary", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  pending_approval: { label: "승인요청", variant: "secondary", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  pending: { label: "승인요청", variant: "secondary", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  approved: { label: "승인완료", variant: "default", color: "bg-green-100 text-green-800 border-green-300" },
  rejected: { label: "반려", variant: "destructive", color: "bg-red-100 text-red-800 border-red-300" },
};

function BatchStatusBadge({ status }: { status: string }) {
  const cfg = BATCH_STATUS_MAP[status] || { label: status, color: "text-gray-600 bg-gray-50 border-gray-200" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.color}`}>{cfg.label}</span>;
}

function ApprovalStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-gray-100 text-gray-600 border-gray-300">미제출</span>;
  const cfg = APPROVAL_STATUS_MAP[status] || { label: status, variant: "outline" as const, color: "bg-gray-100 text-gray-600 border-gray-300" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.color || ''}`}>{cfg.label}</span>;
}

// MySQL datetime "2026-03-01 20:03:00" → Safari 호환을 위해 T로 변환
function safeDate(d: unknown): Date | null {
  if (!d) return null;
  try {
    const s = String(d).replace(' ', 'T');
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  } catch { return null; }
}
function fmtTime(d: unknown) { const dt = safeDate(d); if (!dt) return "-"; try { return format(dt, "HH:mm"); } catch { return "-"; } }
function fmtDateTime(d: unknown) { const dt = safeDate(d); if (!dt) return "-"; try { return format(dt, "HH:mm:ss"); } catch { return "-"; } }
function fmtDateTimeFull(d: unknown) { const dt = safeDate(d); if (!dt) return "-"; try { return format(dt, "MM-dd HH:mm"); } catch { return "-"; } }
function safeNum(v: unknown, dec = 1) { const n = typeof v === "number" ? v : parseFloat(String(v ?? "")); return isNaN(n) ? "-" : n.toFixed(dec); }

// ===========================================================================
// Print CSS for proper document-style printing
// ===========================================================================
const PRINT_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; font-size: 11px; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4 portrait; margin: 10mm 12mm; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
}
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #4b5563; padding: 3px 6px; font-size: 10px; }
.doc-container { max-width: 210mm; margin: 0 auto; padding: 8mm; }
.header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.title-area { }
.title-area .system-label { font-size: 9px; color: #9ca3af; margin-bottom: 2px; }
.title-area h1 { font-size: 22px; font-weight: 700; letter-spacing: 4px; margin: 0; }
.title-area .subtitle { font-size: 10px; color: #6b7280; margin-top: 2px; }
.title-area .work-date { font-size: 11px; color: #374151; margin-top: 4px; }
.title-area .work-date strong { font-weight: 700; }
.seal-table { border-collapse: collapse; table-layout: fixed; width: auto !important; }
.seal-table th, .seal-table td { border: 1px solid #4b5563; text-align: center; overflow: hidden; }
.seal-table .seal-header { background: #f3f4f6; font-size: 8px; font-weight: 700; padding: 0 1px; }
.seal-table .seal-role { background: #f9fafb; font-size: 7px; font-weight: 500; padding: 0; width: 34px; max-width: 34px; }
.seal-table .seal-cell { height: 34px; width: 34px; max-width: 34px; vertical-align: middle; padding: 0; }
.seal-table .seal-name { background: #f9fafb; font-size: 6px; color: #4b5563; padding: 0; width: 34px; max-width: 34px; }
.summary-table td { font-size: 10px; }
.summary-label { background: #f9fafb; font-weight: 500; text-align: center; width: 80px; }
.summary-value { text-align: center; font-weight: 700; }
.section-title { font-size: 11px; font-weight: 700; margin: 12px 0 4px; display: flex; align-items: center; gap: 4px; }
.section-title svg { width: 14px; height: 14px; }
.batch-table th { background: #eff6ff; font-size: 9px; font-weight: 600; text-align: center; padding: 4px 6px; }
.batch-table td { font-size: 10px; padding: 3px 6px; }
.batch-table .total-row { background: #f9fafb; font-weight: 700; }
.ccp-summary td { font-size: 10px; }
.text-green { color: #15803d; }
.text-blue { color: #1d4ed8; }
.text-red { color: #dc2626; }
.text-orange { color: #ea580c; }
.font-bold { font-weight: 700; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.issue-table th { background: #fef2f2; font-size: 9px; }
.remarks-table td { font-size: 10px; min-height: 24px; }
.remarks-label { background: #f9fafb; font-weight: 500; text-align: center; width: 100px; }
.footer { margin-top: 12px; font-size: 8px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 6px; }
.ccp-badge { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 8px; font-weight: 600; }
.ccp-pass { background: #dcfce7; color: #166534; }
.ccp-fail { background: #fef2f2; color: #991b1b; }
.ccp-draft { background: #f3f4f6; color: #4b5563; }
`;

// ===========================================================================
// Generate full print HTML for document-style printing
// ===========================================================================
function generatePrintHTML(batches: ReportBatch[], summary: ReportSummary, dateString: string, issues: ReportIssue[], approvalInfo: ReportApprovalInfo | null | undefined) {
  const totalPlanned = batches.reduce((s, b) => s + (parseFloat(String(b.plannedQuantity ?? "")) || 0), 0);
  const totalActual = batches.reduce((s, b) => s + (parseFloat(String(b.actualQuantity ?? "")) || 0), 0);
  const completedCount = batches.filter((b) => b.status === "completed").length;
  const achievementRate = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
  const ai = approvalInfo || {};

  // SVG 직인(도장) 생성 함수 - 인쇄 시 빨간 직인 표시 (승인도장 3단 분할 스타일)
  const sealSVG = (name: string, date: string | Date, type: string) => {
    let dateStr = "";
    try {
      const d = safeDate(date);
      if (d) dateStr = format(d, "yy.MM.dd");
    } catch {}
    const displayName = name.length === 2 ? name[0] + " " + name[1] : name.length === 3 ? name : name.slice(0, 3);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34" style="display:block;margin:0 auto;">
      <rect x="1" y="1" width="32" height="32" rx="1" ry="1" fill="none" stroke="#D42020" stroke-width="1.6" opacity="0.85"/>
      <line x1="1" y1="12.3" x2="33" y2="12.3" stroke="#D42020" stroke-width="0.7" opacity="0.7"/>
      <line x1="1" y1="23.3" x2="33" y2="23.3" stroke="#D42020" stroke-width="0.7" opacity="0.7"/>
      <text x="17" y="8" text-anchor="middle" dominant-baseline="central" font-size="6.5" fill="#D42020" font-weight="700" opacity="0.85" font-family="'Noto Serif KR','Batang',serif">${type}</text>
      <text x="17" y="18" text-anchor="middle" dominant-baseline="central" font-size="9.5" fill="#D42020" font-weight="700" opacity="0.85" font-family="'Noto Serif KR','Batang',serif">${displayName}</text>
      <text x="17" y="28.5" text-anchor="middle" dominant-baseline="central" font-size="5.5" fill="#D42020" font-weight="400" opacity="0.7" font-family="'Noto Sans KR',sans-serif">${dateStr}</text>
    </svg>`;
  };

  const sealCell = (name?: string, date?: string | Date, type?: string) => {
    if (name && date) {
      return sealSVG(name, String(date), type || "");
    }
    if (name) return `<div style="font-size:9px;font-weight:700;color:#D42020;">${name}</div>`;
    return `<span style="color:#d1d5db;font-size:8px;">미${type === "작성" ? "작성" : type === "검토" ? "검토" : "승인"}</span>`;
  };

  const statusLabel = (status: string) => {
    const m: Record<string, string> = { planned: "계획", production: "생산", approved: "생산", in_progress: "진행중", completed: "완료", paused: "중지", failed: "실패", cancelled: "취소" };
    return m[status] || status || "-";
  };

  const batchRows = batches.map((b, idx) => {
    const ccpBadges = (b.ccpDetails || []).map((c) => {
      const cls = (c.failCount ?? 0) > 0 ? "ccp-fail" : c.status === "draft" ? "ccp-draft" : "ccp-pass";
      return `<span class="ccp-badge ${cls}">${c.ccpType}(${c.passCount}/${c.rowCount})</span>`;
    }).join(" ");
    return `<tr>
      <td class="text-center" style="color:#6b7280;">${idx + 1}</td>
      <td style="font-family:monospace;font-weight:500;">${b.batchCode}</td>
      <td>${b.productName || "-"}</td>
      <td class="text-center">${safeNum(b.plannedQuantity)}</td>
      <td class="text-center font-bold">${b.actualQuantity ? safeNum(b.actualQuantity) : "-"}</td>
      <td class="text-center">${statusLabel(b.status ?? "")}</td>
      <td class="text-center">${fmtTime(b.startTime)}</td>
      <td class="text-center">${fmtTime(b.endTime)}</td>
      <td style="font-size:8px;">${ccpBadges || "-"}</td>
    </tr>`;
  }).join("");

  const issueRows = issues.length > 0 ? issues.map((i) => `<tr>
    <td>${i.batchCode || "-"}</td><td>${(i as { productName?: string }).productName || "-"}</td>
    <td class="text-center">${(i as { ccpType?: string }).ccpType || "-"}</td><td class="text-center text-red font-bold">부적합</td>
    <td class="text-center">${fmtDateTime((i as { measuredAt?: string | Date }).measuredAt)}</td><td>${(i as { note?: string }).note || "-"}</td>
  </tr>`).join("") : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>생산일지 - ${dateString}</title>
<style>${PRINT_STYLES}</style></head><body>
<div class="doc-container">
  <div class="header-row">
    <div class="title-area">
      <div class="system-label">Millio AI | AI 기반 제조 ERP</div>
      <h1>생 산 일 지</h1>
      <div class="subtitle">Production Daily Report</div>
      <div class="work-date">작업일: <strong>${dateString}</strong></div>
    </div>
    <table class="seal-table">
      <tr><th colspan="3" class="seal-header">결 재</th></tr>
      <tr><th class="seal-role">작 성</th><th class="seal-role">검 토</th><th class="seal-role">승 인</th></tr>
      <tr>
        <td class="seal-cell">${sealCell(ai.requesterName, ai.requestedAt, "작성")}</td>
        <td class="seal-cell">${sealCell(ai.reviewerName, ai.reviewedAt, "검토")}</td>
        <td class="seal-cell">${sealCell(ai.approverName, ai.approvedAt, "승인")}</td>
      </tr>
      <tr>
        <td class="seal-name">${ai.requesterName || "-"}</td>
        <td class="seal-name">${ai.reviewerName || "-"}</td>
        <td class="seal-name">${ai.approverName || "-"}</td>
      </tr>
    </table>
  </div>

  <table class="summary-table" style="margin-bottom:12px;">
    <tr>
      <td class="summary-label">총 배치</td><td class="summary-value">${batches.length}건</td>
      <td class="summary-label">완료 배치</td><td class="summary-value text-green">${completedCount}건</td>
      <td class="summary-label">계획 생산량</td><td class="summary-value">${totalPlanned.toFixed(1)} kg</td>
      <td class="summary-label">실제 생산량</td><td class="summary-value">${totalActual.toFixed(1)} kg</td>
      <td class="summary-label">달성률</td><td class="summary-value text-blue">${achievementRate}%</td>
    </tr>
  </table>

  <div class="section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3M4 21V10.5M20 21V10.5"/></svg> 배치별 생산 실적</div>
  <table class="batch-table" style="margin-bottom:12px;">
    <thead><tr>
      <th style="width:24px;">No</th><th>배치코드</th><th>제품명</th>
      <th style="width:60px;">계획(kg)</th><th style="width:60px;">실제(kg)</th>
      <th style="width:48px;">상태</th><th style="width:48px;">시작</th><th style="width:48px;">종료</th>
      <th>CCP</th>
    </tr></thead>
    <tbody>
      ${batchRows}
      ${batches.length > 0 ? `<tr class="total-row">
        <td colspan="3" class="text-center">합 계</td>
        <td class="text-center">${totalPlanned.toFixed(1)}</td>
        <td class="text-center">${totalActual.toFixed(1)}</td>
        <td colspan="4" class="text-center">${completedCount}/${batches.length} 완료</td>
      </tr>` : `<tr><td colspan="9" class="text-center" style="color:#9ca3af;padding:16px;">배치 정보 없음</td></tr>`}
    </tbody>
  </table>

  <div class="section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg> CCP 점검 요약</div>
  <table class="ccp-summary" style="margin-bottom:12px;">
    <tr>
      <td class="summary-label">총 점검</td><td class="summary-value">${summary?.ccp?.totalRecords || 0}건</td>
      <td class="summary-label">정상</td><td class="summary-value text-green">${summary?.ccp?.normalCount || 0}건</td>
      <td class="summary-label">이탈</td><td class="summary-value text-red">${summary?.ccp?.deviationCount || 0}건</td>
      <td class="summary-label">준수율</td><td class="summary-value text-blue">${summary?.ccp?.complianceRate || "100.0"}%</td>
    </tr>
  </table>

  ${issues.length > 0 ? `
  <div class="section-title text-red"><svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> 이상 사항</div>
  <table class="issue-table" style="margin-bottom:12px;">
    <thead><tr><th>배치코드</th><th>제품명</th><th>CCP유형</th><th>결과</th><th>발생시간</th><th>비고</th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>` : ""}

  <table class="remarks-table">
    <tr><td class="remarks-label">특이사항</td><td>${issues.length ? `CCP 부적합 ${issues.length}건 발생` : "없음"}</td></tr>
    <tr><td class="remarks-label">개선조치 및 결과</td><td>&nbsp;</td></tr>
    <tr><td class="remarks-label">조치자</td><td>&nbsp;</td></tr>
    <tr><td class="remarks-label">확인</td><td>&nbsp;</td></tr>
  </table>

  <div class="footer">Millio AI | AI 기반 제조 ERP | ${dateString} 생산일지</div>
</div>
</body></html>`;
}

// ===========================================================================
// 생산일지 문서형 레이아웃 (화면 미리보기용)
// ===========================================================================
function ProductionDailyDocument({
  batches, summary, dateString, issues, approvalInfo,
}: {
  batches: ReportBatch[]; summary: ReportSummary; dateString: string; issues: ReportIssue[];
  approvalInfo?: { requesterName?: string; reviewerName?: string; approverName?: string; approvedAt?: string; reviewedAt?: string; requestedAt?: string };
}) {
  const bCls = "border border-gray-600";
  const thCls = `${bCls} px-2 py-1.5 text-xs font-medium bg-gray-50`;
  const tdCls = `${bCls} px-2 py-1.5 text-xs`;
  const totalPlanned = batches.reduce((s, b) => s + (parseFloat(String(b.plannedQuantity ?? "")) || 0), 0);
  const totalActual = batches.reduce((s, b) => s + (parseFloat(String(b.actualQuantity ?? "")) || 0), 0);
  const completedCount = batches.filter((b) => b.status === "completed").length;
  const ai = approvalInfo || {};
  const sealSize = 30;

  return (
    <div className="bg-white px-8 py-6 max-w-[210mm] mx-auto" style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
      {/* 헤더 + 결재란 */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-[10px] text-gray-400 mb-1">Millio AI | AI 기반 제조 ERP</div>
          <h1 className="text-2xl font-bold tracking-tight">생 산 일 지</h1>
          <p className="text-xs text-gray-500 mt-0.5">Production Daily Report</p>
          <p className="text-xs text-gray-600 mt-1">작업일: <span className="font-bold">{dateString}</span></p>
        </div>
        {/* 결재란 */}
        <table className="border-collapse border border-gray-600 text-xs">
          <thead>
            <tr>
              <th colSpan={3} className="border border-gray-600 px-0 py-0 bg-gray-100 text-center font-bold text-[9px]">결 재</th>
            </tr>
            <tr className="bg-gray-50">
              <th className="border border-gray-600 px-0 py-0 font-medium text-[8px]" style={{width:'32px'}}>작 성</th>
              <th className="border border-gray-600 px-0 py-0 font-medium text-[8px]" style={{width:'32px'}}>검 토</th>
              <th className="border border-gray-600 px-0 py-0 font-medium text-[8px]" style={{width:'32px'}}>승 인</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-600 text-center align-middle p-0" style={{height:'32px'}}>
                {ai.requesterName ? <ApprovalSeal approverName={ai.requesterName} approvalDate={ai.requestedAt} approvalType="작성" size={sealSize} /> : <span className="text-gray-300 text-[8px]">미작성</span>}
              </td>
              <td className="border border-gray-600 text-center align-middle p-0" style={{height:'32px'}}>
                {ai.reviewerName && ai.reviewedAt ? <ApprovalSeal approverName={ai.reviewerName} approvalDate={ai.reviewedAt} approvalType="검토" size={sealSize} /> : <span className="text-gray-300 text-[8px]">미검토</span>}
              </td>
              <td className="border border-gray-600 text-center align-middle p-0" style={{height:'32px'}}>
                {ai.approverName && ai.approvedAt ? <ApprovalSeal approverName={ai.approverName} approvalDate={ai.approvedAt} approvalType="승인" size={sealSize} /> : <span className="text-gray-300 text-[8px]">미승인</span>}
              </td>
            </tr>
            <tr className="bg-gray-50">
              <td className="border border-gray-600 px-0 py-0 text-center text-[8px] text-gray-600">{ai.requesterName || "-"}</td>
              <td className="border border-gray-600 px-0 py-0 text-center text-[8px] text-gray-600">{ai.reviewerName || "-"}</td>
              <td className="border border-gray-600 px-0 py-0 text-center text-[8px] text-gray-600">{ai.approverName || "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 요약 */}
      <table className="w-full border-collapse border border-gray-600 text-xs mb-4">
        <tbody>
          <tr>
            <td className={`${thCls} w-20 text-center`}>총 배치</td>
            <td className={`${tdCls} text-center font-bold w-16`}>{batches.length}건</td>
            <td className={`${thCls} w-20 text-center`}>완료 배치</td>
            <td className={`${tdCls} text-center font-bold text-green-700 w-16`}>{completedCount}건</td>
            <td className={`${thCls} w-24 text-center`}>계획 생산량</td>
            <td className={`${tdCls} text-center font-bold`}>{totalPlanned.toFixed(1)} kg</td>
            <td className={`${thCls} w-24 text-center`}>실제 생산량</td>
            <td className={`${tdCls} text-center font-bold`}>{totalActual.toFixed(1)} kg</td>
            <td className={`${thCls} w-16 text-center`}>달성률</td>
            <td className={`${tdCls} text-center font-bold text-blue-700`}>{totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0}%</td>
          </tr>
        </tbody>
      </table>

      {/* 배치 목록 */}
      <div className="text-xs font-bold mb-1 flex items-center gap-1"><Factory className="h-3.5 w-3.5" /> 배치별 생산 실적</div>
      <table className="w-full border-collapse border border-gray-600 text-xs mb-4">
        <thead>
          <tr className="bg-blue-50">
            <th className={`${bCls} px-1.5 py-1 text-center w-7`}>No</th>
            <th className={`${bCls} px-1.5 py-1`}>배치코드</th>
            <th className={`${bCls} px-1.5 py-1`}>제품명</th>
            <th className={`${bCls} px-1.5 py-1 text-center w-[60px]`}>계획(kg)</th>
            <th className={`${bCls} px-1.5 py-1 text-center w-[60px]`}>실제(kg)</th>
            <th className={`${bCls} px-1.5 py-1 text-center w-12`}>상태</th>
            <th className={`${bCls} px-1.5 py-1 text-center w-12`}>시작</th>
            <th className={`${bCls} px-1.5 py-1 text-center w-12`}>종료</th>
            <th className={`${bCls} px-1.5 py-1 text-center`}>CCP</th>
          </tr>
        </thead>
        <tbody>
          {batches.length > 0 ? batches.map((b: ReportBatch, idx: number) => {
            const statusLabel = (b.status && BATCH_STATUS_MAP[b.status]?.label) || b.status || "-";
            const ccpDetails = b.ccpDetails || [];
            return (
              <tr key={(b as { batchId?: number }).batchId || b.id || idx}>
                <td className={`${tdCls} text-center text-gray-500`}>{idx + 1}</td>
                <td className={`${tdCls} font-medium font-mono text-[10px]`}>{b.batchCode}</td>
                <td className={tdCls}>{b.productName || "-"}</td>
                <td className={`${tdCls} text-center`}>{safeNum(b.plannedQuantity)}</td>
                <td className={`${tdCls} text-center font-bold`}>{b.actualQuantity ? safeNum(b.actualQuantity) : "-"}</td>
                <td className={`${tdCls} text-center`}>{statusLabel}</td>
                <td className={`${tdCls} text-center`}>{fmtTime(b.startTime)}</td>
                <td className={`${tdCls} text-center`}>{fmtTime(b.endTime)}</td>
                <td className={`${tdCls} text-[9px]`}>
                  {ccpDetails.length > 0 ? ccpDetails.map((c: ReportCcpDetail, ci: number) => (
                    <span key={ci} className={cn(
                      "inline-block px-1 py-0 rounded text-[8px] font-medium mr-0.5",
                      (c.failCount ?? 0) > 0 ? "bg-red-100 text-red-700" : c.status === "draft" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-700"
                    )}>
                      {c.ccpType}({c.passCount}/{c.rowCount})
                    </span>
                  )) : <span className="text-gray-300">-</span>}
                </td>
              </tr>
            );
          }) : (
            <tr><td colSpan={9} className={`${tdCls} text-center text-gray-400 py-4`}>배치 정보 없음</td></tr>
          )}
          {batches.length > 0 && (
            <tr className="bg-gray-50 font-bold">
              <td colSpan={3} className={`${tdCls} text-center`}>합 계</td>
              <td className={`${tdCls} text-center`}>{totalPlanned.toFixed(1)}</td>
              <td className={`${tdCls} text-center`}>{totalActual.toFixed(1)}</td>
              <td colSpan={4} className={`${tdCls} text-center`}>{completedCount}/{batches.length} 완료</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* CCP 점검 요약 */}
      <div className="text-xs font-bold mb-1 flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> CCP 점검 요약</div>
      <table className="w-full border-collapse border border-gray-600 text-xs mb-4">
        <tbody><tr>
          <td className={`${thCls} text-center`}>총 점검</td>
          <td className={`${tdCls} text-center font-bold w-16`}>{summary?.ccp?.totalRecords || 0}건</td>
          <td className={`${thCls} text-center`}>정상</td>
          <td className={`${tdCls} text-center text-green-700 font-bold w-16`}>{summary?.ccp?.normalCount || 0}건</td>
          <td className={`${thCls} text-center`}>이탈</td>
          <td className={`${tdCls} text-center text-red-600 font-bold w-16`}>{summary?.ccp?.deviationCount || 0}건</td>
          <td className={`${thCls} text-center`}>준수율</td>
          <td className={`${tdCls} text-center text-blue-700 font-bold`}>{summary?.ccp?.complianceRate || "100.0"}%</td>
        </tr></tbody>
      </table>

      {/* 이상사항 */}
      {issues && issues.length > 0 && (
        <>
          <div className="text-xs font-bold mb-1 flex items-center gap-1 text-red-600"><AlertCircle className="h-3.5 w-3.5" /> 이상 사항</div>
          <table className="w-full border-collapse border border-gray-600 text-xs mb-4">
            <thead><tr className="bg-red-50">
              <th className={`${bCls} px-1.5 py-1`}>배치코드</th><th className={`${bCls} px-1.5 py-1`}>제품명</th>
              <th className={`${bCls} px-1.5 py-1 text-center`}>CCP유형</th><th className={`${bCls} px-1.5 py-1 text-center`}>결과</th>
              <th className={`${bCls} px-1.5 py-1 text-center`}>발생시간</th><th className={`${bCls} px-1.5 py-1`}>비고</th>
            </tr></thead>
            <tbody>
              {issues.map((i: ReportIssue, idx: number) => (
                <tr key={idx}><td className={tdCls}>{i.batchCode||"-"}</td><td className={tdCls}>{i.productName||"-"}</td>
                  <td className={`${tdCls} text-center`}>{i.ccpType||"-"}</td><td className={`${tdCls} text-center text-red-600 font-bold`}>부적합</td>
                  <td className={`${tdCls} text-center`}>{fmtDateTime(i.measuredAt)}</td><td className={tdCls}>{i.note||"-"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* 특이사항란 */}
      <table className="w-full border-collapse border border-gray-600 text-xs">
        <tbody>
          <tr><td className={`${thCls} w-28 text-center`}>특이사항</td><td className={tdCls} style={{minHeight:'30px'}}>{issues?.length ? `CCP 부적합 ${issues.length}건 발생` : "없음"}</td></tr>
          <tr><td className={`${thCls} text-center`}>개선조치 및 결과</td><td className={tdCls}>&nbsp;</td></tr>
          <tr><td className={`${thCls} text-center`}>조치자</td><td className={tdCls}>&nbsp;</td></tr>
          <tr><td className={`${thCls} text-center`}>확인</td><td className={tdCls}>&nbsp;</td></tr>
        </tbody>
      </table>

      <div className="mt-4 text-[9px] text-gray-400 text-center border-t border-gray-200 pt-2">
        Millio AI | AI 기반 제조 ERP | {dateString} 생산일지
      </div>
    </div>
  );
}

// ===========================================================================
// 배치 상세 다이얼로그
// ===========================================================================
function BatchDetailDialog({ batch, open, onClose }: { batch: ReportBatch; open: boolean; onClose: () => void }) {
  if (!batch) return null;
  const th = "text-xs font-medium text-gray-500 py-1.5 pr-4 whitespace-nowrap align-top";
  const td = "text-sm py-1.5";
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-blue-600" />{`${L("batch")} 상세정보`}</DialogTitle>
          <DialogDescription>{batch.batchCode}</DialogDescription>
        </DialogHeader>
        <table className="w-full"><tbody>
          <tr><td className={th}>배치코드</td><td className={td}><span className="font-mono font-bold">{batch.batchCode}</span></td></tr>
          <tr><td className={th}>제품명</td><td className={td}>{batch.productName || "-"}</td></tr>
          <tr><td className={th}>상태</td><td className={td}><BatchStatusBadge status={batch.status ?? ""} /></td></tr>
          <tr><td className={th}>계획 수량</td><td className={td}><span className="font-bold">{safeNum(batch.plannedQuantity)}</span> kg</td></tr>
          <tr><td className={th}>실제 수량</td><td className={td}>{batch.actualQuantity ? <><span className="font-bold">{safeNum(batch.actualQuantity)}</span> kg</> : <span className="text-gray-400">-</span>}</td></tr>
          <tr><td className={th}>달성률</td><td className={td}>{batch.plannedQuantity && batch.actualQuantity ? <span className="font-bold text-blue-600">{Math.round((parseFloat(String(batch.actualQuantity))/parseFloat(String(batch.plannedQuantity)))*100)}%</span> : "-"}</td></tr>
          <tr><td className={th}>시작 시간</td><td className={td}>{safeDate(batch.startTime) ? format(safeDate(batch.startTime)!, "yyyy-MM-dd HH:mm:ss") : "-"}</td></tr>
          <tr><td className={th}>종료 시간</td><td className={td}>{safeDate(batch.endTime) ? format(safeDate(batch.endTime)!, "yyyy-MM-dd HH:mm:ss") : "-"}</td></tr>
          {safeDate(batch.startTime) && safeDate(batch.endTime) && (
            <tr><td className={th}>소요 시간</td><td className={td}>
              <span className="flex items-center gap-1 text-orange-600 font-medium"><Timer className="h-3.5 w-3.5" />
              {(() => { const m = Math.round((safeDate(batch.endTime)!.getTime()-safeDate(batch.startTime)!.getTime())/60000); const h=Math.floor(m/60); return h>0?`${h}시간 ${m%60}분`:`${m}분`; })()}
              </span></td></tr>
          )}
          {(batch.ccpDetails || []).length > 0 && (
            <tr><td className={th}>CCP 점검</td><td className={td}>
              <div className="flex flex-wrap gap-1">
                {(batch.ccpDetails || []).map((c: ReportCcpDetail, i: number) => (
                  <span key={i} className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                    (c.failCount ?? 0) > 0 ? "bg-red-100 text-red-700" : c.status === "draft" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-700"
                  )}>
                    {c.ccpType}: {c.passCount}/{c.rowCount} {(c.failCount ?? 0) > 0 ? `(부적합 ${c.failCount})` : "정상"}
                  </span>
                ))}
              </div>
            </td></tr>
          )}
        </tbody></table>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// 메인 컴포넌트
// ===========================================================================
export function ProductionDailyReportContent() {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ---- API ----
  const { data: reportList = [], isLoading: loadingList, refetch: refetchList } = trpc.dailyReport.listReports.useQuery(
    { year: currentYear, month: currentMonth },
    { keepPreviousData: true, refetchOnWindowFocus: true, refetchInterval: 15000 }
  );
  const { data: generatedReport, isLoading: loadingDetail, refetch: refetchDetail } = trpc.dailyReport.getGeneratedReport.useQuery(
    { date: selectedReportId ? (reportList as ReportListRow[]).find((r: ReportListRow) => r.id === selectedReportId)?.reportDate : "" },
    { enabled: !!selectedReportId, refetchOnWindowFocus: true, refetchInterval: selectedReportId ? 20000 : false }
  );
  const regenerateMutation = trpc.dailyReport.regenerateReport.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.message);
      // 즉시 refetch + 500ms 후 한번 더 (DB 반영 시간 고려)
      refetchList();
      if (selectedReportId) refetchDetail();
      setTimeout(() => { refetchList(); if (selectedReportId) refetchDetail(); }, 500);
    },
    onError: (e: { message: string }) => toast.error("생성 실패: " + e.message),
  });
  const submitMutation = trpc.dailyReport.submitForApproval.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.message);
      refetchList();
      if (selectedReportId) refetchDetail();
      setTimeout(() => { refetchList(); }, 500);
    },
    onError: (e: { message: string }) => toast.error("승인 요청 실패: " + e.message),
  });
  const deleteMutation = trpc.dailyReport.deleteReports.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.message);
      setSelectedIds(new Set());
      refetchList();
      setTimeout(() => { refetchList(); }, 500);
    },
    onError: (e: { message: string }) => toast.error("삭제 실패: " + e.message),
  });

  // ---- Detail data ----
  const selectedReport = (reportList as ReportListRow[]).find((r: ReportListRow) => r.id === selectedReportId);
  const rpt = generatedReport?.summary;
  const allBatches = rpt?.production?.batches || [];
  const allIssues = rpt?.issues || [];

  // ---- Month navigation ----
  const prevMonth = () => {
    if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  // ---- Selection ----
  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => {
    const ids = (reportList as ReportListRow[]).map((r) => r.id);
    setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids));
  };

  // ---- Print (proper document style) ----
  const handlePrint = useCallback(() => {
    if (!selectedReport || !rpt) return;
    const ai = {
      requesterName: selectedReport.requesterName,
      reviewerName: selectedReport.reviewerName,
      approverName: selectedReport.approverName,
      approvedAt: selectedReport.approvedAt,
      reviewedAt: selectedReport.reviewedAt,
      requestedAt: selectedReport.requestedAt,
    };
    const html = generatePrintHTML(allBatches, rpt, selectedReport.reportDate || "", allIssues, ai);
    const w = window.open("", "_blank");
    if (!w) { toast.error("팝업 차단을 해제해주세요."); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 600);
  }, [selectedReport, rpt, allBatches, allIssues]);

  // ---- Generate today ----
  const today = format(new Date(), "yyyy-MM-dd");

  // ===========================================================================
  // 상세보기 모드 (문서 형태)
  // ===========================================================================
  if (selectedReportId) {
    const isApproved = selectedReport?.approvalStatus === "approved";
    const isPending = selectedReport?.approvalStatus === "pending_review" || selectedReport?.approvalStatus === "pending_approval" || selectedReport?.approvalStatus === "pending";
    const canSubmit = !selectedReport?.approvalStatus && !isPending;
    const canPrint = isApproved;

    return (
      <div className="space-y-4">
        {/* 상단 네비게이션 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedReportId(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> 목록으로
          </Button>
          <div className="flex items-center gap-2">
            {canSubmit && (
              <Button size="sm" onClick={() => submitMutation.mutate({ reportId: selectedReportId })} disabled={submitMutation.isPending}>
                {submitMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                승인 요청
              </Button>
            )}
            {canPrint && (
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" /> 출력
              </Button>
            )}
            {canPrint && (
              <Button variant="outline" size="sm" onClick={() => {
                if (!selectedReport || !rpt) return;
                const html = generatePrintHTML(allBatches, rpt, selectedReport.reportDate || "", allIssues, {
                  requesterName: selectedReport.requesterName, reviewerName: selectedReport.reviewerName,
                  approverName: selectedReport.approverName, approvedAt: selectedReport.approvedAt,
                  reviewedAt: selectedReport.reviewedAt, requestedAt: selectedReport.requestedAt,
                });
                const blob = new Blob([html], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `생산일지-${selectedReport.reportDate}.html`; a.click();
                URL.revokeObjectURL(url);
                toast.success("다운로드 완료");
              }}>
                <Download className="h-4 w-4 mr-1" /> 다운로드
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => { if (selectedReport) regenerateMutation.mutate({ date: selectedReport.reportDate }); }} disabled={regenerateMutation.isPending}>
              {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              갱신
            </Button>
          </div>
        </div>

        {/* 상태 배너 */}
        {selectedReport && (
          <div className={cn(
            "flex items-center gap-3 text-xs rounded-lg p-3 border",
            isApproved ? "bg-green-50/50 border-green-200" : isPending ? "bg-yellow-50/50 border-yellow-200" : "bg-muted/50"
          )}>
            <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{selectedReport.reportDate} 생산일지</span>
            <ApprovalStatusBadge status={selectedReport.approvalStatus} />
            {isApproved && <span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> 승인완료 - 출력 가능</span>}
            {isPending && <span className="text-yellow-600">승인 처리 대기중</span>}
            {canSubmit && <span className="text-orange-600">승인 요청 후 출력할 수 있습니다</span>}
          </div>
        )}

        {/* 문서 내용 */}
        {loadingDetail ? (
          <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />로딩 중...</div>
        ) : (
          <Card className="overflow-hidden shadow-sm border-2">
            <CardContent className="p-0">
              <ProductionDailyDocument
                batches={allBatches}
                summary={rpt}
                dateString={selectedReport?.reportDate || ""}
                issues={allIssues}
                approvalInfo={{
                  requesterName: selectedReport?.requesterName,
                  reviewerName: selectedReport?.reviewerName,
                  approverName: selectedReport?.approverName,
                  approvedAt: selectedReport?.approvedAt,
                  reviewedAt: selectedReport?.reviewedAt,
                  requestedAt: selectedReport?.requestedAt,
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* 배치 리스트 (하단) */}
        {allBatches.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                배치 상세 리스트 ({allBatches.length}건)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>배치코드</TableHead><TableHead>제품명</TableHead>
                  <TableHead className="text-right">계획(kg)</TableHead><TableHead className="text-right">실제(kg)</TableHead>
                  <TableHead>상태</TableHead><TableHead>시작</TableHead><TableHead>종료</TableHead>
                  <TableHead>CCP</TableHead>
                  <TableHead className="text-center w-16">상세</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {allBatches.map((b: ReportBatch, idx: number) => (
                    <TableRow key={(b as { batchId?: number }).batchId || b.id || idx} className="hover:bg-muted/50">
                      <TableCell className="text-xs text-muted-foreground">{idx+1}</TableCell>
                      <TableCell className="font-mono font-medium text-sm">{b.batchCode}</TableCell>
                      <TableCell>{b.productName||"-"}</TableCell>
                      <TableCell className="text-right">{safeNum(b.plannedQuantity)}</TableCell>
                      <TableCell className="text-right font-medium">{b.actualQuantity ? safeNum(b.actualQuantity) : "-"}</TableCell>
                      <TableCell><BatchStatusBadge status={b.status ?? ""} /></TableCell>
                      <TableCell className="text-sm">{fmtTime(b.startTime)}</TableCell>
                      <TableCell className="text-sm">{fmtTime(b.endTime)}</TableCell>
                      <TableCell>
                        {(b.ccpDetails || []).length > 0 ? (b.ccpDetails || []).map((c: ReportCcpDetail, ci: number) => (
                          <span key={ci} className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium mr-1",
                            (c.failCount ?? 0) > 0 ? "bg-red-100 text-red-700" : c.status === "draft" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-700"
                          )}>
                            {c.ccpType}
                          </span>
                        )) : <span className="text-xs text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedBatch(b)}><Eye className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <BatchDetailDialog batch={selectedBatch} open={!!selectedBatch} onClose={() => setSelectedBatch(null)} />
      </div>
    );
  }

  // ===========================================================================
  // 리스트 모드 (월별)
  // ===========================================================================
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Factory className="h-5 w-5 text-blue-600" />
            생산일지 관리
          </h2>
          <p className="text-sm text-muted-foreground mt-1">월별 생산일지 리스트 - 클릭하여 문서 형태 상세보기 및 승인/출력</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => regenerateMutation.mutate({ date: today })} disabled={regenerateMutation.isPending}>
            {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            오늘 생성/갱신
          </Button>
          {(reportList as ReportListRow[]).some((r: ReportListRow) => r.needsGeneration) && (
            <Button variant="default" size="sm" onClick={async () => {
              const pendingDates = (reportList as ReportListRow[]).filter((r: ReportListRow) => r.needsGeneration).map((r: ReportListRow) => r.reportDate);
              for (const d of pendingDates) {
                try { regenerateMutation.mutate({ date: d }); } catch {}
              }
            }} disabled={regenerateMutation.isPending}>
              {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              미생성 일괄 생성 ({(reportList as ReportListRow[]).filter((r: ReportListRow) => r.needsGeneration).length}건)
            </Button>
          )}
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => {
              if (window.confirm(`${selectedIds.size}건을 삭제하시겠습니까?`))
                deleteMutation.mutate({ ids: Array.from(selectedIds) });
            }} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              선택 삭제 ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* 월 네비게이션 */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-5 w-5" /></Button>
        <span className="text-lg font-bold min-w-[140px] text-center flex items-center justify-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          {currentYear}년 {currentMonth}월
        </span>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-5 w-5" /></Button>
      </div>

      {/* 리스트 테이블 */}
      <Card>
        <CardContent className="p-0">
          {loadingList ? (
            <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />로딩 중...</div>
          ) : (reportList as ReportListRow[]).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium">{currentYear}년 {currentMonth}월 생산일지가 없습니다.</p>
              <p className="text-sm mt-1">[오늘 생성/갱신] 버튼으로 생산일지를 생성하세요.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={selectedIds.size === (reportList as ReportListRow[]).length && (reportList as ReportListRow[]).length > 0} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>작업일</TableHead>
                  <TableHead className="text-center">{`${L("batch")}`}</TableHead>
                  <TableHead className="text-right">계획(kg)</TableHead>
                  <TableHead className="text-right">실제(kg)</TableHead>
                  <TableHead className="text-center">달성률</TableHead>
                  <TableHead className="text-center">CCP</TableHead>
                  <TableHead className="text-center">이상</TableHead>
                  <TableHead className="text-center">승인상태</TableHead>
                  <TableHead className="text-center">생성시각</TableHead>
                  <TableHead className="text-center w-28">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reportList as ReportListRow[]).map((r: ReportListRow, idx: number) => (
                  <TableRow key={r.id || `pending-${r.reportDate}`} className={cn(
                    "hover:bg-muted/50 cursor-pointer transition-colors",
                    r.needsGeneration && "bg-amber-50/50 border-l-2 border-l-amber-400",
                    selectedIds.has(r.id) && "bg-blue-50/50",
                    r.approvalStatus === "approved" && "bg-green-50/30",
                    (r.approvalStatus === "pending_review" || r.approvalStatus === "pending_approval") && "bg-yellow-50/30"
                  )}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      {!r.needsGeneration && <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      <div className="flex items-center gap-1.5">
                        <FileText className={`h-4 w-4 shrink-0 ${r.needsGeneration ? "text-amber-500" : "text-blue-500"}`} />
                        {r.reportDate}
                        {r.needsGeneration && <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 text-amber-600 border-amber-300">미생성</Badge>}
                      </div>
                      {r.productNames && r.productNames.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[280px]" title={r.productNames.join(", ")}>
                          {r.productNames.join(", ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      <span className="font-bold">{r.totalBatches}</span>
                      <span className="text-xs text-muted-foreground ml-0.5">건</span>
                      {r.completedBatches > 0 && <span className="text-xs text-green-600 ml-1">({r.completedBatches}완료)</span>}
                    </TableCell>
                    <TableCell className="text-right" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>{safeNum(r.totalPlannedQty)}</TableCell>
                    <TableCell className="text-right font-medium" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>{safeNum(r.totalActualQty)}</TableCell>
                    <TableCell className="text-center" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      <span className={cn("font-bold", r.achievementRate >= 90 ? "text-green-600" : r.achievementRate >= 50 ? "text-orange-600" : "text-red-600")}>
                        {r.achievementRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      {r.ccpTotal > 0 ? r.ccpTotal : "-"}
                    </TableCell>
                    <TableCell className="text-center" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      {r.issueCount > 0 ? <Badge variant="destructive" className="text-xs">{r.issueCount}</Badge> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-center" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      {r.needsGeneration ? <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">일보 미생성</Badge> : <ApprovalStatusBadge status={r.approvalStatus} />}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      {r.generatedAt ? format(new Date(r.generatedAt), "MM-dd HH:mm") : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.needsGeneration ? (
                          <Button variant="outline" size="sm" className="h-7 text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
                            onClick={() => regenerateMutation.mutate({ date: r.reportDate })}
                            disabled={regenerateMutation.isPending}>
                            {regenerateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                            생성
                          </Button>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedReportId(r.id)} title="상세보기">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`${r.reportDate} 생산일지를 삭제하시겠습니까?`))
                                deleteMutation.mutate({ ids: [r.id] });
                            }} title="삭제">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Standalone page */
export default function ProductionDailyReport() {
  const L = useIndustryLabel();
  return (
    <DashboardLayout>
      <ProductionDailyReportContent />
    </DashboardLayout>
  );
}
