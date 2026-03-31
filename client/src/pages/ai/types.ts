import {
  XCircle, AlertTriangle, Bell, Eye,
} from "lucide-react";

// ============================================================================
// Shared Types
// ============================================================================
export type AlertItem = {
  id: number;
  rule_code: string;
  title: string;
  message: string;
  severity: string;
  entity_type: string;
  entity_code?: string;
  status: string;
  created_at: string;
  contextData?: Record<string, any>;
};

export type ParsedItem = {
  id: string;
  category: string;
  checkItem: string;
  standard: string;
  frequency: string;
  method?: string;
  responsibleRole?: string;
  itemType?: string;
  importance?: string;
  validationRules?: { min?: number | null; max?: number | null; options?: string[] | null };
};

// ============================================================================
// Section config
// ============================================================================
export type Section = "haccp" | "erp" | "manage";

// ============================================================================
// Severity helpers
// ============================================================================
export const SEVERITY_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  critical: { color: "bg-red-100 text-red-800 border-red-200", icon: XCircle, label: "위험" },
  high: { color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertTriangle, label: "높음" },
  medium: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Bell, label: "보통" },
  low: { color: "bg-blue-100 text-blue-800 border-blue-200", icon: Eye, label: "낮음" },
};

export const STANDARD_TYPE_LABELS: Record<string, string> = {
  haccp_plan: "HACCP 관리계획",
  prerequisite: "선행요건 (PRP)",
  operational_prp: "운영선행요건 (OPRP)",
  ccp_standard: "CCP 기준",
  sanitation: "위생관리기준",
  quality_standard: "품질기준",
  facility_standard: "시설기준",
  training_standard: "교육훈련기준",
  recall_plan: "리콜 계획",
  custom: "사용자 정의",
};

export function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
