import { jsPDF } from "jspdf";

interface CustomPeriodPDFExportProps {
  log: any;
}

export const CustomPeriodPDFExport = ({ log }: CustomPeriodPDFExportProps) => {
  const generatePDF = () => {
    const doc = new jsPDF();
    
    // 제목
    doc.setFontSize(18);
    doc.text("특정기간일지", 105, 20, { align: "center" });
    
    // 기본 정보
    doc.setFontSize(12);
    doc.text(`기간: ${log.startDate} ~ ${log.endDate}`, 20, 40);
    doc.text(`작성자: ${log.inspector}`, 20, 50);
    doc.text(`상태: ${log.status}`, 120, 50);
    
    let yPos = 70;
    
    // 제목
    if (log.title) {
      doc.setFontSize(14);
      doc.text("제목", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      const splitTitle = doc.splitTextToSize(log.title, 170);
      doc.text(splitTitle, 20, yPos);
      yPos += splitTitle.length * 7 + 10;
    }
    
    // 내용
    if (log.content) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(14);
      doc.text("내용", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      const splitContent = doc.splitTextToSize(log.content, 170);
      doc.text(splitContent, 20, yPos);
      yPos += splitContent.length * 7 + 10;
    }
    
    // 특이사항
    if (log.specialNotes) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.text("특이사항", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      const splitNotes = doc.splitTextToSize(log.specialNotes, 170);
      doc.text(splitNotes, 20, yPos);
      yPos += splitNotes.length * 7 + 10;
    }
    
    // 개선조치
    if (log.improvement) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.text("개선조치 및 결과", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      const splitImprovement = doc.splitTextToSize(log.improvement, 170);
      doc.text(splitImprovement, 20, yPos);
      yPos += splitImprovement.length * 7 + 10;
    }
    
    // 승인 정보
    if (log.status === "승인완료" && log.approvedBy) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      yPos += 10;
      doc.setFontSize(12);
      doc.text("승인 정보", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      doc.text(`승인자: ${log.approvedBy}`, 25, yPos);
      yPos += 7;
      doc.text(`승인일시: ${log.approvedAt}`, 25, yPos);
    }
    
    // 날인 표기
    const pageCount = (doc as any).internal.pages.length - 1;
    doc.setPage(pageCount);
    yPos = 270;
    doc.setFontSize(10);
    doc.text("작성자: ___________", 20, yPos);
    doc.text("검토자: ___________", 80, yPos);
    doc.text("승인자: ___________", 140, yPos);
    
    // PDF 다운로드
    doc.save(`특정기간일지_${log.startDate}_${log.endDate}.pdf`);
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
