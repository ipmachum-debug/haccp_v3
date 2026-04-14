/**
 * 견적서 (Quotation) PDF 생성 — Phase C (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 발주서 PDF 패턴 재사용 (pdfkit + 한글 폰트)
 * ═══════════════════════════════════════════════════════════════
 */
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export interface QuotationPdfData {
  // 견적 기본 정보
  quotationNumber: string;
  quoteDate: string;
  validUntil?: string | null;
  title?: string | null;

  // 공급자 (우리 회사 - 견적 발행인)
  seller: {
    name: string;
    businessNumber?: string;
    address?: string;
    representative?: string;
    phone?: string;
  };

  // 고객 (수신인)
  customer: {
    name: string;
    businessNumber?: string;
    address?: string;
    representative?: string;
    phone?: string;
  };

  // 품목 라인
  lines: Array<{
    lineNumber: number;
    itemName: string;
    itemCode?: string;
    description?: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    discountRate?: number;
    amount: number;
  }>;

  // 합계
  totalAmount: number;
  taxAmount: number;
  grandTotal: number;

  // 조건/메모
  paymentTerms?: string;
  deliveryTerms?: string;
  notes?: string;
  status?: string;
}

// 한글 폰트 경로 찾기
function findFontPath(fontName: string): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "fonts", fontName),
    path.join(cwd, "..", "fonts", fontName),
    path.join(cwd, "..", "..", "fonts", fontName),
    path.join(cwd, "..", "..", "..", "fonts", fontName),
    `/home/root/haccp_v3/fonts/${fontName}`,
    `/root/haccp_v3/fonts/${fontName}`,
    path.join(__dirname, "..", "..", "fonts", fontName),
    path.join(__dirname, "..", "..", "..", "fonts", fontName),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) { /* ignore */ }
  }
  console.warn(`[Quotation PDF] 한글 폰트 못찾음: ${fontName}`);
  return null;
}

/**
 * 견적서 PDF 생성 함수
 */
export async function generateQuotationPDF(data: QuotationPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // 한글 폰트 등록
      const regularFontPath = findFontPath("NanumGothic-Regular.ttf");
      const boldFontPath = findFontPath("NanumGothic-Bold.ttf");

      if (!regularFontPath || !boldFontPath) {
        return reject(
          new Error(
            `한글 폰트 파일 없음 (NanumGothic-Regular.ttf / NanumGothic-Bold.ttf). ` +
              `서버의 fonts/ 폴더를 확인하세요. cwd=${process.cwd()}`,
          ),
        );
      }

      doc.registerFont("NanumGothic", regularFontPath);
      doc.registerFont("NanumGothicBold", boldFontPath);
      const FONT_REGULAR = "NanumGothic";
      const FONT_BOLD = "NanumGothicBold";

      // ═══ 제목 ═══
      doc.font(FONT_BOLD).fontSize(22).text("견  적  서", { align: "center" });
      doc.moveDown(0.2);

      // 제목 밑줄
      const lineY = doc.y;
      doc.moveTo(180, lineY).lineTo(420, lineY).lineWidth(1.2).stroke();
      doc.moveDown(0.3);

      // 견적서 번호 (중앙)
      doc.font(FONT_REGULAR).fontSize(10).fillColor("#555")
        .text(`견적번호: ${data.quotationNumber}`, { align: "center" });
      doc.fillColor("#000");
      doc.moveDown(0.5);

      // 제목(있으면)
      if (data.title) {
        doc.font(FONT_BOLD).fontSize(13).fillColor("#1f2937")
          .text(data.title, { align: "center" });
        doc.fillColor("#000");
        doc.moveDown(0.5);
      } else {
        doc.moveDown(0.5);
      }

      // ═══ 공급자 / 고객 (2단) ═══
      const leftX = 40;
      const rightX = 320;
      const startY = doc.y;
      const boxWidth = 230;

      // 공급자 (왼쪽)
      doc.font(FONT_BOLD).fontSize(11).text("공 급 자", leftX, startY);
      doc.moveTo(leftX, doc.y + 2).lineTo(leftX + 60, doc.y + 2).lineWidth(0.8).stroke();
      doc.moveDown(0.3);
      doc.font(FONT_REGULAR).fontSize(9);
      doc.text(`상호: ${data.seller.name}`, leftX);
      if (data.seller.businessNumber) {
        doc.text(`사업자번호: ${data.seller.businessNumber}`, leftX);
      }
      if (data.seller.representative) {
        doc.text(`대표자: ${data.seller.representative}`, leftX);
      }
      if (data.seller.address) {
        doc.text(`주소: ${data.seller.address}`, leftX, doc.y, { width: boxWidth });
      }
      if (data.seller.phone) {
        doc.text(`전화: ${data.seller.phone}`, leftX);
      }
      const leftEndY = doc.y;

      // 고객 (오른쪽)
      doc.font(FONT_BOLD).fontSize(11).text("수 신 처", rightX, startY);
      doc.moveTo(rightX, startY + 15).lineTo(rightX + 60, startY + 15).lineWidth(0.8).stroke();
      doc.font(FONT_REGULAR).fontSize(9);
      let rightY = startY + 20;
      doc.text(`상호: ${data.customer.name}`, rightX, rightY);
      rightY = doc.y;
      if (data.customer.businessNumber) {
        doc.text(`사업자번호: ${data.customer.businessNumber}`, rightX, rightY);
        rightY = doc.y;
      }
      if (data.customer.representative) {
        doc.text(`대표자: ${data.customer.representative}`, rightX, rightY);
        rightY = doc.y;
      }
      if (data.customer.address) {
        doc.text(`주소: ${data.customer.address}`, rightX, rightY, { width: boxWidth });
        rightY = doc.y;
      }
      if (data.customer.phone) {
        doc.text(`전화: ${data.customer.phone}`, rightX, rightY);
        rightY = doc.y;
      }

      const bottomY = Math.max(leftEndY, rightY) + 15;
      doc.y = bottomY;
      doc.x = 40;

      // ═══ 견적일 / 유효기간 ═══
      doc.font(FONT_BOLD).fontSize(10);
      const metaY = doc.y;
      doc.text(`견적일: `, 40, metaY, { continued: true })
        .font(FONT_REGULAR).text(data.quoteDate);
      if (data.validUntil) {
        doc.font(FONT_BOLD).text(`유효기간: `, 220, metaY, { continued: true })
          .font(FONT_REGULAR).text(`~ ${data.validUntil}`);
      }
      doc.y = metaY + 16;
      doc.moveDown(0.3);

      // ═══ 품목 테이블 ═══
      const tableX = 40;
      const colWidths = [30, 180, 50, 40, 80, 60, 75]; // No / 품목 / 수량 / 단위 / 단가 / 할인 / 금액
      const colX = [
        tableX,
        tableX + colWidths[0],
        tableX + colWidths[0] + colWidths[1],
        tableX + colWidths[0] + colWidths[1] + colWidths[2],
        tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
        tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4],
        tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5],
      ];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);

      // 헤더
      const headerY = doc.y;
      doc.rect(tableX, headerY, tableWidth, 22).fillAndStroke("#eef2ff", "#888");
      doc.fillColor("#000").font(FONT_BOLD).fontSize(10);
      doc.text("No", colX[0] + 4, headerY + 7);
      doc.text("품목명", colX[1] + 4, headerY + 7);
      doc.text("수량", colX[2] + 4, headerY + 7, { width: colWidths[2] - 8, align: "right" });
      doc.text("단위", colX[3] + 4, headerY + 7, { width: colWidths[3] - 8, align: "center" });
      doc.text("단가", colX[4] + 4, headerY + 7, { width: colWidths[4] - 8, align: "right" });
      doc.text("할인", colX[5] + 4, headerY + 7, { width: colWidths[5] - 8, align: "right" });
      doc.text("금액", colX[6] + 4, headerY + 7, { width: colWidths[6] - 8, align: "right" });

      let rowY = headerY + 22;
      doc.font(FONT_REGULAR).fontSize(9);

      for (const line of data.lines) {
        const itemNameHeight = doc.heightOfString(line.itemName, { width: colWidths[1] - 8 });
        const descHeight = line.description
          ? doc.heightOfString(line.description, { width: colWidths[1] - 8 })
          : 0;
        const rowHeight = Math.max(22, itemNameHeight + descHeight + 10);

        doc.rect(tableX, rowY, tableWidth, rowHeight).lineWidth(0.3).stroke("#ccc");
        for (let i = 1; i < colX.length; i++) {
          doc.moveTo(colX[i], rowY).lineTo(colX[i], rowY + rowHeight).stroke("#ccc");
        }

        const textY = rowY + 6;
        doc.text(String(line.lineNumber), colX[0] + 4, textY, {
          width: colWidths[0] - 8,
          align: "center",
        });

        const itemText = line.itemCode ? `${line.itemName} (${line.itemCode})` : line.itemName;
        doc.text(itemText, colX[1] + 4, textY, { width: colWidths[1] - 8 });
        if (line.description) {
          doc.fillColor("#666").fontSize(8)
            .text(line.description, colX[1] + 4, doc.y, { width: colWidths[1] - 8 });
          doc.fillColor("#000").fontSize(9);
        }

        doc.text(
          Number(line.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 }),
          colX[2] + 4, textY, { width: colWidths[2] - 8, align: "right" },
        );
        doc.text(line.unit, colX[3] + 4, textY, { width: colWidths[3] - 8, align: "center" });
        doc.text(
          Number(line.unitPrice).toLocaleString(),
          colX[4] + 4, textY, { width: colWidths[4] - 8, align: "right" },
        );
        doc.text(
          line.discountRate && line.discountRate > 0 ? `${line.discountRate}%` : "-",
          colX[5] + 4, textY, { width: colWidths[5] - 8, align: "right" },
        );
        doc.text(
          Number(line.amount).toLocaleString() + "원",
          colX[6] + 4, textY, { width: colWidths[6] - 8, align: "right" },
        );

        rowY += rowHeight;
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
        }
      }

      // ═══ 합계 ═══
      rowY += 8;
      const summaryX = colX[5];
      const summaryWidth = colWidths[5] + colWidths[6];
      const labelX = summaryX + 4;
      const valueX = summaryX + 4;

      doc.font(FONT_REGULAR).fontSize(10);
      doc.text("공급가액:", labelX, rowY);
      doc.text(
        data.totalAmount.toLocaleString() + "원",
        valueX, rowY, { width: summaryWidth - 8, align: "right" },
      );
      rowY += 15;

      doc.text("부가세:", labelX, rowY);
      doc.text(
        data.taxAmount.toLocaleString() + "원",
        valueX, rowY, { width: summaryWidth - 8, align: "right" },
      );
      rowY += 15;

      doc.rect(summaryX, rowY - 2, summaryWidth, 22).fillAndStroke("#dbeafe", "#3b82f6");
      doc.fillColor("#000").font(FONT_BOLD).fontSize(11);
      doc.text("합  계:", labelX, rowY + 4);
      doc.text(
        data.grandTotal.toLocaleString() + "원",
        valueX, rowY + 4, { width: summaryWidth - 8, align: "right" },
      );
      rowY += 30;

      // ═══ 결제/배송 조건 + 메모 ═══
      doc.x = 40;
      if (data.paymentTerms) {
        doc.font(FONT_BOLD).fontSize(9).text("결제 조건: ", 40, rowY, { continued: true })
          .font(FONT_REGULAR).text(data.paymentTerms);
        rowY = doc.y + 4;
      }
      if (data.deliveryTerms) {
        doc.font(FONT_BOLD).fontSize(9).text("배송 조건: ", 40, rowY, { continued: true })
          .font(FONT_REGULAR).text(data.deliveryTerms);
        rowY = doc.y + 4;
      }
      if (data.notes) {
        doc.font(FONT_BOLD).fontSize(9).text("비고", 40, rowY);
        rowY += 13;
        doc.font(FONT_REGULAR).fontSize(9).text(data.notes, 40, rowY, { width: 500 });
        rowY = doc.y + 10;
      }

      // ═══ 푸터 ═══
      const footerY = 780;
      doc.font(FONT_REGULAR).fontSize(8).fillColor("#666");
      doc.text(
        `발행 일시: ${new Date().toLocaleString("ko-KR")}`,
        40, footerY, { align: "right", width: 515 },
      );
      doc.fillColor("#000");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
