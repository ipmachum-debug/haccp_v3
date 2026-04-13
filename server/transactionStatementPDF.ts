import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import path from "path";
import fs from "fs";

interface TransactionStatementData {
  // 거래 기본 정보
  transactionDate: string;
  transactionType: "purchase" | "sale"; // 매입 or 매출
  
  // 공급자 정보 (매입의 경우 거래처, 매출의 경우 우리 회사)
  supplier: {
    name: string;
    businessNumber?: string;
    address?: string;
    representative?: string;
    phone?: string;
  };
  
  // 공급받는자 정보 (매입의 경우 우리 회사, 매출의 경우 거래처)
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
  
  // 기타 정보
  memo?: string;
  notes?: string; // memo와 동일한 필드 (호환성)
  
  // 입금 계좌 정보 (매출의 경우)
  bankAccount?: {
    bankName: string;
    accountNumber: string;
    ownerName: string;
  };
}

// 한글 폰트 경로 찾기
// ★ 2026-04-13: PM2 dist 실행, 개발 서버, 컨테이너 등 다양한 cwd 대응
function findFontPath(fontName: string): string | null {
  const cwd = process.cwd();
  const possiblePaths = [
    path.join(cwd, "fonts", fontName),
    path.join(cwd, "..", "fonts", fontName),
    path.join(cwd, "..", "..", "fonts", fontName),
    path.join(cwd, "..", "..", "..", "fonts", fontName),
    // 하드코딩 대체 경로
    `/home/root/haccp_v3/fonts/${fontName}`,
    `/root/haccp_v3/fonts/${fontName}`,
    // __dirname 기반 (dist/index.js 에서 실행 시)
    path.join(__dirname, "..", "fonts", fontName),
    path.join(__dirname, "..", "..", "fonts", fontName),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch (_) { /* ignore */ }
  }

  console.warn(
    `[PDF] 한글 폰트 못찾음: ${fontName}. 탐색한 경로:\n  ${possiblePaths.join("\n  ")}`,
  );
  return null;
}

/**
 * 거래명세표 PDF 생성 함수 (한글 폰트 지원)
 */
export async function generateTransactionStatementPDF(
  data: TransactionStatementData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // 한글 폰트 등록 — 반드시 필요. 없으면 pdfkit 이 한글 렌더링에서 crash.
      const regularFontPath = findFontPath("NanumGothic-Regular.ttf");
      const boldFontPath = findFontPath("NanumGothic-Bold.ttf");

      if (!regularFontPath || !boldFontPath) {
        const msg = `한글 폰트 파일 없음 (NanumGothic-Regular.ttf / NanumGothic-Bold.ttf). ` +
          `서버의 fonts/ 폴더를 확인하세요. cwd=${process.cwd()}`;
        console.error(`[PDF] ${msg}`);
        return reject(new Error(msg));
      }

      doc.registerFont("NanumGothic", regularFontPath);
      doc.registerFont("NanumGothicBold", boldFontPath);
      const FONT_REGULAR = "NanumGothic";
      const FONT_BOLD = "NanumGothicBold";

      // 폰트 크기 설정
      const titleFontSize = 18;
      const headerFontSize = 11;
      const bodyFontSize = 10;
      const smallFontSize = 8;

      // 제목
      doc
        .font(FONT_BOLD)
        .fontSize(titleFontSize)
        .text("거 래 명 세 표", { align: "center" });
      doc.moveDown(0.3);

      // 밑줄
      const titleLineY = doc.y;
      doc.moveTo(200, titleLineY).lineTo(400, titleLineY).lineWidth(1).stroke();
      doc.moveDown(0.3);

      // 거래 유형 표시
      const typeText = data.transactionType === "purchase" ? "(공급자 보관용)" : "(공급받는자 보관용)";
      doc.font(FONT_REGULAR).fontSize(smallFontSize).text(typeText, { align: "center" });
      doc.moveDown(1);

      // 공급자 및 공급받는자 정보 (2단 레이아웃)
      const leftX = 50;
      const rightX = 320;
      const startY = doc.y;

      // 공급자 정보 (왼쪽)
      doc.font(FONT_BOLD).fontSize(headerFontSize).text("공급자", leftX, startY);
      const supplierUnderY = doc.y;
      doc.moveTo(leftX, supplierUnderY).lineTo(leftX + 50, supplierUnderY).lineWidth(0.5).stroke();
      doc.font(FONT_REGULAR).fontSize(bodyFontSize);
      doc.text(`상호: ${data.supplier.name}`, leftX, doc.y + 5);
      if (data.supplier.businessNumber) {
        doc.text(`사업자번호: ${data.supplier.businessNumber}`, leftX);
      }
      if (data.supplier.representative) {
        doc.text(`대표자: ${data.supplier.representative}`, leftX);
      }
      if (data.supplier.address) {
        doc.text(`주소: ${data.supplier.address}`, leftX, doc.y, { width: 250 });
      }
      if (data.supplier.phone) {
        doc.text(`전화: ${data.supplier.phone}`, leftX);
      }

      // 공급받는자 정보 (오른쪽)
      doc.font(FONT_BOLD).fontSize(headerFontSize).text("공급받는자", rightX, startY);
      const recipientUnderY = startY + 15;
      doc.moveTo(rightX, recipientUnderY).lineTo(rightX + 70, recipientUnderY).lineWidth(0.5).stroke();
      doc.font(FONT_REGULAR).fontSize(bodyFontSize);
      doc.text(`상호: ${data.recipient.name}`, rightX, startY + 20);
      if (data.recipient.businessNumber) {
        doc.text(`사업자번호: ${data.recipient.businessNumber}`, rightX);
      }
      if (data.recipient.representative) {
        doc.text(`대표자: ${data.recipient.representative}`, rightX);
      }
      if (data.recipient.address) {
        doc.text(`주소: ${data.recipient.address}`, rightX, doc.y, { width: 250 });
      }
      if (data.recipient.phone) {
        doc.text(`전화: ${data.recipient.phone}`, rightX);
      }

      doc.moveDown(2);

      // 거래 일자
      doc
        .font(FONT_REGULAR)
        .fontSize(bodyFontSize)
        .text(`거래 일자: ${format(new Date(data.transactionDate), "yyyy년 MM월 dd일", { locale: ko })}`, {
          align: "right"
        });
      doc.moveDown(1);

      // 품목 테이블
      const tableTop = doc.y;
      const tableLeft = 50;
      const colWidths = [40, 180, 60, 80, 100, 60]; // 번호, 품목, 수량, 단가, 금액, 비고
      const tableWidth = colWidths.reduce((a, b) => a + b, 0);
      const rowHeight = 25;

      // 테이블 헤더 배경
      doc.rect(tableLeft, tableTop - 3, tableWidth, rowHeight).fill("#f0f0f0");
      
      // 테이블 헤더 텍스트
      doc.fill("#000000").font(FONT_BOLD).fontSize(bodyFontSize);
      let currentX = tableLeft;
      const headers = ["번호", "품목", "수량", "단가", "금액", "비고"];
      headers.forEach((header, i) => {
        doc.text(header, currentX + 2, tableTop + 4, {
          width: colWidths[i] - 4,
          align: "center"
        });
        currentX += colWidths[i];
      });

      // 테이블 헤더 밑줄
      doc
        .moveTo(tableLeft, tableTop + rowHeight - 3)
        .lineTo(tableLeft + tableWidth, tableTop + rowHeight - 3)
        .lineWidth(1)
        .stroke();

      // 테이블 본문
      doc.font(FONT_REGULAR);
      let currentY = tableTop + rowHeight;
      data.items.forEach((item, index) => {
        currentX = tableLeft;
        const rowData = [
          (index + 1).toString(),
          item.itemName,
          `${parseFloat(item.quantity.toString()).toLocaleString()} ${item.unit}`,
          `${parseFloat(item.unitPrice.toString()).toLocaleString()}원`,
          `${parseFloat(item.amount.toString()).toLocaleString()}원`,
          item.note || "",
        ];

        // 짝수 행 배경
        if (index % 2 === 1) {
          doc.rect(tableLeft, currentY - 3, tableWidth, rowHeight).fill("#fafafa");
          doc.fill("#000000");
        }

        rowData.forEach((cellData, i) => {
          doc.text(cellData, currentX + 2, currentY + 4, {
            width: colWidths[i] - 4,
            align: i === 0 || i === 2 || i === 3 || i === 4 ? "right" : "left"
          });
          currentX += colWidths[i];
        });

        currentY += rowHeight;

        // 페이지 넘김 처리
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
        }
      });

      // 테이블 마지막 줄
      doc
        .moveTo(tableLeft, currentY - 3)
        .lineTo(tableLeft + tableWidth, currentY - 3)
        .lineWidth(1)
        .stroke();

      doc.moveDown(2);

      // 합계 정보
      const summaryX = 350;
      const summaryValueX = 470;
      doc.font(FONT_BOLD).fontSize(bodyFontSize);
      
      let summaryY = currentY + 15;
      doc.text("공급가액:", summaryX, summaryY);
      doc.text(`${parseFloat(data.totalAmount.toString()).toLocaleString()}원`, summaryValueX, summaryY, {
        width: 80,
        align: "right"
      });
      
      summaryY += 18;
      doc.text("부가세:", summaryX, summaryY);
      doc.text(`${parseFloat(data.taxAmount.toString()).toLocaleString()}원`, summaryValueX, summaryY, {
        width: 80,
        align: "right"
      });
      
      summaryY += 18;
      // 합계 강조
      doc.rect(summaryX - 5, summaryY - 3, 140, 20).fill("#e8f5e9");
      doc.fill("#000000");
      doc.text("합  계:", summaryX, summaryY);
      doc.text(`${parseFloat(data.grandTotal.toString()).toLocaleString()}원`, summaryValueX, summaryY, {
        width: 80,
        align: "right"
      });
      
      doc.y = summaryY + 30;

      // 메모
      const memoText = data.memo || data.notes;
      if (memoText) {
        doc.font(FONT_REGULAR).fontSize(bodyFontSize);
        doc.text(`비고: ${memoText}`, tableLeft, doc.y, { width: 500 });
        doc.moveDown(1);
      }

      // 입금 계좌 정보 (매출의 경우)
      if (data.bankAccount) {
        doc.font(FONT_BOLD).fontSize(bodyFontSize);
        doc.text(
          `입금 계좌: ${data.bankAccount.bankName} ${data.bankAccount.accountNumber} (예금주: ${data.bankAccount.ownerName})`,
          { align: "center" }
        );
        doc.moveDown(1);
      }

      // 푸터
      doc.font(FONT_REGULAR).fontSize(smallFontSize).text(
        `발행 일시: ${format(new Date(), "yyyy년 MM월 dd일 HH시 mm분", { locale: ko })}`,
        { align: "center" }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
