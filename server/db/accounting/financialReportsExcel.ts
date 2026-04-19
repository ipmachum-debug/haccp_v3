/**
 * 재무보고서 Excel 내보내기 (P4-3)
 * ExcelJS를 사용하여 시산표, 재무상태표, 손익계산서를 Excel로 생성
 */
import ExcelJS from "exceljs";
import type {
  TrialBalanceResult,
  BalanceSheetResult,
  IncomeStatementResult,
  TrialBalanceRow,
} from "./financialReports";

// ============================================
// 공통 스타일 유틸
// ============================================

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E79" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};

const SUB_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD6E4F0" },
};

const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2CC" },
};

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

function applyHeaderStyle(row: ExcelJS.Row) {
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
  row.border = BORDER_THIN;
  row.alignment = { horizontal: "center", vertical: "middle" };
  row.height = 24;
}

function applyTotalStyle(row: ExcelJS.Row) {
  row.font = { bold: true, size: 11 };
  row.fill = TOTAL_FILL;
  row.border = BORDER_THIN;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

const CATEGORY_LABELS: Record<string, string> = {
  assets: "자산",
  liabilities: "부채",
  equity: "자본",
  revenue: "수익",
  expenses: "비용",
};

// ============================================
// 시산표 (Trial Balance) Excel
// ============================================

export async function exportTrialBalanceToExcel(data: TrialBalanceResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Millio AI";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("시산표");

  // 타이틀
  ws.mergeCells("A1:F1");
  const titleRow = ws.getRow(1);
  titleRow.getCell(1).value = "시 산 표 (Trial Balance)";
  titleRow.getCell(1).font = { bold: true, size: 16 };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 30;

  // 기간
  ws.mergeCells("A2:F2");
  const periodRow = ws.getRow(2);
  periodRow.getCell(1).value = `기간: ${data.period.startDate} ~ ${data.period.endDate}`;
  periodRow.getCell(1).alignment = { horizontal: "center" };
  periodRow.getCell(1).font = { size: 11, color: { argb: "FF666666" } };

  // 헤더
  ws.columns = [
    { key: "code", width: 12 },
    { key: "name", width: 30 },
    { key: "category", width: 10 },
    { key: "debitTotal", width: 18 },
    { key: "creditTotal", width: 18 },
    { key: "balance", width: 18 },
  ];

  const headerRow = ws.addRow(["계정코드", "계정명", "분류", "차변 합계", "대변 합계", "잔액"]);
  applyHeaderStyle(headerRow);

  // 데이터
  for (const row of data.rows) {
    const balance = row.debitBalance > 0 ? row.debitBalance : -row.creditBalance;
    const dataRow = ws.addRow([
      row.accountCode,
      row.accountName,
      CATEGORY_LABELS[row.category] || row.category,
      formatCurrency(row.debitTotal),
      formatCurrency(row.creditTotal),
      formatCurrency(balance),
    ]);
    dataRow.border = BORDER_THIN;
    // 숫자 우측 정렬
    dataRow.getCell(4).alignment = { horizontal: "right" };
    dataRow.getCell(5).alignment = { horizontal: "right" };
    dataRow.getCell(6).alignment = { horizontal: "right" };
  }

  // 합계
  const totalRow = ws.addRow([
    "",
    "합  계",
    "",
    formatCurrency(data.totals.totalDebit),
    formatCurrency(data.totals.totalCredit),
    formatCurrency(data.totals.totalDebitBalance - data.totals.totalCreditBalance),
  ]);
  applyTotalStyle(totalRow);
  totalRow.getCell(4).alignment = { horizontal: "right" };
  totalRow.getCell(5).alignment = { horizontal: "right" };
  totalRow.getCell(6).alignment = { horizontal: "right" };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ============================================
// 재무상태표 (Balance Sheet) Excel
// ============================================

export async function exportBalanceSheetToExcel(data: BalanceSheetResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Millio AI";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("재무상태표");

  // 타이틀
  ws.mergeCells("A1:D1");
  const titleRow = ws.getRow(1);
  titleRow.getCell(1).value = "재 무 상 태 표 (Balance Sheet)";
  titleRow.getCell(1).font = { bold: true, size: 16 };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 30;

  ws.mergeCells("A2:D2");
  const periodRow = ws.getRow(2);
  periodRow.getCell(1).value = `기준일: ${data.asOfDate}`;
  periodRow.getCell(1).alignment = { horizontal: "center" };
  periodRow.getCell(1).font = { size: 11, color: { argb: "FF666666" } };

  ws.columns = [
    { key: "code", width: 12 },
    { key: "name", width: 30 },
    { key: "debit", width: 18 },
    { key: "credit", width: 18 },
  ];

  const addSection = (title: string, rows: TrialBalanceRow[], isDebitBalance: boolean) => {
    const subRow = ws.addRow([title, "", "", ""]);
    subRow.font = { bold: true, size: 12 };
    subRow.fill = SUB_HEADER_FILL;
    subRow.border = BORDER_THIN;

    let sectionTotal = 0;
    for (const row of rows) {
      const amount = isDebitBalance
        ? (row.debitTotal - row.creditTotal)
        : (row.creditTotal - row.debitTotal);
      sectionTotal += amount;
      const dataRow = ws.addRow([
        row.accountCode,
        row.accountName,
        "",
        formatCurrency(amount),
      ]);
      dataRow.border = BORDER_THIN;
      dataRow.getCell(4).alignment = { horizontal: "right" };
    }
    return sectionTotal;
  };

  // 헤더
  const headerRow = ws.addRow(["계정코드", "계정명", "", "금액"]);
  applyHeaderStyle(headerRow);

  // 자산
  addSection("【 자 산 】", data.assets, true);
  const assetTotal = ws.addRow(["", "자산 합계", "", formatCurrency(data.totals.totalAssets)]);
  applyTotalStyle(assetTotal);
  assetTotal.getCell(4).alignment = { horizontal: "right" };

  ws.addRow([]);

  // 부채
  addSection("【 부 채 】", data.liabilities, false);
  const liabTotal = ws.addRow(["", "부채 합계", "", formatCurrency(data.totals.totalLiabilities)]);
  applyTotalStyle(liabTotal);
  liabTotal.getCell(4).alignment = { horizontal: "right" };

  ws.addRow([]);

  // 자본
  addSection("【 자 본 】", data.equity, false);
  const eqTotal = ws.addRow(["", "자본 합계", "", formatCurrency(data.totals.totalEquity)]);
  applyTotalStyle(eqTotal);
  eqTotal.getCell(4).alignment = { horizontal: "right" };

  ws.addRow([]);

  // 대차 균형 확인
  const balRow = ws.addRow([
    "",
    "부채 + 자본 합계",
    "",
    formatCurrency(data.totals.totalLiabilities + data.totals.totalEquity),
  ]);
  balRow.font = { bold: true, size: 12, color: { argb: data.totals.balanceCheck ? "FF006600" : "FFCC0000" } };
  balRow.border = BORDER_THIN;
  balRow.getCell(4).alignment = { horizontal: "right" };

  const checkRow = ws.addRow([
    "",
    data.totals.balanceCheck ? "✓ 대차 균형 일치" : "✗ 대차 균형 불일치",
    "",
    "",
  ]);
  checkRow.font = { bold: true, color: { argb: data.totals.balanceCheck ? "FF006600" : "FFCC0000" } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ============================================
// 손익계산서 (Income Statement) Excel
// ============================================

export async function exportIncomeStatementToExcel(data: IncomeStatementResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Millio AI";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("손익계산서");

  // 타이틀
  ws.mergeCells("A1:D1");
  const titleRow = ws.getRow(1);
  titleRow.getCell(1).value = "손 익 계 산 서 (Income Statement)";
  titleRow.getCell(1).font = { bold: true, size: 16 };
  titleRow.getCell(1).alignment = { horizontal: "center" };
  titleRow.height = 30;

  ws.mergeCells("A2:D2");
  const periodRow = ws.getRow(2);
  periodRow.getCell(1).value = `기간: ${data.period.startDate} ~ ${data.period.endDate}`;
  periodRow.getCell(1).alignment = { horizontal: "center" };
  periodRow.getCell(1).font = { size: 11, color: { argb: "FF666666" } };

  ws.columns = [
    { key: "code", width: 12 },
    { key: "name", width: 30 },
    { key: "amount", width: 18 },
    { key: "subtotal", width: 18 },
  ];

  // 헤더
  const headerRow = ws.addRow(["계정코드", "계정명", "금액", "소계"]);
  applyHeaderStyle(headerRow);

  // 수익
  const revSubRow = ws.addRow(["Ⅰ.", "매출 및 수익", "", ""]);
  revSubRow.font = { bold: true, size: 12 };
  revSubRow.fill = SUB_HEADER_FILL;
  revSubRow.border = BORDER_THIN;

  for (const row of data.revenue) {
    const amount = row.creditTotal - row.debitTotal;
    const dataRow = ws.addRow([row.accountCode, row.accountName, formatCurrency(amount), ""]);
    dataRow.border = BORDER_THIN;
    dataRow.getCell(3).alignment = { horizontal: "right" };
  }
  const revTotal = ws.addRow(["", "수익 합계", "", formatCurrency(data.totals.totalRevenue)]);
  applyTotalStyle(revTotal);
  revTotal.getCell(4).alignment = { horizontal: "right" };

  ws.addRow([]);

  // 비용
  const expSubRow = ws.addRow(["Ⅱ.", "매출원가 및 비용", "", ""]);
  expSubRow.font = { bold: true, size: 12 };
  expSubRow.fill = SUB_HEADER_FILL;
  expSubRow.border = BORDER_THIN;

  for (const row of data.expenses) {
    const amount = row.debitTotal - row.creditTotal;
    const dataRow = ws.addRow([row.accountCode, row.accountName, formatCurrency(amount), ""]);
    dataRow.border = BORDER_THIN;
    dataRow.getCell(3).alignment = { horizontal: "right" };
  }
  const expTotal = ws.addRow(["", "비용 합계", "", formatCurrency(data.totals.totalExpenses)]);
  applyTotalStyle(expTotal);
  expTotal.getCell(4).alignment = { horizontal: "right" };

  ws.addRow([]);

  // 당기순이익
  const netRow = ws.addRow(["Ⅲ.", "당기순이익 (Ⅰ - Ⅱ)", "", formatCurrency(data.totals.netIncome)]);
  netRow.font = { bold: true, size: 13, color: { argb: data.totals.netIncome >= 0 ? "FF006600" : "FFCC0000" } };
  netRow.border = {
    top: { style: "double" },
    left: { style: "thin" },
    bottom: { style: "double" },
    right: { style: "thin" },
  };
  netRow.getCell(4).alignment = { horizontal: "right" };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
