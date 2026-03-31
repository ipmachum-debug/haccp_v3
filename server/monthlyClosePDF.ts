import PDFDocument from "pdfkit";
import { getDb } from "./db";

import { toKSTDate } from "./utils/timezone";

interface MonthlyCloseData {
  year: number;
  month: number;
  totalPurchases: number;
  totalSales: number;
  netCashFlow: number;
  topTransactions: Array<{
    date: string;
    type: "purchase" | "sale";
    partnerName: string;
    itemName: string;
    amount: number;
  }>;
}

/**
 * 월간 마감 PDF 생성 함수
 * @param data 월간 마감 데이터
 * @returns PDF Buffer
 */
export async function generateMonthlyClosePDF(data: MonthlyCloseData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const buffers: Buffer[] = [];

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });
    doc.on("error", reject);

    // PDF 제목
    doc.fontSize(20).text(`${data.year}년 ${data.month}월 회계 마감 리포트`, { align: "center" });
    doc.moveDown(2);

    // 요약 정보
    doc.fontSize(14).text("📊 월간 요약", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`총 매입: ${data.totalPurchases.toLocaleString()}원`);
    doc.text(`총 매출: ${data.totalSales.toLocaleString()}원`);
    doc.text(`순현금흐름: ${data.netCashFlow.toLocaleString()}원`);
    doc.moveDown(2);

    // 고액 거래 리스트
    doc.fontSize(14).text("💰 고액 거래 리스트 (상위 10건)", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);

    if (data.topTransactions.length > 0) {
      // 테이블 헤더
      const startY = doc.y;
      const colWidths = [60, 50, 120, 120, 100];
      const headers = ["날짜", "유형", "거래처", "품목", "금액"];

      let x = 50;
      headers.forEach((header, i) => {
        doc.text(header, x, startY, { width: colWidths[i], align: "left" });
        x += colWidths[i];
      });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      // 테이블 데이터
      data.topTransactions.forEach((tx) => {
        const rowY = doc.y;
        x = 50;

        doc.text(tx.date, x, rowY, { width: colWidths[0], align: "left" });
        x += colWidths[0];

        doc.text(tx.type === "purchase" ? "매입" : "매출", x, rowY, {
          width: colWidths[1],
          align: "left"
        });
        x += colWidths[1];

        doc.text(tx.partnerName || "-", x, rowY, { width: colWidths[2], align: "left" });
        x += colWidths[2];

        doc.text(tx.itemName || "-", x, rowY, { width: colWidths[3], align: "left" });
        x += colWidths[3];

        doc.text(`${tx.amount.toLocaleString()}원`, x, rowY, {
          width: colWidths[4],
          align: "right"
        });

        doc.moveDown(0.8);
      });
    } else {
      doc.text("고액 거래 내역이 없습니다.");
    }

    doc.moveDown(2);

    // 푸터
    doc.fontSize(8).text(`생성일시: ${new Date().toLocaleString("ko-KR")}`, {
      align: "center"
    });

    doc.end();
  });
}

/**
 * 월간 마감 데이터 조회 및 PDF 생성
 * @param year 년도
 * @param month 월
 * @returns PDF Buffer
 */
export async function createMonthlyClosePDF(year: number, month: number): Promise<Buffer> {
  const db = await getDb();

  // 월간 마감 데이터 조회
  const dbAny = db as any;
  const closeData = await dbAny
    .selectFrom("accounting_monthly_close")
    .selectAll()
    .where("year", "=", year)
    .where("month", "=", month)
    .executeTakeFirst();

  if (!closeData) {
    throw new Error(`${year}년 ${month}월 마감 데이터가 없습니다.`);
  }

  // 고액 거래 조회 (상위 10건)
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = toKSTDate(new Date(year, month, 0)); // 해당 월의 마지막 날

  const topPurchases = await dbAny
    .selectFrom("accounting_purchases")
    .select([
      "transaction_date as date",
      "partner_name as partnerName",
      "item_name as itemName",
      "total_amount as amount",
    ])
    .where("transaction_date", ">=", startDate)
    .where("transaction_date", "<=", endDate)
    .orderBy("total_amount", "desc")
    .limit(5)
    .execute();

  const topSales = await dbAny
    .selectFrom("accounting_sales")
    .select([
      "transaction_date as date",
      "partner_name as partnerName",
      "item_name as itemName",
      "total_amount as amount",
    ])
    .where("transaction_date", ">=", startDate)
    .where("transaction_date", "<=", endDate)
    .orderBy("total_amount", "desc")
    .limit(5)
    .execute();

  const topTransactions = [
    ...topPurchases.map((p: any) => ({ ...p, type: "purchase" as const })),
    ...topSales.map((s: any) => ({ ...s, type: "sale" as const })),
  ]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 10);

  const pdfData: MonthlyCloseData = {
    year,
    month,
    totalPurchases: Number(closeData.total_purchases),
    totalSales: Number(closeData.total_sales),
    netCashFlow: Number(closeData.total_sales) - Number(closeData.total_purchases),
    topTransactions: topTransactions.map((tx) => ({
      date: tx.date,
      type: tx.type,
      partnerName: tx.partnerName || "-",
      itemName: tx.itemName || "-",
      amount: Number(tx.amount)
    }))
  };

  return generateMonthlyClosePDF(pdfData);
}
