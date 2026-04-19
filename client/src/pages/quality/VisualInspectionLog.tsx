import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download, FileText, CheckCircle2, Loader2, Info,
  Printer, ChevronLeft, ChevronRight, Trash2, Send,
  Plus, Save, Calendar, ClipboardCheck, Minus, Import, Wand2
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ApprovalSeal } from "@/components/SealGenerator";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
// ===========================================================================
// Status helpers
// ===========================================================================
const APPROVAL_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending_review: { label: "승인요청", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  pending_approval: { label: "승인요청", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  pending: { label: "승인요청", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  approved: { label: "승인완료", color: "bg-green-100 text-green-800 border-green-300" },
  rejected: { label: "반려", color: "bg-red-100 text-red-800 border-red-300" },
};

function ApprovalStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-gray-100 text-gray-600 border-gray-300">미제출</span>;
  const cfg = APPROVAL_STATUS_MAP[status] || { label: status, color: "bg-gray-100 text-gray-600 border-gray-300" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.color}`}>{cfg.label}</span>;
}

function safeDate(d: any): Date | null {
  if (!d) return null;
  try { const s = String(d).replace(' ', 'T'); const dt = new Date(s); return isNaN(dt.getTime()) ? null : dt; } catch { return null; }
}

// Mark options for the inspection fields
const MARKS = ["\u25CB", "\u00D7", "\u2014"];
const COMPLIANCE_OPTIONS = ["\uC801\uD569", "\uBD80\uC801\uD569", "\u2014"];

interface InspectionItem {
  id?: number;
  receiptDate: string;
  productName: string;
  importCertOrigin: string;   // merged: 수입필증/원산지/성적서구비 (UI displays in one cell)
  testReportAvail: string;    // kept in data but merged visually with importCertOrigin
  expiryDate: string;         // 소비기한 (renamed from 유통기한)
  manufactureDate: string;    // 제조년월일
  qualityRetainDate: string;  // 품질유지기한
  vehicleTemp: string;
  vehicleCondition: string;
  palletCondition: string;
  normalApproved: string;
  foreignMatter: string;
  labelAllergen: string;
  labelManager: string;       // kept for backward compat, hidden from UI
  compliance: string;
  correctiveAction: string;
  note: string;
}

const emptyItem = (): InspectionItem => ({
  receiptDate: '', productName: '', importCertOrigin: '', testReportAvail: '',
  expiryDate: '', manufactureDate: '', qualityRetainDate: '',
  vehicleTemp: '\u25CB', vehicleCondition: '\u25CB', palletCondition: '\u25CB', normalApproved: '\u25CB',
  foreignMatter: '\u25CB', labelAllergen: '\u25CB', labelManager: '',
  compliance: '\uC801\uD569', correctiveAction: '', note: '',
});

// Helper: merge cert/origin/report for display
function formatCertOriginReport(item: InspectionItem): string {
  const parts: string[] = [];
  if (item.importCertOrigin) parts.push(item.importCertOrigin);
  if (item.testReportAvail && item.testReportAvail !== '\u2014' && item.testReportAvail !== '') {
    parts.push(item.testReportAvail === '\u25CB' ? '\uC131\uC801\uC11C\u25CB' : item.testReportAvail === '\u00D7' ? '\uC131\uC801\uC11C\u00D7' : item.testReportAvail);
  }
  return parts.join(' / ') || '';
}

// Helper: merge dates for display
function formatDatesInfo(item: InspectionItem): string {
  const parts: string[] = [];
  if (item.expiryDate) parts.push(item.expiryDate);
  if (item.manufactureDate) parts.push(item.manufactureDate);
  if (item.qualityRetainDate) parts.push(item.qualityRetainDate);
  return parts.join('\n') || '';
}

// ===========================================================================
// Print HTML - A4 landscape, auto page break
// ===========================================================================
const ROWS_PER_PAGE = 20;

function generatePrintHTML(items: InspectionItem[], year: number, month: number, approvalInfo: any) {
  const ai = approvalInfo || {};
  const sealSVG = (name: string, date: string, type: string) => {
    let dateStr = "";
    try { const d = safeDate(date); if (d) dateStr = format(d, "yy.MM.dd"); } catch {}
    const displayName = name.length === 2 ? name[0] + " " + name[1] : name.length === 3 ? name : name.slice(0, 3);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34" style="display:block;margin:0 auto;">
      <rect x="1" y="1" width="32" height="32" rx="1" ry="1" fill="none" stroke="#D42020" stroke-width="1.6" opacity="0.85"/>
      <line x1="1" y1="12.3" x2="33" y2="12.3" stroke="#D42020" stroke-width="0.7" opacity="0.7"/>
      <line x1="1" y1="23.3" x2="33" y2="23.3" stroke="#D42020" stroke-width="0.7" opacity="0.7"/>
      <text x="17" y="8" text-anchor="middle" dominant-baseline="central" font-size="6.5" fill="#D42020" font-weight="700" opacity="0.85">${type}</text>
      <text x="17" y="18" text-anchor="middle" dominant-baseline="central" font-size="9.5" fill="#D42020" font-weight="700" opacity="0.85">${displayName}</text>
      <text x="17" y="28.5" text-anchor="middle" dominant-baseline="central" font-size="5.5" fill="#D42020" font-weight="400" opacity="0.7">${dateStr}</text>
    </svg>`;
  };
  const sealCell = (name?: string, date?: string, type?: string) => {
    if (name && date) return sealSVG(name, date, type || "");
    if (name) return `<div style="font-size:9px;font-weight:700;color:#D42020;">${name}</div>`;
    return `<span style="color:#d1d5db;font-size:8px;">\uBBF8${type === "\uC791\uC131" ? "\uC791\uC131" : type === "\uAC80\uD1A0" ? "\uAC80\uD1A0" : "\uC2B9\uC778"}</span>`;
  };
  const markClass = (v: string) => v === '\u25CB' ? 'mark-pass' : v === '\u00D7' ? 'mark-fail' : '';
  const compClass = (v: string) => v === '\uC801\uD569' ? 'compliance-pass' : v === '\uBD80\uC801\uD569' ? 'compliance-fail' : '';

  const totalPages = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE));
  let pages = '';
  for (let p = 0; p < totalPages; p++) {
    const pageItems = items.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    const rows = pageItems.map((item, idx) => {
      const certOrigin = formatCertOriginReport(item);
      const datesLines: string[] = [];
      if (item.expiryDate) datesLines.push(`\uC18C:${item.expiryDate}`);
      if (item.manufactureDate) datesLines.push(`\uC81C:${item.manufactureDate}`);
      if (item.qualityRetainDate) datesLines.push(`\uD488:${item.qualityRetainDate}`);
      const datesStr = datesLines.join('<br/>');
      return `<tr>
      <td>${p * ROWS_PER_PAGE + idx + 1}</td>
      <td>${item.receiptDate}</td>
      <td class="td-left">${item.productName}</td>
      <td class="td-left" style="font-size:7.5px;line-height:1.3;">${certOrigin}</td>
      <td class="td-left" style="font-size:7px;line-height:1.3;">${datesStr || ''}</td>
      <td class="${markClass(item.vehicleTemp)}">${item.vehicleTemp}</td>
      <td class="${markClass(item.vehicleCondition)}">${item.vehicleCondition}</td>
      <td class="${markClass(item.palletCondition)}">${item.palletCondition}</td>
      <td class="${markClass(item.normalApproved)}">${item.normalApproved}</td>
      <td class="${markClass(item.foreignMatter)}">${item.foreignMatter}</td>
      <td class="${markClass(item.labelAllergen)}">${item.labelAllergen}</td>
      <td class="${compClass(item.compliance)}">${item.compliance}</td>
      <td class="td-left">${item.correctiveAction || ''}</td>
    </tr>`;
    }).join('');

    pages += `
    <div class="page-container${p > 0 ? ' page-break' : ''}">
      <div class="header-row">
        <div class="title-area">
          <div class="system-label">Millio AI | \uC2DD\uD488\uC548\uC804 + \uD68C\uACC4 + ERP \uD1B5\uD569 \uAD00\uB9AC \uC2DC\uC2A4\uD15C</div>
          <h1>\uC721 \uC548 \uAC80 \uC0AC \uC77C \uC9C0</h1>
          <div class="subtitle">Visual Inspection Log (\uC6D0\uC7AC\uB8CC)</div>
          <div class="period">\uAC80\uC0AC\uAE30\uAC04: <strong>${year}\uB144 ${month}\uC6D4</strong>${totalPages > 1 ? ` (${p + 1}/${totalPages})` : ''}</div>
        </div>
        <table class="seal-table">
          <tr><th colspan="3" class="seal-header">\uACB0 \uC7AC</th></tr>
          <tr><th class="seal-role">\uC791 \uC131</th><th class="seal-role">\uAC80 \uD1A0</th><th class="seal-role">\uC2B9 \uC778</th></tr>
          <tr>
            <td class="seal-cell">${sealCell(ai.requesterName, ai.requestedAt || ai.createdAt, "\uC791\uC131")}</td>
            <td class="seal-cell">${sealCell(ai.reviewerName, ai.reviewedAt, "\uAC80\uD1A0")}</td>
            <td class="seal-cell">${sealCell(ai.approverName, ai.approvedAt, "\uC2B9\uC778")}</td>
          </tr>
          <tr>
            <td class="seal-name">${ai.requesterName || "-"}</td>
            <td class="seal-name">${ai.reviewerName || "-"}</td>
            <td class="seal-name">${ai.approverName || "-"}</td>
          </tr>
        </table>
      </div>
      <table class="data-table">
        <thead><tr>
          <th style="width:24px;">No</th>
          <th style="width:50px;">\uC785\uACE0\uC77C\uC2DC</th>
          <th style="min-width:80px;">\uD488\uBA85</th>
          <th style="width:85px;">\uC218\uC785\uD544\uC99D/\uC6D0\uC0B0\uC9C0<br/>\uC131\uC801\uC11C\uAD6C\uBE44</th>
          <th style="width:90px;">\uC18C\uBE44\uAE30\uD55C/\uC81C\uC870\uB144\uC6D4\uC77C<br/>\uD488\uC9C8\uC720\uC9C0\uAE30\uD55C</th>
          <th style="width:30px;">\uCC28\uB7C9<br/>\uC628\uB3C4</th>
          <th style="width:30px;">\uCC28\uB7C9<br/>\uC0C1\uD0DC</th>
          <th style="width:30px;">\uD30C\uB808\uD2B8<br/>\uC0C1\uD0DC</th>
          <th style="width:30px;">\uC815\uC0C1<br/>\uACB0\uC7AC</th>
          <th style="width:30px;">\uC774\uBB3C<br/>\uD63C\uC785</th>
          <th style="width:30px;">\uD45C\uC2DC<br/>\uC54C\uB808\uB974\uAE30</th>
          <th style="width:40px;">\uC801\uD569<br/>\uC5EC\uBD80</th>
          <th>\uBD80\uC801\uD569\uC2DC<br/>\uC870\uCE58\uB0B4\uC6A9</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="13" style="text-align:center;color:#9ca3af;padding:20px;">\uAC80\uC0AC \uD56D\uBAA9 \uC5C6\uC74C</td></tr>'}</tbody>
      </table>
      <div class="legend">* \uD310\uC815\uAE30\uD638: \u25CB \uC801\uD569 | \u00D7 \uBD80\uC801\uD569 | \u2014 \uD574\uB2F9\uC5C6\uC74C</div>
      <div class="footer">Millio AI | ${year}\uB144 ${month}\uC6D4 \uC721\uC548\uAC80\uC0AC\uC77C\uC9C0${totalPages > 1 ? ` (${p + 1}/${totalPages})` : ''}</div>
    </div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>\uC721\uC548\uAC80\uC0AC\uC77C\uC9C0 - ${year}\uB144 ${month}\uC6D4</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; font-size: 10px; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4 landscape; margin: 8mm 10mm; }
@media print { body { -webkit-print-color-adjust: exact; } .no-print { display: none !important; } }
.page-break { page-break-before: always; }
.page-container { max-width: 297mm; margin: 0 auto; padding: 5mm; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #4b5563; padding: 2px 4px; font-size: 9px; }
.header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.title-area .system-label { font-size: 8px; color: #9ca3af; margin-bottom: 2px; }
.title-area h1 { font-size: 20px; font-weight: 700; letter-spacing: 4px; margin: 0; }
.title-area .subtitle { font-size: 9px; color: #6b7280; margin-top: 2px; }
.title-area .period { font-size: 10px; color: #374151; margin-top: 4px; }
.title-area .period strong { font-weight: 700; }
.seal-table { border-collapse: collapse; table-layout: fixed; width: auto !important; }
.seal-table th, .seal-table td { border: 1px solid #4b5563; text-align: center; overflow: hidden; }
.seal-table .seal-header { background: #f3f4f6; font-size: 8px; font-weight: 700; padding: 0 1px; }
.seal-table .seal-role { background: #f9fafb; font-size: 7px; font-weight: 500; padding: 0; width: 34px; }
.seal-table .seal-cell { height: 34px; width: 34px; vertical-align: middle; padding: 0; }
.seal-table .seal-name { background: #f9fafb; font-size: 6px; color: #4b5563; padding: 0; width: 34px; }
.data-table th { background: #eff6ff; font-size: 8px; font-weight: 600; text-align: center; padding: 3px 2px; white-space: nowrap; }
.data-table td { font-size: 8px; text-align: center; padding: 2px 3px; }
.data-table .td-left { text-align: left; }
.mark-pass { color: #15803d; font-weight: 700; }
.mark-fail { color: #dc2626; font-weight: 700; }
.compliance-pass { color: #15803d; font-weight: 700; }
.compliance-fail { color: #dc2626; font-weight: 700; }
.legend { font-size: 8px; color: #6b7280; margin-top: 6px; }
.footer { margin-top: 8px; font-size: 7px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 4px; }
</style></head><body>${pages}</body></html>`;
}

// ===========================================================================
// Mark select component
// ===========================================================================
function MarkSelect({ value, onChange, options = MARKS }: { value: string; onChange: (v: string) => void; options?: string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-14 text-xs px-1 text-center">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(m => (
          <SelectItem key={m} value={m} className="text-xs">
            <span className={cn(m === '\u25CB' ? 'text-green-600 font-bold' : m === '\u00D7' ? 'text-red-600 font-bold' : 'text-gray-400')}>{m}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ===========================================================================
// Document preview component (merged columns)
// ===========================================================================
function VisualInspectionDocument({
  items, year, month, approvalInfo,
}: {
  items: InspectionItem[]; year: number; month: number;
  approvalInfo?: { requesterName?: string; reviewerName?: string; approverName?: string; approvedAt?: string; reviewedAt?: string; requestedAt?: string; createdAt?: string };
}) {
  const bCls = "border border-gray-600";
  const thCls = `${bCls} px-1 py-1 text-[8px] font-semibold bg-blue-50 text-center whitespace-nowrap`;
  const tdCls = `${bCls} px-1 py-0.5 text-[9px] text-center`;
  const ai = approvalInfo || {};
  const sealSize = 30;
  const markColor = (v: string) => v === '\u25CB' ? 'text-green-700 font-bold' : v === '\u00D7' ? 'text-red-600 font-bold' : 'text-gray-400';
  const compColor = (v: string) => v === '\uC801\uD569' ? 'text-green-700 font-bold' : v === '\uBD80\uC801\uD569' ? 'text-red-600 font-bold' : 'text-gray-400';

  return (
    <div className="bg-white max-w-full overflow-x-auto space-y-6" style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
      {/* Header + seal */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[10px] text-gray-400 mb-1">Millio AI | AI 기반 제조 ERP</div>
          <h1 className="text-xl font-bold tracking-tight">육 안 검 사 일 지</h1>
          <p className="text-xs text-gray-500 mt-0.5">Visual Inspection Log (원재료)</p>
          <p className="text-xs text-gray-600 mt-1">검사기간: <span className="font-bold">{year}년 {month}월</span></p>
        </div>
        <table className="border-collapse border border-gray-600 text-xs">
          <thead>
            <tr><th colSpan={3} className="border border-gray-600 px-0 py-0 bg-gray-100 text-center font-bold text-[9px]">결 재</th></tr>
            <tr className="bg-gray-50">
              <th className="border border-gray-600 px-0 py-0 font-medium text-[8px]" style={{width:'32px'}}>작 성</th>
              <th className="border border-gray-600 px-0 py-0 font-medium text-[8px]" style={{width:'32px'}}>검 토</th>
              <th className="border border-gray-600 px-0 py-0 font-medium text-[8px]" style={{width:'32px'}}>승 인</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-600 text-center align-middle p-0" style={{height:'32px'}}>
                {ai.requesterName ? <ApprovalSeal approverName={ai.requesterName} approvalDate={ai.requestedAt || ai.createdAt} approvalType="작성" size={sealSize} /> : <span className="text-gray-300 text-[8px]">미작성</span>}
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

      {/* Inspection table - merged columns */}
      <table className="w-full border-collapse border border-gray-600 text-[9px]">
        <thead>
          <tr>
            <th className={thCls} style={{width:'24px'}}>No</th>
            <th className={thCls} style={{width:'55px'}}>입고일시</th>
            <th className={thCls} style={{minWidth:'80px'}}>품명</th>
            <th className={thCls} style={{width:'85px'}}>수입필증/원산지<br/>성적서구비</th>
            <th className={thCls} style={{width:'90px'}}>소비기한/제조년월일<br/>품질유지기한</th>
            <th className={thCls} style={{width:'32px'}}>차량<br/>온도</th>
            <th className={thCls} style={{width:'32px'}}>차량<br/>상태</th>
            <th className={thCls} style={{width:'32px'}}>파레트<br/>상태</th>
            <th className={thCls} style={{width:'32px'}}>정상<br/>결재</th>
            <th className={thCls} style={{width:'32px'}}>이물<br/>혼입</th>
            <th className={thCls} style={{width:'32px'}}>표시<br/>알레르기</th>
            <th className={thCls} style={{width:'42px'}}>적합<br/>여부</th>
            <th className={thCls}>부적합시<br/>조치내용</th>
          </tr>
        </thead>
        <tbody>
          {items.length > 0 ? items.map((item, idx) => {
            const certOrigin = formatCertOriginReport(item);
            const datesLines: string[] = [];
            if (item.expiryDate) datesLines.push(`소:${item.expiryDate}`);
            if (item.manufactureDate) datesLines.push(`제:${item.manufactureDate}`);
            if (item.qualityRetainDate) datesLines.push(`품:${item.qualityRetainDate}`);
            return (
              <tr key={idx}>
                <td className={`${tdCls} text-gray-500`}>{idx + 1}</td>
                <td className={tdCls}>{item.receiptDate}</td>
                <td className={`${bCls} px-1 py-0.5 text-[9px] text-left`}>{item.productName}</td>
                <td className={`${bCls} px-1 py-0.5 text-[8px] text-left`}>{certOrigin}</td>
                <td className={`${bCls} px-1 py-0.5 text-[7.5px] text-left leading-tight`}>
                  {datesLines.map((l, i) => <div key={i}>{l}</div>)}
                </td>
                <td className={`${tdCls} ${markColor(item.vehicleTemp)}`}>{item.vehicleTemp}</td>
                <td className={`${tdCls} ${markColor(item.vehicleCondition)}`}>{item.vehicleCondition}</td>
                <td className={`${tdCls} ${markColor(item.palletCondition)}`}>{item.palletCondition}</td>
                <td className={`${tdCls} ${markColor(item.normalApproved)}`}>{item.normalApproved}</td>
                <td className={`${tdCls} ${markColor(item.foreignMatter)}`}>{item.foreignMatter}</td>
                <td className={`${tdCls} ${markColor(item.labelAllergen)}`}>{item.labelAllergen}</td>
                <td className={`${tdCls} ${compColor(item.compliance)}`}>{item.compliance}</td>
                <td className={`${bCls} px-1 py-0.5 text-[9px] text-left`}>{item.correctiveAction || ''}</td>
              </tr>
            );
          }) : (
            <tr><td colSpan={13} className={`${tdCls} text-gray-400 py-6`}>검사 항목 없음</td></tr>
          )}
        </tbody>
      </table>

      <div className="mt-2 text-[8px] text-gray-500">
        * 판정기호: <span className="text-green-700 font-bold">&#x25CB;</span> 적합 | <span className="text-red-600 font-bold">&#x00D7;</span> 부적합 | <span className="text-gray-400">&#x2014;</span> 해당없음
      </div>
      <div className="mt-3 text-[9px] text-gray-400 text-center border-t border-gray-200 pt-2">
        Millio AI | {year}년 {month}월 육안검사일지
      </div>
    </div>
  );
}

// ===========================================================================
// Main component - monthly auto-create document
// ===========================================================================
export function VisualInspectionLogContent() {
  const L = useIndustryLabel();
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [logId, setLogId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState<InspectionItem[]>([]);
  const [initialized, setInitialized] = useState(false);
  const autoImportDone = useRef(false);
  const { isAdmin } = useAuth();

  // ---- API: monthly document auto-create/fetch ----
  const getOrCreateMutation = (trpc as any).visualInspection.getOrCreateMonthly.useMutation({
    onSuccess: (r: any) => {
      setLogId(r.id);
      setInitialized(true);
      // If newly created, auto-import materials
      if (r.created) {
        autoImportDone.current = false;
      }
    },
    onError: (e: { message: string }) => {
      toast.error("문서 초기화 실패: " + e.message);
      setInitialized(true);
    },
  });

  // Month change -> auto create/fetch
  useEffect(() => {
    setInitialized(false);
    setLogId(null);
    setEditMode(false);
    autoImportDone.current = false;
    getOrCreateMutation.mutate({ year: currentYear, month: currentMonth });
  }, [currentYear, currentMonth]);

  // ---- API: detail query ----
  const { data: logDetail, isLoading: loadingDetail, refetch: refetchDetail } = (trpc as any).visualInspection.getById.useQuery(
    { id: logId! },
    { enabled: !!logId, refetchOnWindowFocus: true }
  );

  // ---- API: material receivings for auto-import (작업자용) ----
  const { data: materialReceivings } = (trpc as any).visualInspection.fetchMaterialReceivings.useQuery(
    { year: currentYear, month: currentMonth },
    { enabled: !!logId && !isAdmin }  // 작업자만 수동 가져오기용 조회
  );

  // ---- API: previous defaults for auto-complete ----
  const { data: previousDefaults } = (trpc as any).visualInspection.fetchPreviousDefaults.useQuery(
    { year: currentYear, month: currentMonth },
    { enabled: !!logId }
  );

  // ---- 관리자용: 입고 데이터 자동 동기화 ----
  const syncMutation = (trpc as any).visualInspection.syncReceivings.useMutation({
    onSuccess: (r: any) => {
      if (r.synced > 0) {
        toast.success(`원재료 입고 ${r.synced}건 자동 반영 완료`);
        refetchDetail();
      }
    },
    onError: (e: { message: string }) => console.error('[syncReceivings]', e.message),
  });

  // 관리자: logId 확정 시 자동 동기화 실행
  useEffect(() => {
    if (isAdmin && logId && initialized && !autoImportDone.current) {
      autoImportDone.current = true;
      syncMutation.mutate({ logId, year: currentYear, month: currentMonth });
    }
  }, [isAdmin, logId, initialized]);

  const saveMutation = (trpc as any).visualInspection.saveItems.useMutation({
    onSuccess: () => {
      toast.success("저장 완료");
      setEditMode(false);
      refetchDetail();
    },
    onError: (e: { message: string }) => toast.error("저장 실패: " + e.message),
  });
  const deleteMutation = (trpc as any).visualInspection.delete.useMutation({
    onSuccess: () => {
      toast.success("삭제 완료");
      setLogId(null);
      setInitialized(false);
      getOrCreateMutation.mutate({ year: currentYear, month: currentMonth });
    },
    onError: (e: { message: string }) => toast.error("삭제 실패: " + e.message),
  });
  const submitMutation = (trpc as any).visualInspection.submitForApproval.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.message);
      refetchDetail();
    },
    onError: (e: { message: string }) => toast.error("승인 요청 실패: " + e.message),
  });

  // ---- detail data ----
  const items: InspectionItem[] = logDetail?.items || [];
  const approvalInfo = logDetail ? {
    requesterName: logDetail.requesterName, reviewerName: logDetail.reviewerName, approverName: logDetail.approverName,
    approvedAt: logDetail.approvedAt, reviewedAt: logDetail.reviewedAt, requestedAt: logDetail.requestedAt,
    createdAt: logDetail.createdAt,  // ★ 2026-04-14: 작성자 도장 날짜 폴백용
  } : undefined;
  const isApproved = logDetail?.approvalStatus === "approved";
  const isPending = logDetail?.approvalStatus === "pending_review" || logDetail?.approvalStatus === "pending_approval";
  const isRejected = logDetail?.approvalStatus === "rejected";
  // Can submit: no approval yet, or rejected (allow re-submit)
  const canSubmit = (!logDetail?.approvalStatus || isRejected) && !isPending;

  // ---- Month nav ----
  const prevMonth = () => { if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const nextMonth = () => { if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };

  // ---- Edit helpers ----
  const startEdit = () => {
    setEditItems(items.length > 0 ? items.map(i => ({ ...i })) : [emptyItem()]);
    setEditMode(true);
  };
  const updateItem = (idx: number, field: keyof InspectionItem, value: string) => {
    setEditItems(prev => {
      const updated = prev.map((item, i) => i === idx ? { ...item, [field]: value } : item);
      // Auto-complete: when productName changes, fill from previousDefaults
      if (field === 'productName' && value && previousDefaults && previousDefaults[value]) {
        const defaults = previousDefaults[value];
        const current = updated[idx];
        // Only fill empty fields
        if (!current.importCertOrigin) updated[idx] = { ...updated[idx], importCertOrigin: defaults.importCertOrigin || '' };
        if (!current.testReportAvail || current.testReportAvail === '') updated[idx] = { ...updated[idx], testReportAvail: defaults.testReportAvail || '\u25CB' };
        if (!current.vehicleTemp || current.vehicleTemp === '\u25CB') updated[idx] = { ...updated[idx], vehicleTemp: defaults.vehicleTemp || '\u25CB' };
        if (!current.vehicleCondition || current.vehicleCondition === '\u25CB') updated[idx] = { ...updated[idx], vehicleCondition: defaults.vehicleCondition || '\u25CB' };
        if (!current.palletCondition || current.palletCondition === '\u25CB') updated[idx] = { ...updated[idx], palletCondition: defaults.palletCondition || '\u25CB' };
        if (!current.normalApproved || current.normalApproved === '\u25CB') updated[idx] = { ...updated[idx], normalApproved: defaults.normalApproved || '\u25CB' };
        if (!current.foreignMatter || current.foreignMatter === '\u25CB') updated[idx] = { ...updated[idx], foreignMatter: defaults.foreignMatter || '\u25CB' };
        if (!current.labelAllergen || current.labelAllergen === '\u25CB') updated[idx] = { ...updated[idx], labelAllergen: defaults.labelAllergen || '\u25CB' };
        if (!current.compliance || current.compliance === '\uC801\uD569') updated[idx] = { ...updated[idx], compliance: defaults.compliance || '\uC801\uD569' };
      }
      return updated;
    });
  };
  const addItem = () => setEditItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setEditItems(prev => prev.filter((_, i) => i !== idx));
  const handleSave = () => {
    if (!logId) return;
    saveMutation.mutate({ logId, items: editItems });
  };

  // ---- Auto-import materials (add to existing items, apply previous defaults) ----
  const handleImportMaterials = () => {
    if (!materialReceivings || materialReceivings.length === 0) {
      toast.info("해당 월의 원재료 입고 데이터가 없습니다. 수동으로 입력해주세요.");
      return;
    }
    // Apply previous defaults to imported items
    let imported: InspectionItem[] = materialReceivings.map((mr: any) => {
      const item: InspectionItem = { ...mr, labelManager: '' };
      // Auto-fill from previous data if available
      if (previousDefaults && item.productName && previousDefaults[item.productName]) {
        const d = previousDefaults[item.productName];
        if (!item.importCertOrigin) item.importCertOrigin = d.importCertOrigin || '';
        if (!item.testReportAvail) item.testReportAvail = d.testReportAvail || '\u25CB';
      }
      return item;
    });

    const existingNonEmpty = editItems.filter(i => i.productName);
    // 중복 체크: 날짜+품명으로 판별
    const existingKeys = new Set(
      existingNonEmpty.map(i => `${i.receiptDate}|${i.productName}`)
    );
    const newOnly = imported.filter(i => !existingKeys.has(`${i.receiptDate}|${i.productName}`));
    if (newOnly.length === 0) {
      toast.info("모든 입고 데이터가 이미 반영되어 있습니다.");
      return;
    }
    const merged = [...existingNonEmpty, ...newOnly];
    setEditItems(merged.length > 0 ? merged : [emptyItem()]);
    toast.success(`원재료 입고 ${newOnly.length}건 추가 (중복 ${imported.length - newOnly.length}건 제외)`);
  };

  // ---- Bulk pass (set all marks to pass) ----
  const handleBulkPass = () => {
    setEditItems(prev => prev.map(item => ({
      ...item,
      vehicleTemp: '\u25CB', vehicleCondition: '\u25CB', palletCondition: '\u25CB',
      normalApproved: '\u25CB', foreignMatter: '\u25CB', labelAllergen: '\u25CB',
      compliance: '\uC801\uD569',
    })));
    toast.success("전체 적합 처리 완료");
  };

  // ---- Print ----
  const handlePrint = useCallback(() => {
    if (!logDetail) return;
    const html = generatePrintHTML(items, logDetail.logYear, logDetail.logMonth, approvalInfo);
    const w = window.open("", "_blank");
    if (!w) { toast.error("팝업 차단을 해제해주세요."); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 600);
  }, [logDetail, items, approvalInfo]);

  // ---- Loading ----
  if (!initialized || getOrCreateMutation.isPending) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center gap-4 py-4">
          <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-5 w-5" /></Button>
          <span className="text-lg font-bold min-w-[140px] text-center flex items-center justify-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />{currentYear}년 {currentMonth}월
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-5 w-5" /></Button>
        </div>
        <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />문서 준비 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month navigation + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-5 w-5" /></Button>
          <span className="text-lg font-bold min-w-[140px] text-center flex items-center justify-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />{currentYear}년 {currentMonth}월
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-5 w-5" /></Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!editMode && !isApproved && (
            <Button size="sm" variant="outline" onClick={startEdit}>
              <FileText className="h-4 w-4 mr-1" /> 편집
            </Button>
          )}
          {editMode && (
            <>
              {!isAdmin && (
                <Button size="sm" variant="outline" onClick={handleImportMaterials}>
                  <Import className="h-4 w-4 mr-1" /> 입고 자동가져오기
                </Button>
              )}
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => {
                  if (!logId) return;
                  syncMutation.mutate({ logId, year: currentYear, month: currentMonth });
                }} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Import className="h-4 w-4 mr-1" />}
                  입고 동기화
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleBulkPass}>
                <Wand2 className="h-4 w-4 mr-1" /> 전체 적합
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                저장
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>취소</Button>
            </>
          )}
          {canSubmit && !editMode && items.length > 0 && (
            <Button size="sm" onClick={() => submitMutation.mutate({ logId: logId! })} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              {isRejected ? '재승인 요청' : '승인 요청'}
            </Button>
          )}
          {!editMode && (
            <>
              <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> 출력</Button>
              <Button variant="outline" size="sm" onClick={() => {
                if (!logDetail) return;
                const html = generatePrintHTML(items, logDetail.logYear, logDetail.logMonth, approvalInfo);
                const blob = new Blob([html], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url;
                a.download = `육안검사일지-${logDetail.logYear}년${logDetail.logMonth}월.html`;
                a.click(); URL.revokeObjectURL(url);
                toast.success("다운로드 완료");
              }}><Download className="h-4 w-4 mr-1" /> 다운로드</Button>
            </>
          )}
          {!isApproved && !editMode && (
            <Button variant="destructive" size="sm" onClick={() => {
              if (window.confirm("이 육안검사일지를 삭제하시겠습니까?"))
                deleteMutation.mutate({ id: logId! });
            }} disabled={deleteMutation.isPending}>
              <Trash2 className="h-4 w-4 mr-1" /> 삭제
            </Button>
          )}
        </div>
      </div>

      {/* Status banner */}
      <div className={cn(
        "flex items-center gap-3 text-xs rounded-lg p-3 border",
        isApproved ? "bg-green-50/50 border-green-200" : isPending ? "bg-yellow-50/50 border-yellow-200" : isRejected ? "bg-red-50/50 border-red-200" : "bg-muted/50"
      )}>
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">{currentYear}년 {currentMonth}월 육안검사일지</span>
        <ApprovalStatusBadge status={logDetail?.approvalStatus || null} />
        <Badge variant="outline" className="text-xs">{items.length}건</Badge>
        {isApproved && <span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> 승인완료 - 출력 가능</span>}
        {isPending && <span className="text-yellow-600">승인 처리 대기중</span>}
        {isRejected && <span className="text-red-600">반려됨 - 수정 후 재승인 요청 가능</span>}
        {canSubmit && !isRejected && items.length > 0 && <span className="text-orange-600">승인 요청 후 출력할 수 있습니다</span>}
      </div>

      {/* Edit mode - merged columns */}
      {editMode ? (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-blue-600" />
              검사 항목 편집
              <Badge variant="outline" className="text-xs ml-2">{editItems.length}건</Badge>
              {previousDefaults && Object.keys(previousDefaults).length > 0 && (
                <span className="text-[10px] text-green-600 font-normal ml-2">* 품명 입력시 이전 데이터 자동완성</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-2">
            <table className="w-full border-collapse text-xs min-w-[1000px]">
              <thead>
                <tr className="bg-blue-50">
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-8">#</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-24">입고일시</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center min-w-[100px]">품명</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-28">수입필증/원산지<br/><span className="text-[10px] text-gray-500">성적서구비</span></th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-32">소비기한/제조년월일<br/><span className="text-[10px] text-gray-500">품질유지기한</span></th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-16">차량온도</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-16">차량상태</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-16">파레트</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-16">정상</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-16">이물</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-16">알레르기</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-16">적합</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center min-w-[80px]">조치내용</th>
                  <th className="border border-gray-300 px-1 py-1.5 text-center w-8"></th>
                </tr>
              </thead>
              <tbody>
                {editItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="border border-gray-200 text-center text-gray-400">{idx + 1}</td>
                    <td className="border border-gray-200 p-0.5">
                      <Input className="h-7 text-xs" value={item.receiptDate} placeholder="01-03" onChange={e => updateItem(idx, 'receiptDate', e.target.value)} />
                    </td>
                    <td className="border border-gray-200 p-0.5">
                      <Input className="h-7 text-xs" value={item.productName} placeholder="품명" onChange={e => updateItem(idx, 'productName', e.target.value)} />
                    </td>
                    {/* Merged: 수입필증/원산지 + 성적서구비 */}
                    <td className="border border-gray-200 p-0.5">
                      <div className="flex flex-col gap-0.5">
                        <Input className="h-6 text-[11px]" value={item.importCertOrigin} placeholder="원산지" onChange={e => updateItem(idx, 'importCertOrigin', e.target.value)} />
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-400 whitespace-nowrap">성적서</span>
                          <MarkSelect value={item.testReportAvail || '\u25CB'} onChange={v => updateItem(idx, 'testReportAvail', v)} />
                        </div>
                      </div>
                    </td>
                    {/* Merged: 소비기한 + 제조년월일 + 품질유지기한 */}
                    <td className="border border-gray-200 p-0.5">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-0.5">
                          <span className="text-[10px] text-gray-400 w-6 shrink-0">소비</span>
                          <Input className="h-5 text-[10px]" value={item.expiryDate} placeholder="2026.12.31" onChange={e => updateItem(idx, 'expiryDate', e.target.value)} />
                        </div>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[10px] text-gray-400 w-6 shrink-0">제조</span>
                          <Input className="h-5 text-[10px]" value={item.manufactureDate} placeholder="2026.01.01" onChange={e => updateItem(idx, 'manufactureDate', e.target.value)} />
                        </div>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[10px] text-gray-400 w-6 shrink-0">품질</span>
                          <Input className="h-5 text-[10px]" value={item.qualityRetainDate} placeholder="2026.06.30" onChange={e => updateItem(idx, 'qualityRetainDate', e.target.value)} />
                        </div>
                      </div>
                    </td>
                    <td className="border border-gray-200 p-0.5"><MarkSelect value={item.vehicleTemp} onChange={v => updateItem(idx, 'vehicleTemp', v)} /></td>
                    <td className="border border-gray-200 p-0.5"><MarkSelect value={item.vehicleCondition} onChange={v => updateItem(idx, 'vehicleCondition', v)} /></td>
                    <td className="border border-gray-200 p-0.5"><MarkSelect value={item.palletCondition} onChange={v => updateItem(idx, 'palletCondition', v)} /></td>
                    <td className="border border-gray-200 p-0.5"><MarkSelect value={item.normalApproved} onChange={v => updateItem(idx, 'normalApproved', v)} /></td>
                    <td className="border border-gray-200 p-0.5"><MarkSelect value={item.foreignMatter} onChange={v => updateItem(idx, 'foreignMatter', v)} /></td>
                    <td className="border border-gray-200 p-0.5"><MarkSelect value={item.labelAllergen} onChange={v => updateItem(idx, 'labelAllergen', v)} /></td>
                    <td className="border border-gray-200 p-0.5"><MarkSelect value={item.compliance} onChange={v => updateItem(idx, 'compliance', v)} options={COMPLIANCE_OPTIONS} /></td>
                    <td className="border border-gray-200 p-0.5"><Input className="h-7 text-xs" value={item.correctiveAction} placeholder="" onChange={e => updateItem(idx, 'correctiveAction', e.target.value)} /></td>
                    <td className="border border-gray-200 text-center p-0.5">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => removeItem(idx)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button variant="outline" size="sm" className="mt-2" onClick={addItem}>
              <Plus className="h-3 w-3 mr-1" /> 행 추가
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Document preview */
        loadingDetail ? (
          <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />로딩 중...</div>
        ) : (
          <Card className="overflow-hidden shadow-sm border-2">
            <CardContent className="p-4 overflow-x-auto">
              <VisualInspectionDocument
                items={items}
                year={logDetail?.logYear || currentYear}
                month={logDetail?.logMonth || currentMonth}
                approvalInfo={approvalInfo}
              />
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}

/** Standalone page */
export default function VisualInspectionLog() {
  return (
    <VisualInspectionLogContent />
  );
}
