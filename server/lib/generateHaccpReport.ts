import PDFDocument from "pdfkit";
import { Readable } from "stream";
import { getDb } from "../db";
import { hBatches, hBatchApprovals, hInventoryLots, hBatchInputs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export interface HaccpReportData {
  batch: {
    id: number;
    batchCode: string;
    productName: string;
    quantity: number;
    unit: string;
    startDate: Date;
    endDate: Date | null;
    status: string;
  };
  ccpRecords: Array<{
    id: number;
    recordData: any;
    recordedAt: Date;
    recordedBy: string;
  }>;
  approvals: Array<{
    id: number;
    status: string;
    approverName: string;
    approvalDate: Date | null;
    rejectionReason: string | null;
  }>;
  materials: Array<{
    materialName: string;
    lotNumber: string;
    quantity: number;
    unit: string;
  }>;
}

/**
 * HACCP 보고서 데이터 수집
 */
export async function collectHaccpReportData(batchId: number): Promise<HaccpReportData> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection failed");
  }

  // 배치 정보 조회
  const [batch] = await db.select().from(hBatches).where(eq(hBatches.id, batchId));
  if (!batch) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  // CCP 점검 기록 조회 (주의: h_ccp_records에는 batchId가 없으므로 빈 배열 반환)
  // TODO: CCP 인스턴스를 통해 batchId로 연결하는 로직 필요
  const ccpRecords: any[] = [];

  // 승인 이력 조회
  const approvals = await db
    .select()
    .from(hBatchApprovals)
    .where(eq(hBatchApprovals.batchId, batchId))
    .orderBy(hBatchApprovals.createdAt);

  // 원재료 추적 정보 조회
  const materialsRaw = await db
    .select()
    .from(hBatchInputs)
    .leftJoin(hInventoryLots, eq(hBatchInputs.lotId, hInventoryLots.id))
    .where(eq(hBatchInputs.batchId, batchId));

  const materials = materialsRaw.map((row: any) => ({
    materialName: row.h_inventory_lots?.materialName || "Unknown",
    lotNumber: row.h_inventory_lots?.lotNumber || "Unknown",
    quantity: parseFloat(row.h_batch_inputs?.quantityUsed || "0"),
    unit: row.h_batch_inputs?.unit || "kg"
  }));

  return {
    batch: {
      id: batch.id,
      batchCode: batch.batchCode,
      productName: "Product", // TODO: productId로 product 테이블에서 조회
      quantity: parseFloat(batch.plannedQuantity || "0"),
      unit: "kg", // TODO: product 테이블에서 조회
      startDate: batch.startTime || batch.plannedDate,
      endDate: batch.endTime,
      status: batch.status
    },
    ccpRecords: ccpRecords.map((record: any) => ({
      id: record.id,
      recordData: record.recordData,
      recordedAt: record.recordedAt,
      recordedBy: record.recordedBy || "Unknown"
    })),
    approvals: approvals.map((approval: any) => ({
      id: approval.id,
      status: approval.status,
      approverName: approval.approverName || "Unknown",
      approvalDate: approval.approvalDate,
      rejectionReason: approval.rejectionReason
    })),
    materials
  };
}

/**
 * HACCP 보고서 PDF 생성
 */
export async function generateHaccpReportPdf(batchId: number): Promise<Buffer> {
  const data = await collectHaccpReportData(batchId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // 제목
    doc.fontSize(20).font("Helvetica-Bold").text("HACCP Report", { align: "center" });
    doc.moveDown();

    // 배치 정보
    doc.fontSize(14).font("Helvetica-Bold").text("Batch Information");
    doc.fontSize(10).font("Helvetica");
    doc.text(`Batch Code: ${data.batch.batchCode}`);
    doc.text(`Product Name: ${data.batch.productName}`);
    doc.text(`Quantity: ${data.batch.quantity} ${data.batch.unit}`);
    doc.text(`Start Date: ${data.batch.startDate.toLocaleDateString("ko-KR")}`);
    doc.text(`End Date: ${data.batch.endDate ? data.batch.endDate.toLocaleDateString("ko-KR") : "N/A"}`);
    doc.text(`Status: ${data.batch.status}`);
    doc.moveDown();

    // 원재료 추적 정보
    doc.fontSize(14).font("Helvetica-Bold").text("Raw Materials Traceability");
    doc.fontSize(10).font("Helvetica");
    if (data.materials.length === 0) {
      doc.text("No raw materials recorded.");
    } else {
      data.materials.forEach((material, index) => {
        doc.text(
          `${index + 1}. ${material.materialName} (LOT: ${material.lotNumber}) - ${material.quantity} ${material.unit}`
        );
      });
    }
    doc.moveDown();

    // CCP 점검 기록
    doc.fontSize(14).font("Helvetica-Bold").text("CCP Inspection Records");
    doc.fontSize(10).font("Helvetica");
    if (data.ccpRecords.length === 0) {
      doc.text("No CCP inspection records.");
    } else {
      data.ccpRecords.forEach((record, index) => {
        doc.text(`${index + 1}. Recorded at: ${record.recordedAt.toLocaleString("ko-KR")}`);
        doc.text(`   Recorded by: ${record.recordedBy}`);
        doc.text(`   Data: ${JSON.stringify(record.recordData)}`);
        doc.moveDown(0.5);
      });
    }
    doc.moveDown();

    // 승인 이력
    doc.fontSize(14).font("Helvetica-Bold").text("Approval History");
    doc.fontSize(10).font("Helvetica");
    if (data.approvals.length === 0) {
      doc.text("No approval records.");
    } else {
      data.approvals.forEach((approval, index) => {
        doc.text(`${index + 1}. Status: ${approval.status}`);
        doc.text(`   Approver: ${approval.approverName}`);
        doc.text(`   Date: ${approval.approvalDate ? approval.approvalDate.toLocaleString("ko-KR") : "N/A"}`);
        if (approval.rejectionReason) {
          doc.text(`   Rejection Reason: ${approval.rejectionReason}`);
        }
        doc.moveDown(0.5);
      });
    }

    // 보고서 생성 시간
    doc.moveDown();
    doc.fontSize(8).text(`Report generated at: ${new Date().toLocaleString("ko-KR")}`, { align: "right" });

    doc.end();
  });
}
