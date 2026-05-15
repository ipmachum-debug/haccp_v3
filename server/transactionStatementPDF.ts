import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import path from "path";
import fs from "fs";

interface TransactionStatementData {
  // 거래 기본 정보
  transactionDate: string;
  transactionType: "purchase" | "sale"; // 매입 or 매출
  statementNumber?: string; // 거래명세표 번호 (옵션 — 자동 생성)

  // 공급자 정보
  supplier: {
    name: string;
    businessNumber?: string;
    address?: string;
    representative?: string;
    phone?: string;
  };

  // 공급받는자 정보
  recipient: {
    name: string;
    businessNumber?: string;
    address?: string;
    representative?: string;
    phone?: string;
  };

  // 품목 리스트
  items: Array<{
    itemName: string;
    quantity: string | number;
    unit: string;
    unitPrice: string | number;
    amount: string | number;
    note?: string;
  }>;

  // 합계 정보
  totalAmount: string | number;
  taxAmount: string | number;
  grandTotal: string | number;

  memo?: string;
  notes?: string;

  // 입금 계좌 정보 (매출용)
  bankAccount?: {
    bankName: string;
    accountNumber: string;
    ownerName: string;
  };
}

// ─── 디자인 토큰 (Tailwind 팔레트 매핑) ─────────────────────────
const TOKENS = {
  // 색상
  accentMain: "#10B981",      // emerald-500 — Millio 브랜드 (헤더 바)
  accentSoft: "#ECFDF5",      // emerald-50 — 합계 박스 배경
  accentDeep: "#047857",      // emerald-700 — 합계 텍스트
  textBody: "#111827",        // slate-900
  textMuted: "#6B7280",       // slate-500
  textFaint: "#9CA3AF",       // slate-400
  border: "#E5E7EB",          // slate-200
  borderSoft: "#F3F4F6",      // slate-100 — zebra row
  rowZebra: "#FAFAFA",        // 짝수 행 배경
  white: "#FFFFFF",
  // 사이즈 (A4 portrait: 595 × 842)
  pageMargin: 50,
  contentWidth: 495, // 595 - 50*2
};

// 한글 폰트 경로 찾기
function findFontPath(fontName: string): string | null {
  const cwd = process.cwd();
  const possiblePaths = [
    path.join(cwd, "fonts", fontName),
    path.join(cwd, "..", "fonts", fontName),
    path.join(cwd, "..", "..", "fonts", fontName),
    path.join(cwd, "..", "..", "..", "fonts", fontName),
    `/root/haccp_v3/fonts/${fontName}`,
    `/home/root/haccp_v3/fonts/${fontName}`,
    `/var/www/haccp_v3/fonts/${fontName}`,
    `/home/user/haccp_v3/fonts/${fontName}`,
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) { /* ignore */ }
  }
  console.warn(`[PDF] 한글 폰트 못찾음: ${fontName}`);
  return null;
}

function formatKRW(value: string | number): string {
  const n = parseFloat(String(value || 0));
  return n.toLocaleString("ko-KR");
}

/**
 * 거래명세표 PDF 생성 — 모던 디자인 (2026-05-16 리뉴얼)
 *
 * 디자인 원칙:
 *   - 브랜드 컬러 (Emerald) 가는 누에띠 + 미니멀 헤더
 *   - 카드형 정보 블록 (공급자/공급받는자 좌우 분할)
 *   - 깔끔한 표 (헤더 강조 + zebra row + 우측 정렬 숫자)
 *   - 합계 박스 + 한글 금액 표기
 *   - A4 1장 fit + 자동 페이지 분할
 */
export async function generateTransactionStatementPDF(
  data: TransactionStatementData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: TOKENS.pageMargin,
        info: {
          Title: data.transactionType === "purchase" ? "매입 거래명세표" : "매출 거래명세표",
          Author: "Millio AI",
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ── 폰트 ────────────────────────────────────────────────
      const regularFontPath = findFontPath("NanumGothic-Regular.ttf");
      const boldFontPath = findFontPath("NanumGothic-Bold.ttf");
      if (!regularFontPath || !boldFontPath) {
        return reject(new Error(`한글 폰트 파일 없음. cwd=${process.cwd()}`));
      }
      doc.registerFont("NG", regularFontPath);
      doc.registerFont("NGB", boldFontPath);

      const { pageMargin, contentWidth, accentMain, accentSoft, accentDeep,
        textBody, textMuted, textFaint, border, rowZebra } = TOKENS;
      const leftX = pageMargin;
      const rightX = pageMargin + contentWidth;
      const colW = contentWidth / 2; // 좌우 분할 폭

      // ── 1. 헤더: 브랜드 컬러 바 + 타이틀 ─────────────────────
      // 상단 얇은 컬러 바 (브랜드 시그니처)
      doc.rect(0, 0, 595, 6).fill(accentMain);

      // 페이지 내용 시작 y
      let y = pageMargin + 10;

      // 좌측: 큰 타이틀 + 영문 + 보관용 라벨
      doc.fillColor(textBody).font("NGB").fontSize(24)
        .text("거 래 명 세 표", leftX, y, { width: colW, align: "left" });

      doc.fillColor(textMuted).font("NG").fontSize(8)
        .text("TRANSACTION STATEMENT", leftX, y + 32, { width: colW });

      const typeLabel = data.transactionType === "purchase"
        ? "공급자 보관용"
        : "공급받는자 보관용";
      doc.fillColor(accentDeep).font("NGB").fontSize(9)
        .text(`( ${typeLabel} )`, leftX, y + 46);

      // 우측: 거래명세표 번호 + 거래일자
      const statementNo = data.statementNumber
        || `${data.transactionType === "purchase" ? "P" : "S"}-${format(new Date(data.transactionDate), "yyyyMMdd")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

      const metaX = leftX + colW;
      doc.fillColor(textFaint).font("NG").fontSize(7)
        .text("STATEMENT NO.", metaX, y, { width: colW, align: "right" });
      doc.fillColor(textBody).font("NGB").fontSize(12)
        .text(statementNo, metaX, y + 10, { width: colW, align: "right" });

      doc.fillColor(textFaint).font("NG").fontSize(7)
        .text("DATE", metaX, y + 32, { width: colW, align: "right" });
      doc.fillColor(textBody).font("NGB").fontSize(11)
        .text(format(new Date(data.transactionDate), "yyyy. MM. dd"), metaX, y + 42, {
          width: colW,
          align: "right",
        });

      y += 75;

      // 헤더 구분선
      doc.moveTo(leftX, y).lineTo(rightX, y).lineWidth(0.5).strokeColor(border).stroke();
      y += 16;

      // ── 2. 공급자 / 공급받는자 (좌우 카드) ────────────────────
      const cardGap = 16;
      const cardW = (contentWidth - cardGap) / 2;
      const cardLeftX = leftX;
      const cardRightX = leftX + cardW + cardGap;

      const renderParty = (
        x: number,
        label: string,
        party: TransactionStatementData["supplier"],
        isUs: boolean,
      ) => {
        const startY = y;
        // 카드 배경 (subtle)
        doc.roundedRect(x, startY, cardW, 100, 6)
          .fillAndStroke(isUs ? accentSoft : "#FFFFFF", border)
          .strokeColor(border).lineWidth(0.5);

        const padX = x + 12;
        let py = startY + 12;

        // 라벨
        doc.fillColor(isUs ? accentDeep : textMuted).font("NGB").fontSize(8)
          .text(label.toUpperCase(), padX, py);
        py += 12;

        // 상호 (큰 글씨)
        doc.fillColor(textBody).font("NGB").fontSize(12)
          .text(party.name || "—", padX, py, { width: cardW - 24 });
        py += 16;

        // 세부 정보 (라벨: 값)
        const detailFont = (l: string, v: string | undefined) => {
          if (!v) return;
          doc.fillColor(textFaint).font("NG").fontSize(7)
            .text(l, padX, py);
          doc.fillColor(textBody).font("NG").fontSize(9)
            .text(v, padX + 50, py - 1, { width: cardW - 74 });
          py += 12;
        };

        detailFont("사업자번호", party.businessNumber);
        detailFont("대표자", party.representative);
        detailFont("연락처", party.phone);
        // 주소는 줄바꿈 가능 → 마지막에
        if (party.address) {
          doc.fillColor(textFaint).font("NG").fontSize(7).text("주소", padX, py);
          doc.fillColor(textBody).font("NG").fontSize(9)
            .text(party.address, padX + 50, py - 1, { width: cardW - 74 });
        }
      };

      renderParty(cardLeftX, "공급자  Supplier", data.supplier, data.transactionType === "sale");
      renderParty(cardRightX, "공급받는자  Recipient", data.recipient, data.transactionType === "purchase");

      y += 110;

      // ── 3. 품목 표 ──────────────────────────────────────────
      // 컬럼 폭 (총 contentWidth = 495)
      const cols = [
        { key: "no", title: "No.", width: 28, align: "center" as const },
        { key: "item", title: "품목명", width: 167, align: "left" as const },
        { key: "qty", title: "수량", width: 60, align: "right" as const },
        { key: "price", title: "단가", width: 80, align: "right" as const },
        { key: "amount", title: "공급가액", width: 95, align: "right" as const },
        { key: "note", title: "비고", width: 65, align: "left" as const },
      ];
      const rowH = 26;
      const headerH = 28;

      // 헤더
      doc.rect(leftX, y, contentWidth, headerH).fill(textBody); // 짙은 헤더
      let cx = leftX;
      cols.forEach((c) => {
        doc.fillColor("#FFFFFF").font("NGB").fontSize(9)
          .text(c.title, cx + 6, y + 9, { width: c.width - 12, align: c.align });
        cx += c.width;
      });
      y += headerH;

      // 본문 행 (자동 페이지 분할)
      doc.font("NG").fontSize(9);
      data.items.forEach((item, idx) => {
        // 페이지 분할
        if (y + rowH > 770) {
          doc.addPage();
          y = pageMargin;
        }

        // 줄무늬 (zebra)
        if (idx % 2 === 1) {
          doc.rect(leftX, y, contentWidth, rowH).fill(rowZebra);
        }

        cx = leftX;
        const cells = [
          String(idx + 1),
          item.itemName || "",
          `${formatKRW(item.quantity)} ${item.unit || ""}`,
          formatKRW(item.unitPrice),
          formatKRW(item.amount),
          item.note || "",
        ];
        cols.forEach((c, ci) => {
          doc.fillColor(textBody)
            .text(cells[ci], cx + 6, y + 8, { width: c.width - 12, align: c.align });
          cx += c.width;
        });

        // 행 하단 구분선
        doc.moveTo(leftX, y + rowH).lineTo(rightX, y + rowH)
          .lineWidth(0.3).strokeColor(border).stroke();

        y += rowH;
      });

      // 빈 행 (최소 5행까지 채워서 양식미 유지)
      const minRows = 5;
      for (let i = data.items.length; i < minRows; i++) {
        if (y + rowH > 770) break;
        if (i % 2 === 1) {
          doc.rect(leftX, y, contentWidth, rowH).fill(rowZebra);
        }
        doc.moveTo(leftX, y + rowH).lineTo(rightX, y + rowH)
          .lineWidth(0.3).strokeColor(border).stroke();
        y += rowH;
      }

      // 표 좌우 외곽선
      const tableTopY = y - (Math.max(data.items.length, minRows) * rowH) - headerH;
      doc.rect(leftX, tableTopY, contentWidth, y - tableTopY)
        .lineWidth(0.5).strokeColor(border).stroke();

      y += 18;

      // ── 4. 합계 (우측 정렬 카드) ───────────────────────────
      const sumCardW = 220;
      const sumX = rightX - sumCardW;

      // 공급가액 / 부가세
      doc.fillColor(textMuted).font("NG").fontSize(10);
      const sumLineH = 18;
      doc.text("공급가액", sumX, y, { width: 100 });
      doc.fillColor(textBody).font("NGB").fontSize(10)
        .text(`${formatKRW(data.totalAmount)} 원`, sumX, y, { width: sumCardW, align: "right" });
      y += sumLineH;

      doc.fillColor(textMuted).font("NG").fontSize(10)
        .text("부가세 (V.A.T.)", sumX, y, { width: 100 });
      doc.fillColor(textBody).font("NGB").fontSize(10)
        .text(`${formatKRW(data.taxAmount)} 원`, sumX, y, { width: sumCardW, align: "right" });
      y += sumLineH + 4;

      // 합계 — 강조 박스
      doc.roundedRect(sumX, y, sumCardW, 36, 6).fill(accentSoft);
      doc.fillColor(accentDeep).font("NGB").fontSize(11)
        .text("합  계  TOTAL", sumX + 12, y + 12, { width: 100 });
      doc.fillColor(accentDeep).font("NGB").fontSize(15)
        .text(`${formatKRW(data.grandTotal)} 원`, sumX, y + 9, {
          width: sumCardW - 12, align: "right",
        });
      y += 50;

      // ── 5. 부가 정보 (계좌 / 메모) ─────────────────────────
      const memoText = data.memo || data.notes;
      if (data.bankAccount || memoText) {
        // 좌측 박스
        const infoBoxH = 50;
        doc.roundedRect(leftX, y, contentWidth, infoBoxH, 6)
          .lineWidth(0.5).strokeColor(border).stroke();

        let infoY = y + 10;
        if (data.bankAccount) {
          doc.fillColor(accentDeep).font("NGB").fontSize(8)
            .text("입금 계좌  PAYMENT", leftX + 12, infoY);
          doc.fillColor(textBody).font("NG").fontSize(10)
            .text(
              `${data.bankAccount.bankName}   ${data.bankAccount.accountNumber}   (예금주: ${data.bankAccount.ownerName})`,
              leftX + 12, infoY + 12, { width: contentWidth - 24 },
            );
          infoY += 28;
        }
        if (memoText) {
          doc.fillColor(textMuted).font("NGB").fontSize(8)
            .text("비고  NOTE", leftX + 12, infoY);
          doc.fillColor(textBody).font("NG").fontSize(9)
            .text(memoText, leftX + 60, infoY, { width: contentWidth - 80 });
        }
        y += infoBoxH + 12;
      }

      // ── 6. 푸터 (발행 정보 + 브랜드) ────────────────────────
      const footerY = 790;
      doc.moveTo(leftX, footerY - 8).lineTo(rightX, footerY - 8)
        .lineWidth(0.3).strokeColor(border).stroke();
      doc.fillColor(textFaint).font("NG").fontSize(7)
        .text(
          `발행 일시: ${format(new Date(), "yyyy.MM.dd HH:mm", { locale: ko })}`,
          leftX, footerY, { width: contentWidth / 2 },
        );
      doc.fillColor(textFaint).font("NG").fontSize(7)
        .text("powered by Millio AI  ·  millioai.com", leftX, footerY, {
          width: contentWidth, align: "right",
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
