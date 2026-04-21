/**
 * 은행 거래 자동 매칭 규칙 라우터 (P4-1 강화)
 * 
 * matching_rules 스키마:
 *   rule_type: keyword | amount | pattern | combined
 *   conditions: JSON text - { keyword?, pattern?, amountMin?, amountMax?, transactionType? }
 *   actions: JSON text - { accountingAccountId?, partnerId?, memo? }
 * 
 * 매칭 엔진: bankTransactionBulk.ts → findMatchingRule() + runAutoMatch
 */
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";

export const matchingRulesRouter = router({
    // 매칭 규칙 목록 조회
    list: tenantRequiredProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const { matchingRules } = await import("../../../drizzle/schema/schema_main");
      const rules = await db.select().from(matchingRules)
        .where(eq(matchingRules.tenantId, ctx.tenantId))
        .orderBy(matchingRules.priority);

      // JSON 필드를 파싱하여 반환
      return rules.map((rule: any) => {
        let conditions: any = {};
        let actions: any = {};
        try { conditions = typeof rule.conditions === "string" ? JSON.parse(rule.conditions) : (rule.conditions || {}); } catch { conditions = {}; }
        try { actions = typeof rule.actions === "string" ? JSON.parse(rule.actions) : (rule.actions || {}); } catch { actions = {}; }
        return {
          ...rule,
          conditions,
          actions,
          // 프론트엔드 호환 필드
          keyword: conditions.keyword || null,
          targetAccountId: actions.accountingAccountId || null,
          targetPartnerId: actions.partnerId || null,
          name: conditions.name || `규칙 #${rule.id}`,
        };
      });
    }),

    // 매칭 규칙 생성
    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1, "규칙 이름은 필수입니다"),
          ruleType: z.enum(["keyword", "amount", "pattern", "combined"]),
          // 조건 필드 (conditions JSON으로 변환)
          keyword: z.string().optional(),
          pattern: z.string().optional(),
          amountMin: z.number().optional(),
          amountMax: z.number().optional(),
          transactionType: z.enum(["deposit", "withdrawal"]).optional(),
          // 액션 필드 (actions JSON으로 변환)
          targetAccountId: z.number().optional(),
          targetPartnerId: z.number().optional(),
          actionMemo: z.string().optional(),
          // 메타
          priority: z.number().min(0).max(1000).default(500),
          isActive: z.boolean().default(true)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const { matchingRules } = await import("../../../drizzle/schema/schema_main");

        // conditions JSON 구성
        const conditions: Record<string, any> = { name: input.name };
        if (input.keyword) conditions.keyword = input.keyword;
        if (input.pattern) conditions.pattern = input.pattern;
        if (input.amountMin !== undefined) conditions.amountMin = input.amountMin;
        if (input.amountMax !== undefined) conditions.amountMax = input.amountMax;
        if (input.transactionType) conditions.transactionType = input.transactionType;

        // actions JSON 구성
        const actions: Record<string, any> = {};
        if (input.targetAccountId) actions.accountingAccountId = input.targetAccountId;
        if (input.targetPartnerId) actions.partnerId = input.targetPartnerId;
        if (input.actionMemo) actions.memo = input.actionMemo;

        const [newRule] = await db.insert(matchingRules).values({
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          ruleType: input.ruleType,
          priority: input.priority,
          conditions: JSON.stringify(conditions),
          actions: JSON.stringify(actions),
          isActive: input.isActive ? 1 : 0,
        }).$returningId();

        return { id: newRule.id, success: true };
      }),

    // 매칭 규칙 수정
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          ruleType: z.enum(["keyword", "amount", "pattern", "combined"]).optional(),
          keyword: z.string().optional(),
          pattern: z.string().optional(),
          amountMin: z.number().optional(),
          amountMax: z.number().optional(),
          transactionType: z.enum(["deposit", "withdrawal"]).optional(),
          targetAccountId: z.number().optional(),
          targetPartnerId: z.number().optional(),
          actionMemo: z.string().optional(),
          priority: z.number().min(0).max(1000).optional(),
          isActive: z.boolean().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const { matchingRules } = await import("../../../drizzle/schema/schema_main");
        const { id, ...data } = input;

        // 기존 규칙 조회
        const existing = await db.select().from(matchingRules).where(
          and(eq(matchingRules.id, id) as any, eq(matchingRules.tenantId, ctx.tenantId as any) )
        ).limit(1);
        if (!existing.length) {
          throw new Error("규칙을 찾을 수 없습니다.");
        }

        const rule = existing[0] as any;
        let oldConditions: any = {};
        let oldActions: any = {};
        try { oldConditions = typeof rule.conditions === "string" ? JSON.parse(rule.conditions) : (rule.conditions || {}); } catch { oldConditions = {}; }
        try { oldActions = typeof rule.actions === "string" ? JSON.parse(rule.actions) : (rule.actions || {}); } catch { oldActions = {}; }

        // 업데이트 데이터 구성
        const dataToUpdate: Record<string, any> = {};

        if (data.ruleType !== undefined) dataToUpdate.ruleType = data.ruleType;
        if (data.priority !== undefined) dataToUpdate.priority = data.priority;
        if (data.isActive !== undefined) dataToUpdate.isActive = data.isActive ? 1 : 0;

        // conditions 업데이트
        const needsConditionsUpdate = data.name !== undefined || data.keyword !== undefined || data.pattern !== undefined
          || data.amountMin !== undefined || data.amountMax !== undefined || data.transactionType !== undefined;
        if (needsConditionsUpdate) {
          const newConditions = { ...oldConditions };
          if (data.name !== undefined) newConditions.name = data.name;
          if (data.keyword !== undefined) newConditions.keyword = data.keyword;
          if (data.pattern !== undefined) newConditions.pattern = data.pattern;
          if (data.amountMin !== undefined) newConditions.amountMin = data.amountMin;
          if (data.amountMax !== undefined) newConditions.amountMax = data.amountMax;
          if (data.transactionType !== undefined) newConditions.transactionType = data.transactionType;
          dataToUpdate.conditions = JSON.stringify(newConditions);
        }

        // actions 업데이트
        const needsActionsUpdate = data.targetAccountId !== undefined || data.targetPartnerId !== undefined || data.actionMemo !== undefined;
        if (needsActionsUpdate) {
          const newActions = { ...oldActions };
          if (data.targetAccountId !== undefined) newActions.accountingAccountId = data.targetAccountId;
          if (data.targetPartnerId !== undefined) newActions.partnerId = data.targetPartnerId;
          if (data.actionMemo !== undefined) newActions.memo = data.actionMemo;
          dataToUpdate.actions = JSON.stringify(newActions);
        }

        if (Object.keys(dataToUpdate).length > 0) {
          await db.update(matchingRules).set(dataToUpdate).where(
            and(eq(matchingRules.id, id) as any, eq(matchingRules.tenantId, ctx.tenantId as any) )
          );
        }

        return { success: true };
      }),

    // 매칭 규칙 삭제
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const { matchingRules } = await import("../../../drizzle/schema/schema_main");
        await db.delete(matchingRules).where(
          and(eq(matchingRules.id, input.id) as any, eq(matchingRules.tenantId, ctx.tenantId as any) )
        );
        return { success: true };
      }),

    // 매칭 통계 조회
    stats: tenantRequiredProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const { matchingRules, bankTransactions } = await import("../../../drizzle/schema/schema_main");
      const { sql } = await import("drizzle-orm");

      const rules = await db.select().from(matchingRules)
        .where(eq(matchingRules.tenantId, ctx.tenantId));

      const [unmatchedResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(bankTransactions)
        .where(and(
          eq(bankTransactions.tenantId, ctx.tenantId),
          eq(bankTransactions.matchingStatus, "unmatched")
        ));

      const [matchedResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(bankTransactions)
        .where(and(
          eq(bankTransactions.tenantId, ctx.tenantId),
          eq(bankTransactions.matchingStatus, "matched")
        ));

      return {
        totalRules: rules.length,
        activeRules: rules.filter((r: any) => r.isActive === 1).length,
        unmatchedTransactions: Number(unmatchedResult?.count || 0),
        matchedTransactions: Number(matchedResult?.count || 0),
      };
    }),
});
