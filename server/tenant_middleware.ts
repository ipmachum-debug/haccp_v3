/**
 * 테넌트 컨텍스트 미들웨어
 * 모든 요청에서 tenant_id를 추출하여 컨텍스트에 추가
 * 
 * P0 FIX: tenantId = 1 기본값 제거 (보안 위험)
 * 인증되지 않은 요청은 tenantId를 undefined로 유지하여
 * tenantRequiredProcedure에서 거부하도록 함
 */
import { Request, Response, NextFunction } from 'express';

export interface TenantRequest extends Request {
  tenantId?: number;
}

/**
 * 테넌트 ID를 요청 컨텍스트에 추가하는 미들웨어
 * 
 * 우선순위:
 * 1. JWT 토큰에서 추출 (로그인한 사용자)
 * 2. undefined (테넌트 미확인 - tenantRequiredProcedure에서 403 반환)
 */
export function tenantMiddleware(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    // JWT 토큰에서 tenant_id 추출
    const user = (req as any).user;
    
    if (user && user.tenantId) {
      req.tenantId = user.tenantId;
    } else {
      // P0 FIX: 기본값 제거 - 인증 안 된 요청은 tenantId 없음
      req.tenantId = undefined;
    }
    
    next();
  } catch (error) {
    console.error('[Tenant Middleware] Error:', error);
    // P0 FIX: 에러 시에도 기본 테넌트 할당하지 않음
    req.tenantId = undefined;
    next();
  }
}

/**
 * 테넌트 ID를 데이터베이스 쿼리에 자동으로 추가하는 헬퍼
 */
export function withTenantId<T extends { tenantId?: number }>(
  data: T,
  tenantId: number
): T & { tenantId: number } {
  return {
    ...data,
    tenantId,
  };
}
