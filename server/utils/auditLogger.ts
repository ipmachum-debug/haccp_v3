
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
  // 2026-10-14: 운영 audit_logs 실측 컬럼(drizzle/schema/audit.ts)으로 기록한다.
  // 이전에는 control-plane 정의(id UUID · actor_type · meta_json …)로 INSERT 해 컬럼이 없어 매번 실패했다.
  const { createAuditLog: write } = await import('../db/system/auditApprovalSupplier');
  const target = params.targetId ?? (params.entityId != null ? String(params.entityId) : undefined);
  await write({
    action: params.action,
    entityType: params.entityType || params.targetType || '',
    entityId: target != null && /^\d+$/.test(String(target)) ? Number(target) : undefined,
    userId: Number(params.actorId) || 0,
    userRole: params.actorType || 'user',
    description: params.description,
    changes: params.meta ?? (target != null && !/^\d+$/.test(String(target)) ? { targetId: target } : undefined),
    ipAddress: params.ip,
    userAgent: params.userAgent,
    tenantId: Number(params.tenantId) || undefined,
  });
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
