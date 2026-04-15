import { jsPDF } from "jspdf";

interface MonthlyHygienePDFExportProps {
  log: any;
}

export const MonthlyHygienePDFExport = ({ log }: MonthlyHygienePDFExportProps) => {
  const generatePDF = () => {
    const doc = new jsPDF();
    
    // 제목
    doc.setFontSize(18);
    doc.text("일반위생관리 및 공정점검표 (월간)", 105, 20, { align: "center" });
    
    // 기본 정보
    doc.setFontSize(12);
    doc.text(`점검일자: ${log.inspectionDate}`, 20, 40);
    doc.text(`점검자: ${log.inspector}`, 120, 40);
    doc.text(`상태: ${log.status}`, 20, 50);
    
    // 체크 항목
    doc.setFontSize(14);
    doc.text("점검 항목", 20, 70);
    
    doc.setFontSize(10);
    let yPos = 80;
    
    // 청소
    doc.text(`1. 청소: ${log.cleaning === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 10;
    
    // 교육
    doc.text(`2. 교육: ${log.education === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 10;
    
    // 검증
    doc.text(`3. 검증: ${log.verification === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 20;
    
    // 특이사항
    if (log.specialNotes) {
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
      doc.setFontSize(12);
      doc.text("개선조치 및 결과", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      const splitImprovement = doc.splitTextToSize(log.improvement, 170);
      doc.text(splitImprovement, 20, yPos);
      yPos += splitImprovement.length * 7 + 10;
    }
    
    // 확인
    if (log.confirmation) {
      doc.setFontSize(12);
      doc.text("확인", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      const splitConfirmation = doc.splitTextToSize(log.confirmation, 170);
      doc.text(splitConfirmation, 20, yPos);
      yPos += splitConfirmation.length * 7 + 10;
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
    
    // 날인 표기
    yPos = 270;
    doc.setFontSize(10);
    doc.text("작성자: ___________", 20, yPos);
    doc.text("검토자: ___________", 80, yPos);
    doc.text("승인자: ___________", 140, yPos);
    
    // PDF 다운로드
    doc.save(`월간일지_일반위생관리_${log.inspectionDate}.pdf`);
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
