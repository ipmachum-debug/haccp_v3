// user 라우터 - routers.ts에서 분리됨
import { adminProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, lt, or } from "drizzle-orm";
import { getDb } from "../../db";

export const userRouter = router({
    // 모든 사용자 조회 (관리자만, tenant 격리)
    list: adminProcedure.query(async ({ ctx }) => {
      const { getAllUsers } = await import("../../db");
      // 모든 관리자(슈퍼관리자 포함)는 자신의 tenant_id로 필터링
      // 슈퍼관리자가 모든 테넌트를 관리하려면 시스템 모니터링 페이지 사용
      return await getAllUsers(ctx.tenantId ?? undefined);
    }),
    
    // 사용자 역할 변경 (관리자만)
    updateRole: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["admin", "worker", "monitor", "employee"])
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateUserRole, createAuditLog, getUserById } = await import("../../db");
        
        // 변경 전 사용자 정보 조회
        const targetUser = await getUserById(input.userId);
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.'
          });
        }
        
        // tenant 격리 검증
        if (targetUser.tenantId !== (ctx.tenantId ?? undefined)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '다른 회사의 사용자는 관리할 수 없습니다.'
          });
        }
        
        const oldRole = targetUser?.role;
        
        // 역할 변경
        await updateUserRole(input.userId, input.role);
        
        // 역할 변경 시 자동으로 승인 처리 (pending 상태인 경우)
        const db = await (await import("../../db")).getDb();
        if (db && targetUser?.approvalStatus === 'pending') {
          const { users } = await import("../../../drizzle/schema_main");
          const { eq } = await import("drizzle-orm");
          await db.update(users)
            .set({ 
              approvalStatus: 'approved',
              isActive: 1 
            })
            .where(eq(users.id, input.userId));
        }
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.updateRole",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            oldRole,
            newRole: input.role,
            targetUserEmail: targetUser?.email
          },
          description: `사용자 ${targetUser?.email}의 역할을 ${oldRole}에서 ${input.role}로 변경`
        });
        
        return { success: true };
      }),
    
    // 사용자 승인 (관리자만)
    approve: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["admin", "worker", "monitor", "employee"]).default("worker")
      }))
      .mutation(async ({ input, ctx }) => {
        const { approveUser, createAuditLog, getUserById } = await import("../../db");
        
        // 사용자 정보 조회
        const targetUser = await getUserById(input.userId);
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.'
          });
        }
        
        // tenant 격리 검증
        if (targetUser.tenantId !== (ctx.tenantId ?? undefined)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '다른 회사의 사용자는 승인할 수 없습니다.'
          });
        }
        
        // 사용자 승인
        await approveUser(input.userId, input.role as "admin" | "worker" | "monitor");
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.approve",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            approvalStatus: "approved",
            role: input.role,
            targetUserEmail: targetUser?.email
          },
          description: `사용자 ${targetUser?.email}를 승인하고 역할을 ${input.role}로 설정`
        });
        
        return { success: true, message: "사용자가 승인되었습니다" };
      }),
      
      // 사용자 활성화/비활성화 (관리자만)
    toggleActive: adminProcedure
      .input(z.object({
        userId: z.number(),
        isActive: z.boolean()
      }))
      .mutation(async ({ input, ctx }) => {
        const { toggleUserActive, getUserById } = await import("../../db");
        
        // 사용자 정보 조회
        const targetUser = await getUserById(input.userId);
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.'
          });
        }
        
        // tenant 격리 검증
        if (targetUser.tenantId !== (ctx.tenantId ?? undefined)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '다른 회사의 사용자는 관리할 수 없습니다.'
          });
        }
        
        await toggleUserActive(input.userId, input.isActive);
        return { success: true };
      }),
    
    // 일괄 승인 (관리자만)
    batchApprove: adminProcedure
      .input(z.object({
        userIds: z.array(z.number()),
        role: z.enum(["admin", "worker", "monitor", "employee"]).default("worker")
      }))
      .mutation(async ({ input, ctx }) => {
        const { batchApproveUsers, createAuditLog } = await import("../../db");
        
        // 일괄 승인
        await batchApproveUsers(input.userIds, input.role as "admin" | "worker" | "monitor");
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.batchApprove",
          entityType: "user",
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            userIds: input.userIds,
            role: input.role
          },
          description: `${input.userIds.length}명의 사용자를 일괄 승인`
        });
        
        return { success: true, message: `${input.userIds.length}명의 사용자가 승인되었습니다` };
      }),
    
    // 개별 거부 (관리자만)
    reject: adminProcedure
      .input(z.object({
        userId: z.number()
      }))
      .mutation(async ({ input, ctx }) => {
        const { rejectUser, createAuditLog, getUserById } = await import("../../db");
        
        // 사용자 정보 조회
        const targetUser = await getUserById(input.userId);
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.'
          });
        }
        
        // tenant 격리 검증
        if (targetUser.tenantId !== (ctx.tenantId ?? undefined)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '다른 회사의 사용자는 거부할 수 없습니다.'
          });
        }
        
        // 사용자 거부
        await rejectUser(input.userId);
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.reject",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            approvalStatus: "rejected",
            targetUserEmail: targetUser?.email
          },
          description: `사용자 ${targetUser?.email}를 거부`
        });
        
        return { success: true, message: "사용자가 거부되었습니다" };
      }),
    
    // 일괄 거부 (관리자만)
    batchReject: adminProcedure
      .input(z.object({
        userIds: z.array(z.number())
      }))
      .mutation(async ({ input, ctx }) => {
        const { batchRejectUsers, createAuditLog } = await import("../../db");
        
        // 일괄 거부
        await batchRejectUsers(input.userIds);
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.batchReject",
          entityType: "user",
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            userIds: input.userIds
          },
          description: `${input.userIds.length}명의 사용자를 일괄 거부`
        });
        
        return { success: true, message: `${input.userIds.length}명의 사용자가 거부되었습니다` };
      }),
    
    // 사용자 초대 (관리자만)
    invite: adminProcedure
      .input(z.object({
        email: z.string().email(),
        name: z.string(),
        role: z.enum(["admin", "worker", "monitor", "employee"]).default("worker"),
        userMemo: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { inviteUser, createAuditLog } = await import("../../db");
        
        // 사용자 초대
        const { userId, tempPassword } = await inviteUser(
          input.email,
          input.name,
          input.role as "admin" | "worker" | "monitor",
          ctx.user.id,
          input.userMemo
        );
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.invite",
          entityType: "user",
          entityId: userId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            email: input.email,
            name: input.name,
            role: input.role
          },
          description: `사용자 ${input.email}를 초대`
        });
        
        return { 
          success: true, 
          message: "사용자가 초대되었습니다",
          userId,
          tempPassword
        };
      }),
    
    // 사용자 삭제 (관리자만)
    delete: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteUser, getUserById } = await import("../../db");
        
        // 자기 자신은 삭제할 수 없음
        if (input.userId === ctx.user.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "자기 자신을 삭제할 수 없습니다."
          });
        }
        
        // 사용자 정보 조회
        const targetUser = await getUserById(input.userId);
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.'
          });
        }
        
        // tenant 격리 검증
        if (targetUser.tenantId !== (ctx.tenantId ?? undefined)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '다른 회사의 사용자는 삭제할 수 없습니다.'
          });
        }
        
        await deleteUser(input.userId);
        
        return { success: true, message: "사용자가 삭제되었습니다" };
      })
});
