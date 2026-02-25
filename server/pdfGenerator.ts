import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface BatchReportData {
  batch: any;
  product: any;
  ccpInstances: any[];
  ccpRecords: any[];
  materialInputs: any[];
}

export async function generateBatchPDF(data: BatchReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // 제목
      doc.fontSize(20).text("배치 생산 보고서", { align: "center" });
      doc.moveDown();

      // 배치 정보
      doc.fontSize(14).text("1. 배치 정보", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`배치 코드: ${data.batch.batchCode}`);
      doc.text(`제품 ID: ${data.batch.productId}`);
      doc.text(`계획 수량: ${data.batch.plannedQuantity}`);
      doc.text(`실제 수량: ${data.batch.actualQuantity || "N/A"}`);
      doc.text(`상태: ${data.batch.status}`);
      doc.text(
        `생산 시작: ${
          data.batch.startTime
            ? format(new Date(data.batch.startTime), "PPpp", { locale: ko })
            : "N/A"
        }`
      );
      doc.text(
        `생산 완료: ${
          data.batch.endTime
            ? format(new Date(data.batch.endTime), "PPpp", { locale: ko })
            : "N/A"
        }`
      );
      doc.moveDown();

      // CCP 점검 기록
      doc.fontSize(14).text("2. CCP 점검 기록", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      
      if (data.ccpRecords.length > 0) {
        data.ccpRecords.forEach((record, index) => {
          doc.text(`${index + 1}. CCP 인스턴스 ID: ${record.instanceId}`);
          doc.text(`   점검 일시: ${format(new Date(record.recordDate), "PPpp", { locale: ko })}`);
          doc.text(`   온도: ${record.temperature || "N/A"}`);
          doc.text(`   시간: ${record.time || "N/A"}`);
          doc.text(`   압력: ${record.pressure || "N/A"}`);
          doc.text(`   pH: ${record.ph || "N/A"}`);
          doc.text(`   습도: ${record.humidity || "N/A"}`);
          doc.text(`   준수 여부: ${record.isCompliant ? "준수" : "미준수"}`);
          if (record.note) {
            doc.text(`   비고: ${record.note}`);
          }
          doc.moveDown(0.5);
        });
      } else {
        doc.text("CCP 점검 기록이 없습니다.");
      }
      doc.moveDown();

      // 원재료 투입 내역
      doc.fontSize(14).text("3. 원재료 투입 내역", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      
      if (data.materialInputs.length > 0) {
        data.materialInputs.forEach((item, index) => {
          const input = item.input;
          const material = item.material;
          doc.text(`${index + 1}. 원재료 ID: ${input.materialId}`);
          if (material) {
            doc.text(`   원재료명: ${material.name}`);
          }
          doc.text(`   LOT 번호: ${input.lotNumber}`);
          doc.text(`   투입 수량: ${input.quantity}`);
          doc.text(
            `   투입 일시: ${format(new Date(input.inputDate), "PPpp", { locale: ko })}`
          );
          doc.moveDown(0.5);
        });
      } else {
        doc.text("원재료 투입 내역이 없습니다.");
      }
      doc.moveDown();

      // 푸터
      doc.fontSize(8).text(
        `보고서 생성 일시: ${format(new Date(), "PPpp", { locale: ko })}`,
        { align: "center" }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
