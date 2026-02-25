import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { verifyToken } from "./jwtAuth";
import { getUserById } from "../localAuth";
import { COOKIE_NAME } from "@shared/const";

import type { TenantDb } from "../db/TenantDb";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  tenantId: number | null; // ✨ 멀티테넌트 격리
  actingTenantId: number | null; // ✨ 슈퍼관리자가 선택한 테넌트 (세션 기반)
  db?: TenantDb | null;    // ✨ TenantDb 자동 주입 (미들웨어에서 설정)
};

/**
 * JWT 기반 컨텍스트 생성
 * Cookie에서 JWT 토큰을 추출하여 사용자 인증
 * 
 * ✨ 멀티테넌트 격리 강화:
 * - 로그인된 사용자는 tenantId가 필수
 * - super_admin만 tenantId 없이 접근 가능
 */
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let tenantId: number | null = null;
  let actingTenantId: number | null = null;

  try {
    // Cookie에서 JWT 토큰 추출
    const token = opts.req.cookies?.[COOKIE_NAME];
    
    // ⚠️ 운영 환경에서는 쿠키 로깅 제거 필요
    if (process.env.NODE_ENV === "development") {
      console.log("[Context] Token from cookie:", token ? "Found" : "Not found");
    }

    if (token) {
      // JWT 토큰 검증
      const payload = await verifyToken(token);
      
      if (payload && payload.userId) {
        // 사용자 정보 조회 (localAuth.ts의 getUserById 사용)
        const dbUser = await getUserById(payload.userId);
        
        if (dbUser) {
          user = dbUser as User;
          tenantId = (user as any).tenantId ?? null;

          // ✨ 슈퍼관리자: 세션에서 actingTenantId 읽기
          if (user.role === "super_admin") {
            actingTenantId = (opts.req.session as any)?.actingTenantId ?? null;
          }

          // ✨ 멀티테넌트 격리: super_admin만 tenantId 없이 허용
          if (user.role !== "super_admin" && !tenantId) {
            console.warn("[Context] User has no tenantId and is not super_admin. Access denied.");
            user = null;
            tenantId = null;
          }
        }
      }
    }
  } catch (error) {
    console.error("[Context] Failed to verify user:", error);
    user = null;
    tenantId = null;
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[Context] Final user:", user?.email, "tenantId:", tenantId);
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    tenantId,
    actingTenantId,
  };
}
