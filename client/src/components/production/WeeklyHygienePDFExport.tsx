import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import jsPDF from 'jspdf';

interface WeeklyHygienePDFExportProps {
  log: any;
}

export function WeeklyHygienePDFExport({ log }: WeeklyHygienePDFExportProps) {
  const generatePDF = () => {
    const doc = new jsPDF();
    
    // 한글 폰트 설정 (기본 폰트 사용)
    doc.setFont('helvetica');
    
    // 제목
    doc.setFontSize(18);
    doc.text('일반위생관리 및 공정점검표 (주간)', 105, 20, { align: 'center' });
    
    // 기본 정보
    doc.setFontSize(12);
    doc.text(`점검 일자: ${log.check_date}`, 20, 40);
    doc.text(`점검자: ${log.checker_name || '-'}`, 20, 50);
    doc.text(`주기: 주간`, 20, 60);
    doc.text(`관리: 청소·소독`, 20, 70);
    
    // 구분선
    doc.line(20, 75, 190, 75);
    
    // 점검 내용
    doc.setFontSize(11);
    doc.text('점검 내용', 20, 85);
    doc.text('기록', 150, 85);
    
    doc.line(20, 88, 190, 88);
    
    let yPos = 98;
    
    // 항목 1
    doc.text('1. 냉장창고 내부 청소 상태는 양호한가?', 20, yPos);
    doc.text(log.cold_storage_clean || '-', 150, yPos);
    yPos += 15;
    
    // 항목 2
    const text2 = '2. 작업장 벽, 제조설비(제품과 직접 닿지 않는';
    doc.text(text2, 20, yPos);
    yPos += 5;
    doc.text('   부분)에 대한 청소·소독 상태는 양호한가?', 20, yPos);
    doc.text(log.facility_clean || '-', 150, yPos - 5);
    yPos += 15;
    
    // 항목 3
    doc.text('3. 위생복 세탁은 실시하였는가?', 20, yPos);
    doc.text(log.uniform_wash || '-', 150, yPos);
    yPos += 20;
    
    // 구분선
    doc.line(20, yPos, 190, yPos);
    yPos += 10;
    
    // 특이사항
    doc.text('특이사항:', 20, yPos);
    yPos += 7;
    const specialNotes = log.special_notes || '-';
    const splitSpecial = doc.splitTextToSize(specialNotes, 170);
    doc.text(splitSpecial, 20, yPos);
    yPos += splitSpecial.length * 7 + 10;
    
    // 개선조치 및 결과
    doc.text('개선조치 및 결과:', 20, yPos);
    yPos += 7;
    const improvement = log.improvement_action || '-';
    const splitImprovement = doc.splitTextToSize(improvement, 170);
    doc.text(splitImprovement, 20, yPos);
    yPos += splitImprovement.length * 7 + 10;
    
    // 확인
    doc.text(`확인: ${log.confirmation || '-'}`, 20, yPos);
    yPos += 20;
    
    // 날인 표기
    doc.setFontSize(10);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;
    
    doc.text('작성자: ________________', 30, yPos);
    doc.text('검토자: ________________', 85, yPos);
    doc.text('승인자: ________________', 140, yPos);
    
    // 승인 정보
    if (log.status === '승인완료' && log.approved_by) {
      yPos += 15;
      doc.text(`승인자: ${log.approved_by}`, 140, yPos);
      yPos += 7;
      doc.text(`승인일시: ${log.approved_at}`, 140, yPos);
    }
    
    // 상태 표시
    yPos += 15;
    doc.setFontSize(9);
    doc.text(`상태: ${log.status}`, 20, yPos);
    doc.text(`작성일시: ${log.created_at}`, 20, yPos + 7);
    
    // PDF 저장
    doc.save(`일반위생관리_주간일지_${log.check_date}.pdf`);
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={generatePDF}
      className="text-blue-600"
    >
      <FileDown className="h-4 w-4 mr-2" />
      PDF 출력
    </Button>
  );
}
