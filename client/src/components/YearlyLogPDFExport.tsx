import { jsPDF } from "jspdf";

interface YearlyLogPDFExportProps {
  log: any;
}

export const YearlyLogPDFExport = ({ log }: YearlyLogPDFExportProps) => {
  const generatePDF = () => {
    const doc = new jsPDF();
    
    // 제목
    doc.setFontSize(18);
    doc.text("일반위생관리 및 공정점검표 (연간)", 105, 20, { align: "center" });
    
    // 기본 정보
    doc.setFontSize(12);
    doc.text(`점검일자: ${log.inspectionDate}`, 20, 40);
    doc.text(`점검자: ${log.inspector}`, 120, 40);
    doc.text(`상태: ${log.status}`, 20, 50);
    
    let yPos = 70;
    
    // 검교정 항목
    doc.setFontSize(14);
    doc.text("검교정 항목", 20, yPos);
    yPos += 10;
    doc.setFontSize(10);
    
    const items = [
      { label: "냉동창고 판넬온도계", field: "freezer_panel_thermometer" },
      { label: "냉장고", field: "refrigerator" },
      { label: "타이머", field: "timer" },
      { label: "탈침온도계", field: "probe_thermometer" },
      { label: "저울", field: "scale" },
      { label: "오븐기", field: "oven" },
      { label: "금속검출기", field: "metal_detector" },
      { label: "온습도계", field: "thermo_hygrometer" },
      { label: "복사온도계1", field: "infrared_thermometer1" },
      { label: "복사온도계2", field: "infrared_thermometer2" },
      { label: "오븐용 실무온도계", field: "oven_practical_thermometer" },
    ];
    
    items.forEach((item, index) => {
      const date = log[item.field] || "-";
      doc.text(`${index + 1}. ${item.label}: ${date}`, 25, yPos);
      yPos += 7;
      
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }
    });
    
    yPos += 10;
    
    // 금속검출기 정기점검
    doc.setFontSize(12);
    doc.text("금속검출기 정기점검", 20, yPos);
    yPos += 10;
    doc.setFontSize(10);
    doc.text(`점검일자: ${log.metal_detector_inspection || "-"}`, 25, yPos);
    yPos += 7;
    doc.text(`차기 검교정 일자: ${log.metal_detector_next || "-"}`, 25, yPos);
    yPos += 15;
    
    // 정기검증
    doc.setFontSize(12);
    doc.text("정기검증 (실시상황평가표)", 20, yPos);
    yPos += 10;
    doc.setFontSize(10);
    doc.text(`검증일자: ${log.periodic_verification || "-"}`, 25, yPos);
    yPos += 7;
    doc.text(`차기 정기검증 일자: ${log.periodic_verification_next || "-"}`, 25, yPos);
    yPos += 15;
    
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
    doc.save(`연간일지_${log.inspectionDate}.pdf`);
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
