import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { employees } from "../../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export const employeeRouter = router({
  /**
   * 전체 직원 목록 조회 (테넌트 격리)
   */
  list: tenantRequiredProcedure
    .input(
      z.object({
        status: z.enum(["active", "resigned", "all"]).optional().default("all"),
      })
    )
    .query(async ({ input, ctx }) => {
      const { status } = input;

      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const conditions = [eq(employees.tenantId, ctx.tenantId)];
      if (status !== "all") {
        conditions.push(eq(employees.status, status));
      }

      const result = await db.select().from(employees)
        .where(and(...conditions))
        .orderBy(desc(employees.createdAt));
      return result;
    }),

  /**
   * 직원 상세 조회 (테넌트 격리)
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const [employee] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.id, input.id), eq(employees.tenantId, ctx.tenantId)));
      
      if (!employee) {
        throw new Error("직원을 찾을 수 없습니다.");
      }

      return employee;
    }),

  /**
   * 신규 직원 등록 (tenantId 자동 주입)
   */
  create: tenantRequiredProcedure
    .input(
      z.object({
        name: z.string().min(1, "이름은 필수입니다"),
        department: z.string().optional(),
        position: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email("올바른 이메일 형식이 아닙니다").optional().or(z.literal("")),
        hireDate: z.date(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const [result] = await db.insert(employees).values({
        ...input,
        tenantId: ctx.tenantId,
        createdBy: ctx.user.id,
      });

      return { success: true, id: result.insertId };
    }),

  /**
   * 직원 정보 수정 (테넌트 격리)
   */
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1, "이름은 필수입니다").optional(),
        department: z.string().optional(),
        position: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email("올바른 이메일 형식이 아닙니다").optional().or(z.literal("")),
        hireDate: z.date().optional(),
        resignationDate: z.date().optional().nullable(),
        status: z.enum(["active", "resigned"]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      await db
        .update(employees)
        .set(data)
        .where(and(eq(employees.id, id), eq(employees.tenantId, ctx.tenantId)));

      return { success: true };
    }),

  /**
   * 직원 삭제 (테넌트 격리)
   */
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      await db.delete(employees).where(
        and(eq(employees.id, input.id), eq(employees.tenantId, ctx.tenantId))
      );
      return { success: true };
    }),

  /**
   * 직원 통계 (테넌트 격리)
   */
  getStats: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

    const [stats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        active: sql<number>`SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)`,
        resigned: sql<number>`SUM(CASE WHEN status = 'resigned' THEN 1 ELSE 0 END)`,
      })
      .from(employees)
      .where(eq(employees.tenantId, ctx.tenantId));

    return stats;
  }),
});
