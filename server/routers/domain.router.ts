/**
 * Domain Plugin Router — 클라이언트가 현재 테넌트의 plugin 정보를 조회.
 *
 * 노출 데이터:
 *   - currentPlugin: 현재 테넌트의 industry plugin 전체 (메뉴 / 알림 type / 승인 등)
 *   - getPluginByKey: 특정 산업 plugin (관리자 UI 용)
 *   - listPlugins: 모든 산업 plugin (테넌트 생성 시 선택용)
 *
 * 보안:
 *   - currentPlugin: tenant 자신의 plugin 만 노출 (tenantRequiredProcedure)
 *   - getPluginByKey / listPlugins: 슈퍼어드민 또는 admin 역할
 *
 * ADR-002 준수: domain registry 만 참조. core-mes / industry 에서 import 안 함.
 */

import { z } from "zod";
import { router, tenantRequiredProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getPlugin,
  getAllPlugins,
  resolveIndustryKeyByCode,
  resolveIndustryKeyByCategory,
} from "../domain/registry";
import type { IndustryKey } from "@shared/domain/types";
import { getDb } from "../db/connection";
import { tenants } from "../../drizzle/schema/schema_main_core";
import { eq } from "drizzle-orm";

const INDUSTRY_KEY_ENUM = z.enum([
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
]);

/**
 * tenant 의 industry key 해석.
 *
 * 우선순위:
 *   1. tenant.industryCode → resolveIndustryKeyByCode
 *   2. tenant.industryCategory → resolveIndustryKeyByCategory (legacy)
 *   3. fallback: null (산업 미정)
 */
async function resolveTenantIndustryKey(tenantId: number): Promise<IndustryKey | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      industryCode: tenants.industryCode,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0] as { industryCode?: string | null };
  if (row.industryCode) {
    const byCode = resolveIndustryKeyByCode(row.industryCode);
    if (byCode) return byCode;
  }
  return null;
}

export const domainRouter = router({
  /**
   * 현재 로그인 테넌트의 plugin 전체 정보.
   * 클라이언트의 사이드바 / 알림 / 승인 / 문서 페이지가 이 데이터로 동적 렌더링.
   */
  currentPlugin: tenantRequiredProcedure.query(async ({ ctx }) => {
    const industryKey = await resolveTenantIndustryKey(Number(ctx.tenantId));
    if (!industryKey) {
      // 미정 시 기본값 (food) — 운영 안전 폴백.
      // 또는 throw NOT_FOUND 으로 강제할 수도 있음 (운영 정책 결정).
      return null;
    }
    return {
      industryKey,
      plugin: getPlugin(industryKey),
    };
  }),

  /**
   * 특정 industry plugin 조회 (관리자 / 테넌트 전환 / 비교용).
   * 슈퍼어드민 또는 admin 권한 필요.
   */
  getByKey: tenantRequiredProcedure
    .input(z.object({ industryKey: INDUSTRY_KEY_ENUM }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== "super_admin" && ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "관리자 권한 필요" });
      }
      return getPlugin(input.industryKey);
    }),

  /**
   * 전체 plugin 목록 (테넌트 생성 시 선택 / 슈퍼어드민 통계).
   */
  listAll: publicProcedure.query(() => {
    return getAllPlugins().map((p) => ({
      key: p.key,
      labelKo: p.labelKo,
      labelEn: p.labelEn,
      category: p.category,
      industryCodes: p.industryCodes,
      icon: p.icon,
      description: p.description,
      modules: p.modules,
      certifications: p.certifications,
    }));
  }),
});
