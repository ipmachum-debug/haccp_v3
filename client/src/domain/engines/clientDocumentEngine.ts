/**
 * Client Document Engine — Plugin 기반 문서 양식 카탈로그
 *
 * Phase Plugin-4 (Document Engine).
 *
 * 역할:
 *   - Plugin 의 documents.formTypes 를 단일 source 로 노출
 *   - 카테고리 별 그룹화
 *   - PDF template 매핑
 *
 * 사용처:
 *   - DocumentApprovalSettingsPage: 결재자 양식 동적 생성
 *   - DocumentPrintManagement: 출력 가능 문서 동적
 *   - 화장품 GMP: BMR / Formula / Release / Stability 등
 *   - 식품 HACCP: 51개 식품 양식
 *
 * 마이그레이션:
 *   기존 client/src/lib/documentFormTypes.ts 의 51개 + 13개 양식이
 *   각 plugin.documents.formTypes 로 흡수됨. 이 engine 이 plugin 을 쿼리.
 */

import type {
  IndustryPlugin,
  DocumentFormTypeDef,
  PdfTemplateDef,
} from "@shared/domain/IndustryPlugin";

export interface BuiltDocumentFormType {
  code: string;
  name: string;
  category: string;
  pdfTemplate?: string;
}

export interface DocumentCategoryGroup {
  category: string;
  formTypes: BuiltDocumentFormType[];
}

/**
 * Plugin 의 documents.formTypes 평면 배열로 반환.
 */
export function getDocumentFormTypes(
  plugin: IndustryPlugin | null,
): BuiltDocumentFormType[] {
  if (!plugin) return [];
  return plugin.documents.formTypes.map((ft: DocumentFormTypeDef) => ({
    code: ft.code,
    name: ft.name,
    category: ft.category,
    pdfTemplate: ft.pdfTemplate,
  }));
}

/**
 * 카테고리 별 그룹화.
 */
export function getDocumentFormTypesByCategory(
  plugin: IndustryPlugin | null,
): DocumentCategoryGroup[] {
  const types = getDocumentFormTypes(plugin);
  const map = new Map<string, BuiltDocumentFormType[]>();
  for (const t of types) {
    const arr = map.get(t.category) ?? [];
    arr.push(t);
    map.set(t.category, arr);
  }
  return Array.from(map.entries()).map(([category, formTypes]) => ({
    category,
    formTypes,
  }));
}

/**
 * 특정 form type code 의 PDF template 조회.
 */
export function getPdfTemplate(
  plugin: IndustryPlugin | null,
  formTypeCode: string,
): PdfTemplateDef | null {
  if (!plugin) return null;
  const formType = plugin.documents.formTypes.find((ft) => ft.code === formTypeCode);
  if (!formType?.pdfTemplate) return null;
  return plugin.documents.pdfTemplates.find((t) => t.code === formType.pdfTemplate) ?? null;
}

/**
 * Plugin 의 모든 PDF template 목록 (관리자 / 출력 페이지 용).
 */
export function getAllPdfTemplates(
  plugin: IndustryPlugin | null,
): PdfTemplateDef[] {
  if (!plugin) return [];
  return [...plugin.documents.pdfTemplates];
}
