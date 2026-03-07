import { router, tenantRequiredProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as batchPdfLogsDb from "../db/batchPdfLogs";
import { getDb } from "../db";
import { hBackups } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { storageGet } from "../storage";

/**
 * Admin 라우터
 * 관리자 전용 기능을 제공합니다
 */
export const adminRouter = router({
  /**
   * 실패 작업 목록 조회
   */
  getFailedTasks: tenantRequiredProcedure.query(async ({ ctx }) => {
    // admin 권한 확인
    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "관리자만 접근할 수 있습니다",
      });
    }

    // h_batch_completion_retries 테이블에서 실패 작업 조회
    const failedTasks = await batchPdfLogsDb.getFailedTasks(ctx.tenantId);
    return failedTasks;
  }),

  /**
   * 실패 작업 재시도
   */
  retryFailedTask: tenantRequiredProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // admin 권한 확인
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "관리자만 접근할 수 있습니다",
        });
      }

      // 실패 작업 재시도 로직
      const result = await batchPdfLogsDb.retryFailedTask(input.taskId, ctx.tenantId);
      return result;
    }),

  /**
   * 실패 작업 삭제
   */
  deleteFailedTask: tenantRequiredProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // admin 권한 확인
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "관리자만 접근할 수 있습니다",
        });
      }

      // 실패 작업 삭제 로직
      const result = await batchPdfLogsDb.deleteFailedTask(input.taskId, ctx.tenantId);
      return result;
    }),

  /**
   * 백업 목록 조회
   */
  listBackups: tenantRequiredProcedure.query(async ({ ctx }) => {
    // admin 권한 확인
    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "관리자만 접근할 수 있습니다",
      });
    }

    // 백업 목록 조회 (최신순)
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "데이터베이스 연결 실패",
      });
    }

    const backups = await db
      .select()
      .from(hBackups)
      .orderBy(desc(hBackups.createdAt))
      .limit(50);

    return backups;
  }),

  /**
   * 백업 다운로드 URL 생성
   */
  getBackupDownloadUrl: tenantRequiredProcedure
    .input(z.object({ backupId: z.number() }))
    .query(async ({ ctx, input }) => {
      // admin 권한 확인
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "관리자만 접근할 수 있습니다",
        });
      }

      // 백업 정보 조회
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "데이터베이스 연결 실패",
        });
      }

      const backup = await db
        .select()
        .from(hBackups)
        .where(eq(hBackups.id, input.backupId))
        .limit(1);

      if (backup.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "백업을 찾을 수 없습니다",
        });
      }

      const backupData = backup[0];

      // S3 백업인 경우 다운로드 URL 반환
      if (backupData.backupType === "s3" && backupData.s3Key) {
        const { url } = await storageGet(backupData.s3Key);
        return { url };
      }

      // 로컬 백업인 경우 (현재는 지원하지 않음)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "로컬 백업은 다운로드할 수 없습니다",
      });
    }),

  /**
   * 데이터베이스 초기화 (스키마 생성)
   * 초기 설정을 위해 publicProcedure로 변경 (로그인 불필요)
   */
  initializeDatabase: publicProcedure
    .mutation(async () => {

      try {
        // pnpm db:push 실행
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);

        const { stdout, stderr } = await execAsync("cd /home/ubuntu/haccp_v3 && pnpm db:push --accept-data-loss");

        return {
          success: true,
          message: "데이터베이스 스키마가 성공적으로 생성되었습니다",
          output: stdout,
        };
      } catch (error: any) {
        console.error("[Admin] Database initialization error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `데이터베이스 초기화 실패: ${error.message}`,
        });
      }
    }),

  /**
   * 샘플 데이터 생성
   * 초기 설정을 위해 publicProcedure로 변경 (로그인 불필요)
   */
  seedSampleData: publicProcedure
    .mutation(async () => {

      try {
        const { seedSampleData } = await import("../db/seed.js");
        const result = await seedSampleData();
        return result;
      } catch (error: any) {
        console.error("[Admin] Sample data seeding error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `샘플 데이터 생성 실패: ${error.message}`,
        });
      }
    }),

  /**
   * 백업 삭제
   */
  deleteBackup: tenantRequiredProcedure
    .input(z.object({ backupId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // admin 권한 확인
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "관리자만 접근할 수 있습니다",
        });
      }

      // 백업 정보 조회
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "데이터베이스 연결 실패",
        });
      }

      const backup = await db
        .select()
        .from(hBackups)
        .where(eq(hBackups.id, input.backupId))
        .limit(1);

      if (backup.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "백업을 찾을 수 없습니다",
        });
      }

      // 데이터베이스에서 백업 메타데이터 삭제
      await db.delete(hBackups).where(eq(hBackups.id, input.backupId));

      // TODO: S3에서 파일 삭제 (현재는 메타데이터만 삭제)
      // S3 삭제 API가 필요하면 추가 구현

      return { success: true };
    }),
});
