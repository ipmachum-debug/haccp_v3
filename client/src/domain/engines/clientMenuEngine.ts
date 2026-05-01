/**
 * Client Menu Engine — Plugin 기반 사이드바 메뉴 동적 생성
 *
 * Phase Plugin-3 (Menu Engine).
 *
 * 역할:
 *   - 산업 무관 공통 메뉴 (대시보드 / 재고 / 알림 / 승인 / 마스터 / 시스템) 정의
 *   - Plugin 의 menu.groups 와 병합하여 최종 메뉴 배열 생성
 *   - 그룹별 order 정렬
 *   - lucide-react 아이콘 string → Component 매핑
 *
 * 사용:
 *   const { plugin } = useDomainPlugin();
 *   const menuItems = buildMenuFromPlugin(plugin);
 */

import type { IndustryPlugin, MenuGroupDef, MenuItemDef } from "@shared/domain/IndustryPlugin";
import type { LucideIcon } from "lucide-react";
import {
  Crown, UserCheck, Building, LayoutDashboard, Package, Calendar, FileCode,
  Shield, ClipboardCheck, ListChecks, Warehouse, Bell, CheckCircle, FileText,
  Database, Sparkles, FlaskConical, Tag, Truck, Thermometer, GitBranch,
  AlertCircle, AlertTriangle, GraduationCap, Sliders, Activity, TrendingUp,
  FileWarning, Building2, Settings, ArrowLeftRight, Pill, ChefHat, Syringe,
  Factory,
} from "lucide-react";

// ─── 아이콘 string → Component 매핑 ───
export const ICON_MAP: Record<string, LucideIcon> = {
  Crown, UserCheck, Building, LayoutDashboard, Package, Calendar, FileCode,
  Shield, ClipboardCheck, ListChecks, Warehouse, Bell, CheckCircle, FileText,
  Database, Sparkles, FlaskConical, Tag, Truck, Thermometer, GitBranch,
  AlertCircle, AlertTriangle, GraduationCap, Sliders, Activity, TrendingUp,
  FileWarning, Building2, Settings, ArrowLeftRight, Pill, ChefHat, Syringe,
  Factory,
};

export function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? FileText;
}

// ─── 공통 메뉴 (산업 무관) ───
// 모든 산업이 공유하는 메뉴 — plugin 에 정의되지 않음.
// 향후 plugin 에 옵트인/옵트아웃 flag 추가 가능.

export interface BuiltMenuItem {
  icon: LucideIcon;
  label: string;
  path: string;
  roles: readonly string[];
  requireModule?: string;
  highlight?: boolean;
  group?: string;
}

export const COMMON_MENU_GROUPS: MenuGroupDef[] = [
  {
    name: "대시보드",
    order: 0,
    items: [
      { icon: "LayoutDashboard", label: "통합 대시보드", path: "/dashboard", roles: ["admin", "accountant", "monitor", "inspector", "worker"] },
    ],
  },
  {
    name: "재고·운영",
    order: 40,
    items: [
      { icon: "Warehouse", label: "재고 관리", path: "/inventory-management", roles: ["super_admin", "admin", "accountant", "worker"] },
      { icon: "Bell", label: "알림 관리", path: "/dashboard/notifications", roles: ["admin", "accountant", "monitor", "inspector", "worker"] },
      { icon: "CheckCircle", label: "승인 관리", path: "/dashboard/approval", roles: ["super_admin", "admin", "monitor", "inspector", "worker"] },
      { icon: "FileText", label: "문서 출력", path: "/dashboard/document-output", roles: ["super_admin", "admin", "accountant", "monitor", "inspector"] },
    ],
  },
  {
    name: "마스터",
    order: 50,
    items: [
      { icon: "Database", label: "마스터 데이터", path: "/dashboard/master-data", roles: ["super_admin", "admin", "accountant"] },
      { icon: "Package", label: "품목 마스터", path: "/dashboard/item-master", roles: ["super_admin", "admin", "accountant"] },
    ],
  },
  {
    name: "시스템",
    order: 100,
    items: [
      { icon: "Settings", label: "시스템 관리", path: "/admin/settings", roles: ["super_admin", "admin"] },
    ],
  },
];

// ─── 슈퍼관리자 전용 메뉴 ───
export const SUPER_ADMIN_MENU_ITEMS: BuiltMenuItem[] = [
  { icon: getIcon("Crown"), label: "슈퍼관리자 대시보드", path: "/dashboard/super-admin", roles: ["super_admin"] },
  { icon: getIcon("UserCheck"), label: "사용자 승인", path: "/dashboard/users/approval", roles: ["super_admin"] },
  { icon: getIcon("Building"), label: "테넌트 관리", path: "/dashboard/tenants", roles: ["super_admin"] },
];

/**
 * Plugin + 공통 메뉴를 병합하여 최종 메뉴 배열 생성.
 *
 * 동작:
 *   1. COMMON_MENU_GROUPS + plugin.menu.groups 병합
 *   2. group.order 로 정렬
 *   3. 각 item 의 icon string → Component 변환
 *   4. group 필드 추가 (group.name)
 *
 * @param plugin 현재 테넌트의 plugin (null = 공통 메뉴만)
 * @returns BuiltMenuItem[] — DashboardLayout 의 menuItems 대체
 */
export function buildMenuFromPlugin(plugin: IndustryPlugin | null): BuiltMenuItem[] {
  const allGroups: MenuGroupDef[] = [
    ...COMMON_MENU_GROUPS,
    ...(plugin ? plugin.menu.groups : []),
  ];

  // group.order 로 정렬
  const sorted = [...allGroups].sort((a, b) => a.order - b.order);

  // flat 변환
  const items: BuiltMenuItem[] = [];
  for (const group of sorted) {
    for (const item of group.items) {
      items.push({
        icon: getIcon(item.icon),
        label: item.label,
        path: item.path,
        roles: item.roles,
        requireModule: item.requireModule,
        highlight: item.highlight,
        group: group.name,
      });
    }
  }
  return items;
}

/**
 * 통합 메뉴 빌드 — plugin 없을 때 폴백 메뉴 (공통만).
 */
export function buildFallbackMenu(): BuiltMenuItem[] {
  return buildMenuFromPlugin(null);
}
