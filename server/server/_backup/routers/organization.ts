import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as organizationHelper from "../helpers/organization";

/**
 * 조직도 및 결재자 설정 관리 Router
 */
export const organizationRouter = router({
  // ============================================================================
  // 부서 관리
  // ============================================================================
  departments: router({
    list: protectedProcedure.query(async () => {
      return await organizationHelper.listDepartments();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return await organizationHelper.getDepartmentById(input.id);
      }),

    create: protectedProcedure
      .input(
        z.object({
          departmentName: z.string(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await organizationHelper.createDepartment(input);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          departmentName: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await organizationHelper.updateDepartment(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await organizationHelper.deleteDepartment(input.id);
        return { success: true };
      }),
  }),

  // ============================================================================
  // 직급 관리
  // ============================================================================
  positions: router({
    list: protectedProcedure.query(async () => {
      return await organizationHelper.listPositions();
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return await organizationHelper.getPositionById(input.id);
      }),

    create: protectedProcedure
      .input(
        z.object({
          positionName: z.string(),
          level: z.number().optional(),
          approvalRole: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await organizationHelper.createPosition(input);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          positionName: z.string().optional(),
          level: z.number().optional(),
          approvalRole: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await organizationHelper.updatePosition(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await organizationHelper.deletePosition(input.id);
        return { success: true };
      }),
  }),

  // ============================================================================
  // 구성원 관리
  // ============================================================================
  employees: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await organizationHelper.listEmployees(ctx.tenantId);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return await organizationHelper.getEmployeeById(input.id);
      }),

    create: protectedProcedure
      .input(
        z.object({
          userId: z.number().optional(),
          employeeCode: z.string(),
          name: z.string(),
          departmentId: z.number().optional(),
          positionId: z.number().optional(),
          hireDate: z.date().optional(),
          isActive: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await organizationHelper.createEmployee(input);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          userId: z.number().optional(),
          employeeCode: z.string().optional(),
          name: z.string().optional(),
          departmentId: z.number().optional(),
          positionId: z.number().optional(),
          hireDate: z.date().optional(),
          isActive: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await organizationHelper.updateEmployee(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await organizationHelper.deleteEmployee(input.id);
        return { success: true };
      }),
  }),

  // 현재 로그인 사용자의 승인 역할 조회
  getMyApprovalRole: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
    const userRole = (ctx.user as any)?.role;
    // 슈퍼관리자/관리자는 자동으로 승인자 권한
    if (userRole === "super_admin" || userRole === "admin") {
      try {
        const employee = await organizationHelper.getEmployeeByUserId(userId);
        return { approvalRole: "approver" as string, employeeId: employee?.id || null, employeeName: employee?.name || ctx.user?.name || "관리자" };
      } catch {
        return { approvalRole: "approver" as string, employeeId: null, employeeName: ctx.user?.name || "관리자" };
      }
    }
    try {
      const employee = await organizationHelper.getEmployeeByUserId(userId);
      return { approvalRole: (employee.approvalRole || "none") as string, employeeId: employee.id, employeeName: employee.name };
    } catch {
      return { approvalRole: "none" as const, employeeId: null, employeeName: null };
    }
  }),
  // ============================================================================
  // 문서 결재자 설정 관리
  // ============================================================================
  approvalSettings: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await organizationHelper.listDocumentApprovalSettings(ctx.tenantId);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return await organizationHelper.getDocumentApprovalSettingById(input.id);
      }),

    getByType: protectedProcedure
      .input(z.object({ documentType: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.tenantId) {
          return null;
        }
        return await organizationHelper.getDocumentApprovalSettingByType(input.documentType, ctx.tenantId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          documentType: z.string(),
          documentTypeName: z.string(),
          authorEmployeeId: z.number().optional(),
          reviewerEmployeeId: z.number().optional(),
          approverEmployeeId: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return await organizationHelper.createDocumentApprovalSetting({ ...input, tenantId: ctx.tenantId });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          documentType: z.string().optional(),
          documentTypeName: z.string().optional(),
          authorEmployeeId: z.number().optional(),
          reviewerEmployeeId: z.number().optional(),
          approverEmployeeId: z.number().optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        return await organizationHelper.updateDocumentApprovalSetting(id, { ...data, tenantId: ctx.tenantId });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await organizationHelper.deleteDocumentApprovalSetting(input.id);
        return { success: true };
      }),
  }),
});
