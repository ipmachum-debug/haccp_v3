/**
 * Express 라우트용 인증 + 테넌트 격리 미들웨어
 * 
 * ⚠️ 보안 강화: req.query/req.body에서 tenantId를 읽지 않음
 * JWT 쿠키에서 사용자를 인증하고, DB에서 tenantId를 가져옴
 * 
 * tRPC의 createContext + protectedTenantProcedure와 동일한 로직
 */
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "./jwtAuth";
import { getUserById } from "../localAuth";
import { COOKIE_NAME } from "../../shared/const";

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  role: string;
  tenantId: number;
}

/**
 * Express Request에 인증 정보를 주입하는 확장 타입
 */
export interface TenantAuthRequest extends Request {
  tenantUser?: AuthenticatedUser;
}

/**
 * requireTenantAuth - Express 라우트용 인증 미들웨어
 * 
 * 1. Cookie에서 JWT 토큰 추출 (tRPC context와 동일)
 * 2. JWT 검증 → userId 추출
 * 3. DB에서 사용자 조회 → tenantId 확인
 * 4. super_admin이 아닌데 tenantId 없으면 403
 * 5. req.tenantUser에 인증 정보 주입
 * 
 * ⚠️ 절대 req.query/req.body/req.params에서 tenantId를 읽지 않음
 */
export function requireTenantAuth(req: TenantAuthRequest, res: Response, next: NextFunction) {
  (async () => {
    try {
      // 1. Cookie에서 JWT 토큰 추출
      const token = req.cookies?.[COOKIE_NAME];

      if (!token) {
        console.warn("[ExpressAuth] No JWT token in cookie");
        return res.status(401).json({ error: "인증이 필요합니다. 로그인해주세요." });
      }

      // 2. JWT 검증
      const payload = await verifyToken(token);
      if (!payload || !payload.userId) {
        console.warn("[ExpressAuth] Invalid JWT token");
        return res.status(401).json({ error: "인증 토큰이 유효하지 않습니다. 다시 로그인해주세요." });
      }

      // 3. DB에서 사용자 조회
      const dbUser = await getUserById(payload.userId);
      if (!dbUser) {
        console.warn(`[ExpressAuth] User not found: userId=${payload.userId}`);
        return res.status(401).json({ error: "사용자를 찾을 수 없습니다." });
      }

      // 4. tenantId 확인 (super_admin이 아닌데 tenantId 없으면 차단)
      const tenantId = (dbUser as any).tenantId;
      if (dbUser.role !== "super_admin" && !tenantId) {
        console.error(`[SECURITY][ExpressAuth] User ${dbUser.email} (id: ${dbUser.id}) has no tenantId! Blocking.`);
        return res.status(403).json({ error: "테넌트 정보가 필요합니다. 관리자에게 문의하세요." });
      }

      // 5. super_admin은 세션의 actingTenantId를 사용
      let effectiveTenantId = tenantId;
      if (dbUser.role === "super_admin") {
        const actingTenantId = (req.session as any)?.actingTenantId;
        if (!actingTenantId) {
          console.error(`[SECURITY][ExpressAuth] Super admin ${dbUser.email} has no actingTenantId! Blocking.`);
          return res.status(403).json({ error: "테넌트를 먼저 선택해주세요." });
        }
        effectiveTenantId = actingTenantId;
      }

      // 6. req.tenantUser에 인증 정보 주입
      req.tenantUser = {
        id: dbUser.id as number,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        tenantId: effectiveTenantId,
      };

      next();
    } catch (error) {
      console.error("[ExpressAuth] Authentication error:", error);
      return res.status(500).json({ error: "인증 처리 중 오류가 발생했습니다." });
    }
  })();
}

/**
 * requireAdminAuth - admin 권한 필요한 Express 라우트용 미들웨어
 * requireTenantAuth + admin/super_admin 역할 확인
 */
export function requireAdminAuth(req: TenantAuthRequest, res: Response, next: NextFunction) {
  requireTenantAuth(req, res, () => {
    if (!req.tenantUser || (req.tenantUser.role !== "admin" && req.tenantUser.role !== "super_admin")) {
      return res.status(403).json({ error: "관리자 권한이 필요합니다." });
    }
    next();
  });
}
