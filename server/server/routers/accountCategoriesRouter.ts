import { router, protectedProcedure } from "../_core/trpc";
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
   */
  getAll: protectedProcedure.query(async () => {
    return await getAllAccountCategories();
  }),

  /**
   * 대분류별 계정 과목 조회
   */
  getByMajor: protectedProcedure
    .input(z.object({ majorCategory: z.string() }))
    .query(async ({ input }) => {
      return await getAccountCategoriesByMajor(input.majorCategory);
    }),

  /**
   * 계정 과목 상세 조회
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getAccountCategoryById(input.id);
    }),

  /**
   * 계정 과목 등록
   */
  create: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1).max(20),
        name: z.string().min(1).max(100),
        majorCategory: z.string().min(1).max(50),
        minorCategory: z.string().max(50).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await createAccountCategory(input);
    }),

  /**
   * 계정 과목 수정
   */
  update: protectedProcedure
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
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await updateAccountCategory(id, data);
    }),

  /**
   * 계정 과목 삭제 (소프트 삭제)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return await deleteAccountCategory(input.id);
    }),

  /**
   * 대분류 목록 조회 (고유한 major_category 값들)
   */
  getMajorCategories: protectedProcedure.query(async () => {
    const all = await getAllAccountCategories();
    const majors = [...new Set(all.map((c: any) => c.majorCategory))];
    return majors;
  }),

  /**
   * 목록 조회 (accountingAccountCategories.list 호환)
   */
  list: protectedProcedure.query(async () => {
    return await getAllAccountCategories();
  }),
});
