/**
 * Domain Plugin Registry — 산업별 plugin 통합 관리
 *
 * 역할:
 *   - 6개 industry plugin (food / cosmetic / pharma / health-functional /
 *     medical-device / general-manufacturing) 을 단일 진입점으로 노출.
 *   - tRPC 라우터, engine, UI 모두 이 registry 만 참조.
 *
 * ADR-002 준수: registry 는 plugin 만 참조. core-mes / industry 에서 import 안 함.
 */

import type { IndustryKey } from "@shared/domain/types";
import type { IndustryPlugin } from "@shared/domain/IndustryPlugin";

import { foodPlugin } from "./plugins/food";
import { cosmeticPlugin } from "./plugins/cosmetic";
import { pharmaceuticalPlugin } from "./plugins/pharmaceutical";
import { healthFunctionalPlugin } from "./plugins/health-functional";
import { medicalDevicePlugin } from "./plugins/medical-device";
import { generalManufacturingPlugin } from "./plugins/general-manufacturing";

/** 6개 plugin 객체 — 산업 키로 인덱싱 */
const PLUGINS: Record<IndustryKey, IndustryPlugin> = {
  food: foodPlugin,
  cosmetic: cosmeticPlugin,
  pharmaceutical: pharmaceuticalPlugin,
  "health-functional": healthFunctionalPlugin,
  "medical-device": medicalDevicePlugin,
  "general-manufacturing": generalManufacturingPlugin,
};

/**
 * 산업 키로 plugin 조회.
 *
 * @throws 미등록 industry 인 경우 (plugin 신규 추가 누락 시점에 즉시 실패)
 */
export function getPlugin(key: IndustryKey): IndustryPlugin {
  const p = PLUGINS[key];
  if (!p) {
    throw new Error(`[domain.registry] plugin not registered for industry: ${key}`);
  }
  return p;
}

/** 모든 plugin 목록 (관리자 UI / 통계용). */
export function getAllPlugins(): IndustryPlugin[] {
  return Object.values(PLUGINS);
}

/** 6개 산업 키 목록 (반복 처리용). */
export function getAllIndustryKeys(): IndustryKey[] {
  return Object.keys(PLUGINS) as IndustryKey[];
}

/**
 * 산업 카테고리 (서버 IndustryCategory) → IndustryKey 매핑.
 * 다중 매핑 (electronics → null 등) 처리.
 */
export function resolveIndustryKeyByCategory(category: string | null | undefined): IndustryKey | null {
  if (!category) return null;
  const map: Record<string, IndustryKey> = {
    food: "food",
    cosmetics: "cosmetic",
    pharma: "pharmaceutical",
    supplement: "health-functional",
    general: "general-manufacturing",
  };
  return map[category] ?? null;
}

/**
 * 산업 코드 (KSIC) → IndustryKey 매핑.
 * 모든 plugin 의 industryCodes 를 순회하여 매칭.
 */
export function resolveIndustryKeyByCode(industryCode: string | null | undefined): IndustryKey | null {
  if (!industryCode) return null;
  for (const plugin of getAllPlugins()) {
    if (plugin.industryCodes.includes(industryCode)) {
      return plugin.key;
    }
  }
  return null;
}
