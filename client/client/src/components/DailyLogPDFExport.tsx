import { jsPDF } from "jspdf";
import { generateSealImage } from "./SealGenerator";

interface DailyLogPDFExportProps {
  log: any;
}

export const DailyLogPDFExport = ({ log }: DailyLogPDFExportProps) => {
  const generatePDF = () => {
    const doc = new jsPDF();
    
    // 제목
    doc.setFontSize(18);
    doc.text("일일일지", 105, 20, { align: "center" });
    
    // 기본 정보
    doc.setFontSize(12);
    doc.text(`작성일자: ${log.date}`, 20, 40);
    doc.text(`작성자: ${log.inspector || "-"}`, 20, 50);
    doc.text(`상태: ${log.status}`, 20, 60);
    
    // 체크리스트 항목
    doc.setFontSize(14);
    doc.text("체크리스트", 20, 80);
    
    doc.setFontSize(10);
    let yPos = 90;
    
    if (log.checklistItems && Array.isArray(log.checklistItems)) {
      log.checklistItems.forEach((item: any, index: number) => {
        const status = item.checked ? "✓" : "✗";
        doc.text(`${index + 1}. ${item.name}: ${status}`, 25, yPos);
        yPos += 10;
        
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
      });
    }
    
    // 특이사항
    if (log.notes) {
      yPos += 10;
      doc.setFontSize(12);
      doc.text("특이사항", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      const splitNotes = doc.splitTextToSize(log.notes, 170);
      doc.text(splitNotes, 20, yPos);
      yPos += splitNotes.length * 7;
    }
    
    // 승인 정보
    if (log.status === "승인완료" && log.approvedBy) {
      yPos += 10;
      doc.setFontSize(12);
      doc.text("승인 정보", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      doc.text(`승인자: ${log.approvedBy}`, 25, yPos);
      yPos += 7;
      doc.text(`승인일시: ${log.approvedAt}`, 25, yPos);
    }
    
    // 날인 표기 - 자동생성 직인 추가
    yPos = 250;
    doc.setFontSize(10);
    
    // 작성자 직인
    if (log.inspector) {
      doc.text("작성자:", 20, yPos);
      const writerSeal = generateSealImage(log.inspector, { type: "round", size: 60 });
      if (writerSeal) {
        doc.addImage(writerSeal, "PNG", 20, yPos + 2, 15, 15);
      }
    }
    
    // 검토자 직인
    if (log.reviewedBy) {
      doc.text("검토자:", 80, yPos);
      const reviewerSeal = generateSealImage(log.reviewedBy, { type: "round", size: 60 });
      if (reviewerSeal) {
        doc.addImage(reviewerSeal, "PNG", 80, yPos + 2, 15, 15);
      }
    }
    
    // 승인자 직인
    if (log.approvedBy && log.status === "승인완료") {
      doc.text("승인자:", 140, yPos);
      const approverSeal = generateSealImage(log.approvedBy, { date: log.approvedAt?.split(" ")[0], type: "round", size: 60 });
      if (approverSeal) {
        doc.addImage(approverSeal, "PNG", 140, yPos + 2, 15, 15);
      }
    }
    
    // PDF 다운로드
    doc.save(`일일일지_${log.date}.pdf`);
  };
  
  return (
    <button
      onClick={generatePDF}
      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
    >
      📥 PDF 출력
    </button>
  );
};
