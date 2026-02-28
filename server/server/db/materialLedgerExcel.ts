/**
 * 원료수불부 월별 엑셀 다운로드 API
 * - 원본 엑셀 서식 재현 (색상, 병합, 테두리, 폰트)
 */
import ExcelJS from 'exceljs';
import { getMonthlyLedger } from './materialLedger';

// 색상 정의
const COLORS = {
  headerDark: '1F4E79',
  headerBlue: '2E75B6',
  headerGreen: '375623',
  headerOrange: 'C55A11',
  dateYellow: 'FFF2CC',
  // 데이터 행 - 홀수
  oddNo: 'EBF3FB',
  oddName: 'D6E4F0',
  oddRecvTotal: 'D6E4F0',
  oddRecvDay: 'EBF5FB',
  oddUseTotal: 'E2EFDA',
  oddUseDay: 'E8F5E9',
  oddEndStock: 'FCE4D6',
  oddAmount: 'FCE4D6',
  // 데이터 행 - 짝수
  evenNo: 'FFFFFF',
  evenName: 'EBF3FB',
  evenRecvTotal: 'EBF3FB',
  evenRecvDay: 'FFFFFF',
  evenUseTotal: 'D4EDDA',
  evenUseDay: 'F1F8E9',
  evenEndStock: 'FDE8D8',
  evenAmount: 'FDE8D8',
  // 합계행
  sumHeader: '1F4E79',
  sumData: 'D6E4F0',
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
};

function fillCell(cell: ExcelJS.Cell, bgColor: string, fontColor: string = '000000', bold: boolean = false, fontSize: number = 9) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
  cell.font = { color: { argb: 'FF' + fontColor }, bold, size: fontSize, name: '맑은 고딕' };
  cell.border = THIN_BORDER;
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

export async function generateMonthlyExcel(yearMonth: string, tenantId: number): Promise<Buffer> {
  const data = await getMonthlyLedger(yearMonth, tenantId);
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('월별 원료수불부', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }]
  });

  // ===== 열 너비 설정 =====
  const colWidths: number[] = [];
  colWidths.push(5);    // A: No
  colWidths.push(24);   // B: 원료명
  colWidths.push(11);   // C: 전월재고
  colWidths.push(10);   // D: 입고합계
  for (let i = 0; i < 31; i++) colWidths.push(6.51); // E~AI: 입고일별
  colWidths.push(10);   // AJ: 사용합계
  for (let i = 0; i < 31; i++) colWidths.push(6.51); // AK~BO: 사용일별
  colWidths.push(12);   // BP: 월말재고
  colWidths.push(11);   // BQ: 단가
  colWidths.push(12);   // BR: 입고금액
  colWidths.push(12);   // BS: 사용금액

  for (let i = 0; i < colWidths.length; i++) {
    ws.getColumn(i + 1).width = colWidths[i];
  }

  const totalCols = colWidths.length; // 71

  // ===== 행1: 제목 =====
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = '월별 원료 수불부';
  fillCell(titleCell, COLORS.headerDark, 'FFFFFF', true, 16);
  ws.getRow(1).height = 39.75;

  // ===== 행2: 관리 월 =====
  ws.getCell(2, 1).value = '';
  const mgmtLabel = ws.getCell(2, 2);
  mgmtLabel.value = '관리 월:';
  mgmtLabel.font = { bold: true, size: 12, name: '맑은 고딕' };
  mgmtLabel.alignment = { vertical: 'middle', horizontal: 'right' };

  ws.mergeCells(2, 3, 2, 4);
  const mgmtValue = ws.getCell(2, 3);
  mgmtValue.value = `${year}년 ${month}월`;
  fillCell(mgmtValue, COLORS.dateYellow, '0000FF', true, 12);
  ws.getRow(2).height = 21.75;

  // ===== 행3-4: 헤더 =====
  // No (A3:A4 병합)
  ws.mergeCells(3, 1, 4, 1);
  fillCell(ws.getCell(3, 1), COLORS.headerDark, 'FFFFFF', true, 10);
  ws.getCell(3, 1).value = 'No';

  // 원료명 (B3:B4 병합)
  ws.mergeCells(3, 2, 4, 2);
  fillCell(ws.getCell(3, 2), COLORS.headerDark, 'FFFFFF', true, 10);
  ws.getCell(3, 2).value = '원료명';

  // 전월재고 (C3:C4 병합)
  ws.mergeCells(3, 3, 4, 3);
  fillCell(ws.getCell(3, 3), COLORS.headerDark, 'FFFFFF', true, 10);
  ws.getCell(3, 3).value = '전월재고\n(kg)';

  // 입고(kg) 헤더 (D3:AI3 병합)
  ws.mergeCells(3, 4, 3, 35);
  fillCell(ws.getCell(3, 4), COLORS.headerBlue, 'FFFFFF', true, 10);
  ws.getCell(3, 4).value = '입고 (kg)';

  // 입고 서브헤더 (행4)
  fillCell(ws.getCell(4, 4), COLORS.headerBlue, 'FFFFFF', true, 10);
  ws.getCell(4, 4).value = '합계';
  for (let d = 1; d <= 31; d++) {
    const col = 4 + d;
    fillCell(ws.getCell(4, col), COLORS.headerBlue, 'FFFFFF', true, 8);
    ws.getCell(4, col).value = d;
  }

  // 사용(kg) 헤더 (AJ3:BO3 병합)
  ws.mergeCells(3, 36, 3, 67);
  fillCell(ws.getCell(3, 36), COLORS.headerGreen, 'FFFFFF', true, 10);
  ws.getCell(3, 36).value = '사용 (kg)';

  // 사용 서브헤더 (행4)
  fillCell(ws.getCell(4, 36), COLORS.headerGreen, 'FFFFFF', true, 10);
  ws.getCell(4, 36).value = '합계';
  for (let d = 1; d <= 31; d++) {
    const col = 36 + d;
    fillCell(ws.getCell(4, col), COLORS.headerGreen, 'FFFFFF', true, 8);
    ws.getCell(4, col).value = d;
  }

  // 월말재고 (BP3:BP4 병합)
  ws.mergeCells(3, 68, 4, 68);
  fillCell(ws.getCell(3, 68), COLORS.headerDark, 'FFFFFF', true, 10);
  ws.getCell(3, 68).value = '월말재고\n(kg)';

  // 단가 (BQ3:BQ4 병합)
  ws.mergeCells(3, 69, 4, 69);
  fillCell(ws.getCell(3, 69), COLORS.headerDark, 'FFFFFF', true, 10);
  ws.getCell(3, 69).value = '단가\n(원/kg)';

  // 입고금액 (BR3:BR4 병합)
  ws.mergeCells(3, 70, 4, 70);
  fillCell(ws.getCell(3, 70), COLORS.headerOrange, 'FFFFFF', true, 10);
  ws.getCell(3, 70).value = '입고금액\n(원)';

  // 사용금액 (BS3:BS4 병합)
  ws.mergeCells(3, 71, 4, 71);
  fillCell(ws.getCell(3, 71), COLORS.headerOrange, 'FFFFFF', true, 10);
  ws.getCell(3, 71).value = '사용금액\n(원)';

  ws.getRow(3).height = 19.5;
  ws.getRow(4).height = 27.75;

  // ===== 데이터 행 =====
  const kgFormat = '#,##0.000';
  const wonFormat = '#,##0';

  // 합계 누적용
  let sumPrevStock = 0, sumRecvTotal = 0, sumUseTotal = 0, sumEndStock = 0;
  let sumUnitPrice = 0, sumRecvAmount = 0, sumUseAmount = 0;
  const sumRecvDays: number[] = new Array(31).fill(0);
  const sumUseDays: number[] = new Array(31).fill(0);

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = 5 + i;
    const isOdd = i % 2 === 0; // 0-indexed, 첫 행이 홀수

    const wsRow = ws.getRow(rowNum);
    wsRow.height = 19.5;

    // No
    const noCell = ws.getCell(rowNum, 1);
    noCell.value = i + 1;
    fillCell(noCell, isOdd ? COLORS.oddNo : COLORS.evenNo, '000000', false, 9);

    // 원료명
    const nameCell = ws.getCell(rowNum, 2);
    nameCell.value = row.materialName;
    fillCell(nameCell, isOdd ? COLORS.oddName : COLORS.evenName, '000000', false, 9);
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

    // 전월재고
    const prevStock = Number(row.prev_stock) || 0;
    sumPrevStock += prevStock;
    const prevCell = ws.getCell(rowNum, 3);
    prevCell.value = prevStock;
    fillCell(prevCell, COLORS.dateYellow, '000000', false, 9);
    prevCell.numFmt = kgFormat;

    // 입고합계
    const recvTotal = Number(row.receiving_total) || 0;
    sumRecvTotal += recvTotal;
    const recvTotalCell = ws.getCell(rowNum, 4);
    recvTotalCell.value = recvTotal;
    fillCell(recvTotalCell, isOdd ? COLORS.oddRecvTotal : COLORS.evenRecvTotal, '000000', true, 9);
    recvTotalCell.numFmt = kgFormat;

    // 입고 일별
    for (let d = 1; d <= 31; d++) {
      const dayKey = `receiving_day_${String(d).padStart(2, '0')}`;
      const val = Number(row[dayKey]) || 0;
      sumRecvDays[d - 1] += val;
      const cell = ws.getCell(rowNum, 4 + d);
      cell.value = val || '';
      fillCell(cell, isOdd ? COLORS.oddRecvDay : COLORS.evenRecvDay, '000000', false, 8);
      if (val) cell.numFmt = kgFormat;
      if (d > lastDay) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      }
    }

    // 사용합계
    const useTotal = Number(row.usage_total) || 0;
    sumUseTotal += useTotal;
    const useTotalCell = ws.getCell(rowNum, 36);
    useTotalCell.value = useTotal;
    fillCell(useTotalCell, isOdd ? COLORS.oddUseTotal : COLORS.evenUseTotal, '000000', true, 9);
    useTotalCell.numFmt = kgFormat;

    // 사용 일별
    for (let d = 1; d <= 31; d++) {
      const dayKey = `usage_day_${String(d).padStart(2, '0')}`;
      const val = Number(row[dayKey]) || 0;
      sumUseDays[d - 1] += val;
      const cell = ws.getCell(rowNum, 36 + d);
      cell.value = val || '';
      fillCell(cell, isOdd ? COLORS.oddUseDay : COLORS.evenUseDay, '000000', false, 8);
      if (val) cell.numFmt = kgFormat;
      if (d > lastDay) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      }
    }

    // 월말재고
    const endStock = Number(row.end_stock) || 0;
    sumEndStock += endStock;
    const endCell = ws.getCell(rowNum, 68);
    endCell.value = endStock;
    fillCell(endCell, isOdd ? COLORS.oddEndStock : COLORS.evenEndStock, '000000', true, 9);
    endCell.numFmt = kgFormat;

    // 단가
    const unitPrice = Number(row.unit_price) || 0;
    sumUnitPrice += unitPrice;
    const priceCell = ws.getCell(rowNum, 69);
    priceCell.value = unitPrice;
    fillCell(priceCell, COLORS.dateYellow, '000000', false, 9);
    priceCell.numFmt = wonFormat;

    // 입고금액
    const recvAmount = Number(row.receiving_amount) || 0;
    sumRecvAmount += recvAmount;
    const recvAmtCell = ws.getCell(rowNum, 70);
    recvAmtCell.value = recvAmount;
    fillCell(recvAmtCell, isOdd ? COLORS.oddAmount : COLORS.evenAmount, '000000', false, 9);
    recvAmtCell.numFmt = wonFormat;

    // 사용금액
    const useAmount = Number(row.usage_amount) || 0;
    sumUseAmount += useAmount;
    const useAmtCell = ws.getCell(rowNum, 71);
    useAmtCell.value = useAmount;
    fillCell(useAmtCell, isOdd ? COLORS.oddAmount : COLORS.evenAmount, '000000', false, 9);
    useAmtCell.numFmt = wonFormat;
  }

  // ===== 합계행 =====
  const sumRowNum = 5 + data.length;
  ws.mergeCells(sumRowNum, 1, sumRowNum, 2);
  const sumLabelCell = ws.getCell(sumRowNum, 1);
  sumLabelCell.value = '합 계';
  fillCell(sumLabelCell, COLORS.sumHeader, 'FFFFFF', true, 11);

  // 전월재고 합계
  const sumPrevCell = ws.getCell(sumRowNum, 3);
  sumPrevCell.value = sumPrevStock;
  fillCell(sumPrevCell, COLORS.sumData, '000000', true, 9);
  sumPrevCell.numFmt = kgFormat;

  // 입고합계 합계
  const sumRecvTotalCell = ws.getCell(sumRowNum, 4);
  sumRecvTotalCell.value = sumRecvTotal;
  fillCell(sumRecvTotalCell, COLORS.sumData, '000000', true, 9);
  sumRecvTotalCell.numFmt = kgFormat;

  // 입고 일별 합계
  for (let d = 1; d <= 31; d++) {
    const cell = ws.getCell(sumRowNum, 4 + d);
    cell.value = sumRecvDays[d - 1] || '';
    fillCell(cell, COLORS.sumData, '000000', true, 8);
    if (sumRecvDays[d - 1]) cell.numFmt = kgFormat;
  }

  // 사용합계 합계
  const sumUseTotalCell = ws.getCell(sumRowNum, 36);
  sumUseTotalCell.value = sumUseTotal;
  fillCell(sumUseTotalCell, COLORS.sumData, '000000', true, 9);
  sumUseTotalCell.numFmt = kgFormat;

  // 사용 일별 합계
  for (let d = 1; d <= 31; d++) {
    const cell = ws.getCell(sumRowNum, 36 + d);
    cell.value = sumUseDays[d - 1] || '';
    fillCell(cell, COLORS.sumData, '000000', true, 8);
    if (sumUseDays[d - 1]) cell.numFmt = kgFormat;
  }

  // 월말재고 합계
  const sumEndCell = ws.getCell(sumRowNum, 68);
  sumEndCell.value = sumEndStock;
  fillCell(sumEndCell, COLORS.sumData, '000000', true, 9);
  sumEndCell.numFmt = kgFormat;

  // 단가 합계 (평균 또는 합계)
  const sumPriceCell = ws.getCell(sumRowNum, 69);
  sumPriceCell.value = '';
  fillCell(sumPriceCell, COLORS.sumData, '000000', true, 9);

  // 입고금액 합계
  const sumRecvAmtCell = ws.getCell(sumRowNum, 70);
  sumRecvAmtCell.value = sumRecvAmount;
  fillCell(sumRecvAmtCell, COLORS.sumData, '000000', true, 9);
  sumRecvAmtCell.numFmt = wonFormat;

  // 사용금액 합계
  const sumUseAmtCell = ws.getCell(sumRowNum, 71);
  sumUseAmtCell.value = sumUseAmount;
  fillCell(sumUseAmtCell, COLORS.sumData, '000000', true, 9);
  sumUseAmtCell.numFmt = wonFormat;

  ws.getRow(sumRowNum).height = 24;

  // 인쇄 설정
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:BS${sumRowNum}`,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
