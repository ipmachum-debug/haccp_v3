import { jsPDF } from "jspdf";
import "jspdf-autotable";

// jsPDF에 autoTable 타입 추가
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface ProductionData {
  batchCode: string;
  productName: string;
  quantity: string;
  status: string;
  startTime: Date | null;
  endTime: Date | null;
}

interface CcpRecord {
  ccpType: string;
  result: string;
  measuredAt: Date;
  isDeviation: boolean;
}

interface IssueData {
  batchCode: string;
  issueType: string;
  description: string;
  createdAt: Date;
}

interface DailyReportData {
  date: string;
  summary: {
    totalBatches: number;
    completedBatches: number;
    ccpChecks: number;
    ccpCompliance: number;
  };
  production: ProductionData[];
  ccpRecords: CcpRecord[];
  issues: IssueData[];
}

export function generateDailyReportPDF(data: DailyReportData) {
  const doc = new jsPDF();
  
  // 한글 폰트 대신 영문으로 대체 (한글은 이미지로 처리하거나 서버에서 생성)
  doc.setFont("helvetica", "normal");
  
  let yPos = 20;
  
  // 제목
  doc.setFontSize(18);
  doc.text("Daily Production Report", 105, yPos, { align: "center" });
  yPos += 10;
  
  // 날짜
  doc.setFontSize(12);
  doc.text(`Date: ${data.date}`, 105, yPos, { align: "center" });
  yPos += 15;
  
  // 요약 통계
  doc.setFontSize(14);
  doc.text("Summary", 14, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.text(`Total Batches: ${data.summary.totalBatches}`, 14, yPos);
  yPos += 6;
  doc.text(`Completed Batches: ${data.summary.completedBatches}`, 14, yPos);
  yPos += 6;
  doc.text(`CCP Checks: ${data.summary.ccpChecks}`, 14, yPos);
  yPos += 6;
  doc.text(`CCP Compliance: ${data.summary.ccpCompliance.toFixed(1)}%`, 14, yPos);
  yPos += 12;
  
  // 생산 실적 테이블
  if (data.production.length > 0) {
    doc.setFontSize(14);
    doc.text("Production Records", 14, yPos);
    yPos += 5;
    
    doc.autoTable({
      startY: yPos,
      head: [["Batch Code", "Product", "Quantity", "Status", "Start Time", "End Time"]],
      body: data.production.map(p => [
        p.batchCode,
        p.productName,
        p.quantity,
        p.status,
        p.startTime ? new Date(p.startTime).toLocaleTimeString("ko-KR") : "-",
        p.endTime ? new Date(p.endTime).toLocaleTimeString("ko-KR") : "-",
      ]),
      theme: "grid",
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 9, cellPadding: 3 },
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // CCP 기록 테이블
  if (data.ccpRecords.length > 0) {
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.text("CCP Records", 14, yPos);
    yPos += 5;
    
    doc.autoTable({
      startY: yPos,
      head: [["CCP Type", "Result", "Time", "Deviation"]],
      body: data.ccpRecords.map(c => [
        c.ccpType,
        c.result,
        new Date(c.measuredAt).toLocaleTimeString("ko-KR"),
        c.isDeviation ? "Yes" : "No",
      ]),
      theme: "grid",
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 9, cellPadding: 3 },
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // 이상 사항 테이블
  if (data.issues.length > 0) {
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.text("Issues", 14, yPos);
    yPos += 5;
    
    doc.autoTable({
      startY: yPos,
      head: [["Batch Code", "Type", "Description", "Time"]],
      body: data.issues.map(i => [
        i.batchCode,
        i.issueType,
        i.description,
        new Date(i.createdAt).toLocaleTimeString("ko-KR"),
      ]),
      theme: "grid",
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 9, cellPadding: 3 },
    });
  }
  
  // PDF 다운로드
  doc.save(`daily-report-${data.date}.pdf`);
}
