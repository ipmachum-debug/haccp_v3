import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface LotTraceData {
  traceType: "forward" | "backward";
  searchLotNumber: string;
  resultData: any;
  tracedAt: Date;
  tracedBy?: string;
}

export async function generateLotTracePdf(data: LotTraceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers: Buffer[] = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // 제목
      doc.fontSize(20).text("LOT 추적성 보고서", { align: "center" });
      doc.moveDown();

      // 기본 정보
      doc.fontSize(12);
      doc.text(`추적 유형: ${data.traceType === "forward" ? "정방향 추적 (원재료 → 완제품)" : "역방향 추적 (완제품 → 원재료)"}`);
      doc.text(`검색 LOT 번호: ${data.searchLotNumber}`);
      doc.text(`추적 일시: ${format(data.tracedAt, "yyyy-MM-dd HH:mm:ss", { locale: ko })}`);
      if (data.tracedBy) {
        doc.text(`추적자: ${data.tracedBy}`);
      }
      doc.moveDown();

      // 추적 결과
      doc.fontSize(14).text("추적 결과", { underline: true });
      doc.moveDown(0.5);

      const resultData = typeof data.resultData === "string" ? JSON.parse(data.resultData) : data.resultData;

      if (data.traceType === "forward") {
        // 정방향 추적 결과
        if (resultData.batches && resultData.batches.length > 0) {
          doc.fontSize(12).text(`사용된 배치: ${resultData.batches.length}개`);
          doc.moveDown(0.5);

          resultData.batches.forEach((batch: any, index: number) => {
            doc.fontSize(11).text(`${index + 1}. 배치 번호: ${batch.batchNumber || "N/A"}`);
            doc.text(`   제품: ${batch.productName || "N/A"}`);
            doc.text(`   생산일: ${batch.productionDate ? format(new Date(batch.productionDate), "yyyy-MM-dd", { locale: ko }) : "N/A"}`);
            doc.text(`   수량: ${batch.quantity || "N/A"}`);
            doc.moveDown(0.3);
          });
        } else {
          doc.fontSize(11).text("추적 결과가 없습니다.");
        }
      } else {
        // 역방향 추적 결과
        if (resultData.materials && resultData.materials.length > 0) {
          doc.fontSize(12).text(`사용된 원재료: ${resultData.materials.length}개`);
          doc.moveDown(0.5);

          resultData.materials.forEach((material: any, index: number) => {
            doc.fontSize(11).text(`${index + 1}. 원재료명: ${material.materialName || "N/A"}`);
            doc.text(`   LOT 번호: ${material.lotNumber || "N/A"}`);
            doc.text(`   입고일: ${material.receivedDate ? format(new Date(material.receivedDate), "yyyy-MM-dd", { locale: ko }) : "N/A"}`);
            doc.text(`   공급업체: ${material.supplier || "N/A"}`);
            doc.moveDown(0.3);
          });
        } else {
          doc.fontSize(11).text("추적 결과가 없습니다.");
        }
      }

      // 푸터
      doc.moveDown(2);
      doc.fontSize(10).text("본 보고서는 Millio AI (AI 기반 제조 ERP) 에서 자동 생성되었습니다.", { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
