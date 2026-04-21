/**
 * 공유 업종 옵션 상수
 * ────────────────────────────────────────────────────
 * SystemSettings / Register / TenantManagement 3곳에서 중복되어있던
 * 하드코딩 배열을 한 곳에 모음. 서버 `server/lib/industry/industryConfig.ts` 의
 * INDUSTRY_PROFILES 와 **코드/카테고리가 일치해야 함** (불일치 시 테넌트
 * 설정 후 메뉴 분기가 오작동).
 *
 * 아이콘은 lucide-react 컴포넌트 reference 가 필요해서 서버에서 받아올 수
 * 없음 — 그래서 클라이언트 사이드 상수로 유지.
 */

import {
  ChefHat,
  Pill,
  Sparkles,
  Syringe,
  Cpu,
  Scissors,
  Factory,
  type LucideIcon,
} from "lucide-react";

export interface IndustryOption {
  code: string;
  label: string;
  category: string;
  icon: LucideIcon;
}

export const INDUSTRY_OPTIONS: readonly IndustryOption[] = [
  { code: "C10", label: "식품 제조업", category: "food", icon: ChefHat },
  { code: "C10_SUP", label: "건강기능식품", category: "supplement", icon: Pill },
  { code: "C20", label: "화장품 제조업", category: "cosmetics", icon: Sparkles },
  { code: "C21", label: "의약품 제조업", category: "pharma", icon: Syringe },
  { code: "C26", label: "전자부품·장비", category: "electronics", icon: Cpu },
  { code: "C13", label: "섬유·의복", category: "textile", icon: Scissors },
  { code: "C_GENERAL", label: "일반 제조업", category: "general", icon: Factory },
] as const;

export const INDUSTRY_OPTION_MAP: Record<string, IndustryOption> =
  Object.fromEntries(INDUSTRY_OPTIONS.map((o) => [o.code, o]));

export const DEFAULT_INDUSTRY_CODE = "C10";

/** 업종코드로 안전하게 라벨 조회 (없으면 코드 자체 반환) */
export function getIndustryLabel(code: string | null | undefined): string {
  if (!code) return "일반 제조업";
  return INDUSTRY_OPTION_MAP[code]?.label ?? code;
}

/** 업종코드로 카테고리 조회 (없으면 "general") */
export function getIndustryCategory(code: string | null | undefined): string {
  if (!code) return "general";
  return INDUSTRY_OPTION_MAP[code]?.category ?? "general";
}

/**
 * 카테고리별 배지 표시 — 라벨/색상/아이콘
 * (테넌트 관리 / 사이드바 헤더 등에서 공통으로 사용)
 */
export interface IndustryCategoryBadge {
  label: string;
  color: string;
  icon: LucideIcon;
}

export const INDUSTRY_CATEGORIES: Record<string, IndustryCategoryBadge> = {
  food: {
    label: "식품제조",
    color: "bg-orange-100 text-orange-700 border-orange-200",
    icon: ChefHat,
  },
  cosmetics: {
    label: "화장품",
    color: "bg-pink-100 text-pink-700 border-pink-200",
    icon: Sparkles,
  },
  supplement: {
    label: "건기식",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: Pill,
  },
  pharma: {
    label: "의약품",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: Syringe,
  },
  electronics: {
    label: "전자",
    color: "bg-indigo-100 text-indigo-700 border-indigo-200",
    icon: Cpu,
  },
  textile: {
    label: "섬유",
    color: "bg-purple-100 text-purple-700 border-purple-200",
    icon: Scissors,
  },
  general: {
    label: "일반제조",
    color: "bg-stone-100 text-stone-700 border-stone-200",
    icon: Factory,
  },
};
