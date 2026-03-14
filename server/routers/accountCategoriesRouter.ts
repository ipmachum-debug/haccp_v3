import { router, tenantRequiredProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getAllAccountCategories,
  getAccountCategoriesByMajor,
  createAccountCategory,
  updateAccountCategory,
  deleteAccountCategory,
  getAccountCategoryById,
} from "../db/accountCategories";

export const accountCategoriesRouter = router({
  /**
   * 전체 계정 과목(카테고리) 목록 조회
   * P5: tenantId 전달 추가
   */
  getAll: tenantRequiredProcedure.query(async ({ ctx }) => {
    try {
      const result = await getAllAccountCategories(ctx.tenantId);
      return result;
    } catch (error: any) {
      console.error('[accountCategories.getAll] Error:', error.message, error.stack);
      throw error;
    }
  }),

  /**
   * 대분류별 계정 과목 조회
   */
  getByMajor: tenantRequiredProcedure
    .input(z.object({ majorCategory: z.string() }))
    .query(async ({ input, ctx }) => {
      return await getAccountCategoriesByMajor(input.majorCategory, ctx.tenantId);
    }),

  /**
   * 계정 과목 상세 조회
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return await getAccountCategoryById(input.id, ctx.tenantId);
    }),

  /**
   * 계정 과목 등록
   */
  create: tenantRequiredProcedure
    .input(
      z.object({
        code: z.string().min(1).max(20),
        name: z.string().min(1).max(100),
        majorCategory: z.string().min(1).max(50),
        minorCategory: z.string().max(50).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await createAccountCategory({ ...input, tenantId: ctx.tenantId });
    }),

  /**
   * 계정 과목 수정
   */
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        code: z.string().min(1).max(20).optional(),
        name: z.string().min(1).max(100).optional(),
        majorCategory: z.string().min(1).max(50).optional(),
        minorCategory: z.string().max(50).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      return await updateAccountCategory(id, data, ctx.tenantId);
    }),

  /**
   * 계정 과목 삭제 (소프트 삭제)
   */
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      return await deleteAccountCategory(input.id, ctx.tenantId);
    }),

  /**
   * 대분류 목록 조회 (고유한 major_category 값들)
   */
  getMajorCategories: tenantRequiredProcedure.query(async ({ ctx }) => {
    const all = await getAllAccountCategories(ctx.tenantId);
    const majors = Array.from(new Set(all.map((c: any) => c.majorCategory)));
    return majors;
  }),

  /**
   * 목록 조회 (accountingAccountCategories.list 호환)
   */
  list: tenantRequiredProcedure.query(async ({ ctx }) => {
    try {
      const result = await getAllAccountCategories(ctx.tenantId);
      return result;
    } catch (error: any) {
      console.error('[accountCategories.list] Error:', error.message, error.stack);
      throw error;
    }
  }),
});
