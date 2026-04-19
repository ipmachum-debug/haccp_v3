/**
 * 클라이언트 관리자용 직원 관리 라우터
 * - 소속 직원 승인/거부
 * - 소속 직원 목록 조회
 * - 소속 직원 삭제 및 역할 변경
 */

import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { users } from "../../../drizzle/schema/schema_main";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { 
  sendEmployeeApprovalComplete,
  sendApprovalRejection 
} from "../../services/emailService";
import { tenants } from "../../../drizzle/schema/schema_main";

export const adminEmployeeRouter = router({
  // 직원 승인 대기 목록 조회 (클라이언트 관리자용)
  getPendingEmployees: tenantRequiredProcedure.query(async ({ ctx }) => {
    // 클라이언트 관리자 권한 확인
    if (!['admin', 'super_admin'].includes(ctx.user.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: '클라이언트 관리자 권한이 필요합니다.',
      });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

    const tenantId = ctx.tenantId;
    console.log('[adminEmployee] getPendingEmployees - tenantId:', tenantId, 'user:', ctx.user.email);

    // 승인 대기 중인 직원 조회 (같은 테넌트)
    const pendingEmployees = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        userType: users.userType,
        userMemo: users.userMemo,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.userType, 'employee'),
          eq(users.approvalStatus, 'pending')
        )
      );

    console.log('[adminEmployee] getPendingEmployees - result count:', pendingEmployees.length, 'users:', pendingEmployees);

    return {
      success: true,
      users: pendingEmployees,
    };
  }),

  // 직원 승인/거부 (클라이언트 관리자용)
  approveEmployee: tenantRequiredProcedure
    .input(
      z.object({
        userId: z.number(),
        action: z.enum(['approve', 'reject']),
        role: z.enum(['worker', 'monitor']).optional(),
        adminMemo: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // 클라이언트 관리자 권한 확인
      if (!['admin', 'super_admin'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '클라이언트 관리자 권한이 필요합니다.',
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

      // 사용자 조회
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: '사용자를 찾을 수 없습니다.',
        });
      }

      // 같은 테넌트인지 확인
      if (user.tenantId !== (ctx.tenantId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '다른 회사의 직원은 관리할 수 없습니다.',
        });
      }

      if (user.userType !== 'employee') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '직원만 승인할 수 있습니다.',
        });
      }

      if (user.approvalStatus !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '이미 처리된 요청입니다.',
        });
      }

      if (input.action === 'approve') {
        // 승인: 사용자 활성화
        await db
          .update(users)
          .set({
            approvalStatus: 'approved',
            isActive: 1,
            role: input.role || 'worker', // 부여할 역할 (기본: worker)
            adminMemo: input.adminMemo || null,
          })
          .where(eq(users.id, input.userId));

        // 테넌트 정보 조회
        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);

        // 승인 완료 이메일 발송
        await sendEmployeeApprovalComplete(
          user.email, 
          user.name, 
          tenant?.name || '회사'
        );

        return {
          success: true,
          message: '직원이 승인되었습니다.',
        };
      } else {
        // 거부: 사용자 상태만 업데이트
        await db
          .update(users)
          .set({
            approvalStatus: 'rejected',
            adminMemo: input.adminMemo || null,
          })
          .where(eq(users.id, input.userId));

        // 거부 알림 이메일 발송
        await sendApprovalRejection(user.email, user.name, input.adminMemo);

        return {
          success: true,
          message: '직원 승인이 거부되었습니다.',
        };
      }
    }),

  // 활성 직원 목록 조회 (클라이언트 관리자용)
  getActiveEmployees: tenantRequiredProcedure.query(async ({ ctx }) => {
    // 클라이언트 관리자 권한 확인
    if (!['admin', 'super_admin'].includes(ctx.user.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: '클라이언트 관리자 권한이 필요합니다.',
      });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

    const tenantId = ctx.tenantId;

    // 활성 직원 조회 (같은 테넌트)
    const activeEmployees = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        userType: users.userType,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.approvalStatus, 'approved'),
          eq(users.isActive, 1)
        )
      );

    return {
      success: true,
      users: activeEmployees,
    };
  }),

  // 직원 삭제 (클라이언트 관리자용)
  deleteEmployee: tenantRequiredProcedure
    .input(
      z.object({
        userId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // 클라이언트 관리자 권한 확인
      if (!['admin', 'super_admin'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '클라이언트 관리자 권한이 필요합니다.',
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

      // 사용자 조회
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: '사용자를 찾을 수 없습니다.',
        });
      }

      // 같은 테넌트인지 확인
      if (user.tenantId !== (ctx.tenantId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '다른 회사의 직원은 삭제할 수 없습니다.',
        });
      }

      // 관리자는 삭제 불가
      if (user.role === 'admin' || user.role === 'super_admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '관리자는 삭제할 수 없습니다.',
        });
      }

      // 사용자 비활성화 (실제 삭제 대신)
      await db
        .update(users)
        .set({
          isActive: 0,
          adminMemo: `${new Date().toISOString()} - 관리자에 의해 삭제됨`,
        })
        .where(eq(users.id, input.userId));

      return {
        success: true,
        message: '직원이 삭제되었습니다.',
      };
    }),

  // 직원 역할 변경 (클라이언트 관리자용)
  updateEmployeeRole: tenantRequiredProcedure
    .input(
      z.object({
        userId: z.number(),
        role: z.enum(['worker', 'monitor']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // 클라이언트 관리자 권한 확인
      if (!['admin', 'super_admin'].includes(ctx.user.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '클라이언트 관리자 권한이 필요합니다.',
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

      // 사용자 조회
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: '사용자를 찾을 수 없습니다.',
        });
      }

      // 같은 테넌트인지 확인
      if (user.tenantId !== (ctx.tenantId)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '다른 회사의 직원은 수정할 수 없습니다.',
        });
      }

      // 역할 변경
      await db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId));

      return {
        success: true,
        message: '직원 역할이 변경되었습니다.',
      };
    }),
});
