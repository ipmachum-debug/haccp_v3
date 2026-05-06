/**
 * 품목제조보고서 Excel 출력 — PR #256
 *
 * 식약처 양식의 "원재료명 또는 성분명 및 배합비율" 표를 Excel 로 생성.
 * - 트리 구조 인덴트 (└, 이중 인덴트)
 * - 원산지 [...] 표기
 * - 비율 % (null 은 빈칸)
 * - 헤더: 품목제조보고번호 + 제품명 (영양성분 미보유 시 생략)
 *
 * 작성: 2026-05-05
 */

import ExcelJS from "exceljs";
import { flattenBomTree, type FlattenedRow } from "./mfReportFlatten";

function indentPrefix(depth: number): string {
  if (depth === 0) return "";
  return "  ".repeat(depth - 1) + "└";
}

function formatRowName(row: FlattenedRow): string {
  const indent = indentPrefix(row.depth);
  let name = row.name;
  // 카테고리가 있으면 "조림류 [백옥앙금]" 형태
  if (row.category) {
    name = `${row.category} [${name}]`;
  }
  // 원산지 표기
  if (row.origin) {
    name = `${name} [${row.origin}]`;
  }
  return `${indent}${name}`;
}

/**
 * 품목제조보고서 Excel 생성
 * @returns base64 인코딩 buffer
 */
export async function exportMfReportExcel(
  versionId: number,
  tenantId: number,
): Promise<{ filename: string; base64: string }> {
  const data = await flattenBomTree(versionId, tenantId);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Millio AI";
  wb.created = new Date();

  const ws = wb.addWorksheet("품목제조보고", {
    pageSetup: { paperSize: 9, orientation: "portrait" }, // A4 portrait
  });

  // ─── 헤더 영역 ───
  ws.mergeCells("A1:D1");
  ws.getCell("A1").value = "식품·식품첨가물 품목제조보고서";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.getCell("A3").value = "품목제조보고번호";
  ws.getCell("A3").font = { bold: true };
  ws.getCell("B3").value = data.reportNo ?? "-";

  ws.getCell("C3").value = "버전";
  ws.getCell("C3").font = { bold: true };
  ws.getCell("D3").value = data.versionNo !== null ? `v${data.versionNo}` : "-";

  ws.getCell("A4").value = "제품명";
  ws.getCell("A4").font = { bold: true };
  ws.mergeCells("B4:D4");
  ws.getCell("B4").value = data.productName ?? "-";

  // ─── 표 헤더 ───
  ws.addRow([]);
  ws.getRow(6).values = ["1. 원재료명 또는 성분명 및 배합비율"];
  ws.getCell("A6").font = { bold: true, size: 12 };
  ws.mergeCells("A6:D6");

  // 컬럼 헤더 (테이블 row 7)
  ws.getRow(7).values = ["번호", "원재료명 또는 성분명", "원산지", "배합비율(%)"];
  ws.getRow(7).font = { bold: true };
  ws.getRow(7).alignment = { horizontal: "center" };
  ws.getRow(7).eachCell((cell) => {
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
  });

  // ─── 데이터 행 ───
  let rowIdx = 8;
  for (const r of data.rows) {
    const row = ws.getRow(rowIdx);
    row.values = [
      r.lineNo,
      formatRowName(r),
      r.origin ?? "",
      r.ratio !== null ? r.ratio : "",
    ];
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });
    // 인덴트된 행은 fill 색 다르게
    if (r.depth > 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: r.depth === 1 ? "FFF8F8F8" : "FFEEEEEE" },
        };
      });
    }
    // 중간재 (MIXED) 는 굵게
    if (r.type === "MIXED" && r.depth === 0) {
      row.font = { bold: true };
    }
    // 비율 우측 정렬
    row.getCell(4).alignment = { horizontal: "right" };
    rowIdx++;
  }

  // ─── 합계 행 ───
  const totalRow = ws.getRow(rowIdx);
  totalRow.values = ["", "합계 (직접 사용 항목)", "", data.totalRatio.toFixed(2) + "%"];
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = {
      top: { style: "double" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });
  totalRow.getCell(4).alignment = { horizontal: "right" };

  // ─── 컬럼 너비 ───
  ws.columns = [
    { width: 8 },   // 번호
    { width: 50 },  // 이름
    { width: 14 },  // 원산지
    { width: 14 },  // 비율
  ];

  // ─── 출력 ───
  const buf = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const safeName = (data.productName ?? "보고서").replace(/[^가-힣A-Za-z0-9]/g, "_");
  return {
    filename: `품목제조보고_${safeName}_v${data.versionNo ?? "1"}.xlsx`,
    base64,
  };
}
