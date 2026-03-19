import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { verificationRecords } from "../../../drizzle/schema/ccpMonitoring";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getEffectiveTenantId } from "./_helpers";

export const verificationRouter = router({
  // 검증 기록 관리
  createVerificationRecord: tenantRequiredProcedure
    .input(z.object({
      verificationDate: z.date(),
      verificationType: z.enum(['최초', '일상', '정기', '특별']),
      findings: z.string().optional(),
      nonconformities: z.string().optional(),
      correctiveActions: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const [result] = await db.insert(verificationRecords).values({
        ...input,
        tenantId,
        verifierId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  getVerificationRecords: tenantRequiredProcedure
    .input(z.object({
      verificationType: z.enum(['최초', '일상', '정기', '특별']).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      let conditions: any[] = [eq(verificationRecords.tenantId, tenantId)];

      if (input.verificationType) {
        conditions.push(eq(verificationRecords.verificationType, input.verificationType));
      }
      if (input.startDate) {
        conditions.push(gte(verificationRecords.verificationDate, input.startDate));
      }
      if (input.endDate) {
        conditions.push(lte(verificationRecords.verificationDate, input.endDate));
      }

      return await db
        .select()
        .from(verificationRecords)
        .where(and(...conditions))
        .orderBy(desc(verificationRecords.verificationDate))
        .limit(50);
    }),

  updateVerificationRecord: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      approvedBy: z.number().optional(),
      findings: z.string().optional(),
      nonconformities: z.string().optional(),
      correctiveActions: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const { id, ...data } = input;
      await db.update(verificationRecords).set(data).where(and(eq(verificationRecords.id, id), eq(verificationRecords.tenantId, tenantId)));
      return { success: true };
    }),
});
