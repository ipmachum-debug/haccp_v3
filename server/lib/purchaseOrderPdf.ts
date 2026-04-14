/**
 * 발주서 (Purchase Order) PDF 생성 — Phase A (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 거래명세표 PDF 패턴 재사용 (pdfkit + 한글 폰트)
 * ═══════════════════════════════════════════════════════════════
 */
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export interface PurchaseOrderPdfData {
  // 발주 기본 정보
  poNumber: string;
  orderDate: string;
  expectedDeliveryDate?: string | null;
  deliveryAddress?: string | null;

  // 발주처 (우리 회사)
  buyer: {
    name: string;
    businessNumber?: string;
    address?: string;
    representative?: string;
    phone?: string;
  };

  // 공급처 (거래처)
  supplier: {
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
    orderedQty: number;
    unit: string;
    unitPrice: number;
    amount: number;
    expectedDeliveryDate?: string | null;
    notes?: string;
  }>;

  // 합계
  totalAmount: number; // 공급가
  taxAmount: number; // 부가세
  grandTotal: number; // 총액

  // 기타
  notes?: string;
  status?: string;
}

// 한글 폰트 경로 찾기
// ★ 2026-04-14: esbuild ESM 번들 호환 — import.meta.url/fileURLToPath/__dirname 미사용
//   process.cwd() + 하드코딩 절대경로만 사용 (quotationPdf.ts 패턴)
function findFontPath(fontName: string): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "fonts", fontName),
    path.join(cwd, "..", "fonts", fontName),
    path.join(cwd, "..", "..", "fonts", fontName),
    path.join(cwd, "..", "..", "..", "fonts", fontName),
    // 하드코딩 절대 경로 (PM2 / 컨테이너 / systemd 등 cwd 변동 대응)
    `/root/haccp_v3/fonts/${fontName}`,
    `/home/root/haccp_v3/fonts/${fontName}`,
    `/var/www/haccp_v3/fonts/${fontName}`,
    `/home/user/haccp_v3/fonts/${fontName}`,
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) { /* ignore */ }
  }
  console.warn(`[PO PDF] 한글 폰트 못찾음: ${fontName}`);
  return null;
}

/**
 * 발주서 PDF 생성 함수
 */
export async function generatePurchaseOrderPDF(data: PurchaseOrderPdfData): Promise<Buffer> {
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
      doc.font(FONT_BOLD).fontSize(22).text("발  주  서", { align: "center" });
      doc.moveDown(0.2);

      // 제목 밑줄
      const lineY = doc.y;
      doc.moveTo(180, lineY).lineTo(420, lineY).lineWidth(1.2).stroke();
      doc.moveDown(0.3);

      // PO 번호 (중앙)
      doc.font(FONT_REGULAR).fontSize(10).fillColor("#555")
        .text(`PO 번호: ${data.poNumber}`, { align: "center" });
      doc.fillColor("#000");
      doc.moveDown(1);

      // ═══ 발주처 / 공급처 (2단) ═══
      const leftX = 40;
      const rightX = 320;
      const startY = doc.y;
      const boxWidth = 230;

      // 발주처 박스 (왼쪽)
      doc.font(FONT_BOLD).fontSize(11).text("발주처", leftX, startY);
      doc.moveTo(leftX, doc.y + 2).lineTo(leftX + 50, doc.y + 2).lineWidth(0.8).stroke();
      doc.moveDown(0.3);
      doc.font(FONT_REGULAR).fontSize(9);
      doc.text(`상호: ${data.buyer.name}`, leftX);
      if (data.buyer.businessNumber) {
        doc.text(`사업자번호: ${data.buyer.businessNumber}`, leftX);
      }
      if (data.buyer.representative) {
        doc.text(`대표자: ${data.buyer.representative}`, leftX);
      }
      if (data.buyer.address) {
        doc.text(`주소: ${data.buyer.address}`, leftX, doc.y, { width: boxWidth });
      }
      if (data.buyer.phone) {
        doc.text(`전화: ${data.buyer.phone}`, leftX);
      }
      const leftEndY = doc.y;

      // 공급처 박스 (오른쪽) — Y 좌표 재설정
      doc.font(FONT_BOLD).fontSize(11).text("공급처", rightX, startY);
      doc.moveTo(rightX, startY + 15).lineTo(rightX + 50, startY + 15).lineWidth(0.8).stroke();
      doc.font(FONT_REGULAR).fontSize(9);
      let rightY = startY + 20;
      doc.text(`상호: ${data.supplier.name}`, rightX, rightY);
      rightY = doc.y;
      if (data.supplier.businessNumber) {
        doc.text(`사업자번호: ${data.supplier.businessNumber}`, rightX, rightY);
        rightY = doc.y;
      }
      if (data.supplier.representative) {
        doc.text(`대표자: ${data.supplier.representative}`, rightX, rightY);
        rightY = doc.y;
      }
      if (data.supplier.address) {
        doc.text(`주소: ${data.supplier.address}`, rightX, rightY, { width: boxWidth });
        rightY = doc.y;
      }
      if (data.supplier.phone) {
        doc.text(`전화: ${data.supplier.phone}`, rightX, rightY);
        rightY = doc.y;
      }

      // 더 아래쪽으로 포지션 이동
      const bottomY = Math.max(leftEndY, rightY) + 15;
      doc.y = bottomY;
      doc.x = 40;

      // ═══ 발주일 / 납기일 / 납품장소 ═══
      doc.font(FONT_BOLD).fontSize(10);
      const metaY = doc.y;
      doc.text(`발주일: `, 40, metaY, { continued: true })
        .font(FONT_REGULAR).text(data.orderDate);
      if (data.expectedDeliveryDate) {
        doc.font(FONT_BOLD).text(`납기 예정일: `, 220, metaY, { continued: true })
          .font(FONT_REGULAR).text(data.expectedDeliveryDate);
      }
      doc.y = metaY + 14;
      if (data.deliveryAddress) {
        doc.font(FONT_BOLD).text(`납품 장소: `, 40, doc.y, { continued: true })
          .font(FONT_REGULAR).text(data.deliveryAddress, { width: 500 });
      }
      doc.moveDown(0.5);

      // ═══ 품목 테이블 ═══
      const tableX = 40;
      const colWidths = [30, 190, 60, 50, 85, 90]; // No / 품목 / 수량 / 단위 / 단가 / 금액
      const colX = [
        tableX,
        tableX + colWidths[0],
        tableX + colWidths[0] + colWidths[1],
        tableX + colWidths[0] + colWidths[1] + colWidths[2],
        tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
        tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4],
      ];
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);

      // 헤더 배경
      const headerY = doc.y;
      doc.rect(tableX, headerY, tableWidth, 22).fillAndStroke("#f0f4f8", "#888");
      doc.fillColor("#000").font(FONT_BOLD).fontSize(10);
      doc.text("No", colX[0] + 4, headerY + 7);
      doc.text("품목명", colX[1] + 4, headerY + 7);
      doc.text("수량", colX[2] + 4, headerY + 7, { width: colWidths[2] - 8, align: "right" });
      doc.text("단위", colX[3] + 4, headerY + 7, { width: colWidths[3] - 8, align: "center" });
      doc.text("단가", colX[4] + 4, headerY + 7, { width: colWidths[4] - 8, align: "right" });
      doc.text("금액", colX[5] + 4, headerY + 7, { width: colWidths[5] - 8, align: "right" });

      let rowY = headerY + 22;
      doc.font(FONT_REGULAR).fontSize(9);

      for (const line of data.lines) {
        // 행 높이 동적 계산
        const itemNameHeight = doc.heightOfString(line.itemName, { width: colWidths[1] - 8 });
        const rowHeight = Math.max(22, itemNameHeight + 10);

        // 행 테두리
        doc.rect(tableX, rowY, tableWidth, rowHeight).lineWidth(0.3).stroke("#ccc");

        // 수직 구분선
        for (let i = 1; i < colX.length; i++) {
          doc.moveTo(colX[i], rowY).lineTo(colX[i], rowY + rowHeight).stroke("#ccc");
        }

        const textY = rowY + 6;
        doc.text(String(line.lineNumber), colX[0] + 4, textY, {
          width: colWidths[0] - 8,
          align: "center",
        });

        // 품목명 + 품목코드 (있으면)
        const itemText = line.itemCode ? `${line.itemName}\n(${line.itemCode})` : line.itemName;
        doc.text(itemText, colX[1] + 4, textY, { width: colWidths[1] - 8 });

        doc.text(
          Number(line.orderedQty).toLocaleString(undefined, { maximumFractionDigits: 3 }),
          colX[2] + 4,
          textY,
          { width: colWidths[2] - 8, align: "right" },
        );
        doc.text(line.unit, colX[3] + 4, textY, { width: colWidths[3] - 8, align: "center" });
        doc.text(
          Number(line.unitPrice).toLocaleString(),
          colX[4] + 4,
          textY,
          { width: colWidths[4] - 8, align: "right" },
        );
        doc.text(
          Number(line.amount).toLocaleString() + "원",
          colX[5] + 4,
          textY,
          { width: colWidths[5] - 8, align: "right" },
        );

        rowY += rowHeight;

        // 페이지 넘김 (A4 약 770px 기준)
        if (rowY > 720) {
          doc.addPage();
          rowY = 50;
        }
      }

      // ═══ 합계 ═══
      rowY += 8;
      const summaryX = colX[4];
      const summaryWidth = colWidths[4] + colWidths[5];
      const labelX = summaryX + 4;
      const valueX = summaryX + 4;

      doc.font(FONT_REGULAR).fontSize(10);
      doc.text("공급가액:", labelX, rowY);
      doc.text(
        data.totalAmount.toLocaleString() + "원",
        valueX,
        rowY,
        { width: summaryWidth - 8, align: "right" },
      );
      rowY += 15;

      doc.text("부가세:", labelX, rowY);
      doc.text(
        data.taxAmount.toLocaleString() + "원",
        valueX,
        rowY,
        { width: summaryWidth - 8, align: "right" },
      );
      rowY += 15;

      // 합계 (굵게 + 박스)
      doc.rect(summaryX, rowY - 2, summaryWidth, 22).fillAndStroke("#fef3c7", "#f59e0b");
      doc.fillColor("#000").font(FONT_BOLD).fontSize(11);
      doc.text("합  계:", labelX, rowY + 4);
      doc.text(
        data.grandTotal.toLocaleString() + "원",
        valueX,
        rowY + 4,
        { width: summaryWidth - 8, align: "right" },
      );
      rowY += 30;

      // ═══ 메모 ═══
      if (data.notes) {
        doc.font(FONT_BOLD).fontSize(9).text("메모", 40, rowY);
        rowY += 14;
        doc.font(FONT_REGULAR).fontSize(9).text(data.notes, 40, rowY, { width: 500 });
        rowY = doc.y + 10;
      }

      // ═══ 푸터 ═══
      const footerY = 780;
      doc.font(FONT_REGULAR).fontSize(8).fillColor("#666");
      doc.text(
        `발행 일시: ${new Date().toLocaleString("ko-KR")}`,
        40,
        footerY,
        { align: "right", width: 515 },
      );
      doc.fillColor("#000");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
