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
import { PLUGIN_COMMON_GROUPS, PLUGIN_SUPER_ADMIN_ITEMS } from "@shared/navigation/menuRegistry";
import type { LucideIcon } from "lucide-react";
import {
  Crown, UserCheck, Building, LayoutDashboard, Package, Calendar, FileCode,
  Shield, ClipboardCheck, ListChecks, Warehouse, Bell, CheckCircle, FileText,
  Database, Sparkles, Bot, FlaskConical, Tag, Truck, Thermometer, GitBranch,
  AlertCircle, AlertTriangle, GraduationCap, Sliders, Activity, TrendingUp,
  FileWarning, Building2, Settings, ArrowLeftRight, Pill, ChefHat, Syringe,
  Factory, Wheat, SearchCheck, Users,
  // 2-a (2026-10-14): DashboardLayout 배열이 쓰던 아이콘 — 레지스트리가 이름으로 들고 여기서 컴포넌트로 바꾼다
  BarChart3, BookOpen, ClipboardList, Clock, DollarSign, FolderOpen, Landmark,
  MessageSquare, PackageMinus, PackagePlus, Receipt, RotateCcw, Scan, Upload, Wallet,
} from "lucide-react";

// ─── 아이콘 string → Component 매핑 ───
export const ICON_MAP: Record<string, LucideIcon> = {
  Crown, UserCheck, Building, LayoutDashboard, Package, Calendar, FileCode,
  Shield, ClipboardCheck, ListChecks, Warehouse, Bell, CheckCircle, FileText,
  Database, Sparkles, Bot, FlaskConical, Tag, Truck, Thermometer, GitBranch,
  AlertCircle, AlertTriangle, GraduationCap, Sliders, Activity, TrendingUp,
  FileWarning, Building2, Settings, ArrowLeftRight, Pill, ChefHat, Syringe,
  Factory, Wheat, SearchCheck, Users,
  BarChart3, BookOpen, ClipboardList, Clock, DollarSign, FolderOpen, Landmark,
  MessageSquare, PackageMinus, PackagePlus, Receipt, RotateCcw, Scan, Upload, Wallet,
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

// 2-a (2026-10-14): 데이터는 shared/navigation/menuRegistry.ts 가 정본. 여기서는 플러그인 타입으로 옮기기만 한다.
export const COMMON_MENU_GROUPS: MenuGroupDef[] = PLUGIN_COMMON_GROUPS.map((g) => ({
  name: g.name,
  order: g.order,
  items: g.items.map((i) => ({
    icon: i.icon, label: i.label, path: i.path, roles: i.roles,
    requireModule: i.requireModule as MenuItemDef["requireModule"], highlight: i.highlight,
  })),
}));

// ─── 슈퍼관리자 전용 메뉴 ───
export const SUPER_ADMIN_MENU_ITEMS: BuiltMenuItem[] = PLUGIN_SUPER_ADMIN_ITEMS.map((i) => ({
  icon: getIcon(i.icon), label: i.label, path: i.path, roles: i.roles,
}));

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
