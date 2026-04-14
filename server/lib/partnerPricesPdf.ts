/**
 * 거래처별 단가표 (Partner Prices) PDF 생성 — Phase B Part 2 UI (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 단일 거래처의 모든 활성 단가 품목을 한 문서로 출력 (고객/공급업체 전달용)
 *
 * ★ esbuild ESM 호환 — __dirname 미사용 (quotationPdf.ts 패턴)
 * ═══════════════════════════════════════════════════════════════
 */
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export interface PartnerPricesPdfData {
  // 발행자 (우리 회사)
  issuer: {
    name: string;
    businessNumber?: string | null;
    address?: string | null;
    representative?: string | null;
    phone?: string | null;
  };

  // 거래처
  partner: {
    name: string;
    businessNumber?: string | null;
    address?: string | null;
    representative?: string | null;
    phone?: string | null;
    grade?: string | null;      // 등급 (있으면)
    paymentTerms?: string | null; // 결제조건 (있으면)
  };

  // 발행 일자
  issueDate: string;
  validUntil?: string | null;

  // 품목 라인
  lines: Array<{
    lineNumber: number;
    targetTypeLabel: string; // "원재료" / "제품" / "서비스"
    itemName: string;
    itemCode?: string | null;
    unitPrice: number;
    currency?: string;
    discountRate?: number | null;
    effectiveFrom: string;
    effectiveTo?: string | null;
    isActive: boolean;
    notes?: string | null;
  }>;

  // 메모
  notes?: string | null;
}

// 한글 폰트 경로 찾기
// ★ 2026-04-14: esbuild ESM 번들 호환 — __dirname 미사용
function findFontPath(fontName: string): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "fonts", fontName),
    path.join(cwd, "..", "fonts", fontName),
    path.join(cwd, "..", "..", "fonts", fontName),
    path.join(cwd, "..", "..", "..", "fonts", fontName),
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
  console.warn(`[Partner Prices PDF] 한글 폰트 못찾음: ${fontName}`);
  return null;
}

export async function generatePartnerPricesPDF(
  data: PartnerPricesPdfData,
): Promise<Buffer> {
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
      doc.font(FONT_BOLD).fontSize(22).text("거 래 처  단 가 표", { align: "center" });
      doc.moveDown(0.2);
      const lineY = doc.y;
      doc.moveTo(150, lineY).lineTo(450, lineY).lineWidth(1.2).stroke();
      doc.moveDown(0.4);

      // ═══ 발행자 / 거래처 (2단) ═══
      const leftX = 40;
      const rightX = 320;
      const startY = doc.y;
      const boxWidth = 235;

      // 공급자 (우리 회사) - 왼쪽
      doc.font(FONT_BOLD).fontSize(11).text("공 급 자", leftX, startY);
      doc.moveTo(leftX, doc.y + 2).lineTo(leftX + 60, doc.y + 2).lineWidth(0.8).stroke();
      doc.moveDown(0.3);
      doc.font(FONT_REGULAR).fontSize(9);
      doc.text(`상호: ${data.issuer.name}`, leftX);
      if (data.issuer.businessNumber) {
        doc.text(`사업자번호: ${data.issuer.businessNumber}`, leftX);
      }
      if (data.issuer.representative) {
        doc.text(`대표자: ${data.issuer.representative}`, leftX);
      }
      if (data.issuer.address) {
        doc.text(`주소: ${data.issuer.address}`, leftX, doc.y, { width: boxWidth });
      }
      if (data.issuer.phone) {
        doc.text(`전화: ${data.issuer.phone}`, leftX);
      }
      const leftEndY = doc.y;

      // 거래처 - 오른쪽
      doc.font(FONT_BOLD).fontSize(11).text("거 래 처", rightX, startY);
      doc.moveTo(rightX, startY + 15).lineTo(rightX + 60, startY + 15).lineWidth(0.8).stroke();
      doc.font(FONT_REGULAR).fontSize(9);
      let rightY = startY + 20;
      doc.text(`상호: ${data.partner.name}`, rightX, rightY);
      rightY = doc.y;
      if (data.partner.businessNumber) {
        doc.text(`사업자번호: ${data.partner.businessNumber}`, rightX, rightY);
        rightY = doc.y;
      }
      if (data.partner.representative) {
        doc.text(`대표자: ${data.partner.representative}`, rightX, rightY);
        rightY = doc.y;
      }
      if (data.partner.address) {
        doc.text(`주소: ${data.partner.address}`, rightX, rightY, { width: boxWidth });
        rightY = doc.y;
      }
      if (data.partner.phone) {
        doc.text(`전화: ${data.partner.phone}`, rightX, rightY);
        rightY = doc.y;
      }
      if (data.partner.grade) {
        doc.text(`등급: ${data.partner.grade}`, rightX, rightY);
        rightY = doc.y;
      }
      if (data.partner.paymentTerms) {
        doc.text(`결제조건: ${data.partner.paymentTerms}`, rightX, rightY);
        rightY = doc.y;
      }

      const bottomY = Math.max(leftEndY, rightY) + 12;
      doc.y = bottomY;
      doc.x = 40;

      // ═══ 발행일 / 유효기간 ═══
      const metaY = doc.y;
      doc.font(FONT_BOLD).fontSize(10).text("발행일: ", 40, metaY, { continued: true })
        .font(FONT_REGULAR).text(data.issueDate);
      if (data.validUntil) {
        doc.font(FONT_BOLD).text("유효기간: ", 220, metaY, { continued: true })
          .font(FONT_REGULAR).text(`~ ${data.validUntil}`);
      }
      doc.font(FONT_BOLD).fontSize(10).text(`총 ${data.lines.length}개 품목`, 400, metaY);
      doc.y = metaY + 18;
      doc.moveDown(0.3);

      // ═══ 품목 테이블 ═══
      const tableX = 40;
      const colWidths = [28, 48, 190, 80, 70, 50, 70]; // No / 구분 / 품목명(+코드) / 단가 / 할인 / 상태 / 유효기간
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      const colX: number[] = [tableX];
      for (let i = 0; i < colWidths.length - 1; i++) {
        colX.push(colX[i] + colWidths[i]);
      }

      // 헤더
      const headerY = doc.y;
      const headerH = 24;
      doc.rect(tableX, headerY, tableWidth, headerH).fillAndStroke("#eef2ff", "#555");
      doc.fillColor("#000").font(FONT_BOLD).fontSize(10);
      const headers = ["No", "구분", "품목명 (코드)", "단가", "할인율", "상태", "유효시작"];
      headers.forEach((h, i) => {
        doc.text(h, colX[i] + 4, headerY + 8, {
          width: colWidths[i] - 8,
          align: "center",
        });
      });

      // 바디
      let rowY = headerY + headerH;
      doc.font(FONT_REGULAR).fontSize(9);

      const maxRowsPerPage = 30;
      let rowsInThisPage = 0;

      for (const line of data.lines) {
        if (rowsInThisPage >= maxRowsPerPage) {
          doc.addPage();
          rowY = 50;
          rowsInThisPage = 0;

          // 헤더 반복
          doc.rect(tableX, rowY, tableWidth, headerH).fillAndStroke("#eef2ff", "#555");
          doc.fillColor("#000").font(FONT_BOLD).fontSize(10);
          headers.forEach((h, i) => {
            doc.text(h, colX[i] + 4, rowY + 8, {
              width: colWidths[i] - 8,
              align: "center",
            });
          });
          rowY += headerH;
          doc.font(FONT_REGULAR).fontSize(9);
        }

        const bodyRowH = 22;
        // 비활성 행은 배경색
        if (!line.isActive) {
          doc.rect(tableX, rowY, tableWidth, bodyRowH).fillAndStroke("#f9fafb", "#ccc");
        } else {
          doc.rect(tableX, rowY, tableWidth, bodyRowH).lineWidth(0.3).stroke("#ccc");
        }
        // 세로선
        for (let c = 1; c < colX.length; c++) {
          doc.moveTo(colX[c], rowY).lineTo(colX[c], rowY + bodyRowH).stroke("#ccc");
        }

        const textY = rowY + 6;
        const textColor = line.isActive ? "#000" : "#666";
        doc.fillColor(textColor);

        // No
        doc.text(String(line.lineNumber), colX[0] + 2, textY, {
          width: colWidths[0] - 4,
          align: "center",
        });
        // 구분 (원재료 / 제품)
        doc.text(line.targetTypeLabel, colX[1] + 2, textY, {
          width: colWidths[1] - 4,
          align: "center",
        });
        // 품목명 + 코드
        const itemText = line.itemCode
          ? `${line.itemName} (${line.itemCode})`
          : line.itemName;
        doc.text(itemText, colX[2] + 3, textY, {
          width: colWidths[2] - 6,
          height: bodyRowH - 4,
          ellipsis: true,
          lineBreak: false,
        });
        // 단가
        doc.text(
          `${Number(line.unitPrice).toLocaleString()} ${line.currency || "KRW"}`,
          colX[3] + 2,
          textY,
          { width: colWidths[3] - 4, align: "right" },
        );
        // 할인율
        doc.text(
          line.discountRate && Number(line.discountRate) > 0
            ? `${line.discountRate}%`
            : "-",
          colX[4] + 2,
          textY,
          { width: colWidths[4] - 4, align: "right" },
        );
        // 상태
        doc.text(line.isActive ? "활성" : "비활성", colX[5] + 2, textY, {
          width: colWidths[5] - 4,
          align: "center",
        });
        // 유효시작
        doc.text(line.effectiveFrom, colX[6] + 2, textY, {
          width: colWidths[6] - 4,
          align: "center",
        });

        doc.fillColor("#000");
        rowY += bodyRowH;
        rowsInThisPage++;
      }

      // ═══ 비고 ═══
      rowY += 12;
      if (data.notes) {
        doc.font(FONT_BOLD).fontSize(9).text("비고", 40, rowY);
        rowY += 14;
        doc.font(FONT_REGULAR).fontSize(9).text(data.notes, 40, rowY, { width: 500 });
        rowY = doc.y + 8;
      }

      // 안내 문구
      doc.font(FONT_REGULAR).fontSize(8).fillColor("#666");
      doc.text(
        "※ 본 단가표는 상기 발행일 기준 활성 단가입니다. 유효기간 만료 및 시장 변동에 따라 조정될 수 있습니다.",
        40,
        rowY + 4,
        { width: 515 },
      );
      doc.fillColor("#000");

      // ═══ 푸터 ═══
      const footerY = 790;
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
