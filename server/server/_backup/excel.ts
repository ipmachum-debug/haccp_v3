import ExcelJS from "exceljs";

/**
 * 배치 데이터를 Excel 파일로 변환
 */
export async function exportBatchesToExcel(batches: any[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("배치 목록");

  // 헤더 설정
  worksheet.columns = [
    { header: "배치 번호", key: "batchNumber", width: 15 },
    { header: "제품명", key: "productName", width: 30 },
    { header: "계획 수량", key: "plannedQuantity", width: 12 },
    { header: "실제 수량", key: "actualQuantity", width: 12 },
    { header: "상태", key: "status", width: 12 },
    { header: "시작 시간", key: "startTime", width: 20 },
    { header: "종료 시간", key: "endTime", width: 20 },
    { header: "생성일", key: "createdAt", width: 20 },
  ];

  // 헤더 스타일
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" }
  };

  // 데이터 추가
  batches.forEach((batch) => {
    worksheet.addRow({
      batchNumber: batch.batchNumber,
      productName: batch.productName || "-",
      plannedQuantity: batch.plannedQuantity,
      actualQuantity: batch.actualQuantity || "-",
      status: getStatusLabel(batch.status),
      startTime: batch.startTime
        ? new Date(batch.startTime).toLocaleString("ko-KR")
        : "-",
      endTime: batch.endTime
        ? new Date(batch.endTime).toLocaleString("ko-KR")
        : "-",
      createdAt: new Date(batch.createdAt).toLocaleString("ko-KR")
    });
  });

  // 파일 버퍼 생성
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * 재고 데이터를 Excel 파일로 변환
 */
export async function exportInventoryToExcel(inventory: any[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("재고 목록");

  // 헤더 설정
  worksheet.columns = [
    { header: "원재료명", key: "materialName", width: 30 },
    { header: "현재 재고", key: "currentStock", width: 12 },
    { header: "단위", key: "unit", width: 10 },
    { header: "최소 재고", key: "minStock", width: 12 },
    { header: "최대 재고", key: "maxStock", width: 12 },
    { header: "유통기한", key: "expiryDate", width: 15 },
    { header: "입고일", key: "receivedDate", width: 15 },
    { header: "공급업체", key: "supplier", width: 20 },
    { header: "상태", key: "status", width: 12 },
  ];

  // 헤더 스타일
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" }
  };

  // 데이터 추가
  inventory.forEach((item) => {
    const row = worksheet.addRow({
      materialName: item.materialName,
      currentStock: item.currentStock,
      unit: item.unit || "kg",
      minStock: item.minStock || "-",
      maxStock: item.maxStock || "-",
      expiryDate: item.expiryDate
        ? new Date(item.expiryDate).toLocaleDateString("ko-KR")
        : "-",
      receivedDate: item.receivedDate
        ? new Date(item.receivedDate).toLocaleDateString("ko-KR")
        : "-",
      supplier: item.supplier || "-",
      status: getInventoryStatus(item)
    });

    // 재고 부족 시 빨간색 표시
    if (item.minStock && item.currentStock < item.minStock) {
      row.getCell("currentStock").font = { color: { argb: "FFFF0000" } };
      row.getCell("status").font = { color: { argb: "FFFF0000" } };
    }
  });

  // 파일 버퍼 생성
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * 배치 템플릿 Excel 파일 생성
 */
export async function generateBatchTemplate() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("배치 템플릿");

  // 헤더 설정
  worksheet.columns = [
    { header: "배치 번호", key: "batchNumber", width: 15 },
    { header: "제품명", key: "productName", width: 30 },
    { header: "계획 수량", key: "plannedQuantity", width: 12 },
    { header: "시작 시간", key: "startTime", width: 20 },
  ];

  // 헤더 스타일
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" }
  };
  worksheet.getRow(1).font = { color: { argb: "FFFFFFFF" }, bold: true };

  // 샘플 데이터 추가
  worksheet.addRow({
    batchNumber: "BATCH-2026-001",
    productName: "딸기설기",
    plannedQuantity: 100,
    startTime: "2026-01-20 09:00"
  });

  worksheet.addRow({
    batchNumber: "BATCH-2026-002",
    productName: "호두찹쌀떡",
    plannedQuantity: 150,
    startTime: "2026-01-20 10:00"
  });

  // 설명 추가
  const instructionRow = worksheet.addRow([]);
  instructionRow.getCell(1).value = "※ 사용법:";
  instructionRow.getCell(1).font = { bold: true, color: { argb: "FFFF0000" } };

  worksheet.addRow([
    "1. 위 샘플 데이터를 참고하여 배치 정보를 입력하세요.",
  ]);
  worksheet.addRow(["2. 배치 번호는 고유해야 합니다."]);
  worksheet.addRow(["3. 제품명은 시스템에 등록된 제품명과 일치해야 합니다."]);
  worksheet.addRow(["4. 계획 수량은 숫자로 입력하세요."]);
  worksheet.addRow([
    "5. 시작 시간은 'YYYY-MM-DD HH:MM' 형식으로 입력하세요.",
  ]);

  // 파일 버퍼 생성
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * 재고 템플릿 Excel 파일 생성
 */
export async function generateInventoryTemplate() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("재고 템플릿");

  // 헤더 설정
  worksheet.columns = [
    { header: "원재료명", key: "materialName", width: 30 },
    { header: "현재 재고", key: "currentStock", width: 12 },
    { header: "단위", key: "unit", width: 10 },
    { header: "유통기한", key: "expiryDate", width: 15 },
    { header: "공급업체", key: "supplier", width: 20 },
  ];

  // 헤더 스타일
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" }
  };
  worksheet.getRow(1).font = { color: { argb: "FFFFFFFF" }, bold: true };

  // 샘플 데이터 추가
  worksheet.addRow({
    materialName: "멥쌀(국내산)",
    currentStock: 500,
    unit: "kg",
    expiryDate: "2026-06-30",
    supplier: "농협"
  });

  worksheet.addRow({
    materialName: "백설탕",
    currentStock: 200,
    unit: "kg",
    expiryDate: "2027-12-31",
    supplier: "CJ제일제당"
  });

  // 설명 추가
  const instructionRow = worksheet.addRow([]);
  instructionRow.getCell(1).value = "※ 사용법:";
  instructionRow.getCell(1).font = { bold: true, color: { argb: "FFFF0000" } };

  worksheet.addRow([
    "1. 위 샘플 데이터를 참고하여 재고 정보를 입력하세요.",
  ]);
  worksheet.addRow(["2. 원재료명은 시스템에 등록된 원재료명과 일치해야 합니다."]);
  worksheet.addRow(["3. 현재 재고는 숫자로 입력하세요."]);
  worksheet.addRow(["4. 단위는 kg, L, 개 등으로 입력하세요."]);
  worksheet.addRow(["5. 유통기한은 'YYYY-MM-DD' 형식으로 입력하세요."]);

  // 파일 버퍼 생성
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// 헬퍼 함수
function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    planned: "계획",
    in_progress: "진행 중",
    completed: "완료",
    cancelled: "취소"
  };
  return statusMap[status] || status;
}

function getInventoryStatus(item: any): string {
  if (item.minStock && item.currentStock < item.minStock) {
    return "재고 부족";
  }
  if (item.expiryDate) {
    const daysUntilExpiry = Math.floor(
      (new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpiry < 0) {
      return "유통기한 만료";
    }
    if (daysUntilExpiry < 7) {
      return "유통기한 임박";
    }
  }
  return "정상";
}
