/**
 * CSV 내보내기 유틸리티 함수
 */

/**
 * 객체 배열을 CSV 문자열로 변환
 */
export function convertToCSV<T extends Record<string, any>>(
  data: T[],
  headers: { key: keyof T; label: string }[]
): string {
  if (data.length === 0) {
    return "";
  }

  // CSV 헤더 생성
  const headerRow = headers.map((h) => h.label).join(",");

  // CSV 데이터 행 생성
  const dataRows = data.map((row) => {
    return headers
      .map((h) => {
        const value = row[h.key];
        // 값이 문자열이고 쉼표나 줄바꿈을 포함하면 따옴표로 감싸기
        if (typeof value === "string" && (value.includes(",") || value.includes("\n"))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? "";
      })
      .join(",");
  });

  return [headerRow, ...dataRows].join("\n");
}

/**
 * CSV 파일 다운로드
 */
export function downloadCSV(csvContent: string, filename: string): void {
  // BOM 추가 (Excel에서 한글이 깨지지 않도록)
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 메모리 해제
  URL.revokeObjectURL(url);
}
