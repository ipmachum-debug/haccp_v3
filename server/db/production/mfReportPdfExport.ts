/**
 * 품목제조보고서 PDF 출력 — PR #256
 *
 * Puppeteer 로 HTML → PDF 변환 (한글 폰트 자동 지원).
 * 식약처 양식의 "원재료명 또는 성분명 및 배합비율" 표 출력.
 *
 * 작성: 2026-05-05
 */

import puppeteer from "puppeteer";
import { flattenBomTree, type FlattenedRow } from "./mfReportFlatten";

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function indentSpaces(depth: number): string {
  if (depth === 0) return "";
  return "&nbsp;".repeat((depth - 1) * 4) + "└&nbsp;";
}

function formatRowName(row: FlattenedRow): string {
  const indent = indentSpaces(row.depth);
  let name = escapeHtml(row.name);
  if (row.category) name = `${escapeHtml(row.category)} [${name}]`;
  if (row.origin) name = `${name} [${escapeHtml(row.origin)}]`;
  return `${indent}${name}`;
}

export async function exportMfReportPdf(
  versionId: number,
  tenantId: number,
): Promise<{ filename: string; base64: string }> {
  const data = await flattenBomTree(versionId, tenantId);

  const tableRows = data.rows
    .map((r) => {
      const isMixed = r.type === "MIXED" && r.depth === 0;
      const cls = `depth-${r.depth} ${isMixed ? "row-mixed" : ""}`;
      return `
        <tr class="${cls}">
          <td class="num">${r.lineNo}</td>
          <td class="name">${formatRowName(r)}</td>
          <td class="origin">${r.origin ? `[${escapeHtml(r.origin)}]` : ""}</td>
          <td class="ratio">${r.ratio !== null ? r.ratio.toFixed(2) + "%" : ""}</td>
        </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>품목제조보고서</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body {
      font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans CJK KR', sans-serif;
      font-size: 11px;
      color: #1a1a1a;
      margin: 0;
    }
    h1 {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      margin: 0 0 16px 0;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .meta-table td {
      padding: 6px 10px;
      border: 1px solid #999;
      font-size: 11px;
    }
    .meta-table .label {
      background: #f0f0f0;
      font-weight: 600;
      width: 22%;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      margin: 18px 0 8px 0;
    }
    .bom-table {
      width: 100%;
      border-collapse: collapse;
    }
    .bom-table th, .bom-table td {
      border: 1px solid #999;
      padding: 5px 8px;
      font-size: 11px;
    }
    .bom-table th {
      background: #e8e8e8;
      font-weight: 700;
      text-align: center;
    }
    .bom-table .num {
      text-align: center;
      width: 8%;
      color: #666;
    }
    .bom-table .name {
      width: 60%;
    }
    .bom-table .origin {
      text-align: center;
      width: 14%;
      color: #555;
      font-size: 10px;
    }
    .bom-table .ratio {
      text-align: right;
      width: 18%;
      font-weight: 500;
    }
    .bom-table .depth-1 { background: #fafafa; }
    .bom-table .depth-2 { background: #f0f0f0; }
    .bom-table .depth-3 { background: #e8e8e8; }
    .bom-table .row-mixed .name { font-weight: 700; }
    .total-row {
      font-weight: 700;
      background: #f0f0f0;
    }
    .total-row td {
      border-top: 2px solid #333 !important;
    }
    .footer {
      margin-top: 24px;
      font-size: 9px;
      color: #888;
      text-align: right;
    }
  </style>
</head>
<body>
  <h1>식품 · 식품첨가물 품목제조보고서</h1>

  <table class="meta-table">
    <tr>
      <td class="label">품목제조보고번호</td>
      <td>${escapeHtml(data.reportNo) || "-"}</td>
      <td class="label">버전</td>
      <td>${data.versionNo !== null ? `v${data.versionNo}` : "-"}</td>
    </tr>
    <tr>
      <td class="label">제품명</td>
      <td colspan="3">${escapeHtml(data.productName) || "-"}</td>
    </tr>
  </table>

  <div class="section-title">1. 원재료명 또는 성분명 및 배합비율</div>

  <table class="bom-table">
    <thead>
      <tr>
        <th class="num">번호</th>
        <th class="name">원재료명 또는 성분명</th>
        <th class="origin">원산지</th>
        <th class="ratio">배합비율(%)</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      <tr class="total-row">
        <td colspan="3" style="text-align: right;">합계 (직접 사용 항목)</td>
        <td class="ratio">${data.totalRatio.toFixed(2)}%</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">생성: ${new Date().toLocaleString("ko-KR")} · Millio AI</div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "18mm", bottom: "18mm", left: "18mm" },
    });
    const base64 = Buffer.from(pdfBuffer).toString("base64");
    const safeName = (data.productName ?? "보고서").replace(/[^가-힣A-Za-z0-9]/g, "_");
    return {
      filename: `품목제조보고_${safeName}_v${data.versionNo ?? "1"}.pdf`,
      base64,
    };
  } finally {
    await browser.close();
  }
}
