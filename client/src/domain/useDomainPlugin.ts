/**
 * useDomainPlugin — 현재 테넌트의 industry plugin 데이터 hook
 *
 * Phase Plugin-1 (근본 도메인 분리 아키텍처).
 *
 * 사용처:
 *   - DashboardLayout: 사이드바 메뉴 동적 생성
 *   - NotificationCenter: 알림 type 필터 동적 생성
 *   - ApprovalManagement: 승인 workflow / entity type 동적 생성
 *   - DocumentApprovalSettingsPage: 결재자 양식 동적 생성
 *   - 대시보드 위젯: 산업별 KPI 동적 렌더링
 *
 * 데이터 소스:
 *   trpc.domain.currentPlugin → server/domain/registry.ts → 6 plugin 중 하나
 *
 * 사용:
 *   const { plugin, isLoading } = useDomainPlugin();
 *   if (plugin) {
 *     plugin.menu.groups.forEach(g => ...);
 *     plugin.notifications.types.forEach(t => ...);
 *   }
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { IndustryPlugin } from "@shared/domain/IndustryPlugin";
import type { IndustryKey } from "@shared/domain/types";

export interface UseDomainPluginResult {
  /** 현재 테넌트의 plugin (null = 미정 / 슈퍼어드민 등) */
  plugin: IndustryPlugin | null;
  /** 산업 키 */
  industryKey: IndustryKey | null;
  /** 로딩 중 */
  isLoading: boolean;
  /** 오류 */
  error: Error | null;
}

export function useDomainPlugin(): UseDomainPluginResult {
  const { data, isLoading, error } = trpc.domain.currentPlugin.useQuery(
    undefined,
    {
      staleTime: 5 * 60 * 1000, // 5분 캐싱 (plugin 은 정적)
      retry: 1,
    },
  );

  return useMemo(
    () => ({
      plugin: (data?.plugin as IndustryPlugin | undefined) ?? null,
      industryKey: (data?.industryKey as IndustryKey | undefined) ?? null,
      isLoading,
      error: (error as unknown as Error | null) ?? null,
    }),
    [data, isLoading, error],
  );
}

/**
 * 특정 산업의 plugin 조회 (관리자 / 비교용).
 */
export function useDomainPluginByKey(industryKey: IndustryKey | null) {
  return trpc.domain.getByKey.useQuery(
    { industryKey: industryKey! },
    {
      enabled: !!industryKey,
      staleTime: 5 * 60 * 1000,
    },
  );
}

/**
 * 모든 산업 plugin 목록 (관리자 UI / 테넌트 생성).
 */
export function useAllDomainPlugins() {
  return trpc.domain.listAll.useQuery(undefined, {
    staleTime: 30 * 60 * 1000, // 30분 (정적 데이터)
  });
}
