/**
 * 재무보고서 PDF 내보내기 (P6)
 * jsPDF + jspdf-autotable을 사용하여 시산표, 재무상태표, 손익계산서를 PDF로 생성
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  TrialBalanceResult,
  BalanceSheetResult,
  IncomeStatementResult,
} from "./financialReports";

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

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, doc.internal.pageSize.width / 2, 20, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(subtitle, doc.internal.pageSize.width / 2, 28, { align: "center" });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(8);
  doc.text(
    `Millio AI | ${new Date().toLocaleDateString("ko-KR")} generated`,
    doc.internal.pageSize.width / 2, 34,
    { align: "center" }
  );
}

// ============================================
// 시산표 PDF
// ============================================

export async function exportTrialBalanceToPdf(data: TrialBalanceResult): Promise<Buffer> {
  const doc = new jsPDF({ orientation: "landscape" });

  addHeader(
    doc,
    "Trial Balance",
    `Period: ${data.period.startDate} ~ ${data.period.endDate}`
  );

  const body: any[][] = [];

  // 카테고리별 그룹핑
  const categories = ["assets", "liabilities", "equity", "revenue", "expenses"];
  for (const cat of categories) {
    const rows = data.rows.filter(r => r.category === cat);
    if (rows.length === 0) continue;

    body.push([{
      content: CATEGORY_LABELS[cat] || cat,
      colSpan: 6,
      styles: { fillColor: [214, 228, 240], fontStyle: "bold", fontSize: 9 },
    }]);

    for (const row of rows) {
      body.push([
        row.accountCode,
        row.accountName,
        formatCurrency(row.debitTotal),
        formatCurrency(row.creditTotal),
        formatCurrency(row.debitBalance),
        formatCurrency(row.creditBalance),
      ]);
    }
  }

  // 합계 행
  body.push([{
    content: "Total",
    colSpan: 2,
    styles: { fillColor: [255, 242, 204], fontStyle: "bold" },
  },
    { content: formatCurrency(data.totals.totalDebit), styles: { fillColor: [255, 242, 204], fontStyle: "bold" } },
    { content: formatCurrency(data.totals.totalCredit), styles: { fillColor: [255, 242, 204], fontStyle: "bold" } },
    { content: formatCurrency(data.totals.totalDebitBalance), styles: { fillColor: [255, 242, 204], fontStyle: "bold" } },
    { content: formatCurrency(data.totals.totalCreditBalance), styles: { fillColor: [255, 242, 204], fontStyle: "bold" } },
  ]);

  autoTable(doc, {
    startY: 40,
    head: [["Code", "Account", "Debit Total", "Credit Total", "Debit Balance", "Credit Balance"]],
    body,
    headStyles: { fillColor: [31, 78, 121], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 25 },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });

  return Buffer.from(doc.output("arraybuffer"));
}

// ============================================
// 재무상태표 PDF
// ============================================

export async function exportBalanceSheetToPdf(data: BalanceSheetResult): Promise<Buffer> {
  const doc = new jsPDF();

  addHeader(doc, "Balance Sheet", `As of: ${data.asOfDate}`);

  const sections: { title: string; rows: typeof data.assets; total: number }[] = [
    { title: "Assets", rows: data.assets, total: data.totals.totalAssets },
    { title: "Liabilities", rows: data.liabilities, total: data.totals.totalLiabilities },
    { title: "Equity", rows: data.equity, total: data.totals.totalEquity },
  ];

  const body: any[][] = [];

  for (const section of sections) {
    body.push([{
      content: section.title,
      colSpan: 3,
      styles: { fillColor: [214, 228, 240], fontStyle: "bold", fontSize: 10 },
    }]);

    for (const row of section.rows) {
      const balance = section.title === "Assets" ? row.debitBalance : row.creditBalance;
      body.push([row.accountCode, row.accountName, formatCurrency(balance)]);
    }

    body.push([
      { content: "", styles: {} },
      { content: `${section.title} Total`, styles: { fontStyle: "bold", fillColor: [255, 242, 204] } },
      { content: formatCurrency(section.total), styles: { fontStyle: "bold", fillColor: [255, 242, 204], halign: "right" } },
    ]);
  }

  // 등식 체크
  const balanceOk = data.totals.balanceCheck;
  body.push([{
    content: `Assets = Liabilities + Equity : ${balanceOk ? "BALANCED" : "UNBALANCED"}`,
    colSpan: 3,
    styles: {
      fillColor: balanceOk ? [198, 239, 206] : [255, 199, 206],
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
    },
  }]);

  autoTable(doc, {
    startY: 40,
    head: [["Code", "Account", "Amount"]],
    body,
    headStyles: { fillColor: [31, 78, 121], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 25 },
      2: { halign: "right", cellWidth: 40 },
    },
  });

  return Buffer.from(doc.output("arraybuffer"));
}

// ============================================
// 손익계산서 PDF
// ============================================

export async function exportIncomeStatementToPdf(data: IncomeStatementResult): Promise<Buffer> {
  const doc = new jsPDF();

  addHeader(
    doc,
    "Income Statement",
    `Period: ${data.period.startDate} ~ ${data.period.endDate}`
  );

  const body: any[][] = [];

  // 수익
  body.push([{
    content: "Revenue",
    colSpan: 3,
    styles: { fillColor: [214, 228, 240], fontStyle: "bold", fontSize: 10 },
  }]);
  for (const row of data.revenue) {
    body.push([row.accountCode, row.accountName, formatCurrency(row.creditBalance)]);
  }
  body.push([
    { content: "", styles: {} },
    { content: "Total Revenue", styles: { fontStyle: "bold", fillColor: [198, 239, 206] } },
    { content: formatCurrency(data.totals.totalRevenue), styles: { fontStyle: "bold", fillColor: [198, 239, 206], halign: "right" } },
  ]);

  // 비용
  body.push([{
    content: "Expenses",
    colSpan: 3,
    styles: { fillColor: [214, 228, 240], fontStyle: "bold", fontSize: 10 },
  }]);
  for (const row of data.expenses) {
    body.push([row.accountCode, row.accountName, formatCurrency(row.debitBalance)]);
  }
  body.push([
    { content: "", styles: {} },
    { content: "Total Expenses", styles: { fontStyle: "bold", fillColor: [255, 199, 206] } },
    { content: formatCurrency(data.totals.totalExpenses), styles: { fontStyle: "bold", fillColor: [255, 199, 206], halign: "right" } },
  ]);

  // 당기순이익
  const netIncome = data.totals.netIncome;
  body.push([{
    content: `Net Income: ${formatCurrency(netIncome)}`,
    colSpan: 3,
    styles: {
      fillColor: netIncome >= 0 ? [198, 239, 206] : [255, 199, 206],
      fontStyle: "bold",
      fontSize: 11,
      halign: "center",
    },
  }]);

  autoTable(doc, {
    startY: 40,
    head: [["Code", "Account", "Amount"]],
    body,
    headStyles: { fillColor: [31, 78, 121], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 25 },
      2: { halign: "right", cellWidth: 40 },
    },
  });

  return Buffer.from(doc.output("arraybuffer"));
}
