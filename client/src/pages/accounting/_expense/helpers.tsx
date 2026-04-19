/**
 * ExpenseManagement 공통 헬퍼 + 상수 + 도메인 타입.
 */
import { FileText, Image, FileSpreadsheet, File } from "lucide-react";
import type { RouterOutput } from "@/lib/trpcTypes";

// ─── 도메인 타입 ─────────────────────────────
export type ExpenseListRow = RouterOutput["expense"]["list"]["items"][number];
export type ExpenseDetail = NonNullable<RouterOutput["expense"]["getById"]>;
export type ExpenseItem = ExpenseDetail["items"][number];
export type ExpenseJournalLine = ExpenseDetail["journalLines"][number];
export type ExpenseAttachment = ExpenseDetail["attachments"][number];
export type ExpenseAccount = RouterOutput["expense"]["getExpenseAccounts"][number];
export type ExpensePartnerRow = RouterOutput["expense"]["searchPartners"][number];
export type RecurringTemplate = RouterOutput["expense"]["recurringList"][number];
export type UnpaidRow = RouterOutput["expense"]["list"]["items"][number];

// ─── 상수 ─────────────────────────────
export const PAYMENT_METHODS: Record<string, string> = {
  cash: "현금",
  bank: "계좌이체",
  card: "카드",
  unpaid: "미지급(외상)",
};

export const PROOF_TYPES: Record<string, string> = {
  tax_invoice: "세금계산서",
  card: "카드",
  cash_receipt: "현금영수증",
  simple: "간이영수증",
  none: "없음",
};

export const STATUS_MAP: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: "임시저장", variant: "secondary" },
  posted: { label: "확정", variant: "default" },
  canceled: { label: "취소", variant: "destructive" },
};

// ─── 헬퍼 함수 ─────────────────────────────
export function fmt(n: unknown) {
  const num = typeof n === "number" ? n : Number(n ?? 0);
  return (isNaN(num) ? 0 : num).toLocaleString("ko-KR");
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(mimeType: string) {
  if (mimeType?.startsWith("image/")) return <Image className="w-4 h-4 text-green-500" />;
  if (mimeType?.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
  if (
    mimeType?.includes("excel") ||
    mimeType?.includes("spreadsheet") ||
    mimeType?.includes("csv")
  )
    return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
  return <File className="w-4 h-4 text-blue-500" />;
}
