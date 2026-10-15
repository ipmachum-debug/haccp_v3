/**
 * 결재란 — HTML 문자열 출력용 (2026-10-15)
 * 화면 결재란(ApprovalStampBox)·인쇄 결재란(PrintHelpers)과 같은 2줄 모양:
 *   [결재 | 작성 검토 승인] / [직인: 원 안 이름 + 짧은 날짜, 결재 전은 예정자 회색]
 * 결재 여부 규칙도 같다 — 작성: 이름 있으면 / 검토: 검토(또는 승인) 시각 있으면 / 승인: 승인 시각 있으면.
 * (이전 HTML 출력은 이름만 있으면 직인을 찍어, 검토·승인 전 문서에도 직인이 찍혔다)
 */
import { shortStampDate } from "@/components/checklist/ApprovalStampBox";

export type StampHtmlInput = {
  authorName?: string | null; reviewerName?: string | null; approverName?: string | null;
  requestedAt?: string | null; reviewedAt?: string | null; approvedAt?: string | null;
};

export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function cellHtml(name: string | null | undefined, done: boolean, date: string | null | undefined): string {
  if (done) {
    const d = shortStampDate(date ?? "");
    return `<div class="st-seal">${escapeHtml(name || "인")}</div>${d ? `<div class="st-date">${escapeHtml(d)}</div>` : ""}`;
  }
  return `<span class="st-pending">${escapeHtml(name || "—")}</span>`;
}

export function stampTableHtml(i: StampHtmlInput): string {
  const cells = [
    { label: "작성", html: cellHtml(i.authorName, !!i.authorName, i.requestedAt) },
    { label: "검토", html: cellHtml(i.reviewerName, !!i.reviewerName && !!(i.reviewedAt || i.approvedAt), i.reviewedAt || i.approvedAt) },
    { label: "승인", html: cellHtml(i.approverName, !!i.approverName && !!i.approvedAt, i.approvedAt) },
  ];
  return `<table class="st-table">
  <tr><th rowspan="2" class="st-side">결재</th>${cells.map((c) => `<th class="st-role">${c.label}</th>`).join("")}</tr>
  <tr>${cells.map((c) => `<td class="st-cell">${c.html}</td>`).join("")}</tr>
</table>`;
}

export const STAMP_TABLE_CSS = `
.st-table { border-collapse: collapse; table-layout: fixed; width: auto !important; }
.st-table th, .st-table td { border: 1px solid #4b5563; text-align: center; }
.st-table .st-side { background: #f3f4f6; font-size: 8px; font-weight: 600; width: 14px; padding: 0 1px; writing-mode: vertical-rl; }
.st-table .st-role { background: #f9fafb; font-size: 8px; font-weight: 600; width: 40px; padding: 1px 0; }
.st-table .st-cell { height: 40px; width: 40px; vertical-align: middle; padding: 1px 0; }
.st-seal { width: 28px; height: 28px; margin: 0 auto; border: 1.4px solid #D42020; border-radius: 50%; color: #D42020; font-size: 8px; font-weight: 700; line-height: 28px; overflow: hidden; white-space: nowrap; }
.st-date { font-size: 6.5px; color: #6b7280; margin-top: 1px; }
.st-pending { font-size: 7px; color: #9ca3af; }
`;
