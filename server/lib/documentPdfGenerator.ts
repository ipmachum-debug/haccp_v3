/**
 * 승인 문서 PDF 생성기
 * jsPDF + jspdf-autotable 기반
 *
 * document_instances의 document_data JSON을 파싱하여
 * 생산일지, CCP 기록지 등을 PDF로 변환
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

function formatDate(value: string | Date | null): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString("ko-KR");
}

function addHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, doc.internal.pageSize.width / 2, 20, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(subtitle, doc.internal.pageSize.width / 2, 28, { align: "center" });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(7);
  doc.text(
    `HACCP-ONE | Generated: ${new Date().toLocaleDateString("ko-KR")} ${new Date().toLocaleTimeString("ko-KR")}`,
    doc.internal.pageSize.width / 2, 33,
    { align: "center" }
  );
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} / ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }
}

interface DocumentRecord {
  id: number;
  document_type_code: string;
  document_type_name: string;
  work_date: string | Date;
  status: string;
  document_data: string | Record<string, unknown>;
  batch_id?: number;
  product_id?: number;
  created_by?: number;
  approved_at?: string | Date;
  approver_id?: number;
}

/**
 * 개별 문서 PDF 생성
 * @returns base64 인코딩된 PDF 데이터
 */
export function generateDocumentPDF(doc: DocumentRecord): string {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let docData: Record<string, unknown> = {};
  try {
    docData = typeof doc.document_data === "string"
      ? JSON.parse(doc.document_data)
      : (doc.document_data || {});
  } catch { /* empty */ }

  const typeName = doc.document_type_name || doc.document_type_code || "문서";
  const workDate = formatDate(doc.work_date);

  addHeader(pdf, typeName, `작업일: ${workDate} | 문서 ID: ${doc.id}`);

  let startY = 42;

  // 문서 기본 정보 테이블
  const infoRows: string[][] = [
    ["문서 유형", typeName],
    ["작업일", workDate],
    ["상태", doc.status === "approved" ? "승인완료" : doc.status],
    ["승인일", formatDate(doc.approved_at || null)],
  ];

  if (docData.batchCode) infoRows.push(["배치코드", String(docData.batchCode)]);
  if (docData.productName) infoRows.push(["제품명", String(docData.productName)]);
  if (docData.lotNumber) infoRows.push(["LOT 번호", String(docData.lotNumber)]);
  if (docData.plannedQuantity) infoRows.push(["계획수량", formatCurrency(Number(docData.plannedQuantity))]);
  if (docData.actualQuantity) infoRows.push(["실제수량", formatCurrency(Number(docData.actualQuantity))]);

  autoTable(pdf, {
    startY,
    head: [["항목", "내용"]],
    body: infoRows,
    theme: "grid",
    headStyles: { fillColor: [41, 128, 185], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold" },
      1: { cellWidth: 130 },
    },
  });

  startY = (pdf as any).lastAutoTable?.finalY + 10 || startY + 60;

  // document_data의 나머지 필드를 키-값 테이블로 출력
  const skipKeys = new Set(["batchCode", "productName", "lotNumber", "plannedQuantity", "actualQuantity",
    "batchId", "productCode", "autoApprovedBy", "autoApprovedAt", "completedAt", "expiryDate"]);

  const extraRows: string[][] = [];
  for (const [key, value] of Object.entries(docData)) {
    if (skipKeys.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue; // skip nested objects
    extraRows.push([key, String(value)]);
  }

  if (extraRows.length > 0) {
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text("상세 데이터", 14, startY);
    startY += 5;

    autoTable(pdf, {
      startY,
      head: [["필드", "값"]],
      body: extraRows,
      theme: "striped",
      headStyles: { fillColor: [52, 73, 94], fontSize: 8 },
      bodyStyles: { fontSize: 7 },
    });
  }

  // 서명란
  const signY = (pdf as any).lastAutoTable?.finalY + 20 || startY + 40;
  if (signY < pdf.internal.pageSize.height - 40) {
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");

    const signBoxWidth = 50;
    const signBoxStart = pdf.internal.pageSize.width - 14 - signBoxWidth * 3 - 20;

    ["작성자", "검토자", "승인자"].forEach((label, i) => {
      const x = signBoxStart + i * (signBoxWidth + 10);
      pdf.rect(x, signY, signBoxWidth, 20);
      pdf.text(label, x + signBoxWidth / 2, signY + 5, { align: "center" });
      pdf.line(x + 5, signY + 15, x + signBoxWidth - 5, signY + 15);
    });
  }

  addFooter(pdf);

  return Buffer.from(pdf.output("arraybuffer")).toString("base64");
}

/**
 * 일괄 출력 PDF 생성 (여러 문서를 하나의 PDF로 합침)
 * @returns base64 인코딩된 PDF 데이터
 */
export function generateBatchPrintPDF(documents: DocumentRecord[], groupName: string): string {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  addHeader(pdf, `일괄 출력: ${groupName}`, `${documents.length}건 | ${new Date().toLocaleDateString("ko-KR")}`);

  // 목차
  let y = 42;
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.text("목차", 14, y);
  y += 6;

  const tocRows = documents.map((doc, i) => [
    String(i + 1),
    doc.document_type_name || doc.document_type_code,
    formatDate(doc.work_date),
    doc.status === "approved" ? "승인완료" : doc.status,
  ]);

  autoTable(pdf, {
    startY: y,
    head: [["#", "문서유형", "작업일", "상태"]],
    body: tocRows,
    theme: "grid",
    headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
  });

  // 각 문서를 별도 페이지로
  for (const doc of documents) {
    pdf.addPage();

    let docData: Record<string, unknown> = {};
    try {
      docData = typeof doc.document_data === "string"
        ? JSON.parse(doc.document_data)
        : (doc.document_data || {});
    } catch { /* empty */ }

    const typeName = doc.document_type_name || doc.document_type_code;
    addHeader(pdf, typeName, `작업일: ${formatDate(doc.work_date)} | ID: ${doc.id}`);

    const infoRows: string[][] = [
      ["문서 유형", typeName],
      ["작업일", formatDate(doc.work_date)],
      ["상태", doc.status === "approved" ? "승인완료" : doc.status],
    ];

    if (docData.batchCode) infoRows.push(["배치코드", String(docData.batchCode)]);
    if (docData.productName) infoRows.push(["제품명", String(docData.productName)]);
    if (docData.actualQuantity) infoRows.push(["실제수량", formatCurrency(Number(docData.actualQuantity))]);
    if (docData.lotNumber) infoRows.push(["LOT 번호", String(docData.lotNumber)]);

    autoTable(pdf, {
      startY: 42,
      head: [["항목", "내용"]],
      body: infoRows,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 40, fontStyle: "bold" } },
    });
  }

  addFooter(pdf);
  return Buffer.from(pdf.output("arraybuffer")).toString("base64");
}
