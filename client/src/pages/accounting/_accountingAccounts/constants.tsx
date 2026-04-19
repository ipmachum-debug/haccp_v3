/**
 * AccountingAccounts 공통 상수 + 도메인 타입.
 */
import { Building2, Receipt, Wallet, TrendingUp, CircleDot } from "lucide-react";
import type { RouterOutput } from "@/lib/trpcTypes";

// ===== 도메인 타입 =====
export type AccountCategoryRow = RouterOutput["accountCategories"]["getAll"][number];
export type AccountingAccountRow = RouterOutput["accountingAccounts"]["list"][number];
export type AccountingStats = RouterOutput["accountingAccounts"]["getStats"];

// ===== 5분류 체계 (고정, 추가/삭제 불가) =====
export type AccountCategory = "assets" | "liabilities" | "equity" | "revenue" | "expenses";

export const FIXED_CATEGORIES: {
  key: AccountCategory;
  label: string;
  code: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}[] = [
  {
    key: "assets",
    label: "자산",
    code: "1",
    icon: Building2,
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    description: "기업이 소유한 경제적 자원",
  },
  {
    key: "liabilities",
    label: "부채",
    code: "2",
    icon: Receipt,
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    description: "갚아야 할 의무",
  },
  {
    key: "equity",
    label: "자본",
    code: "3",
    icon: Wallet,
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    description: "자산에서 부채를 뺀 잔여 지분",
  },
  {
    key: "revenue",
    label: "수익",
    code: "4",
    icon: TrendingUp,
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    description: "영업 활동으로 발생하는 수입",
  },
  {
    key: "expenses",
    label: "비용",
    code: "5",
    icon: CircleDot,
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    description: "수익 창출을 위해 지출한 비용",
  },
];

export const categoryLabels: Record<AccountCategory, string> = {
  assets: "자산",
  liabilities: "부채",
  equity: "자본",
  revenue: "수익",
  expenses: "비용",
};

export const categoryBadgeColors: Record<AccountCategory, string> = {
  assets: "bg-blue-100 text-blue-800",
  liabilities: "bg-red-100 text-red-800",
  equity: "bg-green-100 text-green-800",
  revenue: "bg-purple-100 text-purple-800",
  expenses: "bg-orange-100 text-orange-800",
};

// majorCategory(한국어) → AccountCategory(영어) 매핑
export const majorToCategory: Record<string, AccountCategory> = {
  "자산": "assets",
  "부채": "liabilities",
  "자본": "equity",
  "수익": "revenue",
  "비용": "expenses",
};

export const categoryToMajor: Record<AccountCategory, string> = {
  assets: "자산",
  liabilities: "부채",
  equity: "자본",
  revenue: "수익",
  expenses: "비용",
};
