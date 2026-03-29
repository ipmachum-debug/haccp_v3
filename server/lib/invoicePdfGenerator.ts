/**
 * 청구서 PDF 생성기
 * jsPDF 기반 — 테넌트별 월 청구서 발행
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  // 공급자
  supplierName: string;
  supplierBizNo: string;
  supplierAddress: string;
  supplierRepresentative: string;
  // 공급받는 자
  customerName: string;
  customerBizNo: string;
  customerAddress: string;
  customerRepresentative: string;
  // 품목
  items: Array<{
    name: string;
    period: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  // 합계
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

/**
 * 청구서 PDF 생성
 * @returns base64 인코딩된 PDF
 */
export function generateInvoicePDF(data: InvoiceData): string {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // 헤더
  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  pdf.text("청 구 서", pdf.internal.pageSize.width / 2, 25, { align: "center" });

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(`No. ${data.invoiceNumber}`, pdf.internal.pageSize.width - 20, 25, { align: "right" });

  // 발행일/납부기한
  pdf.setFontSize(9);
  pdf.text(`발행일: ${data.issueDate}`, 20, 35);
  pdf.text(`납부기한: ${data.dueDate}`, pdf.internal.pageSize.width - 20, 35, { align: "right" });

  // 공급자/공급받는자 정보
  autoTable(pdf, {
    startY: 42,
    head: [["", "공급자", "공급받는 자"]],
    body: [
      ["상호", data.supplierName, data.customerName],
      ["사업자번호", data.supplierBizNo, data.customerBizNo],
      ["대표자", data.supplierRepresentative, data.customerRepresentative],
      ["주소", data.supplierAddress, data.customerAddress],
    ],
    theme: "grid",
    headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 25, fontStyle: "bold" } },
  });

  let startY = (pdf as any).lastAutoTable?.finalY + 10 || 100;

  // 품목 테이블
  autoTable(pdf, {
    startY,
    head: [["품목명", "이용기간", "수량", "단가", "공급가액"]],
    body: data.items.map(item => [
      item.name,
      item.period,
      String(item.quantity),
      formatCurrency(item.unitPrice) + "원",
      formatCurrency(item.amount) + "원",
    ]),
    theme: "grid",
    headStyles: { fillColor: [52, 73, 94], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 50 },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  startY = (pdf as any).lastAutoTable?.finalY + 5 || startY + 40;

  // 합계
  autoTable(pdf, {
    startY,
    body: [
      ["공급가액", formatCurrency(data.supplyAmount) + "원"],
      ["부가세 (10%)", formatCurrency(data.taxAmount) + "원"],
      ["합계 (VAT 포함)", formatCurrency(data.totalAmount) + "원"],
    ],
    theme: "plain",
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold" },
      1: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: pdf.internal.pageSize.width - 80 },
  });

  startY = (pdf as any).lastAutoTable?.finalY + 15 || startY + 30;

  // 입금 안내
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.text("입금 안내", 20, startY);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("은행: 기업은행", 20, startY + 6);
  pdf.text("계좌번호: 000-000000-00-000", 20, startY + 11);
  pdf.text("예금주: 골든터틀컴퍼니", 20, startY + 16);

  // 하단
  pdf.setFontSize(7);
  pdf.setTextColor(150, 150, 150);
  pdf.text(
    "HACCP-ONE | www.goldenturtle.co.kr | 본 청구서는 전자적으로 발행되었습니다.",
    pdf.internal.pageSize.width / 2,
    pdf.internal.pageSize.height - 15,
    { align: "center" }
  );

  return Buffer.from(pdf.output("arraybuffer")).toString("base64");
}

/**
 * 테넌트 청구서 데이터 생성 헬퍼
 */
export function buildInvoiceData(params: {
  tenantName: string;
  tenantBizNo: string;
  tenantAddress: string;
  tenantRepresentative: string;
  planName: string;
  monthlyPrice: number;
  billingMonth: string; // "2026-03"
}): InvoiceData {
  const taxAmount = Math.round(params.monthlyPrice * 0.1);
  const ym = params.billingMonth.split("-");
  const year = ym[0];
  const month = ym[1];
  const lastDay = new Date(Number(year), Number(month), 0).getDate();

  return {
    invoiceNumber: `INV-${params.billingMonth.replace("-", "")}-${Date.now().toString(36).toUpperCase()}`,
    issueDate: `${year}.${month}.01`,
    dueDate: `${year}.${month}.${lastDay}`,
    supplierName: "골든터틀컴퍼니",
    supplierBizNo: "000-00-00000",
    supplierAddress: "서울특별시",
    supplierRepresentative: "대표자",
    customerName: params.tenantName,
    customerBizNo: params.tenantBizNo || "-",
    customerAddress: params.tenantAddress || "-",
    customerRepresentative: params.tenantRepresentative || "-",
    items: [{
      name: `HACCP-ONE ${params.planName} 플랜 월 이용료`,
      period: `${year}.${month}.01 ~ ${year}.${month}.${lastDay}`,
      quantity: 1,
      unitPrice: params.monthlyPrice,
      amount: params.monthlyPrice,
    }],
    supplyAmount: params.monthlyPrice,
    taxAmount,
    totalAmount: params.monthlyPrice + taxAmount,
  };
}
