/**
 * 업종코드 관리 라우터
 * ────────────────────────────────────────────────────────────
 * - 업종코드 목록 조회 (회원가입/설정 시 업종 선택)
 * - 현재 테넌트 업종 조회/변경
 * - 업종별 활성 모듈/기능 조회
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { RowDataPacket } from "mysql2";
import {
  router,
  publicProcedure,
  tenantRequiredProcedure,
  adminProcedure,
} from "../../_core/trpc";
import { getRawConnection } from "../../db";
import {
  resolveIndustryProfile,
  getActiveModules,
  getActiveFeatures,
  getIndustryCategories,
  INDUSTRY_PROFILES,
} from "../../lib/industry/industryConfig";

/** listCodes 응답 시 공통으로 반환할 경량 메타 shape. filter 유무와 무관하게 일정. */
function toIndustryMeta(p: (typeof INDUSTRY_PROFILES)[keyof typeof INDUSTRY_PROFILES]) {
  return {
    code: p.code,
    nameKo: p.nameKo,
    nameEn: p.nameEn,
    category: p.category,
    icon: p.icon,
    description: p.description,
  };
}

/** INDUSTRY_PROFILES 에 실제 등록된 코드만 허용 */
function assertValidIndustryCode(code: string) {
  if (!INDUSTRY_PROFILES[code as keyof typeof INDUSTRY_PROFILES]) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `알 수 없는 업종코드: ${code}`,
    });
  }
}

export const industryRouter = router({
  /**
   * 업종 카테고리 목록 (공개 — 회원가입 시 사용)
   */
  getCategories: publicProcedure.query(() => {
    return getIndustryCategories();
  }),

  /**
   * 전체 업종코드 목록 (공개)
   * — filter 유무와 무관하게 동일 shape 반환 (경량 메타).
   *   상세 프로필이 필요하면 `getProfile` 을 별도 호출.
   */
  listCodes: publicProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      const entries = Object.values(INDUSTRY_PROFILES);
      const filtered = input?.category
        ? entries.filter((p) => p.category === input.category)
        : entries;
      return filtered.map(toIndustryMeta);
    }),

  /**
   * 특정 업종코드의 프로필 상세 조회
   */
  getProfile: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => {
      return resolveIndustryProfile(input.code);
    }),

  /**
   * 현재 테넌트의 업종 정보 조회
   */
  getCurrentIndustry: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = await getRawConnection();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT industry_code, industry_category FROM tenants WHERE id = ? LIMIT 1`,
      [ctx.tenantId]
    );

    const row = rows?.[0];
    const industryCode = (row?.industry_code as string | null) || null;
    const profile = resolveIndustryProfile(industryCode);

    return {
      industryCode,
      industryCategory: (row?.industry_category as string | null) || profile.category,
      profile,
      activeModules: getActiveModules(industryCode),
      activeFeatures: getActiveFeatures(industryCode),
    };
  }),

  /**
   * 테넌트 업종코드 변경 (관리자 전용)
   * — 업종 변경은 tenant 전체 구성원의 메뉴/모듈 가시성을 바꾸므로
   *   반드시 admin 권한 필요 (일반 멤버는 권한 없음).
   * — 알 수 없는 코드는 DB 에 저장하지 않고 400 에러.
   */
  updateIndustry: adminProcedure
    .input(
      z.object({
        industryCode: z.string().min(2).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertValidIndustryCode(input.industryCode);
      const profile = resolveIndustryProfile(input.industryCode);
      const pool = await getRawConnection();

      await pool.execute(
        `UPDATE tenants SET industry_code = ?, industry_category = ?, updated_at = NOW() WHERE id = ?`,
        [input.industryCode, profile.category, ctx.tenantId]
      );

      return {
        success: true,
        industryCode: input.industryCode,
        category: profile.category,
        profile,
      };
    }),

  /**
   * 업종코드로 활성 모듈 조회
   */
  getModules: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => {
      const profile = resolveIndustryProfile(input.code);
      return {
        modules: profile.modules,
        activeModules: getActiveModules(input.code),
      };
    }),

  /**
   * 업종코드로 필수 인증 조회
   */
  getCertifications: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => {
      const profile = resolveIndustryProfile(input.code);
      return profile.certifications;
    }),

  /**
   * 업종코드로 UI 라벨 조회
   */
  getLabels: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => {
      const profile = resolveIndustryProfile(input.code);
      return profile.labels;
    }),
});
