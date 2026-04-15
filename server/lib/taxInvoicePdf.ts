/**
 * 세금계산서 (Tax Invoice) PDF 생성 — Phase C Part 2 UI (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 한국 세법 표준 전자세금계산서 양식 (pdfkit + NanumGothic)
 *
 * ★ esbuild ESM 번들 호환: __dirname/import.meta.url/fileURLToPath 미사용
 *   process.cwd() + 하드코딩 절대경로 (quotationPdf.ts 패턴)
 * ═══════════════════════════════════════════════════════════════
 */
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export interface TaxInvoicePdfData {
  // 문서 메타
  invoiceNumber: string;    // 사내 발번호
  invoiceType: "sales" | "purchase";
  taxCategory: "taxed" | "zero_rated" | "tax_free";
  receiptType: "invoice" | "receipt"; // 청구 / 영수
  issueDate: string;        // 작성일자
  supplyDate?: string | null; // 공급일자

  // 공급자 (매출이면 우리 회사, 매입이면 거래처)
  supplier: {
    bizNo?: string | null;
    name?: string | null;
    ceo?: string | null;
    address?: string | null;
    bizType?: string | null;    // 업태
    bizClass?: string | null;   // 종목
  };

  // 공급받는자 (매출이면 거래처, 매입이면 우리 회사)
  receiver: {
    bizNo?: string | null;
    name?: string | null;
    ceo?: string | null;
    address?: string | null;
    bizType?: string | null;
    bizClass?: string | null;
  };

  // 품목 라인 (최대 4개 — 한국 표준)
  lines: Array<{
    lineNumber: number;
    itemName: string;
    itemSpec?: string | null;
    quantity?: number | null;
    unit?: string | null;
    unitPrice?: number | null;
    supplyAmount: number;
    taxAmount: number;
    notes?: string | null;
  }>;

  // 합계
  supplyAmountTotal: number;
  taxAmountTotal: number;
  grandTotal: number;

  // 비고 (최대 3개)
  remark1?: string | null;
  remark2?: string | null;
  remark3?: string | null;

  // 팝빌 메타 (있을 경우)
  popbillIssueId?: string | null; // 국세청 승인번호
  popbillMgtKey?: string | null;

  // 상태
  status?: string;

  // 메모
  notes?: string | null;
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
  console.warn(`[TaxInvoice PDF] 한글 폰트 못찾음: ${fontName}`);
  return null;
}

/** 숫자 → 자리수 배열 (오른쪽 정렬 11자리) */
function numberToDigitBoxes(amount: number, boxCount = 11): string[] {
  const str = Math.round(amount).toLocaleString().replace(/,/g, "");
  const digits = str.split("");
  const padded: string[] = [];
  for (let i = 0; i < boxCount - digits.length; i++) padded.push("");
  padded.push(...digits);
  return padded;
}

/** 카테고리 라벨 */
function categoryLabel(cat: TaxInvoicePdfData["taxCategory"]): string {
  if (cat === "zero_rated") return "영세율";
  if (cat === "tax_free") return "면세";
  return "과세";
}

/**
 * 세금계산서 PDF 생성 함수
 */
export async function generateTaxInvoicePDF(data: TaxInvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 30 });
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
      const title =
        data.receiptType === "receipt"
          ? "전자세금계산서 (영수)"
          : "전자세금계산서 (청구)";
      doc.font(FONT_BOLD).fontSize(20).text(title, { align: "center" });
      doc.moveDown(0.1);

      // 공급자/공급받는자 색 구분 표시
      doc.font(FONT_REGULAR).fontSize(9).fillColor("#555").text(
        `[${categoryLabel(data.taxCategory)}] 책번호/일련번호: - / - · 승인번호: ${
          data.popbillIssueId || "-"
        }`,
        { align: "center" },
      );
      doc.fillColor("#000");
      doc.moveDown(0.4);

      // ═══ 공급자 / 공급받는자 2단 박스 ═══
      const pageLeft = 30;
      const pageRight = 565; // A4 가로 - margin 30
      const colGap = 6;
      const halfWidth = (pageRight - pageLeft - colGap) / 2; // 약 264
      const boxStartY = doc.y;
      const rowH = 18;
      const numRows = 5; // 등록번호 / 상호 / 성명 / 사업장주소 / 업태·종목
      const boxH = rowH * numRows;

      const drawPartyBox = (
        x: number,
        party: TaxInvoicePdfData["supplier"],
        label: string,
      ) => {
        // 라벨 (세로 텍스트 느낌: 왼쪽에 라벨칼럼)
        const labelW = 20;
        doc.rect(x, boxStartY, halfWidth, boxH).lineWidth(0.8).stroke("#444");

        // 라벨 영역
        doc.rect(x, boxStartY, labelW, boxH).fillAndStroke("#f3f4f6", "#444");
        doc.fillColor("#000").font(FONT_BOLD).fontSize(9);
        // 라벨 한 글자씩 세로로
        const labelText = label === "supplier" ? "공급자" : "공급받는자";
        const chars = labelText.split("");
        const charH = boxH / chars.length;
        chars.forEach((ch, i) => {
          doc.text(ch, x, boxStartY + charH * i + 4, {
            width: labelW,
            align: "center",
          });
        });

        // 행 헤더 + 값
        const fieldX = x + labelW;
        const fieldW = halfWidth - labelW;
        const headerW = 50;
        const valueX = fieldX + headerW;
        const valueW = fieldW - headerW;

        const fields: Array<[string, string]> = [
          ["등록번호", party.bizNo || "-"],
          ["상호", party.name || "-"],
          ["대표자", party.ceo || "-"],
          ["사업장주소", party.address || "-"],
          ["업태·종목", [party.bizType, party.bizClass].filter(Boolean).join(" · ") || "-"],
        ];

        fields.forEach(([header, value], idx) => {
          const rowY = boxStartY + rowH * idx;
          // 라벨(좌측 50px)
          doc
            .rect(fieldX, rowY, headerW, rowH)
            .fillAndStroke("#fafafa", "#aaa");
          doc.fillColor("#000").font(FONT_REGULAR).fontSize(8);
          doc.text(header, fieldX + 2, rowY + 5, {
            width: headerW - 4,
            align: "center",
          });
          // 값
          doc.rect(valueX, rowY, valueW, rowH).lineWidth(0.3).stroke("#aaa");
          doc.font(FONT_REGULAR).fontSize(9);
          doc.text(value, valueX + 4, rowY + 5, {
            width: valueW - 8,
            height: rowH - 4,
            ellipsis: true,
            lineBreak: false,
          });
        });
      };

      drawPartyBox(pageLeft, data.supplier, "supplier");
      drawPartyBox(pageLeft + halfWidth + colGap, data.receiver, "receiver");

      doc.y = boxStartY + boxH + 6;
      doc.x = pageLeft;

      // ═══ 작성일자 / 공급가액 / 세액 합계 ═══
      const metaY = doc.y;
      const metaH = 34;
      const totalW = pageRight - pageLeft;
      const writeDateW = 80;
      const amountBoxCount = 11;
      const taxBoxCount = 11;
      const digitW = (totalW - writeDateW - 8) / (amountBoxCount + taxBoxCount);

      // 작성일자 칸
      doc.rect(pageLeft, metaY, writeDateW, metaH).fillAndStroke("#f3f4f6", "#444");
      doc.fillColor("#000").font(FONT_BOLD).fontSize(9);
      doc.text("작성일자", pageLeft, metaY + 4, { width: writeDateW, align: "center" });
      doc.font(FONT_REGULAR).fontSize(10);
      doc.text(data.issueDate, pageLeft, metaY + 18, {
        width: writeDateW,
        align: "center",
      });

      // 공급가액 라벨
      const supplyLabelX = pageLeft + writeDateW + 4;
      const supplyBoxesW = digitW * amountBoxCount;
      doc.rect(supplyLabelX, metaY, supplyBoxesW, 14).fillAndStroke("#fafafa", "#aaa");
      doc.fillColor("#000").font(FONT_BOLD).fontSize(9);
      doc.text("공 급 가 액", supplyLabelX, metaY + 3, {
        width: supplyBoxesW,
        align: "center",
      });
      // 자리수 박스
      const supplyDigits = numberToDigitBoxes(data.supplyAmountTotal, amountBoxCount);
      supplyDigits.forEach((d, i) => {
        const bx = supplyLabelX + digitW * i;
        doc.rect(bx, metaY + 14, digitW, metaH - 14).lineWidth(0.3).stroke("#aaa");
        doc.font(FONT_REGULAR).fontSize(10);
        doc.text(d, bx, metaY + 18, { width: digitW, align: "center" });
      });

      // 세액 라벨
      const taxLabelX = supplyLabelX + supplyBoxesW + 4;
      const taxBoxesW = digitW * taxBoxCount;
      doc.rect(taxLabelX, metaY, taxBoxesW, 14).fillAndStroke("#fafafa", "#aaa");
      doc.fillColor("#000").font(FONT_BOLD).fontSize(9);
      doc.text("세    액", taxLabelX, metaY + 3, {
        width: taxBoxesW,
        align: "center",
      });
      const taxDigits = numberToDigitBoxes(data.taxAmountTotal, taxBoxCount);
      taxDigits.forEach((d, i) => {
        const bx = taxLabelX + digitW * i;
        doc.rect(bx, metaY + 14, digitW, metaH - 14).lineWidth(0.3).stroke("#aaa");
        doc.font(FONT_REGULAR).fontSize(10);
        doc.text(d, bx, metaY + 18, { width: digitW, align: "center" });
      });

      doc.y = metaY + metaH + 6;
      doc.x = pageLeft;

      // ═══ 품목 테이블 ═══
      const tableY = doc.y;
      const colWidths = [30, 170, 60, 50, 70, 85, 70]; // No / 품목(+규격) / 수량 / 단위 / 단가 / 공급가액 / 세액
      // total = 535, 맞춰서 여분 조정
      const tableW = colWidths.reduce((a, b) => a + b, 0);
      const colX: number[] = [pageLeft];
      for (let i = 0; i < colWidths.length - 1; i++) {
        colX.push(colX[i] + colWidths[i]);
      }

      // 헤더
      const headerH = 22;
      doc.rect(pageLeft, tableY, tableW, headerH).fillAndStroke("#eef2ff", "#555");
      doc.fillColor("#000").font(FONT_BOLD).fontSize(9);
      const headers = ["월일", "품목(규격)", "수량", "단위", "단가", "공급가액", "세액"];
      headers.forEach((h, i) => {
        doc.text(h, colX[i] + 2, tableY + 7, {
          width: colWidths[i] - 4,
          align: "center",
        });
      });

      // 바디 (항상 최소 4행 — 한국 표준)
      let rowY = tableY + headerH;
      const bodyRowH = 20;
      const maxRows = 4;
      for (let i = 0; i < maxRows; i++) {
        const line = data.lines[i];
        doc.rect(pageLeft, rowY, tableW, bodyRowH).lineWidth(0.3).stroke("#aaa");
        // 세로선
        for (let c = 1; c < colX.length; c++) {
          doc.moveTo(colX[c], rowY).lineTo(colX[c], rowY + bodyRowH).stroke("#aaa");
        }

        if (line) {
          doc.font(FONT_REGULAR).fontSize(9).fillColor("#000");
          doc.text(data.issueDate.slice(5).replace("-", "/"), colX[0] + 2, rowY + 5, {
            width: colWidths[0] - 4,
            align: "center",
          });
          const itemLabel =
            line.itemSpec && line.itemSpec.trim()
              ? `${line.itemName} (${line.itemSpec})`
              : line.itemName;
          doc.text(itemLabel, colX[1] + 3, rowY + 5, {
            width: colWidths[1] - 6,
            height: bodyRowH - 4,
            ellipsis: true,
            lineBreak: false,
          });
          doc.text(
            line.quantity != null
              ? Number(line.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })
              : "-",
            colX[2] + 2,
            rowY + 5,
            { width: colWidths[2] - 4, align: "right" },
          );
          doc.text(line.unit || "-", colX[3] + 2, rowY + 5, {
            width: colWidths[3] - 4,
            align: "center",
          });
          doc.text(
            line.unitPrice != null ? Number(line.unitPrice).toLocaleString() : "-",
            colX[4] + 2,
            rowY + 5,
            { width: colWidths[4] - 4, align: "right" },
          );
          doc.text(Number(line.supplyAmount).toLocaleString(), colX[5] + 2, rowY + 5, {
            width: colWidths[5] - 4,
            align: "right",
          });
          doc.text(Number(line.taxAmount).toLocaleString(), colX[6] + 2, rowY + 5, {
            width: colWidths[6] - 4,
            align: "right",
          });
        }

        rowY += bodyRowH;
      }

      // "외 N건" 표시 (4건 초과)
      if (data.lines.length > maxRows) {
        doc.font(FONT_REGULAR).fontSize(8).fillColor("#dc2626");
        doc.text(
          `※ 품목 ${data.lines.length}건 중 상위 ${maxRows}건만 표시 — 외 ${
            data.lines.length - maxRows
          }건 (PDF 양식 표준)`,
          pageLeft,
          rowY + 3,
          { width: tableW, align: "center" },
        );
        doc.fillColor("#000");
        rowY += 14;
      }

      // ═══ 합계/비고/현금수표어음외상 푸터 ═══
      rowY += 6;
      const footerY = rowY;
      const footerH = 40;
      // 합계금액 표시
      doc.rect(pageLeft, footerY, tableW, footerH).lineWidth(0.6).stroke("#444");
      const labelSumW = 80;
      doc.rect(pageLeft, footerY, labelSumW, footerH).fillAndStroke("#f3f4f6", "#444");
      doc.fillColor("#000").font(FONT_BOLD).fontSize(10);
      doc.text("합계금액", pageLeft, footerY + 14, {
        width: labelSumW,
        align: "center",
      });

      doc.font(FONT_BOLD).fontSize(14);
      doc.text(
        Number(data.grandTotal).toLocaleString() + "원",
        pageLeft + labelSumW + 10,
        footerY + 12,
        { width: tableW - labelSumW - 20, align: "center" },
      );

      rowY = footerY + footerH + 8;

      // ═══ 비고 ═══
      const remarks = [data.remark1, data.remark2, data.remark3].filter(
        (r) => r && r.trim(),
      ) as string[];
      if (remarks.length || data.notes) {
        doc.font(FONT_BOLD).fontSize(9).text("비고", pageLeft, rowY);
        rowY += 13;
        doc.font(FONT_REGULAR).fontSize(9);
        remarks.forEach((r) => {
          doc.text(`· ${r}`, pageLeft + 8, rowY, { width: tableW - 16 });
          rowY = doc.y + 2;
        });
        if (data.notes) {
          doc.text(data.notes, pageLeft + 8, rowY, { width: tableW - 16 });
          rowY = doc.y + 2;
        }
      }

      // ═══ 푸터 ═══
      const bottomY = 800;
      doc.font(FONT_REGULAR).fontSize(8).fillColor("#666");
      const footerLeft = `발행 일시: ${new Date().toLocaleString("ko-KR")}`;
      const footerRight = data.popbillMgtKey
        ? `관리번호: ${data.popbillMgtKey}`
        : `사내 발번호: ${data.invoiceNumber}`;
      doc.text(footerLeft, pageLeft, bottomY, { width: tableW / 2, align: "left" });
      doc.text(footerRight, pageLeft + tableW / 2, bottomY, {
        width: tableW / 2,
        align: "right",
      });
      doc.fillColor("#000");

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
