import puppeteer from "puppeteer";
import { storagePut } from "../storage";

export interface CcpPdfData {
  period: string;
  records: Array<{
    date: string;
    time: string;
    ccpType: string;
    temperature?: number;
    pressure?: number;
    time_duration?: number;
    result: string;
    inspector: string;
    notes?: string;
  }>;
}

export async function generateCcpMonitoringPdf(data: CcpPdfData): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    body {
      font-family: 'Malgun Gothic', sans-serif;
      font-size: 12px;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
    }
    .header h1 {
      font-size: 24px;
      margin: 0 0 10px 0;
    }
    .header .period {
      font-size: 14px;
      color: #666;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      border: 1px solid #000;
      padding: 8px;
      text-align: center;
    }
    th {
      background-color: #f0f0f0;
      font-weight: bold;
    }
    .footer {
      margin-top: 50px;
      text-align: right;
    }
    .signature {
      display: inline-block;
      margin-left: 50px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>CCP 모니터링 기록서</h1>
    <div class="period">${data.period}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>날짜</th>
        <th>시간</th>
        <th>CCP 유형</th>
        <th>온도(℃)</th>
        <th>압력(kPa)</th>
        <th>시간(분)</th>
        <th>결과</th>
        <th>점검자</th>
        <th>비고</th>
      </tr>
    </thead>
    <tbody>
      ${data.records
        .map(
          (record) => `
        <tr>
          <td>${record.date}</td>
          <td>${record.time}</td>
          <td>${record.ccpType}</td>
          <td>${record.temperature ?? "-"}</td>
          <td>${record.pressure ?? "-"}</td>
          <td>${record.time_duration ?? "-"}</td>
          <td>${record.result}</td>
          <td>${record.inspector}</td>
          <td>${record.notes || "-"}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <div class="footer">
    <div class="signature">
      <p>작성자: __________________ (인)</p>
      <p>검토자: __________________ (인)</p>
      <p>승인자: __________________ (인)</p>
    </div>
  </div>
</body>
</html>
    `;

    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

export interface PDFGenerationOptions {
  html: string;
  filename: string;
  format?: "A4" | "Letter";
  landscape?: boolean;
  tenantId?: number;
}

/**
 * HTML을 PDF로 변환하고 S3에 업로드
 * @param options PDF 생성 옵션
 * @returns S3 URL
 */
export async function generatePDF(
  options: PDFGenerationOptions
): Promise<{ url: string; key: string }> {
  const { html, filename, format = "A4", landscape = false } = options;

  let browser;
  try {
    // Puppeteer 브라우저 시작
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // HTML 콘텐츠 설정
    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    // PDF 생성
    const pdfBuffer = await page.pdf({
      format,
      landscape,
      printBackground: true,
      margin: {
        top: "20mm",
        right: "15mm",
        bottom: "20mm",
        left: "15mm",
      },
    });

    // S3에 업로드
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const tenantPrefix = options.tenantId ? `tenant-${options.tenantId}/` : "";
    const fileKey = `${tenantPrefix}reports/${filename}-${timestamp}-${randomSuffix}.pdf`;

    const result = await storagePut(fileKey, pdfBuffer, "application/pdf");

    return result;
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw new Error(`PDF 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 월 마감 리포트 HTML 템플릿 생성
 */
export function generateMonthlyReportHTML(data: {
  year: number;
  month: number;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  highAmountTransactions: Array<{
    date: string;
    description: string;
    amount: number;
    type: string;
  }>;
  missingDates: string[];
}): string {
  const { year, month, totalIncome, totalExpense, netCashFlow, highAmountTransactions, missingDates } = data;

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>월간 마감 리포트 - ${year}년 ${month}월</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #333;
      padding: 20px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
    }
    
    .header h1 {
      font-size: 24px;
      color: #1e40af;
      margin-bottom: 10px;
    }
    
    .header .period {
      font-size: 16px;
      color: #64748b;
    }
    
    .summary {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    
    .summary h2 {
      font-size: 18px;
      color: #1e40af;
      margin-bottom: 15px;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 5px;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 15px;
    }
    
    .summary-item {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 15px;
    }
    
    .summary-item .label {
      font-size: 13px;
      color: #64748b;
      margin-bottom: 8px;
    }
    
    .summary-item .value {
      font-size: 20px;
      font-weight: bold;
    }
    
    .summary-item.income .value {
      color: #10b981;
    }
    
    .summary-item.expense .value {
      color: #ef4444;
    }
    
    .summary-item.net .value {
      color: #3b82f6;
    }
    
    .section {
      margin-bottom: 30px;
    }
    
    .section h2 {
      font-size: 18px;
      color: #1e40af;
      margin-bottom: 15px;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 5px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }
    
    thead {
      background: #f1f5f9;
    }
    
    th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #475569;
      border-bottom: 2px solid #cbd5e1;
    }
    
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    tr:hover {
      background: #f8fafc;
    }
    
    .amount {
      text-align: right;
      font-weight: 600;
    }
    
    .amount.positive {
      color: #10b981;
    }
    
    .amount.negative {
      color: #ef4444;
    }
    
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    
    .badge.income {
      background: #d1fae5;
      color: #065f46;
    }
    
    .badge.expense {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .alert {
      background: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 20px;
    }
    
    .alert h3 {
      font-size: 14px;
      color: #92400e;
      margin-bottom: 8px;
    }
    
    .alert ul {
      list-style: none;
      padding-left: 0;
    }
    
    .alert li {
      color: #78350f;
      margin-bottom: 5px;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #64748b;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>월간 마감 리포트</h1>
    <div class="period">${year}년 ${month}월</div>
  </div>

  <div class="summary">
    <h2>📊 월간 집계</h2>
    <div class="summary-grid">
      <div class="summary-item income">
        <div class="label">총 입금</div>
        <div class="value">₩${totalIncome.toLocaleString()}</div>
      </div>
      <div class="summary-item expense">
        <div class="label">총 출금</div>
        <div class="value">₩${totalExpense.toLocaleString()}</div>
      </div>
      <div class="summary-item net">
        <div class="label">순현금흐름</div>
        <div class="value">₩${netCashFlow.toLocaleString()}</div>
      </div>
    </div>
  </div>

  ${missingDates.length > 0 ? `
  <div class="alert">
    <h3>⚠️ 마감 누락일</h3>
    <ul>
      ${missingDates.map(date => `<li>• ${date}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  ${highAmountTransactions.length > 0 ? `
  <div class="section">
    <h2>💰 고액 거래 내역</h2>
    <table>
      <thead>
        <tr>
          <th>날짜</th>
          <th>내용</th>
          <th>구분</th>
          <th class="amount">금액</th>
        </tr>
      </thead>
      <tbody>
        ${highAmountTransactions.map(tx => `
          <tr>
            <td>${tx.date}</td>
            <td>${tx.description}</td>
            <td>
              <span class="badge ${tx.type === 'income' ? 'income' : 'expense'}">
                ${tx.type === 'income' ? '입금' : '출금'}
              </span>
            </td>
            <td class="amount ${tx.type === 'income' ? 'positive' : 'negative'}">
              ${tx.type === 'income' ? '+' : '-'}₩${Math.abs(tx.amount).toLocaleString()}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    <p>본 리포트는 HACCP 시스템에서 자동 생성되었습니다.</p>
    <p>생성일시: ${new Date().toLocaleString('ko-KR')}</p>
  </div>
</body>
</html>
  `.trim();
}
