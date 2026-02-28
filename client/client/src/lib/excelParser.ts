/**
 * 제품 엑셀 파일 파싱 (DB 스키마 매칭)
 * 
 * 템플릿 헤더 (DB 스키마 기준):
 * 제품 코드* | 제품명* | 카테고리* | 단위* | 소비기한(개월)* | 설명
 */

import * as XLSX from "xlsx";
import { normalizeString } from "./uploadUtils";

/**
 * 제품 데이터 타입 (DB 스키마 기준)
 */
export interface ParsedProduct {
  productCode?: string;           // 제품 코드 (미입력 시 자동생성)
  productName: string;             // 제품명 (필수)
  category?: string;               // 카테고리
  unit?: string;                   // 단위
  shelfLifeMonths?: number;        // 소비기한(개월)
  description?: string;            // 설명
}

/**
 * 파싱 결과 타입
 */
export interface ParseResult<T> {
  success: boolean;
  data: T[];
  errors: Array<{
    row: number;
    field: string;
    message: string;
  }>;
}

/**
 * 제품 엑셀 파일 파싱
 */
export function parseProductExcel(file: File): Promise<ParseResult<ParsedProduct>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const result: ParseResult<ParsedProduct> = {
          success: false,
          data: [],
          errors: [],
        };

        // 헤더 확인 (첫 번째 행)
        if (!jsonData || jsonData.length < 2) {
          resolve({
            success: false,
            data: [],
            errors: [{ row: 0, field: "header", message: "헤더가 없습니다" }],
          });
          return;
        }

        // 데이터 행 파싱 (2번째 행부터)
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;

          // 빈 행 건너뛰기 (제품명이 없으면 빈 행으로 간주)
          if (!row[1]) continue;

          const product: Partial<ParsedProduct> = {};

          // 0. 제품 코드 (선택, 미입력 시 서버에서 자동생성)
          product.productCode = normalizeString(row[0]) || undefined;

          // 1. 제품명 (필수)
          const productName = normalizeString(row[1]);
          if (!productName) {
            result.errors.push({
              row: i + 1,
              field: "제품명",
              message: "필수 항목입니다",
            });
            continue;
          }
          product.productName = productName;

          // 2. 카테고리 (선택)
          product.category = normalizeString(row[2]) || undefined;

          // 3. 단위 (선택)
          product.unit = normalizeString(row[3]) || undefined;

          // 4. 소비기한(개월) (선택, 숫자 검증)
          const shelfLifeMonths = row[4];
          if (shelfLifeMonths !== undefined && shelfLifeMonths !== null && shelfLifeMonths !== "") {
            const months = typeof shelfLifeMonths === "number" ? shelfLifeMonths : parseInt(String(shelfLifeMonths));
            if (isNaN(months) || months < 0) {
              result.errors.push({
                row: i + 1,
                field: "소비기한(개월)",
                message: "올바른 숫자 형식이 아닙니다",
              });
              continue;
            }
            product.shelfLifeMonths = months;
          }

          // 5. 설명 (선택)
          product.description = normalizeString(row[5]) || undefined;

          result.data.push(product as ParsedProduct);
        }

        result.success = result.errors.length === 0;
        resolve(result);
      } catch (error: any) {
        reject(new Error(`파일 파싱 오류: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error("파일 읽기 오류"));
    };

    reader.readAsBinaryString(file);
  });
}

/**
 * 원재료 데이터 타입
 */
export interface ParsedMaterial {
  materialCode?: string;
  materialName: string;
  category?: string;
  unit?: string;
  expiryWarningDays?: number;
  description?: string;
}

/**
 * 원재료 엑셀 파일 파싱
 */
export function parseMaterialExcel(file: File): Promise<ParseResult<ParsedMaterial>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const result: ParseResult<ParsedMaterial> = {
          success: false,
          data: [],
          errors: [],
        };

        if (!jsonData || jsonData.length < 2) {
          resolve({
            success: false,
            data: [],
            errors: [{ row: 0, field: "header", message: "헤더가 없습니다" }],
          });
          return;
        }

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          // 거래처명(row[0])과 사업자번호(row[1])가 모두 비어있으면 스킵
          const hasSupplierName = row[0] && String(row[0]).trim() !== "";
          const hasBusinessNumber = row[1] && String(row[1]).trim() !== "";
          if (!hasSupplierName || !hasBusinessNumber) continue;

          const material: Partial<ParsedMaterial> = {};

          material.materialCode = normalizeString(row[0]) || undefined;

          const materialName = normalizeString(row[1]);
          if (!materialName) {
            result.errors.push({
              row: i + 1,
              field: "원재료명",
              message: "필수 항목입니다",
            });
            continue;
          }
          material.materialName = materialName;

          material.category = normalizeString(row[2]) || undefined;
          material.unit = normalizeString(row[3]) || undefined;

          const expiryWarningDays = row[4];
          if (expiryWarningDays !== undefined && expiryWarningDays !== null && expiryWarningDays !== "") {
            const days = typeof expiryWarningDays === "number" ? expiryWarningDays : parseInt(String(expiryWarningDays));
            if (isNaN(days) || days < 0) {
              result.errors.push({
                row: i + 1,
                field: "소비기한(일)",
                message: "올바른 숫자 형식이 아닙니다",
              });
              continue;
            }
            material.expiryWarningDays = days;
          }

          material.description = normalizeString(row[5]) || undefined;

          result.data.push(material as ParsedMaterial);
        }

        result.success = result.errors.length === 0;
        resolve(result);
      } catch (error: any) {
        reject(new Error(`파일 파싱 오류: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error("파일 읽기 오류"));
    };

    reader.readAsBinaryString(file);
  });
}

/**
 * 거래처 데이터 타입
 */
export interface ParsedSupplier {
  supplierCode?: string;
  supplierName: string;
  businessNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  supplierType?: string;
  certifications?: string;
  rating?: string;
}

/**
 * 거래처 엑셀 파일 파싱
 */
export function parseSupplierExcel(file: File): Promise<ParseResult<ParsedSupplier>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const result: ParseResult<ParsedSupplier> = {
          success: false,
          data: [],
          errors: [],
        };

        if (!jsonData || jsonData.length < 2) {
          resolve({
            success: false,
            data: [],
            errors: [{ row: 0, field: "header", message: "헤더가 없습니다" }],
          });
          return;
        }

        // 최대 100개 행까지만 처리 (1행은 헤더이므로 2-101행)
        const maxRow = Math.min(jsonData.length, 101);
        for (let i = 1; i < maxRow; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;
          // 거래처명(row[0])과 사업자번호(row[1])가 모두 비어있으면 스킵
          const hasSupplierName = row[0] && String(row[0]).trim() !== "";
          const hasBusinessNumber = row[1] && String(row[1]).trim() !== "";
          if (!hasSupplierName || !hasBusinessNumber) continue;

          const supplier: Partial<ParsedSupplier> = {};

          // 새로운 컴럼 순서: 거래처명*, 사업자번호*, 대표자명, 연락처, 주소, 거래처 유형*, 이메일, 비고
          const supplierName = normalizeString(row[0]);
          if (!supplierName) {
            result.errors.push({
              row: i + 1,
              field: "거래처명",
              message: "필수 항목입니다",
            });
            continue;
          }
          supplier.supplierName = supplierName;

          supplier.businessNumber = normalizeString(row[1]) || undefined;
          supplier.contactPerson = normalizeString(row[2]) || undefined;
          supplier.phone = normalizeString(row[3]) || undefined;
          supplier.address = normalizeString(row[4]) || undefined;
          supplier.supplierType = normalizeString(row[5]) || undefined;
          const emailValue = normalizeString(row[6]);
          supplier.email = (emailValue && emailValue.trim() !== "") ? emailValue : undefined;
          // row[7]은 비고로 현재 사용하지 않음

          result.data.push(supplier as ParsedSupplier);
        }

        result.success = result.errors.length === 0;
        resolve(result);
      } catch (error: any) {
        reject(new Error(`파일 파싱 오류: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error("파일 읽기 오류"));
    };

    reader.readAsBinaryString(file);
  });
}

/**
 * 은행거래내역 데이터 타입
 */
export interface ParsedBankTransaction {
  거래일시: string;
  거래구분: string;
  거래금액: number;
  거래처: string;
  메모?: string;
  잔액: number;
}

/**
 * 거래구분 매핑 함수
 */
export function mapTransactionType(type: string): 'deposit' | 'withdrawal' {
  const normalized = normalizeString(type);
  if (normalized === '입금' || normalized === 'deposit') {
    return 'deposit';
  }
  return 'withdrawal';
}

/**
 * 거래일시 파싱 함수
 */
export function parseTransactionDate(dateStr: string): Date {
  // Excel 날짜 형식 또는 문자열 날짜 파싱
  if (typeof dateStr === 'number') {
    // Excel 날짜 (1900년 1월 1일부터의 일수)
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + dateStr * 86400000);
  }
  return new Date(dateStr);
}

/**
 * 은행거래내역 엑셀 파일 파싱
 */
export function parseBankTransactionExcel(file: File): Promise<ParseResult<ParsedBankTransaction>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const result: ParseResult<ParsedBankTransaction> = {
          success: false,
          data: [],
          errors: [],
        };

        if (!jsonData || jsonData.length < 2) {
          resolve({
            success: false,
            data: [],
            errors: [{ row: 0, field: "header", message: "헤더가 없습니다" }],
          });
          return;
        }

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;

          const transaction: Partial<ParsedBankTransaction> = {};

          // 0. 거래일시 (필수)
          if (!row[0]) {
            result.errors.push({
              row: i + 1,
              field: "거래일시",
              message: "필수 항목입니다",
            });
            continue;
          }
          transaction.거래일시 = String(row[0]);

          // 1. 거래구분 (필수)
          const transactionType = normalizeString(row[1]);
          if (!transactionType) {
            result.errors.push({
              row: i + 1,
              field: "거래구분",
              message: "필수 항목입니다",
            });
            continue;
          }
          transaction.거래구분 = transactionType;

          // 2. 거래금액 (필수, 숫자)
          const amount = row[2];
          if (amount === undefined || amount === null || amount === "") {
            result.errors.push({
              row: i + 1,
              field: "거래금액",
              message: "필수 항목입니다",
            });
            continue;
          }
          const amountNum = typeof amount === "number" ? amount : parseFloat(String(amount).replace(/,/g, ''));
          if (isNaN(amountNum)) {
            result.errors.push({
              row: i + 1,
              field: "거래금액",
              message: "올바른 숫자 형식이 아닙니다",
            });
            continue;
          }
          transaction.거래금액 = amountNum;

          // 3. 거래처 (필수)
          const counterparty = normalizeString(row[3]);
          if (!counterparty) {
            result.errors.push({
              row: i + 1,
              field: "거래처",
              message: "필수 항목입니다",
            });
            continue;
          }
          transaction.거래처 = counterparty;

          // 4. 메모 (선택)
          transaction.메모 = normalizeString(row[4]) || undefined;

          // 5. 잔액 (필수, 숫자)
          const balance = row[5];
          if (balance === undefined || balance === null || balance === "") {
            result.errors.push({
              row: i + 1,
              field: "잔액",
              message: "필수 항목입니다",
            });
            continue;
          }
          const balanceNum = typeof balance === "number" ? balance : parseFloat(String(balance).replace(/,/g, ''));
          if (isNaN(balanceNum)) {
            result.errors.push({
              row: i + 1,
              field: "잔액",
              message: "올바른 숫자 형식이 아닙니다",
            });
            continue;
          }
          transaction.잔액 = balanceNum;

          result.data.push(transaction as ParsedBankTransaction);
        }

        result.success = result.errors.length === 0;
        resolve(result);
      } catch (error: any) {
        reject(new Error(`파일 파싱 오류: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error("파일 읽기 오류"));
    };

    reader.readAsBinaryString(file);
  });
}
