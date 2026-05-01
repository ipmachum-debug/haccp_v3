/**
 * Client Dashboard Engine — Plugin 기반 대시보드 위젯 카탈로그
 *
 * Phase Plugin-7 (Dashboard Engine).
 *
 * 역할:
 *   - Plugin 의 dashboardWidgets 를 단일 source 로 노출
 *   - 크기 / 순서 정렬
 *   - 차트 type 매핑
 *
 * 사용처:
 *   - IntegratedDashboard: 산업별 KPI 위젯 동적 렌더링
 *   - 향후 위젯 시스템 확장 기반
 */

import type {
  IndustryPlugin,
  DashboardWidgetDef,
  WidgetSize,
} from "@shared/domain/IndustryPlugin";

/**
 * Plugin 의 위젯 평면 배열 (order 정렬).
 */
export function getDashboardWidgets(
  plugin: IndustryPlugin | null,
): DashboardWidgetDef[] {
  if (!plugin) return [];
  return [...plugin.dashboardWidgets].sort((a, b) => a.order - b.order);
}

/**
 * 크기 별 그리드 클래스 (Tailwind).
 */
export function getWidgetGridClass(size: WidgetSize): string {
  const map: Record<WidgetSize, string> = {
    small: "col-span-1",
    medium: "col-span-1 md:col-span-2",
    large: "col-span-1 md:col-span-3 lg:col-span-4",
    full: "col-span-full",
  };
  return map[size];
}
