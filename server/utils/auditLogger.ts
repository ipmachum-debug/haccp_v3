import { getDb } from '../db';
import { auditLogs } from '../../drizzle/schema_control_plane_ops';
import { randomUUID } from 'crypto';

/**
 * 감사 로그 파라미터 인터페이스
 * 실제 DB 스키마에 맞춰 작성됨
 */
interface AuditLogParams {
  action: string;                    // 필수: 수행된 작업 (예: 'tenant.create', 'user.login')
  actorType?: string;                // 작업 수행자 유형 (예: 'super_admin', 'admin', 'user', 'system')
  actorId?: string;                  // 작업 수행자 ID
  tenantId?: string;                 // 테넌트 ID (시스템 전체 이벤트의 경우 null)
  targetType?: string;               // 대상 유형 (예: 'tenant', 'user', 'license')
  targetId?: string;                 // 대상 ID
  entityType?: string;               // 엔티티 유형 (예: 'tenants', 'users')
  entityId?: number;                 // 엔티티 ID
  description?: string;              // 상세 설명
  ip?: string;                       // IP 주소
  userAgent?: string;                // User Agent
  meta?: Record<string, any>;        // 추가 메타데이터 (JSON)
}

/**
 * 감사 로그를 기록하는 헬퍼 함수
 * 
 * @param params 감사 로그 파라미터
 * @returns Promise<void>
 * 
 * @example
 * await createAuditLog({
 *   action: 'tenant.create',
 *   actorType: 'super_admin',
 *   actorId: '123',
 *   targetType: 'tenant',
 *   targetId: '456',
 *   meta: { tenantName: 'New Tenant' }
 * });
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.error('[AuditLog] Database connection failed');
      return;
    }

    await db.insert(auditLogs).values({
      id: randomUUID(),
      action: params.action,
      actorType: params.actorType || 'user',
      actorId: params.actorId || null,
      tenantId: params.tenantId || null,
      targetType: params.targetType || null,
      targetId: params.targetId || null,
      ip: params.ip || null,
      userAgent: params.userAgent || null,
      metaJson: params.meta || null,
      createdAt: new Date()
    });

    console.log(`[AuditLog] Created: ${params.action} by ${params.actorType}:${params.actorId}`);
  } catch (error) {
    console.error('[AuditLog] Failed to create audit log:', error);
    // 감사 로그 실패는 메인 작업을 중단시키지 않음
    // 하지만 에러는 로그로 남김
  }
}

/**
 * tRPC context에서 감사 로그를 기록하는 헬퍼 함수
 * 
 * @param ctx tRPC context (user, req 포함)
 * @param params 감사 로그 파라미터 (actorId, ip, userAgent는 자동으로 추출됨)
 * @returns Promise<void>
 * 
 * @example
 * await createAuditLogFromContext(ctx, {
 *   action: 'tenant.update',
 *   targetType: 'tenant',
 *   targetId: '456',
 *   meta: { changes: { name: 'Updated Name' } }
 * });
 */
export async function createAuditLogFromContext(
  ctx: any,
  params: Omit<AuditLogParams, 'actorId' | 'ip' | 'userAgent'>
): Promise<void> {
  const user = ctx.user;
  const req = ctx.req;

  // User 정보에서 actorType 결정
  let actorType = 'user';
  if (user?.role === 'super_admin') {
    actorType = 'super_admin';
  } else if (user?.role === 'admin' || user?.role === 'client_admin') {
    actorType = 'admin';
  }

  // IP 주소 추출 (프록시 고려)
  const ip = req?.ip || 
             req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || 
             req?.headers?.['x-real-ip'] ||
             req?.connection?.remoteAddress ||
             req?.socket?.remoteAddress;

  // User Agent 추출
  const userAgent = req?.headers?.['user-agent'];

  await createAuditLog({
    ...params,
    actorType,
    actorId: user?.id?.toString(),
    tenantId: params.tenantId || user?.tenantId?.toString(),
    ip,
    userAgent
  });
}

/**
 * 시스템 이벤트를 위한 감사 로그 기록 함수
 * 
 * @param params 감사 로그 파라미터
 * @returns Promise<void>
 * 
 * @example
 * await createSystemAuditLog({
 *   action: 'system.backup',
 *   targetType: 'database',
 *   meta: { backupSize: '1.2GB' }
 * });
 */
export async function createSystemAuditLog(
  params: Omit<AuditLogParams, 'actorType' | 'actorId'>
): Promise<void> {
  await createAuditLog({
    ...params,
    actorType: 'system',
    actorId: undefined
  });
}
