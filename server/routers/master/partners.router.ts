// partners 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const partnersRouter = router({
    // 거래처 생성
    create: tenantRequiredProcedure
      .input(
        z.object({
          partnerType: z.enum(["supplier", "customer", "subcontractor"]),
          bizNo: z.string().optional(),
          companyName: z.string(),
          ceoName: z.string().optional(),
          bizType: z.string().optional(),
          bizItem: z.string().optional(),
          address: z.string().optional(),
          phone: z.string().optional(),
          fax: z.string().optional(),
          email: z.string().optional(),
          bankName: z.string().optional(),
          bankAccount: z.string().optional(),
          // Phase B (2026-04-14): 거래처 고도화
          grade: z.string().optional(), // VIP/일반/주의 등
          paymentTermsDays: z.number().int().optional(), // 지급 조건 (일)
          creditLimit: z.number().nonnegative().optional(), // 여신 한도
          defaultDiscountRate: z.number().min(0).max(100).optional(), // 기본 할인율
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createPartner } = await import("../../partners");
        const { creditLimit, defaultDiscountRate, ...rest } = input;
        const id = await createPartner({
          ...rest,
          tenantId: ctx.tenantId,
          creditLimit: creditLimit !== undefined ? creditLimit.toString() : undefined,
          defaultDiscountRate: defaultDiscountRate !== undefined ? defaultDiscountRate.toString() : undefined,
        } as any);
        return { id };
      }),

    // 거래처 목록 조회 (tenantId 필터링 추가)
    list: tenantRequiredProcedure
      .input(
        z
          .object({
            partnerType: z.enum(["supplier", "customer", "subcontractor"]).optional(),
            isActive: z.number().optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const { getAllPartners } = await import("../../partners");
        return await getAllPartners(input, ctx.tenantId);
      }),

    // 거래처 상세 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getPartnerById } = await import("../../partners");
        return await getPartnerById(input.id, ctx.tenantId);
      }),

    // 거래처 수정
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          companyName: z.string().optional(),
          ceoName: z.string().optional(),
          bizType: z.string().optional(),
          bizItem: z.string().optional(),
          address: z.string().optional(),
          contactPerson: z.string().optional(),
          phone: z.string().optional(),
          fax: z.string().optional(),
          email: z.string().optional(),
          bankName: z.string().optional(),
          bankAccount: z.string().optional(),
          // Phase B (2026-04-14): 거래처 고도화
          grade: z.string().optional(),
          paymentTermsDays: z.number().int().optional(),
          creditLimit: z.number().nonnegative().optional(),
          defaultDiscountRate: z.number().min(0).max(100).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updatePartner } = await import("../../partners");
        const { id, creditLimit, defaultDiscountRate, ...rest } = input;
        const data: any = { ...rest };
        if (creditLimit !== undefined) data.creditLimit = creditLimit.toString();
        if (defaultDiscountRate !== undefined) data.defaultDiscountRate = defaultDiscountRate.toString();
        await updatePartner(id, data, ctx.tenantId);
        return { success: true };
      }),

    // 거래처 삭제
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deletePartner } = await import("../../partners");
        await deletePartner(input.id);
        return { success: true };
      }),

    // 사업자번호로 검색
    getByBizNo: tenantRequiredProcedure
      .input(z.object({ bizNo: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getPartnerByBizNo } = await import("../../partners");
        return await getPartnerByBizNo(input.bizNo);
      }),

    // 거래처 검색 (자동완성용)
    search: tenantRequiredProcedure
      .input(z.object({
        search: z.string().optional(),
        partnerType: z.enum(["supplier", "customer", "subcontractor"]).optional(),
        limit: z.number().default(20),
      }))
      .query(async ({ input, ctx }) => {
        const { getRawConnection } = await import("../../db");
        const tenantId = ctx.tenantId;
        const conn = await getRawConnection();
        let where = "tenant_id = ? AND is_active = 1";
        const params: any[] = [tenantId];
        if (input.partnerType) {
          where += " AND partner_type = ?";
          params.push(input.partnerType);
        }
        if (input.search) {
          where += " AND (company_name LIKE ? OR biz_no LIKE ? OR contact_person LIKE ?)";
          const s = `%${input.search}%`;
          params.push(s, s, s);
        }
        const limitVal = Math.max(1, Math.min(input.limit, 50));
        const [rows] = await conn.query(
          `SELECT id, company_name, partner_type, biz_no, contact_person, phone
           FROM partners WHERE ${where} ORDER BY company_name LIMIT ${limitVal}`,
          params,
        );
        return rows as any[];
      }),
});
