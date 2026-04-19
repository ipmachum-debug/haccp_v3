/**
 * CCPLimitsManagement 공통 상수 + 도메인 타입.
 */
import type { RouterOutput } from "@/lib/trpcTypes";

// ===== 도메인 타입 =====
export type ProductRow = RouterOutput["product"]["list"]["items"][number];
export type ProcessGroup = RouterOutput["ccpMonitoring"]["getProcessGroups"][number];
export type ProcessGroupProduct = RouterOutput["ccpMonitoring"]["getProcessGroupProducts"][number];
export type EquipmentRow = RouterOutput["equipment"]["list"]["items"][number];

export type CcpLimitEquipment = {
  id?: number;
  equipmentId?: number;
  equipment_id?: number;
  ccpType?: string;
  equipmentName?: string;
  equipment_name?: string;
  name?: string;
  equipmentCode?: string;
  code?: string;
};

export type CcpLimitInitialData = {
  id?: number;
  name?: string;
  ccpType?: string;
  ccp_type?: string;
  description?: string;
  temperatureMin?: number | string;
  temperature_min?: number | string;
  temperatureMax?: number | string;
  temperature_max?: number | string;
  timeMin?: number | string;
  time_min?: number | string;
  timeMax?: number | string;
  time_max?: number | string;
  pressureMin?: number | string;
  pressure_min?: number | string;
  pressureMax?: number | string;
  pressure_max?: number | string;
  phMin?: number | string;
  ph_min?: number | string;
  phMax?: number | string;
  ph_max?: number | string;
  monitoringMethod?: string;
  monitoring_method?: string;
  correctiveAction?: string;
  corrective_action?: string;
  equipments?: CcpLimitEquipment[];
  equipGroupMode?: "sequential" | "concurrent" | "grouped";
  equip_group_mode?: "sequential" | "concurrent" | "grouped";
  equipIntervalMin?: number | string;
  equip_interval_min?: number | string;
  equipBatchSize?: number | string;
  equip_batch_size?: number | string;
};

// ===== CCP 타입 상수 =====
export const ccpTypes = [
  { value: "CCP-1B", label: "CCP-1B (가열/증숙)", color: "bg-red-100 text-red-700" },
  { value: "CCP-2B", label: "CCP-2B (가열 굽기)", color: "bg-blue-100 text-blue-700" },
  { value: "CCP-3B", label: "CCP-3B (가열/볶음)", color: "bg-yellow-100 text-yellow-700" },
  { value: "CCP-4P", label: "CCP-4P (금속검출)", color: "bg-green-100 text-green-700" },
];

export const processTypes = [
  { value: "MIX", label: "교반(MIX)" },
  { value: "STEAM", label: "증숙(STEAM)" },
  { value: "OVEN", label: "오븐(OVEN)" },
  { value: "COOL", label: "냉각(COOL)" },
  { value: "METAL", label: "금속검출(METAL)" },
];

export function getCcpColor(type: string) {
  return ccpTypes.find(t => t.value === type)?.color || "bg-gray-100 text-gray-700";
}
