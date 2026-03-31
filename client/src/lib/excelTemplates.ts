/**
 * 엑셀 템플릿 생성 유틸리티
 * ExcelJS를 사용하여 원재료/거래처 업로드용 템플릿 생성
 */

import ExcelJS from "exceljs";

/**
 * 원재료 업로드 템플릿 생성
 */
export async function generateMaterialTemplate(): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("원재료 목록");

  // 1. 헤더 설정
  worksheet.columns = [
    { header: "원재료명*", key: "name", width: 30 },
    { header: "규격", key: "specification", width: 20 },
    { header: "단위*", key: "unit", width: 15 },
    { header: "안전재고*", key: "safetyStock", width: 15 },
    { header: "유통기한(일)", key: "shelfLifeDays", width: 15 },
    { header: "보관방법", key: "storageMethod", width: 20 },
    { header: "비고", key: "notes", width: 30 },
  ];

  // 2. 헤더 스타일 적용
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;

  // 3. 단위 드롭다운 설정 (C열)
  const units = ["kg", "g", "L", "mL", "개", "박스", "포"];
  for (let i = 2; i <= 1000; i++) {
    worksheet.getCell(`C${i}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${units.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "잘못된 입력",
      error: "드롭다운에서 선택해주세요.",
    };
  }

  // 4. 보관방법 드롭다운 설정 (F열)
  const storageMethods = ["냉장", "냉동", "실온", "건조", "밀봉"];
  for (let i = 2; i <= 1000; i++) {
    worksheet.getCell(`F${i}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${storageMethods.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "잘못된 입력",
      error: "드롭다운에서 선택해주세요.",
    };
  }

  // 5. 샘플 데이터 추가 (3줄)
  worksheet.addRow({
    name: "밀가루",
    specification: "1등급",
    unit: "kg",
    safetyStock: 100,
    shelfLifeDays: 180,
    storageMethod: "실온",
    notes: "습기 주의",
  });

  worksheet.addRow({
    name: "설탕",
    specification: "백설탕",
    unit: "kg",
    safetyStock: 50,
    shelfLifeDays: 365,
    storageMethod: "실온",
    notes: "",
  });

  worksheet.addRow({
    name: "우유",
    specification: "1L",
    unit: "L",
    safetyStock: 20,
    shelfLifeDays: 7,
    storageMethod: "냉장",
    notes: "개봉 후 3일 이내 사용",
  });

  // 6. 샘플 데이터 스타일 (연한 노란색 배경)
  for (let i = 2; i <= 4; i++) {
    const row = worksheet.getRow(i);
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD0D0D0" } },
        left: { style: "thin", color: { argb: "FFD0D0D0" } },
        bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
        right: { style: "thin", color: { argb: "FFD0D0D0" } },
      };
    });
  }

  // 7. 사용법 안내 시트 추가
  const instructionSheet = workbook.addWorksheet("📖 사용법");
  instructionSheet.columns = [{ width: 80 }];

  const instructions = [
    "📋 원재료 일괄 등록 템플릿 사용법",
    "",
    "✅ 필수 입력 항목 (*):",
    "  • 원재료명: 중복되지 않는 고유한 이름",
    "  • 단위: 드롭다운에서 선택 (kg, g, L, mL, 개, 박스, 포)",
    "  • 안전재고: 숫자만 입력 (최소 재고 수량)",
    "",
    "📝 선택 입력 항목:",
    "  • 규격: 원재료의 상세 규격 (예: 1등급, 500g)",
    "  • 유통기한(일): 숫자만 입력 (예: 180일)",
    "  • 보관방법: 드롭다운에서 선택 (냉장, 냉동, 실온, 건조, 밀봉)",
    "  • 비고: 추가 설명 입력",
    "",
    "🔢 원재료 코드 자동 생성:",
    "  • 업로드 시 자동으로 MAT-001, MAT-002... 형식으로 생성됩니다",
    "",
    "⚠️ 주의사항:",
    "  1. 샘플 데이터(노란색 행)는 삭제하고 실제 데이터를 입력하세요",
    "  2. 헤더(첫 번째 행)는 절대 수정하지 마세요",
    "  3. 단위와 보관방법은 반드시 드롭다운에서 선택하세요",
    "  4. 원재료명이 중복되면 업로드가 실패합니다",
    "  5. 안전재고와 유통기한은 0 이상의 숫자만 입력하세요",
    "",
    "💾 저장 및 업로드:",
    "  1. 데이터 입력 완료 후 파일을 저장하세요",
    "  2. 마스터데이터 관리 > 원재료 탭에서 '일괄 업로드' 버튼 클릭",
    "  3. 저장한 파일을 선택하여 업로드",
    "  4. 미리보기에서 데이터 확인 후 '등록' 버튼 클릭",
  ];

  instructions.forEach((text, index) => {
    const row = instructionSheet.addRow([text]);
    if (index === 0) {
      row.font = { bold: true, size: 16, color: { argb: "FF2E75B6" } };
      row.height = 30;
    } else if (text.startsWith("✅") || text.startsWith("📝") || text.startsWith("🔢") || text.startsWith("⚠️") || text.startsWith("💾")) {
      row.font = { bold: true, size: 12 };
    }
  });

  // 8. 파일 생성
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * 거래처 업로드 템플릿 생성
 */
export async function generateSupplierTemplate(): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("거래처 목록");

  // 1. 헤더 설정
  worksheet.columns = [
    { header: "거래처명*", key: "name", width: 30 },
    { header: "사업자번호*", key: "businessNumber", width: 20 },
    { header: "대표자명", key: "representative", width: 15 },
    { header: "연락처", key: "contact", width: 20 },
    { header: "주소", key: "address", width: 40 },
    { header: "거래처 유형*", key: "supplierType", width: 20 },
    { header: "이메일", key: "email", width: 25 },
    { header: "비고", key: "notes", width: 30 },
  ];

  // 2. 헤더 스타일 적용
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF70AD47" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;

  // 3. 샘플 데이터 추가 (2-4행)
  // 샘플 데이터를 먼저 추가하여 사용자가 참고할 수 있도록 함
  worksheet.addRow({
    name: "(주)한국식품",
    businessNumber: "123-45-67890",
    representative: "김철수",
    contact: "02-1234-5678",
    address: "서울특별시 강남구 테헤란로 123",
    supplierType: "공급처",
    email: "contact@hankook.com",
    notes: "주요 거래처",
  });

  worksheet.addRow({
    name: "대한유통",
    businessNumber: "987-65-43210",
    representative: "이영희",
    contact: "031-9876-5432",
    address: "경기도 성남시 분당구 판교로 456",
    supplierType: "판매처",
    email: "info@daehan.co.kr",
    notes: "",
  });

  worksheet.addRow({
    name: "글로벌푸드",
    businessNumber: "555-12-34567",
    representative: "박민수",
    contact: "010-5555-1234",
    address: "부산광역시 해운대구 센텀로 789",
    supplierType: "원재료",
    email: "global@food.com",
    notes: "월 1회 정기 거래",
  });

  // 4. 샘플 데이터 스타일 (연한 초록색 배경)
  for (let i = 2; i <= 4; i++) {
    const row = worksheet.getRow(i);
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2EFDA" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD0D0D0" } },
        left: { style: "thin", color: { argb: "FFD0D0D0" } },
        bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
        right: { style: "thin", color: { argb: "FFD0D0D0" } },
      };
    });
  }

  // 5. 거래처 유형 드롭다운 설정 (F열, 5-100행)
  const supplierTypes = ["거래처", "공급처", "원재료", "판매처", "전자상거래", "경비항목"];
  for (let i = 5; i <= 100; i++) {
    worksheet.getCell(`F${i}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${supplierTypes.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "잘못된 입력",
      error: "드롭다운에서 선택해주세요.",
    };
  }

  // 6. 사용법 안내 시트 추가
  const instructionSheet = workbook.addWorksheet("📖 사용법");
  instructionSheet.columns = [{ width: 80 }];

  const instructions = [
    "📋 거래처 일괄 등록 템플릿 사용법",
    "",
    "✅ 필수 입력 항목 (*):",
    "  • 거래처명: 중복되지 않는 고유한 이름",
    "  • 사업자번호: 하이픈 포함 형식 (예: 123-45-67890)",
    "  • 거래처 유형: 드롭다운에서 선택 (거래처, 공급처, 원재료, 판매처, 전자상거래, 경비항목)",
    "",
    "📝 선택 입력 항목:",
    "  • 대표자명: 거래처 대표자 이름",
    "  • 연락처: 전화번호 (하이픈 포함 가능)",
    "  • 주소: 거래처 주소",
    "  • 이메일: 이메일 주소 (선택 사항)",
    "  • 비고: 추가 설명 입력",
    "",
    "🔢 거래처 코드 자동 생성:",
    "  • 업로드 시 자동으로 SUP-001, SUP-002... 형식으로 생성됩니다",
    "",
    "⚠️ 주의사항:",
    "  1. ‼️ 샘플 데이터 행(2-4행, 초록색)을 반드시 삭제하고 실제 데이터를 입력하세요",
    "  2. 한 번에 최대 100개의 거래처만 등록할 수 있습니다",
    "  3. 헤더(첫 번째 행)는 절대 수정하지 마세요",
    "  4. 거래처 유형은 반드시 드롭다운에서 선택하세요",
    "  5. 사업자번호는 하이픈을 포함하여 정확히 입력하세요",
    "  6. 거래처명 또는 사업자번호가 중복되면 업로드가 실패합니다",
    "  7. 이메일은 선택 사항이며, 입력 시 형식이 올바른지 확인하세요",
    "",
    "💾 저장 및 업로드:",
    "  1. 데이터 입력 완료 후 파일을 저장하세요",
    "  2. 마스터데이터 관리 > 거래처 탭에서 '일괄 업로드' 버튼 클릭",
    "  3. 저장한 파일을 선택하여 업로드",
    "  4. 미리보기에서 데이터 확인 후 '등록' 버튼 클릭",
  ];

  instructions.forEach((text, index) => {
    const row = instructionSheet.addRow([text]);
    if (index === 0) {
      row.font = { bold: true, size: 16, color: { argb: "FF70AD47" } };
      row.height = 30;
    } else if (text.startsWith("✅") || text.startsWith("📝") || text.startsWith("🔢") || text.startsWith("⚠️") || text.startsWith("💾")) {
      row.font = { bold: true, size: 12 };
    }
  });

  // 7. 파일 생성
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * 템플릿 다운로드 헬퍼 함수
 */
export function downloadTemplate(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 제품 업로드 템플릿 생성
 */
export async function generateProductTemplate(): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("제품 목록");

  // 1. 헤더 설정
  worksheet.columns = [
    { header: "제품명*", key: "name", width: 30 },
    { header: "카테고리", key: "category", width: 20 },
    { header: "단위", key: "unit", width: 15 },
    { header: "단가", key: "unitPrice", width: 15 },
    { header: "유통기한(월)", key: "shelfLifeMonths", width: 15 },
    { header: "설명", key: "description", width: 40 },
  ];

  // 2. 헤더 스타일 적용
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;

  // 3. 단위 드롭다운 설정 (C열)
  const units = ["개", "박스", "세트", "kg", "g", "L", "mL"];
  for (let i = 2; i <= 1000; i++) {
    worksheet.getCell(`C${i}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${units.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "잘못된 입력",
      error: "드롭다운에서 선택해주세요.",
    };
  }

  // 4. 카테고리 드롭다운 설정 (B열)
  const categories = ["음료", "과자", "냉동식품", "유제품", "조미료", "기타"];
  for (let i = 2; i <= 1000; i++) {
    worksheet.getCell(`B${i}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${categories.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "잘못된 입력",
      error: "드롭다운에서 선택해주세요.",
    };
  }

  // 5. 샘플 데이터 추가 (3개)
  worksheet.addRow({
    name: "프리미엄 우유",
    category: "유제품",
    unit: "개",
    unitPrice: 2500,
    shelfLifeMonths: 3,
    description: "1L 용량, 무항생제 인증",
  });

  worksheet.addRow({
    name: "냉동 만두",
    category: "냉동식품",
    unit: "박스",
    unitPrice: 15000,
    shelfLifeMonths: 12,
    description: "1박스 20개입",
  });

  worksheet.addRow({
    name: "초코칩 쿠키",
    category: "과자",
    unit: "세트",
    unitPrice: 5000,
    shelfLifeMonths: 6,
    description: "200g x 5봉지 세트",
  });

  // 6. 샘플 데이터 스타일 (연한 초록색 배경)
  for (let i = 2; i <= 4; i++) {
    const row = worksheet.getRow(i);
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2EFDA" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD0D0D0" } },
        left: { style: "thin", color: { argb: "FFD0D0D0" } },
        bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
        right: { style: "thin", color: { argb: "FFD0D0D0" } },
      };
    });
  }

  // 7. 사용법 안내 시트 추가
  const instructionSheet = workbook.addWorksheet("📖 사용법");
  instructionSheet.columns = [{ width: 80 }];

  const instructions = [
    "📋 제품 일괄 등록 템플릿 사용법",
    "",
    "✅ 필수 입력 항목 (*):",
    "  • 제품명: 중복되지 않는 고유한 이름",
    "",
    "📝 선택 입력 항목:",
    "  • 카테고리: 드롭다운에서 선택 (음료, 과자, 냉동식품, 유제품, 조미료, 기타)",
    "  • 단위: 드롭다운에서 선택 (개, 박스, 세트, kg, g, L, mL)",
    "  • 단가: 숫자만 입력 (예: 2500)",
    "  • 유통기한(월): 월 단위로 입력 (예: 3, 6, 12)",
    "  • 설명: 제품에 대한 추가 설명",
    "",
    "🔢 제품 코드 자동 생성:",
    "  • 업로드 시 자동으로 30001, 30002... 형식으로 생성됩니다",
    "",
    "⚠️ 주의사항:",
    "  1. 샘플 데이터(초록색 행)는 삭제하고 실제 데이터를 입력하세요",
    "  2. 헤더(첫 번째 행)는 절대 수정하지 마세요",
    "  3. 제품명이 중복되면 업로드가 실패합니다",
    "  4. 단가와 유통기한은 숫자만 입력하세요",
    "  5. 유통기한은 월 단위로 입력하세요 (일 단위 아님)",
    "",
    "💾 저장 및 업로드:",
    "  1. 데이터 입력 완료 후 파일을 저장하세요",
    "  2. 마스터데이터 관리 > 제품 탭에서 '일괄 업로드' 버튼 클릭",
    "  3. 저장한 파일을 선택하여 업로드",
    "  4. 미리보기에서 데이터 확인 후 '등록' 버튼 클릭",
  ];

  instructions.forEach((text, index) => {
    const row = instructionSheet.addRow([text]);
    if (index === 0) {
      row.font = { bold: true, size: 16, color: { argb: "FF70AD47" } };
      row.height = 30;
    } else if (text.startsWith("✅") || text.startsWith("📝") || text.startsWith("🔢") || text.startsWith("⚠️") || text.startsWith("💾")) {
      row.font = { bold: true, size: 12 };
    }
  });

  // 8. 파일 생성
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * 은행 거래 업로드 템플릿 생성
 */
export async function generateBankTransactionTemplate(): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("은행거래");

  // 1. 헤더 설정
  worksheet.columns = [
    { header: "거래일시*", key: "transactionDate", width: 20 },
    { header: "거래구분*", key: "type", width: 12 },
    { header: "거래금액*", key: "amount", width: 15 },
    { header: "잔액*", key: "balance", width: 15 },
    { header: "거래처*", key: "counterparty", width: 25 },
    { header: "메모", key: "memo", width: 40 },
  ];

  // 2. 헤더 스타일 적용
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 25;

  // 3. 거래구분 드롭다운 설정 (B열)
  const types = ["입금", "출금"];
  for (let i = 2; i <= 1000; i++) {
    worksheet.getCell(`B${i}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${types.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "잘못된 입력",
      error: "입금 또는 출금을 선택해주세요.",
    };
  }

  // 4. 샘플 데이터 추가 (5줄)
  worksheet.addRow({
    transactionDate: "2024-01-15 10:30:00",
    type: "입금",
    amount: 1000000,
    balance: 5000000,
    counterparty: "ABC 식품",
    memo: "원재료 대금",
  });

  worksheet.addRow({
    transactionDate: "2024-01-16 14:20:00",
    type: "출금",
    amount: 500000,
    balance: 4500000,
    counterparty: "XYZ 공급업체",
    memo: "포장재 구매",
  });

  worksheet.addRow({
    transactionDate: "2024-01-17 09:15:00",
    type: "입금",
    amount: 2000000,
    balance: 6500000,
    counterparty: "DEF 유통",
    memo: "제품 판매 대금",
  });

  worksheet.addRow({
    transactionDate: "2024-01-18 11:45:00",
    type: "출금",
    amount: 300000,
    balance: 6200000,
    counterparty: "GHI 물류",
    memo: "배송비",
  });

  worksheet.addRow({
    transactionDate: "2024-01-19 16:00:00",
    type: "입금",
    amount: 1500000,
    balance: 7700000,
    counterparty: "JKL 마트",
    memo: "정기 거래 대금",
  });

  // 5. 샘플 데이터 스타일 (연한 파란색 배경)
  for (let i = 2; i <= 6; i++) {
    const row = worksheet.getRow(i);
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9E1F2" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD0D0D0" } },
        left: { style: "thin", color: { argb: "FFD0D0D0" } },
        bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
        right: { style: "thin", color: { argb: "FFD0D0D0" } },
      };
    });
  }

  // 6. 사용법 안내 시트 추가
  const instructionSheet = workbook.addWorksheet("📖 사용법");
  instructionSheet.columns = [{ width: 80 }];

  const instructions = [
    "📋 은행 거래 일괄 업로드 템플릿 사용법",
    "",
    "✅ 필수 입력 항목 (*):",
    "  • 거래일시: YYYY-MM-DD HH:mm:ss 형식 (예: 2024-01-15 10:30:00)",
    "  • 거래구분: 드롭다운에서 선택 (입금 또는 출금)",
    "  • 거래금액: 숫자만 입력, 쉼표 없이 (예: 1000000)",
    "  • 잔액: 거래 후 잔액, 숫자만 입력 (예: 5000000)",
    "  • 거래처: 거래 상대방 이름 (예: ABC 식품)",
    "",
    "📝 선택 입력 항목:",
    "  • 메모: 거래에 대한 추가 설명",
    "",
    "⚠️ 주의사항:",
    "  1. 샘플 데이터(파란색 행)는 삭제하고 실제 데이터를 입력하세요",
    "  2. 헤더(첫 번째 행)는 절대 수정하지 마세요",
    "  3. 거래일시는 반드시 YYYY-MM-DD HH:mm:ss 형식을 지켜주세요",
    "  4. 거래금액과 잔액은 숫자만 입력하세요 (쉼표, 원화 기호 제외)",
    "  5. 거래구분은 반드시 드롭다운에서 선택하세요",
    "  6. 거래일시 순서대로 정렬하면 업로드 후 확인이 쉽습니다",
    "",
    "💾 저장 및 업로드:",
    "  1. 데이터 입력 완료 후 파일을 저장하세요",
    "  2. 은행 거래 매칭 페이지에서 '템플릿 다운로드' 버튼 클릭",
    "  3. 은행 계좌를 선택하세요",
    "  4. '파일 선택' 버튼으로 작성한 파일 선택",
    "  5. '업로드' 버튼 클릭",
    "  6. 업로드 완료 후 자동 매칭 실행",
    "",
    "🔍 자동 매칭 기능:",
    "  • 업로드된 거래는 자동으로 회계 거래와 매칭됩니다",
    "  • 매칭되지 않은 거래는 수동으로 매칭할 수 있습니다",
    "  • 거래처 이름, 금액, 날짜를 기준으로 매칭됩니다",
  ];

  instructions.forEach((text, index) => {
    const row = instructionSheet.addRow([text]);
    if (index === 0) {
      row.font = { bold: true, size: 16, color: { argb: "FF4472C4" } };
      row.height = 30;
    } else if (text.startsWith("✅") || text.startsWith("📝") || text.startsWith("⚠️") || text.startsWith("💾") || text.startsWith("🔍")) {
      row.font = { bold: true, size: 12 };
    }
  });

  // 7. 파일 생성
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
