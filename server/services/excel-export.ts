import ExcelJS from "exceljs";

/**
 * CCP 점검 이력을 Excel로 export
 */
export async function exportCcpInspectionToExcel(data: any[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("CCP 점검 이력");
  
  // 헤더 설정
  worksheet.columns = [
    { header: "점검 ID", key: "rowId", width: 12 },
    { header: "배치 코드", key: "batchCode", width: 20 },
    { header: "CCP 유형", key: "ccpType", width: 15 },
    { header: "제품명", key: "productName", width: 25 },
    { header: "작업일", key: "workDate", width: 15 },
    { header: "온도(°C)", key: "tempC", width: 12 },
    { header: "시간(분)", key: "durationMin", width: 12 },
    { header: "압력(bar)", key: "pressureBar", width: 12 },
    { header: "결과", key: "result", width: 10 },
    { header: "비고", key: "note", width: 30 },
    { header: "측정 시각", key: "measuredAt", width: 20 },
    { header: "등록 시각", key: "checkedAt", width: 20 },
  ];
  
  // 헤더 스타일
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
  
  // 데이터 추가
  data.forEach((row) => {
    worksheet.addRow({
      ...row,
      workDate: row.workDate ? new Date(row.workDate).toLocaleDateString("ko-KR") : "",
      measuredAt: row.measuredAt ? new Date(row.measuredAt).toLocaleString("ko-KR") : "",
      checkedAt: row.checkedAt ? new Date(row.checkedAt).toLocaleString("ko-KR") : "",
      tempC: row.tempC || "-",
      durationMin: row.durationMin || "-",
      pressureBar: row.pressureBar || "-",
      note: row.note || "",
    });
  });
  
  // Excel 파일을 Buffer로 변환
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

// TODO: 거래처 평가 테이블 구현 후 추가 예정

// TODO: 승인 워크플로우 테이블 구현 후 추가 예정
