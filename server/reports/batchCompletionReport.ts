import PDFDocument from "pdfkit";
import { storagePut } from "../storage";
import { getDb } from "../db";
import { hBatches, hProductsV2, hCcpInstances, hCcpRecords, hBatchInputs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * 배치 완료 보고서 PDF 생성
 * @param batchId 배치 ID
 * @returns S3에 업로드된 PDF URL
 */
export async function generateBatchCompletionReport(batchId: number, tenantId?: number): Promise<string> {
  const db = await getDb();
  if (!db) {
    throw new Error("DB 연결 실패");
  }

  // 1. 배치 정보 조회
  const batch = await db
    .select()
    .from(hBatches)
    .where(eq(hBatches.id, batchId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  // 2. 제품 정보 조회
  const product = await db
    .select()
    .from(hProductsV2)
    .where(eq(hProductsV2.id, batch.productId))
    .limit(1)
    .then((rows) => rows[0]);

  // 3. CCP 점검 기록 조회
  const ccpInstances = await db
    .select()
    .from(hCcpInstances)
    .where(eq(hCcpInstances.batchId, batchId));

  const ccpRecords = [];
  for (const instance of ccpInstances) {
    const records = await db
      .select()
      .from(hCcpRecords)
      .where(eq(hCcpRecords.instanceId, instance.id));
    ccpRecords.push({ instance, records });
  }

  // 4. 원재료 투입 내역 조회
  const batchInputs = await db
    .select()
    .from(hBatchInputs)
    .where(eq(hBatchInputs.batchId, batchId));

  // 5. PDF 생성
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  // PDF 제목
  doc.fontSize(20).text("배치 완료 보고서", { align: "center" });
  doc.moveDown();

  // 배치 기본 정보
  doc.fontSize(14).text("배치 기본 정보", { underline: true });
  doc.fontSize(10);
  doc.text(`배치 코드: ${batch.batchCode}`);
  doc.text(`제품명: ${product?.productName || "N/A"}`);
  doc.text(`계획 수량: ${batch.plannedQuantity} ${product?.unit || ""}`);
  doc.text(`실제 수량: ${batch.actualQuantity || "N/A"} ${product?.unit || ""}`);
  doc.text(`시작 시간: ${batch.startTime ? new Date(batch.startTime).toLocaleString("ko-KR") : "N/A"}`);
  doc.text(`종료 시간: ${batch.endTime ? new Date(batch.endTime).toLocaleString("ko-KR") : "N/A"}`);
  doc.text(`배치 모드: ${batch.mode === "manual" ? "수동" : "자동"}`);
  doc.moveDown();

  // CCP 점검 기록
  doc.fontSize(14).text("CCP 점검 기록", { underline: true });
  doc.fontSize(10);
  if (ccpRecords.length > 0) {
    for (const { instance, records } of ccpRecords) {
      doc.text(`- CCP 타입: ${instance.ccpType}`);
      doc.text(`  상태: ${instance.status}`);
      doc.text(`  점검 기록 수: ${records.length}건`);
      doc.moveDown(0.5);
    }
  } else {
    doc.text("CCP 점검 기록이 없습니다.");
  }
  doc.moveDown();

  // 원재료 투입 내역
  doc.fontSize(14).text("원재료 투입 내역", { underline: true });
  doc.fontSize(10);
  if (batchInputs.length > 0) {
    for (const input of batchInputs) {
      doc.text(`- LOT ID: ${input.lotId || "N/A"}`);
      doc.text(`  계획 수량: ${input.plannedQuantity} ${input.unit || ""}`);
      doc.text(`  실제 수량: ${input.actualQuantity || "N/A"} ${input.unit || ""}`);
      doc.moveDown(0.5);
    }
  } else {
    doc.text("원재료 투입 내역이 없습니다.");
  }
  doc.moveDown();

  // 생산 실적
  doc.fontSize(14).text("생산 실적", { underline: true });
  doc.fontSize(10);
  const yieldRate = batch.actualQuantity && batch.plannedQuantity
    ? ((Number(batch.actualQuantity) / Number(batch.plannedQuantity)) * 100).toFixed(2)
    : "N/A";
  doc.text(`수율: ${yieldRate}%`);
  doc.moveDown();

  // 보고서 생성 시간
  doc.fontSize(8).text(`보고서 생성 시간: ${new Date().toLocaleString("ko-KR")}`, { align: "right" });

  doc.end();

  // 6. PDF를 Buffer로 변환
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // 7. S3에 업로드
  const fileName = `batch-completion-report-${batch.batchCode}-${Date.now()}.pdf`;
  const tenantPrefix = tenantId ? `tenant-${tenantId}/` : "";
  const { url } = await storagePut(`${tenantPrefix}reports/${fileName}`, pdfBuffer, "application/pdf");

  return url;
}
