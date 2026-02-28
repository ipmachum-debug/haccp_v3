/**
 * 데이터 업로드 공용 유틸리티
 * 문자열 정규화, 파일 파싱, 유효성 검사 등
 */

/**
 * 문자열 정규화 함수
 * 유니코드 정규화, 공백 제거, 따옴표 제거 등
 */
export function normalizeString(value: string | null | undefined): string {
  if (!value) return "";
  
  let normalized = value;
  
  // 1. 유니코드 정규화 (NFKC)
  normalized = normalized.normalize("NFKC");
  
  // 2. 다양한 공백 문자 제거 (NBSP, zero-width space 등)
  normalized = normalized.replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, "");
  
  // 3. 개행/탭 문자 제거
  normalized = normalized.replace(/[\r\n\t]/g, " ");
  
  // 4. 모든 공백을 단일 공백으로 처리
  normalized = normalized.replace(/\s+/g, " ");
  
  // 5. 따옴표 제거
  normalized = normalized.replace(/['"]/g, "");
  
  // 6. 최종적으로 문자열의 앞뒤 공백 제거
  return normalized.trim();
}

/**
 * 엑셀 날짜 시리얼 번호를 Date 객체로 변환
 */
export function excelDateToJSDate(serial: number): Date {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info;
}

/**
 * 파일 읽기 (ArrayBuffer로 변환)
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as ArrayBuffer);
      } else {
        reject(new Error("파일 읽기 실패"));
      }
    };
    reader.onerror = () => reject(new Error("파일 읽기 오류"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 업로드 결과 타입
 */
export interface UploadResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  errors: Array<{
    row: number;
    code?: string;
    message: string;
  }>;
}
