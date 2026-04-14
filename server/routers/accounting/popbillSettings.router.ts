/**
 * 팝빌 설정 (Popbill Settings) 라우터 — Phase C (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 테넌트별 팝빌 연동 설정 + 회원 등록/조회 + 포인트 조회
 * ═══════════════════════════════════════════════════════════════
 */
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { popbillSettings } from "../../../drizzle/schema/schema_tax_invoices";
import { eq } from "drizzle-orm";

export const popbillSettingsRouter = router({
  /**
   * 현재 테넌트 설정 조회
   */
  get: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const [row] = await db
      .select()
      .from(popbillSettings)
      .where(eq(popbillSettings.tenantId, ctx.tenantId))
      .limit(1);

    // 환경변수 모드 확인
    const { isPopbillStubMode } = await import("../../lib/popbill/popbillAdapter");

    return {
      settings: row ?? null,
      mode: isPopbillStubMode() ? "stub" : "live",
    };
  }),

  /**
   * 설정 저장 (upsert)
   */
  upsert: adminProcedure
    .input(
      z.object({
        corpNum: z.string().min(10).max(13),
        userId: z.string().optional(),
        isEnabled: z.boolean().default(false),
        isTestMode: z.boolean().default(true),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const [existing] = await db
        .select()
        .from(popbillSettings)
        .where(eq(popbillSettings.tenantId, ctx.tenantId))
        .limit(1);

      const payload: any = {
        corpNum: input.corpNum.replace(/-/g, ""),
        userId: input.userId ?? null,
        isEnabled: input.isEnabled ? 1 : 0,
        isTestMode: input.isTestMode ? 1 : 0,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        notes: input.notes ?? null,
      };

      if (existing) {
        await db
          .update(popbillSettings)
          .set(payload)
          .where(eq(popbillSettings.tenantId, ctx.tenantId));
      } else {
        await db.insert(popbillSettings).values({
          tenantId: ctx.tenantId,
          ...payload,
        } as any);
      }

      return { message: "팝빌 설정이 저장되었습니다." };
    }),

  /**
   * 회원 등록 (RegistContact)
   * - 이미 등록된 사업자번호면 isMember=1 로 표시만
   */
  registMember: adminProcedure
    .input(
      z.object({
        corpName: z.string(),
        ceoName: z.string().optional(),
        addr: z.string().optional(),
        bizType: z.string().optional(),
        bizClass: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const [settings] = await db
        .select()
        .from(popbillSettings)
        .where(eq(popbillSettings.tenantId, ctx.tenantId))
        .limit(1);
      if (!settings) {
        throw new Error("먼저 팝빌 설정을 저장하세요.");
      }

      const { registMember, checkIsMember } = await import("../../lib/popbill/popbillAdapter");

      // 이미 회원인지 먼저 확인
      const isAlreadyMember = await checkIsMember(settings.corpNum);
      if (isAlreadyMember) {
        await db
          .update(popbillSettings)
          .set({ isMember: 1, lastSyncAt: new Date() })
          .where(eq(popbillSettings.tenantId, ctx.tenantId));
        return { message: "이미 팝빌 회원으로 등록되어 있습니다.", alreadyMember: true };
      }

      // 신규 등록
      const result = await registMember({
        corpNum: settings.corpNum,
        corpName: input.corpName,
        ceoName: input.ceoName,
        addr: input.addr,
        bizType: input.bizType,
        bizClass: input.bizClass,
        contactName: settings.contactName ?? undefined,
        contactEmail: settings.contactEmail ?? undefined,
        contactTel: settings.contactPhone ?? undefined,
      });

      if (result.success) {
        await db
          .update(popbillSettings)
          .set({ isMember: 1, lastSyncAt: new Date() })
          .where(eq(popbillSettings.tenantId, ctx.tenantId));
      }

      return { message: result.message ?? "팝빌 회원 등록", success: result.success };
    }),

  /**
   * 잔여 포인트 조회 + 캐시 업데이트
   */
  refreshBalance: adminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    const [settings] = await db
      .select()
      .from(popbillSettings)
      .where(eq(popbillSettings.tenantId, ctx.tenantId))
      .limit(1);
    if (!settings) throw new Error("팝빌 설정이 없습니다.");

    const { getBalance } = await import("../../lib/popbill/popbillAdapter");
    const balance = await getBalance(settings.corpNum);

    await db
      .update(popbillSettings)
      .set({
        balanceCached: balance.remainPoint.toFixed(2),
        lastBalanceCheck: new Date(),
      })
      .where(eq(popbillSettings.tenantId, ctx.tenantId));

    return { remainPoint: balance.remainPoint, unPaidAmount: balance.unPaidAmount ?? 0 };
  }),
});
