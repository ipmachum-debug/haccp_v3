/**
 * 테넌트 컨텍스트 미들웨어
 * 모든 요청에서 tenant_id를 추출하여 컨텍스트에 추가
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
 * 2. 기본값 1 (Golden Turtle)
 */
export function tenantMiddleware(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    // JWT 토큰에서 tenant_id 추출
    const user = (req as any).user;
    
    if (user && user.tenantId) {
      req.tenantId = user.tenantId;
    } else {
      // 기본 테넌트 (Golden Turtle)
      req.tenantId = 1;
    }
    
    next();
  } catch (error) {
    console.error('[Tenant Middleware] Error:', error);
    req.tenantId = 1; // 에러 시 기본 테넌트
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
