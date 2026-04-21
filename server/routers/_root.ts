/**
 * _root.ts - appRouter 조립 전용 (비즈니스 로직 없음)
 * v2-rebuild: 도메인별 index.ts에서 일괄 import → 깔끔한 구조
 */

import { router, tenantRequiredProcedure } from "../_core/trpc";
import { z } from "zod";

// ══════════════════════════════════════════
// 도메인별 라우터 import (index.ts barrel)
// ══════════════════════════════════════════

// ── accounting ── (2026-04-19: 도메인 맵으로 분리)
import { accountingRouterMap } from "./_maps/accountingMap";

// ── auth ──
import { authRouter, tenantsPublicRouter, onboardingRouter } from "./auth";

// ── checklist ── (2026-04-19: 도메인 맵으로 분리)
import { checklistRouterMap } from "./_maps/checklistMap";

// ── dashboard ──
import { dashboardRouter, pipelineRouter } from "./dashboard";

// ── haccp ── (2026-04-19: 도메인 맵으로 분리)
import { haccpRouterMap } from "./_maps/haccpMap";

// ── inventory ──
import { inventoryRouter, materialLedgerRouter, stockAlertsRouter } from "./inventory";

// ── master ── (2026-04-19: 도메인 맵으로 분리)
import { masterRouterMap } from "./_maps/masterMap";

// ── production ── (2026-04-19: 도메인 맵으로 분리)
import { productionRouterMap } from "./_maps/productionMap";

// ── superadmin ──
import {
  superadminRouter,
  superadminApprovalRouter,
  superadminDashboardRouter,
} from "./superadmin";

// ── system ── (2026-04-19: 도메인 맵으로 분리)
import { systemRouterMap } from "./_maps/systemMap";

// ── 독립 라우터 (외부 파일) ──
import { aiRouter } from "../routers-ai";
import { opscoreSyncRouter } from "../routers-opscore-sync";
import { systemRouter } from "../_core/systemRouter";

// ══════════════════════════════════════════
// appRouter 조립
// ══════════════════════════════════════════
export const appRouter = router({
  // ── superadmin ──
  superadmin: superadminRouter,
  superadminApproval: superadminApprovalRouter,
  superadminDashboard: superadminDashboardRouter,
  system: systemRouter,

  // ── auth ──
  auth: authRouter,
  tenantsPublic: tenantsPublicRouter,
  onboarding: onboardingRouter,

  // ── production ── (2026-04-19 분해: _maps/productionMap.ts)
  ...productionRouterMap,

  // ── haccp ── (2026-04-19 분해: _maps/haccpMap.ts)
  ...haccpRouterMap,

  // ── inventory ──
  inventory: inventoryRouter,
  materialLedger: materialLedgerRouter,
  stockAlerts: stockAlertsRouter,

  // ── accounting ── (2026-04-19 분해: _maps/accountingMap.ts)
  ...accountingRouterMap,

  // ── dashboard ──
  dashboard: dashboardRouter,
  pipeline: pipelineRouter,

  // ── master ── (2026-04-19 분해: _maps/masterMap.ts)
  ...masterRouterMap,

  // ── checklist ── (2026-04-19 분해: _maps/checklistMap.ts)
  ...checklistRouterMap,

  // ── system ── (2026-04-19 분해: _maps/systemMap.ts)
  ...systemRouterMap,

  // ── ai (LLM 연동) ──
  ai: aiRouter,
  opscoreSync: opscoreSyncRouter,

  // ── company info (stub) ──
  // ★ 2026-04-13: companyInfo 라우터 실제 구현 연결 (stub 제거)
  //   - 거래명세표 PDF 에서 회사명/사업자번호/주소/대표자/전화 자동 사용
  //   - 시스템관리 > 시스템 설정 탭의 회사 정보 폼과 연동
  companyInfo: router({
    get: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getCompanyInfo } = await import("../db/system/companyInfo");
      return await getCompanyInfo(ctx.tenantId);
    }),
    update: tenantRequiredProcedure
      .input(z.object({
        companyName: z.string().optional(),
        companyBusinessNumber: z.string().optional(),
        companyAddress: z.string().optional(),
        companyRepresentative: z.string().optional(),
        companyPhone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateCompanyInfo } = await import("../db/system/companyInfo");
        await updateCompanyInfo(input, ctx.tenantId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
