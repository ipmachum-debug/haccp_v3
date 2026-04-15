/**
 * 슈퍼관리자용 승인 라우터
 * - 클라이언트 관리자 승인/거부
 * - 승인 시 테넌트 자동 생성
 */

import { router, superAdminProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { users, tenants } from "../../../drizzle/schema/schema_main";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { 
  sendClientAdminApprovalComplete,
  sendApprovalRejection 
} from "../../services/emailService";
import { createAuditLogFromContext } from "../../utils/auditLogger";

export const superadminApprovalRouter = router({
  // 클라이언트 관리자 승인 대기 목록 조회
  getPendingClientAdmins: superAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

    // 승인 대기 중인 클라이언트 관리자 조회
    const pendingAdmins = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        userType: users.userType,
        companyName: users.companyName,
        businessNumber: users.businessNumber,
        userMemo: users.userMemo,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        and(
          eq(users.userType, 'client_admin'),
          eq(users.approvalStatus, 'pending')
        )
      );

    return {
      success: true,
      users: pendingAdmins,
    };
  }),

  // 클라이언트 관리자 승인/거부
  approveClientAdmin: superAdminProcedure
    .input(
      z.object({
        userId: z.number(),
        action: z.enum(['approve', 'reject']),
        adminMemo: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
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

      if (user.userType !== 'client_admin') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '클라이언트 관리자만 승인할 수 있습니다.',
        });
      }

      if (user.approvalStatus !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '이미 처리된 요청입니다.',
        });
      }

      if (input.action === 'approve') {
        // 승인: 테넌트 생성 및 사용자 활성화

        // 1. 신규 테넌트 생성
        // slug 생성: 회사명을 기반으로 URL-safe한 문자열 생성
        const generateSlug = (name: string) => {
          return name
            .toLowerCase()
            .replace(/[^a-z0-9가-힣]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            + '-' + Date.now().toString(36); // 고유성 보장
        };

        const tenantName = user.companyName || `${user.name}의 회사`;
        const tenantSlug = generateSlug(tenantName);

        const [newTenant] = await db
          .insert(tenants)
          .values({
            name: tenantName,
            slug: tenantSlug,
            status: 'active',
          })
          .$returningId();

        const tenantId = newTenant.id;

        // 2. 사용자 업데이트 (승인 + 테넌트 할당 + 관리자 권한)
        await db
          .update(users)
          .set({
            approvalStatus: 'approved',
            isActive: 1,
            role: 'admin', // 클라이언트 관리자 권한
            tenantId: tenantId,
            adminMemo: input.adminMemo || null,
          })
          .where(eq(users.id, input.userId));

        // 승인 완료 이메일 발송
        await sendClientAdminApprovalComplete(user.email, user.name);

        // 감사 로그 기록
        await createAuditLogFromContext(ctx, {
          action: 'tenant_approved',
          entityType: 'tenants',
          entityId: tenantId,
          description: `테넌트 '${tenantName}' 승인 완료 (사용자: ${user.email})`
        });

        return {
          success: true,
          message: '클라이언트 관리자가 승인되었습니다.',
          tenant: {
            id: tenantId,
            name: user.companyName || `${user.name}의 회사`,
            adminUserId: input.userId,
          },
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

        // 감사 로그 기록
        await createAuditLogFromContext(ctx, {
          action: 'tenant_rejected',
          entityType: 'tenants',
          description: `클라이언트 관리자 승인 거부 (사용자: ${user.email}, 사유: ${input.adminMemo || '없음'})`
        });

        return {
          success: true,
          message: '클라이언트 관리자 승인이 거부되었습니다.',
        };
      }
    }),

  // 전체 사용자 목록 조회 (슈퍼관리자용)
  getAllUsers: superAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        userType: users.userType,
        tenantId: users.tenantId,
        approvalStatus: users.approvalStatus,
        isActive: users.isActive,
        companyName: users.companyName,
        createdAt: users.createdAt,
      })
      .from(users);

    return {
      success: true,
      users: allUsers,
    };
  }),
});
