import { jsPDF } from "jspdf";

interface MonthlyCCPPDFExportProps {
  log: any;
}

export const MonthlyCCPPDFExport = ({ log }: MonthlyCCPPDFExportProps) => {
  const generatePDF = () => {
    const doc = new jsPDF();
    
    // 제목
    doc.setFontSize(18);
    doc.text("중요관리점(CCP) 검증점검표 (매월)", 105, 20, { align: "center" });
    
    // 기본 정보
    doc.setFontSize(12);
    doc.text(`점검일자: ${log.inspectionDate}`, 20, 40);
    doc.text(`점검자: ${log.inspector}`, 120, 40);
    doc.text(`상태: ${log.status}`, 20, 50);
    
    let yPos = 70;
    
    // 가열 공정
    doc.setFontSize(14);
    doc.text("가열 공정", 20, yPos);
    yPos += 10;
    doc.setFontSize(10);
    
    doc.text(`1. 가열온도/시간 기록: ${log.heating_temp_time === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 7;
    doc.text(`2. 온도계/타이머 검교정: ${log.heating_calibration === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 7;
    doc.text(`3. 가열온도 확인 방법: ${log.heating_temp_method === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 7;
    doc.text(`4. 가열시간 확인 방법: ${log.heating_time_method === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 7;
    doc.text(`5. 품온 확인 방법: ${log.heating_product_temp === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 10;
    
    doc.text(`모니터링 행동 관찰: ${log.heating_monitoring_observation || "-"}`, 25, yPos);
    yPos += 7;
    doc.text(`개선조치 기록: ${log.heating_corrective_action === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 7;
    doc.text(`담당자 인터뷰: ${log.heating_interview || "-"}`, 25, yPos);
    yPos += 15;
    
    // 금속검출 공정
    doc.setFontSize(14);
    doc.text("금속검출 공정", 20, yPos);
    yPos += 10;
    doc.setFontSize(10);
    
    doc.text(`1. 테스트피스 감도 확인: ${log.metal_test_piece === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 7;
    doc.text(`2. 금속검출기 검교정: ${log.metal_calibration === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 7;
    doc.text(`3. 감도 확인 방법: ${log.metal_sensitivity_method === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 10;
    
    doc.text(`모니터링 행동 관찰: ${log.metal_monitoring_observation || "-"}`, 25, yPos);
    yPos += 7;
    doc.text(`개선조치 기록: ${log.metal_corrective_action === "yes" ? "예" : "아니오"}`, 25, yPos);
    yPos += 7;
    doc.text(`담당자 인터뷰: ${log.metal_interview || "-"}`, 25, yPos);
    yPos += 15;
    
    // 한계기준 이탈 및 조치
    if (log.deviation_content) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.text("한계기준 이탈내용", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      const splitDeviation = doc.splitTextToSize(log.deviation_content, 170);
      doc.text(splitDeviation, 20, yPos);
      yPos += splitDeviation.length * 7 + 10;
    }
    
    if (log.corrective_action) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.text("개선조치 및 결과", 20, yPos);
      yPos += 10;
      doc.setFontSize(10);
      const splitAction = doc.splitTextToSize(log.corrective_action, 170);
      doc.text(splitAction, 20, yPos);
      yPos += splitAction.length * 7 + 10;
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
    doc.save(`월간일지_CCP검증_${log.inspectionDate}.pdf`);
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
