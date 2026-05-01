/**
 * Client Notification Engine — Plugin 기반 알림 type 카탈로그
 *
 * Phase Plugin-5 (Notification Engine).
 *
 * 역할:
 *   - Plugin 의 notifications.types 를 단일 source 로 노출
 *   - 카테고리 별 그룹화 (CCP / Stability / Release / 검교정 등)
 *   - 우선순위 별 색상 매핑
 *
 * 사용처:
 *   - NotificationCenter: 필터 type 동적 생성
 *   - NotificationHistory: type 라벨 변환
 *   - 알림 자동 발행: rule trigger
 *
 * 마이그레이션:
 *   기존 NotificationCenter 의 하드코딩된 알림 type 필터
 *   (CCP점검, CCP누락, 7일전, 3일전, 기한초과, 재고부족) 가
 *   각 plugin.notifications.types 로 흡수.
 */

import type {
  IndustryPlugin,
  NotificationTypeDef,
  NotificationPriority,
} from "@shared/domain/IndustryPlugin";

export interface NotificationCategory {
  category: string;
  types: NotificationTypeDef[];
}

/**
 * Plugin 의 알림 type 평면 배열.
 */
export function getNotificationTypes(
  plugin: IndustryPlugin | null,
): NotificationTypeDef[] {
  if (!plugin) return [];
  return [...plugin.notifications.types];
}

/**
 * 카테고리 별 그룹화.
 */
export function getNotificationTypesByCategory(
  plugin: IndustryPlugin | null,
): NotificationCategory[] {
  const types = getNotificationTypes(plugin);
  const map = new Map<string, NotificationTypeDef[]>();
  for (const t of types) {
    const arr = map.get(t.category) ?? [];
    arr.push(t);
    map.set(t.category, arr);
  }
  return Array.from(map.entries()).map(([category, types]) => ({
    category,
    types,
  }));
}

/**
 * 우선순위별 색상 (Tailwind class).
 */
export function getPriorityColor(priority: NotificationPriority): string {
  const map: Record<NotificationPriority, string> = {
    low: "bg-gray-100 text-gray-700",
    medium: "bg-blue-100 text-blue-700",
    high: "bg-amber-100 text-amber-700",
    critical: "bg-red-100 text-red-700",
  };
  return map[priority];
}

/**
 * 알림 type code → 표시 라벨 변환.
 *   plugin 미정 시 raw code 그대로 반환.
 */
export function getNotificationTypeLabel(
  plugin: IndustryPlugin | null,
  code: string,
): string {
  if (!plugin) return code;
  const t = plugin.notifications.types.find((t) => t.code === code);
  return t?.label ?? code;
}
