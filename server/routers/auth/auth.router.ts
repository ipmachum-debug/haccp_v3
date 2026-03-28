// auth 라우터 - routers.ts에서 분리됨
import { publicProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lt, or } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../../_core/cookies";
import crypto from "crypto";
import { getDb, getUserByEmail } from "../../db";
import { loginUser as localLoginUser, hashPassword } from "../../localAuth";
import { sendPasswordResetEmail } from "../../_core/email";

export const authRouter = router({
    me: publicProcedure.query(async (opts) => {
      const user = opts.ctx.user;
      
      // 로그인한 사용자의 경우 기본 즐겨찾기 자동 생성
      if (user) {
        const { createDefaultFavorites } = await import("../../db/favorites");
        try { await createDefaultFavorites(user.id, (user as any).tenantId); } catch (e) { console.error("[auth.me] Failed to create default favorites:", e); }
      }
      
      return user;
    }),
    
    // 회원가입
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          // 비밀번호 정책: 최소 8자 이상
          password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다"),
          name: z.string().min(1),
          userType: z.enum(["b2b_partner", "general_user", "company_staff", "other", "client_admin", "employee"]).default("employee"),
          userMemo: z.string().optional(),
          companyName: z.string().optional(),
          businessNumber: z.string().optional(),
          tenantId: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { registerUser } = await import("../../localAuth");
        const result = await registerUser(
          input.email, 
          input.password, 
          input.name, 
          input.userType, 
          input.userMemo,
          input.companyName,
          input.businessNumber,
          input.tenantId
        );
        
        return result;
      }),

    // 로그인 (이메일 인증 + 관리자 승인 확인)
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string()
        })
      )
      .mutation(async ({ input, ctx }) => {
        // IP 주소 추출
        const ipAddress = (ctx.req.headers['x-forwarded-for'] as string)?.split(',')[0] || ctx.req.ip || ctx.req.socket.remoteAddress;
        const result = await localLoginUser(input.email, input.password, ipAddress);
        
        // 쿠키에 토큰 저장 (7일 유효)
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, result.token, {
          ...cookieOptions,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
        });
        
        return {
          success: true,
          user: result.user
        };
      }),
    
    // 비밀번호 재설정 요청
    requestPasswordReset: publicProcedure
      .input(
        z.object({
          email: z.string().email()
        })
      )
      .mutation(async ({ input, ctx }) => {
        // 사용자 조회
        const user = await getUserByEmail(input.email);
        if (!user) {
          // 보안상 사용자 존재 여부를 노출하지 않음
          return {
            success: true,
            message: "비밀번호 재설정 링크가 이메일로 전송되었습니다."
          };
        }

        // 랜덤 토큰 생성 (32바이트)
        const resetToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // 1시간 후 만료

        // 데이터베이스에 토큰 저장
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

        await (db as any).execute(
          "INSERT INTO h_password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
          [user.id, resetToken, expiresAt]
        );

        // 이메일 발송
        try {
          await sendPasswordResetEmail(user.email, resetToken, user.name || "사용자");
        } catch (error) {
          console.error("비밀번호 재설정 이메일 발송 실패:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요."
          });
        }

        return {
          success: true,
          message: "비밀번호 재설정 링크가 이메일로 전송되었습니다."
        };
      }),

    // 비밀번호 재설정 확인
    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string(),
          newPassword: z.string().min(8)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

        // 토큰 조회
        const [tokenRecord] = await (db as any).execute(
          "SELECT * FROM h_password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > NOW()",
          [input.token]
        ) as any;

        if (!tokenRecord || tokenRecord.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "유효하지 않거나 만료된 토큰입니다."
          });
        }

        const token = tokenRecord[0];

        // 비밀번호 해싱
        const passwordHash = await hashPassword(input.newPassword);

        // 비밀번호 업데이트
        await (db as any).execute(
          "UPDATE users SET password_hash = ? WHERE id = ?",
          [passwordHash, token.user_id]
        );

        // 토큰 사용 처리
        await (db as any).execute(
          "UPDATE h_password_reset_tokens SET used = 1 WHERE id = ?",
          [token.id]
        );

        return {
          success: true,
          message: "비밀번호가 성공적으로 변경되었습니다."
        };
      }),

    // 로그아웃
    logout: publicProcedure.mutation(async ({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      } as const;
    })
});
