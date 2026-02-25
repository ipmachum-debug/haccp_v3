import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';
import jsPDF from 'jspdf';

interface WeeklyPestPDFExportProps {
  log: any;
}

export function WeeklyPestPDFExport({ log }: WeeklyPestPDFExportProps) {
  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    // 한글 폰트 설정 (기본 폰트 사용)
    doc.setFont('helvetica');
    
    // 제목
    doc.setFontSize(18);
    doc.text('방충·방서 점검표 (매주 작성)', 148, 15, { align: 'center' });
    
    // 기본 정보
    doc.setFontSize(11);
    doc.text(`점검 일자: ${log.check_date}`, 20, 30);
    doc.text(`점검자: ${log.checker_name || '-'}`, 20, 38);
    
    // 구분선
    doc.line(20, 43, 277, 43);
    
    // 테이블 헤더
    doc.setFontSize(9);
    let yPos = 50;
    
    doc.text('구분', 20, yPos);
    doc.text('설비명', 40, yPos);
    doc.text('위치', 70, yPos);
    doc.text('구역', 95, yPos);
    doc.text('먼지', 115, yPos);
    doc.text('끈끈이', 130, yPos);
    doc.text('날파리', 145, yPos);
    doc.text('초파리', 160, yPos);
    doc.text('나방파리', 175, yPos);
    doc.text('날개', 195, yPos);
    doc.text('바퀴', 210, yPos);
    doc.text('개미', 225, yPos);
    doc.text('거미', 240, yPos);
    doc.text('취', 255, yPos);
    doc.text('기타', 265, yPos);
    doc.text('탈게', 277, yPos);
    
    doc.line(20, yPos + 3, 277, yPos + 3);
    yPos += 10;
    
    // 설비별 데이터
    if (log.equipment_checks && log.equipment_checks.length > 0) {
      log.equipment_checks.forEach((check: any) => {
        doc.text(check.equipment_type || '-', 20, yPos);
        doc.text(check.equipment_name || '-', 40, yPos);
        doc.text(check.location || '-', 70, yPos);
        doc.text(check.zone || '-', 95, yPos);
        
        // 체크 항목
        doc.text(check.dust ? 'V' : '', 117, yPos);
        doc.text(check.sticky ? 'V' : '', 135, yPos);
        doc.text(check.fly ? 'V' : '', 150, yPos);
        doc.text(check.fruit_fly ? 'V' : '', 165, yPos);
        doc.text(check.moth_fly ? 'V' : '', 182, yPos);
        doc.text(check.wing ? 'V' : '', 200, yPos);
        doc.text(check.cockroach ? 'V' : '', 215, yPos);
        doc.text(check.ant ? 'V' : '', 230, yPos);
        doc.text(check.spider ? 'V' : '', 245, yPos);
        doc.text(check.mouse ? 'V' : '', 258, yPos);
        doc.text(check.other ? 'V' : '', 270, yPos);
        doc.text(check.escape ? 'V' : '', 282, yPos);
        
        yPos += 7;
        
        // 페이지 넘김 체크
        if (yPos > 180) {
          doc.addPage();
          yPos = 20;
        }
      });
    } else {
      doc.text('설비 데이터가 없습니다.', 20, yPos);
      yPos += 10;
    }
    
    // 구분선
    doc.line(20, yPos, 277, yPos);
    yPos += 10;
    
    // 관리사항, 기준이탈, 개선조치
    doc.setFontSize(10);
    doc.text('관리사항:', 20, yPos);
    yPos += 5;
    const management = log.management_notes || '-';
    const splitManagement = doc.splitTextToSize(management, 250);
    doc.setFontSize(9);
    doc.text(splitManagement, 20, yPos);
    yPos += splitManagement.length * 5 + 8;
    
    doc.setFontSize(10);
    doc.text('기준이탈 (원인파악):', 20, yPos);
    yPos += 5;
    const deviation = log.deviation_reason || '-';
    const splitDeviation = doc.splitTextToSize(deviation, 250);
    doc.setFontSize(9);
    doc.text(splitDeviation, 20, yPos);
    yPos += splitDeviation.length * 5 + 8;
    
    doc.setFontSize(10);
    doc.text('개선조치 (조치사항):', 20, yPos);
    yPos += 5;
    const improvement = log.improvement_action || '-';
    const splitImprovement = doc.splitTextToSize(improvement, 250);
    doc.setFontSize(9);
    doc.text(splitImprovement, 20, yPos);
    yPos += splitImprovement.length * 5 + 10;
    
    // 날인 표기
    doc.setFontSize(9);
    doc.line(20, yPos, 277, yPos);
    yPos += 8;
    
    doc.text('작성자: ________________', 50, yPos);
    doc.text('검토자: ________________', 130, yPos);
    doc.text('승인자: ________________', 210, yPos);
    
    // 승인 정보
    if (log.status === '승인완료' && log.approved_by) {
      yPos += 10;
      doc.text(`승인자: ${log.approved_by}`, 210, yPos);
      yPos += 5;
      doc.text(`승인일시: ${log.approved_at}`, 210, yPos);
    }
    
    // 상태 표시
    yPos += 10;
    doc.setFontSize(8);
    doc.text(`상태: ${log.status}`, 20, yPos);
    doc.text(`작성일시: ${log.created_at}`, 20, yPos + 5);
    
    // PDF 저장
    doc.save(`방충방서_주간일지_${log.check_date}.pdf`);
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
