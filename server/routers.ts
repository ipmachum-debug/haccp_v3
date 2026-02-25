import { itemMasterRouter, productSkuRouter, productionVerificationRouter } from "./routers/itemMasterRouter";
import { aiRouter } from "./routers-ai";
import { opscoreSyncRouter } from "./routers-opscore-sync";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, workerProcedure, monitorProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { loginUser as localLoginUser, hashPassword } from "./localAuth";
import { sendPasswordResetEmail } from "./_core/email";
import crypto from "crypto";
import { getUserByEmail, createUser, updateUserLastLogin, getDb, saveLotTraceHistory, getLotTraceHistory, getTopSearchedLots, getUserTraceStats, getLotTraceHistoryByLotNumber } from "./db";
import { hSystemSettings, hInventoryLots, hInventoryTransactions, hMfFlavors, hSuppliers } from "../drizzle/schema";
import { hMaterials } from "../drizzle/schema_main";
import { eq, and, isNull, desc, asc, gte, lte, sql, like, or } from "drizzle-orm";
import { hazardAnalysisRouter } from "./routers/hazardAnalysis";
import { correctiveActionRouter } from "./routers/correctiveAction";
import { trainingRouter } from "./routers/training";
import { traceabilityRouter } from "./routers/traceability";
import { reportsRouter } from "./routers/reports";
import { adminRouter } from "./routers/admin";
import { tenantsRouter } from "./routers/tenants";
import { qualityChecklistRouter } from "./routers/qualityChecklist";
import { ccpMonitoringRouter } from "./routers/ccpMonitoring";
import { employeeRouter } from "./routers/employee";
import { healthCertificateRouter } from "./routers/healthCertificate";
import { checklistScheduleRouter } from "./routers/checklistSchedule";
import { checklistInstanceRouter } from "./routers/checklistInstance";
import { calibrationRouter } from "./routers/calibration";
import { hygieneRouter } from "./routers/hygiene";
import { pestControlRouter } from "./routers/pestControl";
import {
  checklistDashboardRouter,
  waterQualityTestRouter,
  airCompressorRouter,
  validityEvaluationRouter,
  personalHygieneCheckRouter,
  waterUsageCheckRouter,
  equipmentCleaningRecordRouter,
  foreignMaterialRecordRouter,
  refrigerationCheckRouter,
  packagingStorageRecordRouter,
  qualityIssueRecordRouter,
  capaRecordRouter,
  genericChecklistRouter
} from "./routers/checklists";
import { organizationRouter } from "./routers/organization";
import { accountingAccountsRouter } from "./routers/accountingAccounts";
import { accountCategoriesRouter } from "./routers/accountCategoriesRouter";
import { inventoryAccountingRouter } from "./routers/inventoryAccounting";
import { superadminApprovalRouter } from "./routers/superadminApproval";
import { superadminDashboardRouter } from "./routers/superadminDashboard";
import { auditLogsRouter } from "./routers/auditLogs";
import { adminEmployeeRouter } from "./routers/adminEmployee";
import { tenantsPublicRouter } from "./routers/tenantsPublic";
import { subscriptionRouter } from "./routers/subscription";
import { bannerRouter } from "./routers/banner_router";
import {
  getDashboardStats,
  getCCPCompletionRate,
  getTurnoverAlertCount,
  getFailedTaskCount
} from "./db/dashboard";
import { documentApprovalRouter } from "./routers/documentApproval";
import { documentPrintRouter } from "./routers/documentPrint";
import { getPipelineStatus, checkMaterialAvailability, runDailyClosing } from "./services/pipelineDashboard";
import { haccpPlanVerificationRouter } from "./routers/haccpPlanVerification";
import { internalAuditRouter } from "./routers/internalAudit";
import { nonconformingProductRouter } from "./routers/nonconformingProduct";
import { recallSimulationRouter } from "./routers/recall";
import { supplierAuditRouter } from "./routers/supplierAudit";
import { weeklyLogsRouter } from "./routers/weeklyLogs";
import { monthlyLogsRouter } from "./routers/monthlyLogs";
import { yearlyLogsRouter } from "./routers/yearlyLogs";
import { bankAccountRouter } from "./routers/bankAccount";
import { bankTransactionRouter } from "./routers/bankTransaction";
import { bankTransactionBulkRouter } from "./routers/bankTransactionBulk";

export const appRouter = router({
  
  // 슈퍼관리자 API
  superadmin: router({
    /**
     * 슈퍼관리자가 테넌트를 선택하는 API
     * 선택된 tenantId는 세션에 actingTenantId로 저장됨
     */
    setActingTenant: protectedProcedure
      .input(z.object({
        tenantId: z.number().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        // super_admin만 사용 가능
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "슈퍼관리자만 테넌트를 선택할 수 있습니다.",
          });
        }

        // 세션에 actingTenantId 저장
        if (!ctx.req.session) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "세션이 초기화되지 않았습니다.",
          });
        }

        (ctx.req.session as any).actingTenantId = input.tenantId;

        return {
          success: true,
          actingTenantId: input.tenantId,
          message: input.tenantId
            ? `테넌트 ID ${input.tenantId}로 전환되었습니다.`
            : "테넌트 선택이 해제되었습니다.",
        };
      }),

    /**
     * 현재 선택된 actingTenantId 조회
     */
    getActingTenant: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin") {
          return { actingTenantId: null };
        }

        const actingTenantId = (ctx.req.session as any)?.actingTenantId ?? null;
        return { actingTenantId };
      }),

    /**
     * 모든 테넌트 목록 조회 (슈퍼관리자 전용)
     */
    listTenants: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== "super_admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "슈퍼관리자만 테넌트 목록을 조회할 수 있습니다.",
          });
        }

        const { getDb } = await import("./db");
        const { tenants } = await import("../drizzle/schema");
        const db = await getDb();

        const tenantList = await db.select({
          id: tenants.id,
          name: tenants.name,
          status: tenants.status,
        }).from(tenants);

        return { tenants: tenantList };
      }),
  }),
ai: aiRouter,
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async (opts) => {
      const user = opts.ctx.user;
      
      // 로그인한 사용자의 경우 기본 즐겨찾기 자동 생성
      if (user) {
        const { createDefaultFavorites } = await import("./db/favorites");
        try { await createDefaultFavorites(user.id, (user as any).tenantId); } catch (e) { console.error("[auth.me] Failed to create default favorites:", e); }
      }
      
      return user;
    }),
    
    // 회원가입
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(6),
          name: z.string().min(1),
          userType: z.enum(["b2b_partner", "general_user", "company_staff", "other", "client_admin", "employee"]).default("employee"),
          userMemo: z.string().optional(),
          companyName: z.string().optional(),
          businessNumber: z.string().optional(),
          tenantId: z.number().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { registerUser } = await import("./localAuth");
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
      .mutation(async ({ input }) => {
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
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

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
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

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
  }),

  // 배치 관리 (Batch Management)
  batch: router({

    
    // 배치 생성
    create: workerProcedure
      .input(
        z.object({
          siteId: z.number(),
          productId: z.number(),
          batchNumber: z.string(),
          plannedQuantity: z.number(),
          plannedStartDate: z.date(),
          plannedEndDate: z.date().optional(),
          mode: z.enum(["auto", "manual"]).default("auto"),
          manualStartTime: z.string().optional(), // 수동배치 시작 시간 (HH:mm 형식)
          manualEndTime: z.string().optional(),   // 수동배치 종료 시간 (HH:mm 형식)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createBatch, createAuditLog, getProductById } = await import("./db");
        const { autoCreateCcpInstancesForBatch } = await import("./services/ccp-batch");
        
        // 1. 배치 생성
        const batchId = await createBatch({
          tenantId: ctx.user.tenantId,
          siteId: input.siteId,
          productId: input.productId,
          batchCode: input.batchNumber,
          plannedQuantity: input.plannedQuantity.toString(),
          plannedDate: input.plannedStartDate,
          createdBy: ctx.user.id
        });
        
        // 2. 제품 정보 조회 (CCP 자동 생성용)
        const product = await getProductById(input.productId);
        const productName = product?.productName || "";
        
        // 3. CCP 자동 생성 (auto/manual 모두 자동 생성)
        let ccpCreated = false;
        let ccpCount = 0;
        let instanceIds: number[] = [];
        try {
          const workDate = input.plannedStartDate.toISOString().split('T')[0];
          const result = await autoCreateCcpInstancesForBatch({
            siteId: input.siteId,
            workDate,
            batchId,
            productId: input.productId,
            productName,
            createdBy: ctx.user.id,
            tenantId: ctx.user.tenantId
          });
          ccpCreated = result.instanceIds.length > 0;
          ccpCount = result.instanceIds.length;
          instanceIds = result.instanceIds;
          console.log(`[파이프라인] CCP 자동 생성 완료 (${input.mode} 모드): ${ccpCount}건`);
        } catch (error) {
          console.error("CCP 자동 생성 실패 (배치 생성은 유지):", error);
        }
        
        // 3.5. CCP 점검 알림 자동 생성 (수동배치 모드일 때만)
        let alertsCreated = 0;
        if (input.mode === "manual" && input.manualStartTime && input.manualEndTime) {
          try {
            const { createInspectionAlert } = await import("./db/ccpInspectionAlerts");
            const { getCcpInstancesByBatchId } = await import("./db");
            
            // 배치의 CCP 인스턴스 조회 (수동 생성된 경우를 대비)
            const instances = await getCcpInstancesByBatchId(batchId);
            
            // 수동 시간을 Date 객체로 변환
            const [startHour, startMin] = input.manualStartTime.split(':').map(Number);
            const [endHour, endMin] = input.manualEndTime.split(':').map(Number);
            
            const startTime = new Date(input.plannedStartDate);
            startTime.setHours(startHour, startMin, 0, 0);
            
            const endTime = new Date(input.plannedStartDate);
            endTime.setHours(endHour, endMin, 0, 0);
            
            // 각 CCP 인스턴스에 대해 알림 생성
            for (const instance of instances) {
              // 시작 시간에 첫 번째 알림 생성
              await createInspectionAlert({
                instanceId: instance.id,
                scheduledTime: startTime
              });
              alertsCreated++;
            }
          } catch (error) {
            console.error("CCP 점검 알림 생성 실패:", error);
          }
        }
        
        // 4. 일정 자동 생성
        let scheduleCreated = false;
        try {
          const { createBatchSchedule } = await import("./db/batchSchedules");
          
          await createBatchSchedule({
            batchId,
            scheduledDate: input.plannedStartDate,
            status: "scheduled",
            notes: `자동 생성된 일정 (배치: ${input.batchNumber}, 시작: ${input.manualStartTime || '09:00'}, 종료: ${input.manualEndTime || '18:00'})`
          });
          
          scheduleCreated = true;
          console.log(`[배치 생성] 일정 자동 생성 성공: 배치 ID ${batchId}`);
        } catch (error) {
          console.error("[배치 생성] 일정 자동 생성 실패 (배치 생성은 유지):", error);
        }
        
        // 5. 감사 로그 기록
        await createAuditLog({
          action: "batch.create",
          entityType: "batch",
          entityId: batchId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 생성: ${input.batchNumber}${ccpCreated ? ' (CCP 자동 생성 완료)' : ''}${scheduleCreated ? ' (일정 자동 생성 완료)' : ''}`,
          changes: { created: input }
        });
        
        return {
          success: true,
          batchId,
          ccpCreated,
          ccpCount,
          scheduleCreated,
          mode: input.mode,
          message: ccpCreated 
            ? `배치 및 CCP가 자동으로 생성되었습니다. (${input.mode === 'auto' ? '자동' : '수동'}배치, CCP ${ccpCount}건)${scheduleCreated ? ' 일정도 자동 생성되었습니다.' : ''}` 
            : `배치가 생성되었습니다. (CCP 자동 생성 실패)${scheduleCreated ? ' 일정은 자동 생성되었습니다.' : ''}`
        };
      }),

    // 배치 목록 조회
    list: protectedProcedure
      .input(
        z.object({
          siteId: z.number().optional(),
          status: z.string().optional(),
          productId: z.number().optional(),
          page: z.number().optional(),
          limit: z.number().optional()
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const { getAllBatches } = await import("./db");
        const batches = await getAllBatches({ ...input, tenantId: ctx.user.tenantId });
        
        return batches;
      }),

    // 배치 상세 조회
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchById } = await import("./db");
        const { getLatestSuccessPdfUrl } = await import("./db/batchPdfLogs");
        
        const batch = await getBatchById(input.id, ctx.user.tenantId);
        
        if (!batch) {
          throw new Error("배치를 찾을 수 없습니다.");
        }
        
        // 최신 PDF URL 조회
        const latestPdfUrl = await getLatestSuccessPdfUrl(input.id, ctx.user.tenantId);
        
        return {
          ...batch,
          latestPdfUrl
        };
      }),

    // 배치 일정 변경 (드래그 앤 드롭)
    updateSchedule: workerProcedure
      .input(
        z.object({
          id: z.number(),
          plannedDate: z.date().optional(),
          startTime: z.date().optional(),
          endTime: z.date().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateBatchSchedule, createAuditLog } = await import("./db");
        await updateBatchSchedule(input.id, {
          plannedDate: input.plannedDate,
          startTime: input.startTime,
          endTime: input.endTime
        });
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batch.updateSchedule",
          entityType: "batch",
          entityId: input.id,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 일정 변경: ID ${input.id}`,
          changes: { updated: input }
        });
        
        return { success: true };
      }),

    // 배치 수정
    update: workerProcedure
      .input(
        z.object({
          id: z.number(),
          batchNumber: z.string().optional(),
          plannedQuantity: z.number().optional(),
          plannedStartDate: z.date().optional(),
          plannedEndDate: z.date().optional(),
          status: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getBatchById, updateBatch, createAuditLog } = await import("./db");
        
        // 락 체크: 완료된 배치 수정 금지
        const batch = await getBatchById(input.id, ctx.user.tenantId);
        if (!batch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "배치를 찾을 수 없습니다."
          });
        }
        
        if (batch.status === 'completed') {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "완료된 배치는 수정할 수 없습니다."
          });
        }
        
        await updateBatch(input.id, {
          batchNumber: input.batchNumber,
          plannedQuantity: input.plannedQuantity,
          plannedStartDate: input.plannedStartDate,
          plannedEndDate: input.plannedEndDate,
          status: input.status
        });
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batch.update",
          entityType: "batch",
          entityId: input.id,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 수정: ${input.batchNumber || input.id}`,
          changes: { updated: input }
        });
        
        return {
          success: true,
          message: "배치가 수정되었습니다."
        };
      }),
    
    // 배치 상태 변경
    updateStatus: workerProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.string()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getBatchById, updateBatchStatus } = await import("./db");
        
        // 락 체크: 완료된 배치 수정 금지
        const batch = await getBatchById(input.id, ctx.user.tenantId);
        if (!batch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "배치를 찾을 수 없습니다."
          });
        }
        
        if (batch.status === 'completed') {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "완료된 배치는 수정할 수 없습니다."
          });
        }
        
        await updateBatchStatus(input.id, input.status, undefined, ctx.user.tenantId);
        
        // === 파이프라인 자동화: 배치 시작 시 원료 자동 출고 ===
        let autoIssueResult = null;
        if (input.status === 'in_progress') {
          try {
            const { autoIssueMaterialsForBatch } = await import('./lib/autoMaterialIssue');
            autoIssueResult = await autoIssueMaterialsForBatch(input.id, batch.createdBy || 1);
            if (!autoIssueResult.success) {
              console.warn('[파이프라인] 원료 자동 출고 일부 실패:', autoIssueResult.errors);
            } else {
              console.log('[파이프라인] 원료 자동 출고 완료:', autoIssueResult.issuedMaterials.length, '건');
            }
          } catch (autoIssueError) {
            console.error('[파이프라인] 원료 자동 출고 오류:', autoIssueError);
          }
        }
        // === 파이프라인 자동화 끝 ===
        
        return {
          success: true,
          message: "배치 상태가 변경되었습니다.",
          autoIssueResult
        };
      }),
    
    // 배치 삭제
    delete: workerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getBatchById, deleteBatch } = await import("./db");
        
        // 락 체크: 완료된 배치 삭제 금지
        const batch = await getBatchById(input.id, ctx.user.tenantId);
        if (!batch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "배치를 찾을 수 없습니다."
          });
        }
        
        if (batch.status === 'completed') {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "완료된 배치는 삭제할 수 없습니다."
          });
        }
        
        await deleteBatch(input.id, ctx.user.tenantId);
        return { success: true, message: "배치가 삭제되었습니다." };
      }),
    
    // 배치 번호 자동 생성
    generateBatchCode: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { generateBatchCode } = await import("./db");
        const batchCode = await generateBatchCode(input.productId, ctx.user.tenantId);
        return { batchCode };
      }),
    
    // CCP 자동 생성
    generateCcp: workerProcedure
      .input(z.object({ 
        batchId: z.number(),
        frequency: z.enum(["daily", "weekly", "monthly"]).optional().default("daily"),
        scheduleCount: z.number().optional().default(30)
      }))
      .mutation(async ({ input }) => {
        const { generateCcpForBatch, createCcpSchedules } = await import("./db");
        const createdCcps = await generateCcpForBatch(input.batchId);
        
        // CCP 생성 후 자동으로 점검 일정 생성
        for (const ccp of createdCcps) {
          await createCcpSchedules(
            ccp.instanceId,
            input.frequency,
            new Date(),
            input.scheduleCount
          );
        }
        
        return {
          success: true,
          ccps: createdCcps,
          message: `${createdCcps.length}개의 CCP가 생성되었습니다.`
        };
      }),
    
    // 배치 비용 조회
    getCost: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const { getBatchCost } = await import("./db");
        return await getBatchCost(input.batchId);
      }),
    
    // 배치 대시보드 데이터 조회
    getDashboardData: protectedProcedure
      .query(async () => {
        const { getBatchDashboardData } = await import("./db/batchDashboard");
        return await getBatchDashboardData(ctx.user.tenantId);
      }),
    
    // 진행 중인 배치 목록
    getInProgress: protectedProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input, ctx }) => {
        const { getInProgressBatches } = await import("./db/batchDashboard");
        return await getInProgressBatches(input.limit, ctx.user.tenantId);
      }),
    
    // 완료된 배치 목록
    getCompleted: protectedProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input, ctx }) => {
        const { getCompletedBatches } = await import("./db/batchDashboard");
        return await getCompletedBatches(input.limit, ctx.user.tenantId);
      }),
    
    // 승인 대기 중인 배치 목록
    getPendingApproval: protectedProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input, ctx }) => {
        const { getPendingApprovalBatches } = await import("./db/batchDashboard");
        return await getPendingApprovalBatches(input.limit, ctx.user.tenantId);
      }),
    
    // HACCP 보고서 PDF 생성
    generateHaccpReport: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input }) => {
        try {
          console.log(`[generateHaccpReport] Starting PDF generation for batch ${input.batchId}`);
          const { generateHaccpReportPdf } = await import("./lib/generateHaccpReport");
          const pdfBuffer = await generateHaccpReportPdf(input.batchId);
          console.log(`[generateHaccpReport] PDF generated successfully, size: ${pdfBuffer.length} bytes`);
          
          if (pdfBuffer.length === 0) {
            throw new Error("Generated PDF is empty");
          }
          
          return {
            pdf: pdfBuffer.toString("base64"),
            filename: `HACCP_Report_Batch_${input.batchId}_${Date.now()}.pdf`
          };
        } catch (error) {
          console.error(`[generateHaccpReport] Error generating PDF:`, error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `PDF 생성 실패: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }),
    
    // 배치 승인 요청
    requestApproval: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getBatchById, updateBatchStatus, createAuditLog, getUsersByRole, createNotification } = await import("./db");
        
        // 배치 정보 조회
        const batch = await getBatchById(input.batchId, ctx.user.tenantId);
        if (!batch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "배치를 찾을 수 없습니다."
          });
        }
        
        // 배치 상태를 under_review로 변경
        await updateBatchStatus(input.batchId, "under_review", undefined, ctx.user.tenantId);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batch.requestApproval",
          entityType: "batch",
          entityId: input.batchId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 승인 요청: ID ${input.batchId}`,
          changes: { status: "under_review", notes: input.notes }
        });
        
        // 관리자 및 검사자에게 알림 발송
        const admins = await getUsersByRole("admin");
        const inspectors = await getUsersByRole("inspector");
        const recipients = [...admins, ...inspectors];
        
        for (const recipient of recipients) {
          await createNotification({
            userId: recipient.id,
            notificationType: "batch_approval_request",
            title: "배치 승인 요청",
            message: `${ctx.user.name}님이 배치 ${batch.batchCode}의 승인을 요청했습니다.${input.notes ? ` (참고: ${input.notes})` : ""}`,
            referenceType: "batch",
            referenceId: input.batchId,
            priority: "high"
          });
        }
        
        return {
          success: true,
          message: "승인 요청이 전송되었습니다."
        };
      }),
    
    // 배치 승인
    approve: monitorProcedure
      .input(
        z.object({
          batchId: z.number(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveBatch } = await import("./db/batchApprovals");
        const { updateBatchStatus, createAuditLog } = await import("./db");
        
        await approveBatch({
          batchId: input.batchId,
          approverId: ctx.user.id,
          notes: input.notes
        });
        
        // 배치 상태를 approved로 변경
        await updateBatchStatus(input.batchId, "approved", undefined, ctx.user.tenantId);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batch.approve",
          entityType: "batch",
          entityId: input.batchId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 승인: ID ${input.batchId}`,
          changes: { approved: true, notes: input.notes }
        });
        
        return {
          success: true,
          message: "배치가 승인되었습니다."
        };
      }),
    
    // 배치 반려
    reject: monitorProcedure
      .input(
        z.object({
          batchId: z.number(),
          rejectionReason: z.string().min(1, "반려 사유를 입력해주세요"),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { rejectBatch } = await import("./db/batchApprovals");
        const { updateBatchStatus, createAuditLog } = await import("./db");
        
        await rejectBatch({
          batchId: input.batchId,
          approverId: ctx.user.id,
          rejectionReason: input.rejectionReason,
          notes: input.notes
        });
        
        // 배치 상태를 rejected로 변경
        await updateBatchStatus(input.batchId, "rejected", undefined, ctx.user.tenantId);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batch.reject",
          entityType: "batch",
          entityId: input.batchId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 반려: ID ${input.batchId}`,
          changes: { rejected: true, reason: input.rejectionReason, notes: input.notes }
        });
        
        return {
          success: true,
          message: "배치가 반려되었습니다."
        };
      }),
    
    // 배치 승인 이력 조회
    getApprovals: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchApprovals } = await import("./db/batchApprovals");
        return await getBatchApprovals(input.batchId, ctx.user.tenantId);
      }),
    
    // 배치 승인 상태 확인
    getApprovalStatus: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchApprovalStatus } = await import("./db/batchApprovals");
        return await getBatchApprovalStatus(input.batchId, ctx.user.tenantId);
      }),
    
    // 여러 배치 비용 요약 조회
    getCostSummary: protectedProcedure
      .input(z.object({ batchIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        const { getBatchCostSummary } = await import("./db");
        return await getBatchCostSummary(input.batchIds);
      }),
    
    // 배치 수익성 조회
    getProfitability: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const { getBatchProfitability } = await import("./db");
        return await getBatchProfitability(input.batchId);
      }),
    
    // 제품별 수익성 통계 조회
    getProfitabilityByProduct: protectedProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input }) => {
        const { getProfitabilityByProduct } = await import("./db");
        return await getProfitabilityByProduct(input);
      }),
    
    // 배치 매출액 업데이트
    updateRevenue: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          revenue: z.number()
        })
      )
      .mutation(async ({ input }) => {
        const { updateBatchRevenue } = await import("./db");
        return await updateBatchRevenue(input.batchId, input.revenue);
      }),
    
    // 월별 수익률 추이 조회
    getProfitabilityTrendByMonth: protectedProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input }) => {
        const { getProfitabilityTrendByMonth } = await import("./db");
        return await getProfitabilityTrendByMonth(input.startDate, input.endDate);
      }),
    
    // 분기별 수익률 추이 조회
    getProfitabilityTrendByQuarter: protectedProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input }) => {
        const { getProfitabilityTrendByQuarter } = await import("./db");
        return await getProfitabilityTrendByQuarter(input.startDate, input.endDate);
      }),
    
    // 배치 수익성 예측 (지수 평활법 + 트렌드 기반)
    getProfitabilityForecast: protectedProcedure
      .query(async () => {
        const { getProfitabilityForecast } = await import("./db");
        return await getProfitabilityForecast();
      }),
    
    // 예측값 저장
    saveForecast: protectedProcedure
      .input(z.object({
        targetMonth: z.string(),
        predictedRevenue: z.number(),
        predictedCost: z.number(),
        predictedProfitMargin: z.number()
      }))
      .mutation(async ({ input }) => {
        const { saveProfitabilityForecast } = await import("./db");
        return await saveProfitabilityForecast(input);
      }),
    
    // 과거 예측값 조회
    getForecastHistory: protectedProcedure
      .query(async () => {
        const { getProfitabilityForecastHistory } = await import("./db");
        return await getProfitabilityForecastHistory();
      }),
    
    // 실제값 업데이트
    updateActualProfitability: protectedProcedure
      .input(z.object({
        targetMonth: z.string(),
        actualRevenue: z.number(),
        actualCost: z.number(),
        actualProfitMargin: z.number()
      }))
      .mutation(async ({ input }) => {
        const { updateActualProfitability } = await import("./db");
        return await updateActualProfitability(input);
      }),
    
    // 활성 배치 목록 조회 (실시간 모니터링용)
    getActiveBatches: protectedProcedure.query(async () => {
      const { getActiveBatches } = await import("./db");
      return await getActiveBatches(ctx.user.tenantId);
    }),
    
    // 배치 완성도 체크 (미작성 문서 추적)
    checkCompletion: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { checkBatchCompletion } = await import("./db/batchCompletion");
        return await checkBatchCompletion(input.batchId, ctx.user.tenantId);
      }),
    
    // 배치 완료 전 체크리스트 확인
    checkCompletionReadiness: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const { checkBatchCompletionReadiness } = await import("./db");
        return await checkBatchCompletionReadiness(input.batchId);
      }),
    
    // 배치 완료 (admin 또는 관리자만 가능)
    complete: protectedProcedure
      .input(
        z.object({
          batchId: z.number(),
          actualQuantity: z.number().min(0, "실제 생산량은 0 이상이어야 합니다"),
          defectQuantity: z.number().min(0).optional(),
          revenue: z.number().min(0).optional(),
          completionNotes: z.string().optional(),
          idempotencyKey: z.string().min(1, "idempotency 키는 필수입니다")
        })
      )
      .mutation(async ({ input, ctx }) => {
        // admin 역할 검증
        if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "배치 완료는 관리자만 수행할 수 있습니다."
          });
        }
        
        const { createAuditLog, completeBatch } = await import("./db");
        const { notifyOwner } = await import("./_core/notification");
        
        try {
          // 1. 배치 완료 처리 (재고 정산, 원가 확정, CCP 종결, idempotency 키 검증)
          const result = await completeBatch({
            batchId: input.batchId,
            actualQuantity: input.actualQuantity,
            defectQuantity: input.defectQuantity,
            revenue: input.revenue,
            completionNotes: input.completionNotes,
            idempotencyKey: input.idempotencyKey
          });
          
          // 2. 감사 로그 기록
          await createAuditLog({
            action: "batch.complete",
            entityType: "batch",
            entityId: input.batchId,
            userId: ctx.user.id,
            userEmail: ctx.user.email,
            userRole: ctx.user.role,
            description: `배치 완료: ID ${input.batchId}, 실제 생산량 ${input.actualQuantity}`,
            changes: {
              actualQuantity: input.actualQuantity,
              defectQuantity: input.defectQuantity,
              revenue: input.revenue,
              completionNotes: input.completionNotes
            }
          });
          
          // 3. 알림 생성 (비동기, 실패 시 재시도 큐에 추가)
          try {
            await notifyOwner({
              title: "배치 생산 완료",
              content: `배치 ID ${input.batchId}가 완료되었습니다. 실제 생산량: ${input.actualQuantity}`
            });
          } catch (notifyError) {
            console.error("[배치 완료] 알림 생성 실패:", notifyError);
            // 재시도 큐에 추가
            try {
              const { addRetryTask } = await import("./db/batchCompletionRetries");
              await addRetryTask({
                batchId: input.batchId,
                taskType: "notification",
                errorMessage: notifyError instanceof Error ? notifyError.message : "알림 생성 실패"
              });
            } catch (retryError) {
              console.error("[배치 완료] 재시도 큐 추가 실패:", retryError);
            }
          }
          
          // 4. PDF 자동 생성 (비동기, 실패 시 재시도 큐에 추가)
          let pdfGenerated = false;
          let pdfUrl: string | null = null;
          try {
            const { generateHaccpReportPdf } = await import("./lib/generateHaccpReport");
            const pdfBuffer = await generateHaccpReportPdf(input.batchId);
            
            // PDF를 S3에 업로드
            const { storagePut } = await import("./storage");
            const timestamp = Date.now();
            const fileKey = `tenant-${ctx.user.tenantId}/haccp-reports/batch-${input.batchId}-${timestamp}.pdf`;
            const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
            pdfUrl = url;
            pdfGenerated = true;
            
            // PDF 생성 성공 로그 저장
            if (pdfUrl) {
              try {
                const { logPdfSuccess } = await import("./db/batchPdfLogs");
                await logPdfSuccess(input.batchId, pdfUrl, ctx.user.tenantId);
              } catch (logError) {
                console.error("[배치 완료] PDF 성공 로그 저장 실패:", logError);
              }
            }
          } catch (pdfError) {
            console.error("[배치 완료] PDF 생성 실패:", pdfError);
            
            // PDF 생성 실패 로그 저장
            try {
              const { logPdfFailure } = await import("./db/batchPdfLogs");
              await logPdfFailure(
                input.batchId,
                pdfError instanceof Error ? pdfError.message : "PDF 생성 실패"
              , ctx.user.tenantId);
            } catch (logError) {
              console.error("[배치 완료] PDF 실패 로그 저장 실패:", logError);
            }
            
            // 재시도 큐에 추가
            try {
              const { addRetryTask } = await import("./db/batchCompletionRetries");
              await addRetryTask({
                batchId: input.batchId,
                taskType: "pdf_generation",
                errorMessage: pdfError instanceof Error ? pdfError.message : "PDF 생성 실패"
              });
            } catch (retryError) {
              console.error("[배치 완료] 재시도 큐 추가 실패:", retryError);
            }
          }
          
          // === 파이프라인 자동화: 일일일지 + 승인 자동 등록 ===
          let dailyReportResult = null;
          let approvalResult = null;
          
          // 단절 3: 일일일지 자동 생성
          try {
            const { autoGenerateDailyReport } = await import('./lib/autoDailyReport');
            dailyReportResult = await autoGenerateDailyReport(input.batchId, ctx.user.id);
            console.log('[파이프라인] 일일일지:', dailyReportResult.message);
          } catch (dailyError) {
            console.error('[파이프라인] 일일일지 생성 오류:', dailyError);
          }
          
          // 단절 4-1: 법적 선행 체크리스트 자동생성
          let checklistResult = null;
          try {
            const batch = await getBatchById(input.batchId, ctx.user.tenantId);
            if (batch) {
              const today = new Date().toISOString().split('T')[0];
              const { sql: rawSql } = await import("drizzle-orm");
              const dbConn = await (await import("./db")).getDb();
              if (dbConn) {
                // 해당 날짜에 이미 생성된 체크리스트가 있는지 확인
                const existing = await dbConn.execute(rawSql`
                  SELECT id FROM h_daily_checklists 
                  WHERE site_id = ${batch.siteId || 1} 
                    AND check_date = ${today} 
                    AND tenant_id = ${ctx.user.tenantId}
                  LIMIT 1
                `);
                
                const existingRows = (existing as any)[0] || [];
                
                if (existingRows.length === 0) {
                  // 일일 체크리스트 자동 생성
                  const insertRes = await dbConn.execute(rawSql`
                    INSERT INTO h_daily_checklists (site_id, check_date, shift, area, status, notes, tenant_id)
                    VALUES (${batch.siteId || 1}, ${today}, 'day', '생산구역', 'pending', 
                            ${JSON.stringify({ batchId: input.batchId, autoGenerated: true })}, 
                            ${ctx.user.tenantId})
                  `);
                  
                  const checklistId = Number((insertRes as any)[0]?.insertId || 0);
                  
                  // 기본 체크리스트 항목 자동 생성 (HACCP 법적 선행요건)
                  const defaultItems = [
                    '작업장 위생 상태 확인',
                    '작업자 개인위생 확인 (건강상태, 복장)',
                    '설비 작동 상태 확인',
                    '금속검출기 작동 확인',
                    '냉장/냉동고 온도 확인',
                    '작업장 온/습도 확인',
                    '이물 혼입 방지 확인',
                    '원재료 입고 검수 확인',
                    '용수(물) 검사 확인',
                    '방충/방서 관리 확인',
                  ];
                  
                  for (let i = 0; i < defaultItems.length; i++) {
                    await dbConn.execute(rawSql`
                      INSERT INTO h_daily_checklist_items (checklist_id, item_name, result, sort_order, tenant_id)
                      VALUES (${checklistId}, ${defaultItems[i]}, NULL, ${i + 1}, ${ctx.user.tenantId})
                    `);
                  }
                  
                  checklistResult = { success: true, checklistId, message: '일일 체크리스트 자동 생성 완료' };
                  console.log('[파이프라인] 체크리스트 자동생성:', checklistId);
                } else {
                  checklistResult = { success: true, checklistId: existingRows[0].id, message: '기존 체크리스트 사용' };
                  console.log('[파이프라인] 기존 체크리스트 사용:', existingRows[0].id);
                }
              }
            }
          } catch (checklistError) {
            console.error('[파이프라인] 체크리스트 자동생성 오류:', checklistError);
          }
          
          // 단절 4: 승인 대기 문서 자동 등록
          try {
            const { autoCreateApprovalRequest } = await import('./lib/autoApprovalRequest');
            approvalResult = await autoCreateApprovalRequest(input.batchId, ctx.user.id, pdfUrl);
            console.log('[파이프라인] 승인 요청:', approvalResult.message);
          } catch (approvalError) {
            console.error('[파이프라인] 승인 요청 생성 오류:', approvalError);
          }
          // === 파이프라인 자동화 끝 ===
          
          
          // === 원료수불부 사용 연동 ===
          try {
            const { onBatchCompleted } = await import("./db/materialLedger");
            const completionDate = new Date().toISOString().split("T")[0];
            await onBatchCompleted({
              batchId: input.batchId,
              completionDate,
            }, ctx.user.tenantId);
            console.log("[원료수불부] 배치 사용 반영 완료:", input.batchId);
          } catch (ledgerError) {
            console.error("[원료수불부] 배치 사용 반영 실패:", ledgerError);
          }
          return {
            success: true,
            message: "배치가 성공적으로 완료되었습니다.",
            data: {
              ...result,
              pdfGenerated,
              dailyReportResult,
              checklistResult,
              approvalResult
            }
          };
        } catch (error) {
          console.error("[배치 완료] 오류:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "배치 완료 중 오류가 발생했습니다."
          });
        }
      }),
    
    // 원재료별 원가 비중 집계
    getMaterialCostBreakdown: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        productId: z.number().optional(),
        status: z.string().optional()
      }))
      .query(async ({ ctx, input }) => {
        const { getMaterialCostBreakdown } = await import("./db");
        
        if (!ctx.user.siteId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "siteId가 없습니다."
          });
        }
        
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        
        const result = await getMaterialCostBreakdown({
          siteId: ctx.user.siteId,
          startDate,
          endDate,
          productId: input.productId,
          status: input.status
        });
        
        return result;
      }),

    // 배치 비용 분석
    getCostAnalysis: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional()
      }))
      .query(async ({ input }) => {
        const { getBatchCostAnalysis } = await import("./db/batchCostAnalysis");
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getBatchCostAnalysis({ startDate, endDate, limit: input.limit });
      }),

    // 특정 배치의 원재료별 비용 분석
    getMaterialCostBreakdownByBatch: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchMaterialCostBreakdown } = await import("./db/batchCostAnalysis");
        return await getBatchMaterialCostBreakdown(input.batchId, ctx.user.tenantId);
      }),

    // 기간별 비용 분석 집계
    getCostAnalysisPeriodSummary: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        groupBy: z.enum(["month", "week", "day"])
      }))
      .query(async ({ input }) => {
        const { getCostAnalysisPeriodSummary } = await import("./db/batchCostAnalysis");
        return await getCostAnalysisPeriodSummary({
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          groupBy: input.groupBy
        });
      }),

    // 원재료별 비용 분석
    getMaterialCostAnalysis: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }))
      .query(async ({ input }) => {
        const { getMaterialCostAnalysis } = await import("./db/batchCostAnalysis");
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getMaterialCostAnalysis({ startDate, endDate });
      }),
    
    // 배치 원가율 계산
    getCostRate: workerProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { calculateBatchCost } = await import("./db/batchCostCalculation");
        return await calculateBatchCost(input.batchId, ctx.user.tenantId);
      })
  }),

  // 배치 일정 캘린더
  batchSchedule: router({
    // 배치 일정 생성
    create: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          scheduledDate: z.date(),
          status: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createBatchSchedule } = await import("./db/batchSchedules");
        const { createAuditLog } = await import("./db");
        
        const schedule = await createBatchSchedule(input);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batchSchedule.create",
          entityType: "batch_schedule",
          entityId: input.batchId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 일정 생성: 배치 ID ${input.batchId}`,
          changes: { created: input }
        });
        
        return {
          success: true,
          schedule,
          message: "배치 일정이 생성되었습니다."
        };
      }),
    
    // 날짜 범위로 배치 일정 조회
    list: protectedProcedure
      .input(
        z.object({
          startDate: z.date(),
          endDate: z.date()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getBatchSchedulesByDateRange } = await import("./db/batchSchedules");
        return await getBatchSchedulesByDateRange(input.startDate, input.endDate, ctx.user.tenantId);
      }),
    
    // 배치 ID로 일정 조회
    getByBatchId: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const { getBatchSchedulesByBatchId } = await import("./db/batchSchedules");
        return await getBatchSchedulesByBatchId(input.batchId);
      }),
    
    // 배치 일정 수정
    update: workerProcedure
      .input(
        z.object({
          id: z.number(),
          scheduledDate: z.date().optional(),
          status: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateBatchSchedule } = await import("./db/batchSchedules");
        const { createAuditLog } = await import("./db");
        
        const { id, ...updateData } = input;
        await updateBatchSchedule(id, updateData);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batchSchedule.update",
          entityType: "batch_schedule",
          entityId: id,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 일정 수정: ID ${id}`,
          changes: { updated: updateData }
        });
        
        return {
          success: true,
          message: "배치 일정이 수정되었습니다."
        };
      }),
    
    // 배치 일정 삭제
    delete: workerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteBatchSchedule } = await import("./db/batchSchedules");
        const { createAuditLog } = await import("./db");
        
        await deleteBatchSchedule(input.id);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batchSchedule.delete",
          entityType: "batch_schedule",
          entityId: input.id,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 일정 삭제: ID ${input.id}`,
          changes: { deleted: true }
        });
        
        return {
          success: true,
          message: "배치 일정이 삭제되었습니다."
        };
      })
  }),

   product: router({
    list: protectedProcedure
      .input(
        z.object({
          page: z.number().default(1),
          limit: z.number().default(20),
          search: z.string().optional(),
          category: z.string().optional(),
          sortBy: z.enum(["productCode", "productName", "category", "createdAt"]).optional(),
          sortOrder: z.enum(["asc", "desc"]).optional()
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../drizzle/schema_main.js");
        
        const page = input?.page || 1;
        const limit = input?.limit || 20;
        const offset = (page - 1) * limit;
        
        const conditions = [eq(hProductsV2.tenantId, ctx.user.tenantId), eq(hProductsV2.isActive, 1)];
        
        if (input?.search) {
          conditions.push(
            or(
              like(hProductsV2.productName, `%${input.search}%`),
              like(hProductsV2.productCode, `%${input.search}%`)
            )!
          );
        }
        if (input?.category) {
          conditions.push(eq(hProductsV2.category, input.category));
        }
        
        const totalResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(hProductsV2)
          .where(and(...conditions));
        const total = Number(totalResult[0]?.count || 0);
        
        const orderByClause = input?.sortBy === "productCode"
          ? (input?.sortOrder === "desc" ? desc(hProductsV2.productCode) : asc(hProductsV2.productCode))
          : input?.sortBy === "productName"
          ? (input?.sortOrder === "desc" ? desc(hProductsV2.productName) : asc(hProductsV2.productName))
          : input?.sortBy === "category"
          ? (input?.sortOrder === "desc" ? desc(hProductsV2.category) : asc(hProductsV2.category))
          : desc(hProductsV2.createdAt);
        
        const items = await db
          .select()
          .from(hProductsV2)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset)
          .orderBy(orderByClause);
        
        return { items, total, page, limit };
      }),
    // 제품 전체 내보내기 (엑셀 다운로드용)
    exportAll: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../drizzle/schema_main.js");
        
        const items = await db
          .select()
          .from(hProductsV2)
          .where(and(
            eq(hProductsV2.tenantId, ctx.user.tenantId),
            eq(hProductsV2.isActive, 1)
          ))
          .orderBy(asc(hProductsV2.productCode));
        
        return { items, total: items.length };
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getProductById } = await import("./db.js");
        return await getProductById(input.id);
      }),
    updateCcpMapping: protectedProcedure
      .input(
        z.object({
          productId: z.number(),
          ccpTypes: z.array(z.string())
        })
      )
      .mutation(async ({ input }) => {
        const { updateProductCcpMapping } = await import("./db.js");
        await updateProductCcpMapping(input.productId, input.ccpTypes);
        return { success: true };
      }),
    create: adminProcedure
      .input(
        z.object({
          productName: z.string().min(1),
          productCode: z.string().min(1),
          category: z.string().optional(),
          unit: z.string().optional(),
          shelfLifeMonths: z.number().optional(),
          description: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../drizzle/schema_main.js");
        const { shelfLifeMonths, ...rest } = input;
        const shelfLifeDays = shelfLifeMonths ? shelfLifeMonths * 30 : undefined;
        const result = await db.insert(hProductsV2).values({
          ...rest,
          shelfLifeDays,
          tenantId: ctx.user.tenantId,
          isActive: input.isActive ?? 1,
        });
        const newProductId = Number(result[0].insertId);
        
        // item_master 테이블에도 동기화 생성
        try {
          const { itemMaster } = await import("../drizzle/schema/schema_dual_unit.js");
          await db.insert(itemMaster).values({
            tenantId: ctx.user.tenantId,
            itemCode: input.productCode,
            itemName: input.productName,
            itemType: 'own_product',
            category: input.category || null,
            baseUnit: input.unit || 'kg',
            shelfLifeDays: shelfLifeDays || null,
            description: input.description || null,
            legacyProductId: newProductId,
            isActive: input.isActive ?? 1,
          });
        } catch (syncErr) {
          console.error('item_master 동기화 생성 실패:', syncErr);
        }
        
        return { success: true, id: newProductId };
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          productName: z.string().optional(),
          productCode: z.string().optional(),
          category: z.string().optional(),
          unit: z.string().optional(),
          shelfLifeMonths: z.number().optional(),
          description: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../drizzle/schema_main.js");
        const { id, shelfLifeMonths, ...rest } = input;
        const shelfLifeDays = shelfLifeMonths ? shelfLifeMonths * 30 : undefined;
        const updateData: any = { ...rest };
        if (shelfLifeDays !== undefined) updateData.shelfLifeDays = shelfLifeDays;
        await db.update(hProductsV2).set(updateData).where(eq(hProductsV2.id, id));
        
        // item_master 테이블 동기화 (legacyProductId로 연결)
        try {
          const { itemMaster } = await import("../drizzle/schema/schema_dual_unit.js");
          const syncData: any = {};
          if (rest.productName) syncData.itemName = rest.productName;
          if (rest.category) syncData.category = rest.category;
          if (rest.unit) syncData.baseUnit = rest.unit;
          if (rest.productCode) syncData.itemCode = rest.productCode;
          if (shelfLifeDays !== undefined) syncData.shelfLifeDays = shelfLifeDays;
          if (Object.keys(syncData).length > 0) {
            await db.update(itemMaster).set(syncData).where(
              and(eq(itemMaster.legacyProductId, id), eq(itemMaster.tenantId, ctx.user.tenantId))
            );
          }
        } catch (syncErr) {
          console.error('item_master 동기화 실패:', syncErr);
        }
        
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../drizzle/schema_main.js");
        await db.update(hProductsV2).set({ isActive: 0 }).where(and(eq(hProductsV2.id, input.id), eq(hProductsV2.tenantId, ctx.user.tenantId)));
        
        // item_master 동기화 (비활성화)
        try {
          const { itemMaster } = await import("../drizzle/schema/schema_dual_unit.js");
          await db.update(itemMaster).set({ isActive: 0 }).where(
            and(eq(itemMaster.legacyProductId, input.id), eq(itemMaster.tenantId, ctx.user.tenantId))
          );
        } catch (syncErr) {
          console.error('item_master 동기화 실패:', syncErr);
        }
        
        return { success: true };
      }),

    // 자동 코드 생성
    generateCode: protectedProcedure
      .query(async ({ ctx }) => {
        const { generateProductCode } = await import("./db/codeGenerator.js");
        return await generateProductCode(ctx.user.tenantId);
      }),

    // 일괄 등록 (UPSERT - 동일 제품명 있으면 수정, 없으면 신규)
    bulkCreate: adminProcedure
      .input(
        z.object({
          products: z.array(
            z.object({
              productCode: z.string().optional(),
              productName: z.string().min(1),
              category: z.string().optional(),
              unit: z.string().optional(),
              shelfLifeMonths: z.number().optional(),
              description: z.string().optional()
            })
          )
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../drizzle/schema_main.js");
        const { createUploadHistory } = await import("./db/uploadHistory.js");
        
        const results = { successCount: 0, insertCount: 0, updateCount: 0, failureCount: 0, errors: [] as any[] };
        
        // 현재 최대 코드 번호 조회
        const maxResult = await db.execute(sql`SELECT MAX(CAST(SUBSTRING(product_code, 5) AS UNSIGNED)) as maxNum FROM h_products_v2 WHERE tenant_id = ${ctx.user.tenantId} AND product_code REGEXP '^PRD-[0-9]+$'`);
        let codeCounter = Number((maxResult as any)[0]?.[0]?.maxNum || (maxResult as any)[0]?.maxNum || 0);
        
        for (let i = 0; i < input.products.length; i++) {
          try {
            const product = input.products[i];
            if (!product.productName?.trim()) {
              results.errors.push({ row: i + 2, productName: "", message: "제품명이 비어있습니다" });
              results.failureCount++;
              continue;
            }
            
            const existing = await db.select().from(hProductsV2)
              .where(and(eq(hProductsV2.tenantId, ctx.user.tenantId), eq(hProductsV2.productName, product.productName.trim())))
              .limit(1);
            
            const shelfLifeDays = product.shelfLifeMonths ? product.shelfLifeMonths * 30 : undefined;
            
            if (existing.length > 0) {
              const updateData: any = {};
              if (product.category !== undefined) updateData.category = product.category;
              if (product.unit !== undefined) updateData.unit = product.unit;
              if (shelfLifeDays !== undefined) updateData.shelfLifeDays = shelfLifeDays;
              if (product.description !== undefined) updateData.description = product.description;
              
              if (Object.keys(updateData).length > 0) {
                await db.update(hProductsV2).set(updateData).where(eq(hProductsV2.id, existing[0].id));
              }
              results.updateCount++;
            } else {
              codeCounter++;
              const productCode = "PRD-" + String(codeCounter).padStart(3, "0");
              
              const insertResult = await db.insert(hProductsV2).values({
                tenantId: ctx.user.tenantId,
                productCode: product.productCode || productCode,
                productName: product.productName.trim(),
                category: product.category || null,
                unit: product.unit || null,
                shelfLifeDays: shelfLifeDays || null,
                description: product.description || null,
              });
              
              // item_master 동기화
              try {
                const { itemMaster } = await import("../drizzle/schema/schema_dual_unit.js");
                await db.insert(itemMaster).values({
                  tenantId: ctx.user.tenantId,
                  itemCode: productCode,
                  itemName: product.productName.trim(),
                  itemType: 'own_product',
                  category: product.category || null,
                  baseUnit: product.unit || 'kg',
                  shelfLifeDays: shelfLifeDays || null,
                  description: product.description || null,
                  legacyProductId: Number(insertResult[0].insertId),
                  isActive: 1,
                });
              } catch (syncErr) {
                console.error('item_master 동기화 실패 (bulkCreate):', syncErr);
              }
              results.insertCount++;
            }
            results.successCount++;
          } catch (error: any) {
            results.failureCount++;
            results.errors.push({ row: i + 2, productName: input.products[i].productName, message: error.message || "등록 실패" });
          }
        }
        
        await createUploadHistory({
          uploadType: "product",
          userId: ctx.user.id,
          userName: ctx.user.name,
          fileName: "Excel Upload",
          totalCount: input.products.length,
          successCount: results.successCount,
          errorCount: results.failureCount,
          errors: results.errors
        });
        
        return results;
      }),
  }),

  
  // 레시피 (품목제조보고) - 기존 함수 유지
  recipe: router({
    // 제품 ID로 레시피 조회
    getByProductId: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => {
        const { getRecipeByProductId } = await import("./db");
        return await getRecipeByProductId(input.productId);
      }),
    
    // 레시피 ID로 원재료 목록 조회
    getMaterialsByRecipeId: protectedProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input }) => {
        const { getMaterialsByRecipeId } = await import("./db");
        return await getMaterialsByRecipeId(input.recipeId);
      })
  }),
  
  // 레시피 관리 (품목제조보고서)
  recipeManagement: router({
    // 레시피 목록 조회
    list: protectedProcedure
      .input(z.object({
        productId: z.number().optional(),
        isActive: z.boolean().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getRecipes } = await import("./db/recipe");
        return await getRecipes({ ...input, tenantId: ctx.user.tenantId });
      }),
    
    // 레시피 상세 조회 (라인 포함)
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getRecipeById } = await import("./db/recipe");
        const recipe = await getRecipeById(input.id, ctx.user.tenantId);
        if (!recipe) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "레시피를 찾을 수 없습니다."
          });
        }
        return recipe;
      }),
    
    // 제품별 레시피 조회
    getByProduct: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getRecipesByProductId } = await import("./db/recipe");
        return await getRecipesByProductId(input.productId, ctx.user.tenantId);
      }),
    
    // 레시피 생성
    create: adminProcedure
      .input(z.object({
        productId: z.number(),
        recipeName: z.string().min(1, "레시피 이름은 필수입니다"),
        version: z.string().default("1.0"),
        description: z.string().optional(),
        batchSize: z.string(),
        batchUnit: z.string().default("kg"),
        yieldRate: z.string().optional(),
        preparationTime: z.number().optional(),
        cookingTime: z.number().optional(),
        totalTime: z.number().optional(),
        lines: z.array(
          z.object({
            materialId: z.number(),
            quantity: z.string(),
            unit: z.string(),
            percentage: z.string().optional(),
            sortOrder: z.number().default(0),
            notes: z.string().optional()
          })
        )
      }))
      .mutation(async ({ input, ctx }) => {
        const { createRecipe } = await import("./db/recipe");
        return await createRecipe({
          ...input,
          createdBy: ctx.user.id,
          tenantId: ctx.user.tenantId
        });
      }),
    
    // 레시피 수정
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        recipeName: z.string().optional(),
        version: z.string().optional(),
        description: z.string().optional(),
        batchSize: z.string().optional(),
        batchUnit: z.string().optional(),
        yieldRate: z.string().optional(),
        preparationTime: z.number().optional(),
        cookingTime: z.number().optional(),
        totalTime: z.number().optional(),
        isActive: z.number().optional(),
        lines: z.array(
          z.object({
            id: z.number().optional(),
            materialId: z.number(),
            quantity: z.string(),
            unit: z.string(),
            percentage: z.string().optional(),
            sortOrder: z.number().default(0),
            notes: z.string().optional()
          })
        ).optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateRecipe, createRecipeVersion } = await import("./db/recipe");
        const { id, lines, ...recipeData } = input;
        
        // 버전 이력 생성
        if (input.version) {
          await createRecipeVersion({
            recipeId: id,
            version: input.version,
            changeDescription: "레시피 수정",
            createdBy: ctx.user.id
          });
        }
        
        return await updateRecipe(id, recipeData, lines);
      }),
    
    // 레시피 삭제 (소프트 삭제)
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteRecipe } = await import("./db/recipe");
        await deleteRecipe(input.id, ctx.user.tenantId);
        
        // 감사 로그 기록
        const { createAuditLog } = await import("./db");
        await createAuditLog({
          action: "recipe.delete",
          entityType: "recipe",
          entityId: input.id,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `레시피 삭제: ${input.id}`,
          changes: { deleted: true }
        });
        
        return { success: true, message: "레시피가 삭제되었습니다" };
      }),
    
    // 레시피 버전 이력 조회
    getVersions: protectedProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input }) => {
        const { getRecipeVersions } = await import("./db/recipe");
        return await getRecipeVersions(input.recipeId);
      }),
    
    // 레시피 복제
    duplicate: adminProcedure
      .input(z.object({
        id: z.number(),
        newRecipeName: z.string().min(1, "새 레시피 이름은 필수입니다")
      }))
      .mutation(async ({ input, ctx }) => {
        const { duplicateRecipe } = await import("./db/recipe");
        return await duplicateRecipe(input.id, input.newRecipeName, ctx.user.id, ctx.user.tenantId);
      }),
    
    // 레시피 활성화/비활성화
    toggleActive: adminProcedure
      .input(z.object({
        id: z.number(),
        isActive: z.boolean()
      }))
      .mutation(async ({ input }) => {
        const { updateRecipe } = await import("./db/recipe");
        await updateRecipe(input.id, { isActive: input.isActive ? 1 : 0 });
        return { success: true };
      })
  }),
  
  // 원가 분석 (Cost Analysis)
  costAnalysis: router({
    // 레시피 기반 원가 계산
    calculateRecipeCost: protectedProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input }) => {
        const { calculateRecipeCost } = await import("./api/costAnalysis");
        return await calculateRecipeCost(input.recipeId);
      }),
    
    // 제품별 원가 통계
    getProductCostStats: protectedProcedure
      .input(z.object({ productId: z.number().optional() }))
      .query(async ({ input }) => {
        const { calculateProductCostStats } = await import("./api/costAnalysis");
        return await calculateProductCostStats(input.productId);
      })
  }),
  
  // CCP (Critical Control Point)
  ccp: router({
    // 배치별 CCP 인스턴스 조회
    getByBatchId: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const { getCcpInstancesByBatchId } = await import("./db");
        return await getCcpInstancesByBatchId(input.batchId);
      }),
    
    // CCP 인스턴스 상세 조회
    getInstanceById: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input }) => {
        const { getCcpInstanceById } = await import("./db");
        return await getCcpInstanceById(input.instanceId);
      }),
    
    // CCP 인스턴스별 점검 행 조회
    getRowsByInstanceId: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input }) => {
        const { getCcpRowsByInstanceId } = await import("./db");
        return await getCcpRowsByInstanceId(input.instanceId);
      }),
    
    // CCP 템플릿 조회 (ccpType으로)
    getTemplateByType: protectedProcedure
      .input(z.object({ ccpType: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getCcpTemplates, getCcpTemplateRows } = await import("./db/batch");
        const templates = await getCcpTemplates({ ccpType: input.ccpType, isActive: true, tenantId: ctx.user.tenantId });
        if (templates.length === 0) return null;
        
        const template = templates[0];
        const rows = await getCcpTemplateRows(template.id);
        
        return {
          ...template,
          rows
        };
      }),
    
    // CCP 점검 행 생성
    createRow: workerProcedure
      .input(
        z.object({
          instanceId: z.number(),
          sortOrder: z.number().optional(),
          rowType: z.enum(["measurement", "corrective_action", "verification"]).optional(),
          measuredAt: z.date().optional(),
          tempC: z.string().optional(),
          durationMin: z.number().optional(),
          pressureBar: z.string().optional(),
          result: z.enum(["PASS", "FAIL", "N/A"]).optional(),
          note: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createCcpRow, getCcpInstanceById, createCcpDeviation, createNotification, getBatchById } = await import("./db");
        
        // CCP 점검 행 생성
        const newRow = await createCcpRow(input);
        
        // 한계기준 검사는 클라이언트 측에서 수행
        const instance = await getCcpInstanceById(input.instanceId);
        let deviationDetected = false;
        let deviationMessage = "";
        
        // 이탈 발생 시 h_ccp_deviations에 기록
        if (deviationDetected && instance && instance.batchId !== null) {
          const batch = await getBatchById(instance.batchId, ctx.user.tenantId);
          
          await createCcpDeviation({
            ccpInstanceId: input.instanceId,
            batchId: instance.batchId,
            deviationType: "critical_limit",
            criticalLimit: deviationMessage,
            actualValue: input.tempC || "",
            deviationDate: new Date(),
            createdBy: ctx.user.id,
            severity: "high",
            notes: deviationMessage
          });
          
          // 관리자 알림 생성
          await createNotification({
            userId: ctx.user.id, // 실제로는 관리자 ID를 사용해야 함
            notificationType: "ccp_deviation",
            title: "CCP 한계기준 이탈 발생",
            message: `배치 ${batch?.batchCode || instance.batchId}: ${deviationMessage}`,
            referenceType: "ccp_instance",
            referenceId: input.instanceId,
            priority: "high"
          });
        }
        
        return { success: true, message: "점검 데이터가 저장되었습니다.", deviation: deviationDetected };
      }),
    
    // CCP 점검 기록 저장 (실시간 입력)
    createRecord: workerProcedure
      .input(
        z.object({
          instanceId: z.number(),
          measuredValue: z.string(),
          result: z.enum(["pass", "fail"]),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createCcpRecord } = await import("./db/ccpRecords");
        const { getCcpInstanceById, getBatchById, createNotification } = await import("./db");
        
        const recordData = {
          measuredValue: input.measuredValue,
          result: input.result,
          inspector: ctx.user.name,
          inspectorId: ctx.user.id,
          notes: input.notes || "",
          timestamp: new Date().toISOString()
        };
        
        await createCcpRecord({
          instanceId: input.instanceId,
          recordData
        });
        
        // CCP 점검 완료 알림 발송
        const instance = await getCcpInstanceById(input.instanceId);
        if (instance && instance.batchId !== null) {
          const batch = await getBatchById(instance.batchId);
          
          // 관리자에게 알림 발송
          await createNotification({
            userId: ctx.user.id, // 실제로는 관리자 ID를 사용해야 함
            notificationType: "ccp_inspection_complete",
            title: "CCP 점검 완료",
            message: `배치 ${batch?.batchCode || instance.batchId}: ${instance.ccpType} 점검이 완료되었습니다. (판정: ${input.result === "pass" ? "적합" : "부적합"})`,
            referenceType: "ccp_instance",
            referenceId: input.instanceId,
            priority: input.result === "fail" ? "high" : "medium"
          });
        }
        
        return {
          success: true,
          message: "CCP 점검 기록이 저장되었습니다."
        };
      }),
    // CCP 점검 기록 조회
    getRecords: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCcpRecordsByInstanceId } = await import("./db/ccpRecords");
        return await getCcpRecordsByInstanceId(input.instanceId, ctx.user.tenantId);
      }),
    
    // 배치의 모    // CCP 점검 알림 생성
    createInspectionAlert: protectedProcedure
      .input(z.object({
        instanceId: z.number(),
        scheduledTime: z.date()
      }))
      .mutation(async ({ input }) => {
        const { createInspectionAlert } = await import("./db/ccpInspectionAlerts");
        return await createInspectionAlert(input);
      }),
    
    // 사용자별 대기 중인 알림 조회
    getUserPendingAlerts: protectedProcedure
      .query(async ({ ctx }) => {
        const { getUserPendingAlerts } = await import("./db/ccpInspectionAlerts");
        return await getUserPendingAlerts(ctx.user.id, ctx.user.tenantId);
      }),
    
    // 알림 완료 처리
    completeInspectionAlert: protectedProcedure
      .input(z.object({ alertId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { updateAlertStatus } = await import("./db/ccpInspectionAlerts");
        return await updateAlertStatus(input.alertId, "completed", ctx.user.tenantId);
      }),
    
    // CCP 점검 완료 여부 확인
    checkInspectionComplete: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {        const { getCcpInstancesByBatchId } = await import("./db");
        const { getCcpRecordsByInstanceId } = await import("./db/ccpRecords");
        
        // 배치의 모든 CCP 인스턴스 조회
        const instances = await getCcpInstancesByBatchId(input.batchId);
        
        if (!instances || instances.length === 0) {
          return {
            allComplete: false,
            totalCcps: 0,
            completedCcps: 0,
            passedCcps: 0,
            failedCcps: 0,
            incompleteCcps: [],
            message: "배치에 CCP가 없습니다."
          };
        }
        
        const incompleteCcps: any[] = [];
        let completedCount = 0;
        let passedCount = 0;
        let failedCount = 0;
        
        // 각 CCP 인스턴스의 점검 기록 확인
        for (const instance of instances) {
          const records = await getCcpRecordsByInstanceId(instance.id);
          
          if (!records || records.length === 0) {
            incompleteCcps.push({
              instanceId: instance.id,
              ccpType: instance.ccpType,
              reason: "점검 기록이 없습니다."
            });
          } else {
            completedCount++;
            // 가장 최근 기록의 결과 확인
            const latestRecord = records[records.length - 1];
            if (latestRecord.recordData && typeof latestRecord.recordData === 'object') {
              const data = latestRecord.recordData as any;
              if (data.result === "pass") {
                passedCount++;
              } else if (data.result === "fail") {
                failedCount++;
                incompleteCcps.push({
                  instanceId: instance.id,
                  ccpType: instance.ccpType,
                  reason: "부적합 판정"
                });
              }
            }
          }
        }
        
        const allComplete = incompleteCcps.length === 0;
        
        return {
          allComplete,
          totalCcps: instances.length,
          completedCcps: completedCount,
          passedCcps: passedCount,
          failedCcps: failedCount,
          incompleteCcps,
          message: allComplete
            ? "모든 CCP 점검이 완료되었고 적합 판정을 받았습니다."
            : `${incompleteCcps.length}개의 CCP 점검이 미완료 또는 부적합 상태입니다.`
        };
      }),
        // CCP 상태 변경
    updateStatus: workerProcedure
      .input(
        z.object({
          instanceId: z.number(),
          status: z.enum(["draft", "submitted", "approved", "rejected"])
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateCcpInstanceStatus, createAuditLog } = await import("./db");
        await updateCcpInstanceStatus(input.instanceId, input.status, ctx.user?.id);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "ccp.updateStatus",
          entityType: "ccp",
          entityId: input.instanceId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `CCP 상태 변경: ${input.status}`,
          changes: { status: input.status }
        });
        
        return { success: true, message: "상태가 변경되었습니다." };
      }),
    
    // 모든 CCP 기록 조회
    getAllRecords: protectedProcedure
      .input(
        z.object({
          ccpType: z.string().optional(),
          status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input }) => {
        const { getAllCcpRecords } = await import("./db");
        return await getAllCcpRecords(input);
      }),
    
    // CCP 이탈 건수 조회
    getDeviationCount: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input }) => {
        const { getCcpDeviationCount } = await import("./db");
        return await getCcpDeviationCount(input.instanceId);
      }),
    
    // CCP 일괄 삭제
    bulkDelete: workerProcedure
      .input(z.object({ instanceIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { deleteCcpInstances, createAuditLog } = await import("./db");
        const result = await deleteCcpInstances(input.instanceIds);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "ccp.bulkDelete",
          entityType: "ccp",
          entityId: 0,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `CCP 일괄 삭제: ${input.instanceIds.length}건`,
          changes: { deleted: input.instanceIds }
        });
        
        return {
          success: true,
          deletedCount: result.deletedCount,
          message: `${result.deletedCount}건의 CCP가 삭제되었습니다.`
        };
      }),
    
    // CCP 통계 조회
    getStats: protectedProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input }) => {
        const {
          getCcpStatsOverview,
          getCcpStatsByProduct,
          getCcpStatsByCcpType,
          getCcpStatsTrend
        } = await import("./services/ccp-stats.service");
        
        const [overview, byProduct, byCcpType, trend] = await Promise.all([
          getCcpStatsOverview(input),
          getCcpStatsByProduct(input),
          getCcpStatsByCcpType(input),
          input.startDate && input.endDate
            ? getCcpStatsTrend({ startDate: input.startDate, endDate: input.endDate })
            : Promise.resolve([]),
        ]);
        
        return {
          overview,
          byProduct,
          byCcpType,
          trend
        };
      }),
    
    // CCP 점검 이력 Excel export
    exportInspectionHistory: protectedProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          siteId: z.number().optional(),
          ccpType: z.string().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { getCcpInspectionHistory } = await import("./db");
        const { exportCcpInspectionToExcel } = await import("./services/excel-export");
        
        const data = await getCcpInspectionHistory(input);
        const buffer = await exportCcpInspectionToExcel(data);
        
        // Buffer를 Base64로 변환하여 반환
        const base64 = Buffer.from(buffer).toString('base64');
        const filename = `CCP_점검이력_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        return {
          success: true,
          file: base64,
          filename,
          message: `${data.length}건의 CCP 점검 이력이 내보내기되었습니다.`
        };
      }),
    
    // CCP 이탈 통계 조회
    getDeviationStats: protectedProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input }) => {
        const {
          getCcpDeviationStatsByMonth,
          getCcpDeviationStatsByProduct,
          getCcpDeviationStatsByCcpType
        } = await import("./db");
        
        const [byMonth, byProduct, byCcpType] = await Promise.all([
          getCcpDeviationStatsByMonth(input),
          getCcpDeviationStatsByProduct(input),
          getCcpDeviationStatsByCcpType(input),
        ]);
        
        return {
          byMonth,
          byProduct,
          byCcpType
        };
      }),
    
    // CCP 점검 준수율 통계 (월별/주별)
    getComplianceStats: protectedProcedure
      .input(
        z.object({
          period: z.enum(["weekly", "monthly"]),
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input }) => {
        const { getCcpComplianceStats } = await import("./db/ccpStats");
        return await getCcpComplianceStats(input);
      }),
    
    // CCP 이탈 건수 추이 (월별/주별)
    getDeviationTrend: protectedProcedure
      .input(
        z.object({
          period: z.enum(["weekly", "monthly"]),
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input }) => {
        const { getCcpDeviationTrend } = await import("./db/ccpStats");
        return await getCcpDeviationTrend(input);
      })
  }),
  
  // 재고 (Inventory)
  inventory: router({
    // LOT 목록 조회 (소비기한/생산일자 포함)
    listLots: protectedProcedure
      .query(async () => {
        const { getAllInventoryLotsWithDetails } = await import("./db");
        return await getAllInventoryLotsWithDetails();
      }),
    
    // 모든 재고 LOT 조회
    list: protectedProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          materialId: z.number().optional(),
          supplierId: z.number().optional(),
          search: z.string().optional()
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const { getAllInventoryLots } = await import("./db");
        return await getAllInventoryLots({ ...input, tenantId: ctx.user.tenantId });
      }),
    
    // 재고 입고 (LOT 생성)
    createLot: workerProcedure
      .input(
        z.object({
          materialId: z.number(),
          lotNumber: z.string(),
          quantity: z.string(),
          unit: z.string(),
          expiryDate: z.string().optional(),
          supplierId: z.number().optional(),
          receiptDate: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createInventoryLot } = await import("./db");
        return await createInventoryLot({
          materialId: input.materialId,
          lotNumber: input.lotNumber,
          quantity: input.quantity,
          unit: input.unit,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          supplierId: input.supplierId,
          receiptDate: input.receiptDate ? new Date(input.receiptDate) : undefined,
          userId: ctx.user?.id || 0
        });
      }),
    
    // 원재료 입고 (LOT 생성 + 재고 업데이트 + 거래 기록)
    receiveMaterial: workerProcedure
      .input(
        z.object({
          materialId: z.number(),
          quantity: z.number(),
          unit: z.string(),
          receiptDate: z.string(),
          expiryDate: z.string().optional(),
          lotNumber: z.string().optional(),
          location: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { receiveMaterial } = await import("./db");
        return await receiveMaterial({
          materialId: input.materialId,
          quantity: input.quantity,
          unit: input.unit,
          receiptDate: input.receiptDate,
          expiryDate: input.expiryDate,
          lotNumber: input.lotNumber,
          location: input.location
        });
      }),
    
    // FEFO 순서로 원재료별 LOT 조회
    getLotsByMaterialFefo: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input }) => {
        const { getLotsByMaterialFefo } = await import("./db");
        return await getLotsByMaterialFefo({ materialId: input.materialId });
      }),
    
    // 재고 거래 내역 조회
    getInventoryTransactions: protectedProcedure
      .input(
        z.object({
          materialId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input }) => {
        const { getInventoryTransactions } = await import("./db");
        return await getInventoryTransactions({
          materialId: input.materialId,
          startDate: input.startDate,
          endDate: input.endDate
        });
      }),
    
    // 원재료별 재고 LOT 조회 (FEFO 순서)
    getLotsByMaterialId: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input }) => {
        const { getInventoryLotsByMaterialId } = await import("./db");
        return await getInventoryLotsByMaterialId(input.materialId);
      }),
    
    // 원재료 투입
    addMaterialInput: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          materialId: z.number(),
          lotId: z.number(),
          quantity: z.string(),
          unit: z.string()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { addMaterialInputToBatch, notifyLowStock } = await import("./db");
        await addMaterialInputToBatch({
          batchId: input.batchId,
          materialId: input.materialId,
          lotId: input.lotId,
          quantity: input.quantity,
          unit: input.unit,
          userId: ctx.user?.id || 0
        });
        
        // 재고 부족 감지 및 알림
        await notifyLowStock(input.materialId);
        
        return { success: true, message: "원재료가 투입되었습니다" };
      }),
    
    // 배치별 원재료 투입 내역 조회
    getBatchInputs: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const { getBatchMaterialInputs } = await import("./db");
        return await getBatchMaterialInputs(input.batchId);
      }),
    
    // 원재료 투입 수정
    updateMaterialInput: workerProcedure
      .input(
        z.object({
          inputId: z.number(),
          quantity: z.string().optional(),
          lotId: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateMaterialInput, createAuditLog } = await import("./db");
        await updateMaterialInput(input.inputId, {
          quantity: input.quantity,
          lotId: input.lotId
        });
        
        // 감사 로그 기록
        await createAuditLog({
          action: "material_input.update",
          entityType: "material_input",
          entityId: input.inputId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `원재료 투입 수정: ${input.inputId}`,
          changes: { updated: input }
        });
        
        return { success: true, message: "원재료 투입이 수정되었습니다" };
      }),
    
    // 원재료 투입 삭제
    deleteMaterialInput: workerProcedure
      .input(z.object({ inputId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteMaterialInput, createAuditLog } = await import("./db");
        await deleteMaterialInput(input.inputId);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "material_input.delete",
          entityType: "material_input",
          entityId: input.inputId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `원재료 투입 삭제: ${input.inputId}`,
          changes: { deleted: true }
        });
        
        return { success: true, message: "원재료 투입이 삭제되었습니다" };
      }),
    
    // 재고 부족 원재료 조회
    getLowStock: protectedProcedure
      .query(async () => {
        const { getLowStockMaterials } = await import("./db");
        return await getLowStockMaterials();
      }),
    
    // 원재료별 입출고 이력 조회
    getTransactionHistory: protectedProcedure
      .input(
        z.object({
          materialId: z.number(),
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input }) => {
        const { getMaterialTransactionHistory } = await import("./db");
        return await getMaterialTransactionHistory(input.materialId, {
          startDate: input.startDate,
          endDate: input.endDate
        });
      }),
    
    // 재고 회전율 계산
    getTurnoverRate: protectedProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input }) => {
        const { getInventoryTurnoverRate } = await import("./db");
        return await getInventoryTurnoverRate({
          startDate: input.startDate,
          endDate: input.endDate
        });
      }),
    
    // 장기 재고 항목 식별
    getSlowMovingItems: protectedProcedure
      .input(
        z.object({
          thresholdDays: z.number().optional()
        })
      )
      .query(async ({ input }) => {
        const { getSlowMovingItems } = await import("./db");
        return await getSlowMovingItems(input.thresholdDays);
      }),
    
    // 재고 회전율 알림 생성
    createTurnoverAlert: adminProcedure
      .input(
        z.object({
          materialId: z.number(),
          turnoverRate: z.number(),
          thresholdRate: z.number()
        })
      )
      .mutation(async ({ input }) => {
        const { createInventoryTurnoverAlert } = await import("./db.js");
        return await createInventoryTurnoverAlert(
          input.materialId,
          input.turnoverRate,
          input.thresholdRate
        );
      }),
    
    // 재고 회전율 임계값 설정
    setTurnoverThreshold: adminProcedure
      .input(
        z.object({
          materialId: z.number(),
          thresholdRate: z.number(),
          alertEnabled: z.boolean().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { setInventoryTurnoverThreshold } = await import("./db.js");
        return await setInventoryTurnoverThreshold(
          input.materialId,
          input.thresholdRate,
          input.alertEnabled ?? true
        );
      }),
    
    // 재고 회전율 임계값 조회
    getTurnoverSettings: protectedProcedure.query(async () => {
      const { getInventoryTurnoverSettings } = await import("./db.js");
      return await getInventoryTurnoverSettings();
    }),
    
    // 재고 회전율 임계값 기반 자동 알림 생성
    checkAndCreateTurnoverAlerts: protectedProcedure.mutation(async () => {
      const { checkAndCreateTurnoverAlerts } = await import("./db.js");
      return await checkAndCreateTurnoverAlerts();
    }),
    
    // 재고 LOT 삭제
    deleteLot: adminProcedure
      .input(z.object({ lotId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteInventoryLot, createAuditLog } = await import("./db");
        await deleteInventoryLot(input.lotId);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "inventory_lot.delete",
          entityType: "inventory_lot",
          entityId: input.lotId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `재고 LOT 삭제: ${input.lotId}`,
          changes: { deleted: true }
        });
        
        return { success: true, message: "재고 LOT가 삭제되었습니다" };
      }),
    
    // 재고 현황 대시보드
    getDashboard: protectedProcedure.query(async () => {
      const { getInventoryDashboard } = await import("./db");
      return await getInventoryDashboard();
    }),
    
    // 재고 이동 추이 (일별)
    getTrend: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          materialId: z.number().optional()
        })
      )
      .query(async ({ input }) => {
        const { getInventoryTrend } = await import("./db");
        return await getInventoryTrend(input);
      }),
    
    // 원재료별 재고 회전율 분석
    getTurnoverAnalysis: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input }) => {
        const { calculateInventoryTurnover } = await import("./db/inventoryAnalytics");
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        return await calculateInventoryTurnover(undefined, startDate, endDate);
      }),
    
    // 재고 효율성 지표
    getEfficiencyMetrics: protectedProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input }) => {
        const { calculateEfficiencyMetrics } = await import("./db/inventoryAnalytics");
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await calculateEfficiencyMetrics(startDate, endDate);
      }),
    
    // 재고 부족 예측 분석 (단일 원재료)
    predictShortage: protectedProcedure
      .input(
        z.object({
          materialId: z.number(),
          days: z.number(), // 예측 기간 (일)
        })
      )
      .query(async ({ input }) => {
        const { predictInventoryShortage } = await import("./db");
        return await predictInventoryShortage(input);
      }),
    
    // 재고 부족 예측 분석 (모든 원재료)
    predictAllShortage: protectedProcedure
      .input(
        z.object({
          days: z.number(), // 예측 기간 (일)
        })
      )
      .query(async ({ input }) => {
        const { predictAllMaterialsShortage } = await import("./db");
        return await predictAllMaterialsShortage(input);
      }),
    
    // 자동 발주 제안 생성
    getPurchaseOrderSuggestions: protectedProcedure
      .input(
        z.object({
          days: z.number(), // 예측 기간 (일)
        })
      )
      .query(async ({ input }) => {
        const { generatePurchaseOrderSuggestions } = await import("./db");
        return await generatePurchaseOrderSuggestions(input);
      }),
    
    // 발주 제안 승인
    approvePurchaseOrder: protectedProcedure
      .input(
        z.object({
          materialId: z.number(),
          quantity: z.number()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approvePurchaseOrderSuggestion } = await import("./db");
        return await approvePurchaseOrderSuggestion({
          ...input,
          approvedBy: ctx.user.id
        });
      }),
    
    // 발주 제안 거부
    rejectPurchaseOrder: protectedProcedure
      .input(
        z.object({
          materialId: z.number(),
          reason: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { rejectPurchaseOrderSuggestion } = await import("./db");
        return await rejectPurchaseOrderSuggestion({
          materialId: input.materialId,
          rejectedBy: ctx.user.id,
          reason: input.reason
        });
      }),
    
    // 유통기한 임박 현황 (7일 이내)
    getExpiringStock: protectedProcedure.query(async () => {
      const { getExpiringMaterials } = await import("./db");
      return await getExpiringMaterials();
    }),
    
    // 발주 제안 이력 조회
    getPurchaseProposalHistory: protectedProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          status: z.enum(["draft", "submitted", "approved", "received", "cancelled"]).optional(),
          materialId: z.number().optional()
        })
      )
      .query(async ({ input }) => {
        const { getPurchaseProposalHistory } = await import("./db");
        return await getPurchaseProposalHistory(input);
      }),
    
    // 재고 출고 (LOT 수량 차감)
    releaseStock: workerProcedure
      .input(
        z.object({
          lotId: z.number(),
          quantity: z.number(),
          releaseDate: z.string(),
          reason: z.string().optional(),
          destination: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        // LOT 조회 (테넌트 격리 적용)
        const [lot] = await db.select().from(hInventoryLots).where(
          and(eq(hInventoryLots.id, input.lotId), eq(hInventoryLots.tenantId, ctx.user.tenantId))
        );
        if (!lot) {
          throw new Error("LOT을 찾을 수 없습니다.");
        }
        
        const availableQty = parseFloat(lot.availableQuantity);
        
        // 재고 0개여도 출고 가능 (처음 프로그램 시작 시 재고 미입력 고려)
        // 마이너스 재고 방지: 재고가 있으면 차감, 없으면 0 유지
        const newAvailableQty = Math.max(0, availableQty - input.quantity);
        
        // 재고 차감
        await db.update(hInventoryLots)
          .set({ 
            availableQuantity: newAvailableQty.toString()
          })
          .where(and(eq(hInventoryLots.id, input.lotId), eq(hInventoryLots.tenantId, ctx.user.tenantId)));
        
        // 거래 내역 기록 (h_inventory_transactions)
        await db.insert(hInventoryTransactions).values({
          tenantId: ctx.user.tenantId,
          lotId: input.lotId,
          transactionType: "usage",
          quantity: input.quantity.toString(),
          unit: lot.unit,
          notes: input.reason || null,
          createdBy: ctx.user.id,
          performedBy: ctx.user.id,
          transactionDate: input.releaseDate
        });
        
        return { 
          success: true, 
          message: "출고가 완료되었습니다."
        };
      }),
    
    // 재고 조정 (재고 실사 등)
    adjustStock: workerProcedure
      .input(
        z.object({
          lotId: z.number(),
          newQuantity: z.number(),
          reason: z.string()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        // LOT 조회 (테넌트 격리 적용)
        const [lot] = await db.select().from(hInventoryLots).where(
          and(eq(hInventoryLots.id, input.lotId), eq(hInventoryLots.tenantId, ctx.user.tenantId))
        );
        if (!lot) {
          throw new Error("LOT을 찾을 수 없습니다.");
        }
        
        const oldQty = parseFloat(lot.availableQuantity);
        const diff = input.newQuantity - oldQty;
        
        // 재고 조정
        await db.update(hInventoryLots)
          .set({ 
            availableQuantity: input.newQuantity.toString()
          })
          .where(and(eq(hInventoryLots.id, input.lotId), eq(hInventoryLots.tenantId, ctx.user.tenantId)));
        
        // 거래 내역 기록은 추후 구현
        
        return { success: true, message: "재고가 조정되었습니다." };
      }),
    
    // 재고 예측 (과거 사용 패턴 분석)
    getForecast: protectedProcedure
      .input(
        z.object({
          days: z.number().default(30), // 분석 기간 (일)
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInventoryForecast } = await import("./db/inventoryForecast");
        return await getInventoryForecast(input.days, ctx.user.tenantId);
      }),
    
    // 발주 제안 (재고 부족 예상 원재료)
    getPurchaseRecommendations: protectedProcedure.query(async () => {
      const { getPurchaseRecommendations } = await import("./db/inventoryForecast");
      return await getPurchaseRecommendations(ctx.user.tenantId);
    }),

    // 고도화된 재고 예측 (계절성, 요일별 패턴, 이벤트 고려)
    getAdvancedForecast: protectedProcedure
      .input(z.object({ days: z.number().optional().default(90) }))
      .query(async ({ input, ctx }) => {
        const { getAdvancedInventoryForecast } = await import("./db/inventoryForecastAdvanced");
        return await getAdvancedInventoryForecast(input.days, ctx.user.tenantId);
      }),

    // 고도화된 발주 제안
    getAdvancedPurchaseRecommendations: protectedProcedure.query(async () => {
      const { getAdvancedPurchaseRecommendations } = await import("./db/inventoryForecastAdvanced");
      return await getAdvancedPurchaseRecommendations(ctx.user.tenantId);
    }),

    // 입고 등록 (LOT 자동 생성 + 재고 반영)
    createInboundReceipt: workerProcedure
      .input(
        z.object({
          materialId: z.number(),
          quantity: z.number(),
          unit: z.string(),
          unitPrice: z.number().optional(),
          supplierName: z.string().optional(),
          manufacturerName: z.string().optional(),
          expiryDate: z.string().optional(),
          receiptDate: z.string().optional(),
          location: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createInboundReceipt } = await import("./db/inboundManagement");
        return await createInboundReceipt({
          materialId: input.materialId,
          quantity: input.quantity,
          unit: input.unit,
          unitPrice: input.unitPrice,
          supplierName: input.supplierName,
          manufacturerName: input.manufacturerName,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          receiptDate: input.receiptDate ? new Date(input.receiptDate) : undefined,
          location: input.location,
          notes: input.notes,
          createdBy: ctx.user?.id || 0
        });
      }),

    // 입고 이력 조회
    getInboundHistory: protectedProcedure
      .input(
        z.object({
          limit: z.number().optional(),
          materialId: z.number().optional(),
          supplierId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          search: z.string().optional()
        })
      )
      .query(async ({ input }) => {
        const { getInboundHistory } = await import("./db/inboundManagement");
        return await getInboundHistory({
          limit: input.limit,
          materialId: input.materialId,
          supplierId: input.supplierId,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          search: input.search
        });
      }),

    // 출고 등록 (LOT 차감 + 재고 반영)
    createOutbound: workerProcedure
      .input(
        z.object({
          materialId: z.number(),
          lotId: z.number(),
          quantity: z.number(),
          unit: z.string(),
          batchId: z.number().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createOutboundRecord } = await import("./db/outboundManagement");
        return await createOutboundRecord({
          materialId: input.materialId,
          lotId: input.lotId,
          quantity: input.quantity,
          unit: input.unit,
          batchId: input.batchId,
          notes: input.notes,
          createdBy: ctx.user?.id || 0
        });
      }),

    // 출고 이력 조회
    getOutboundHistory: protectedProcedure
      .input(
        z.object({
          limit: z.number().optional(),
          materialId: z.number().optional(),
          batchId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input }) => {
        const { getOutboundHistory } = await import("./db/outboundManagement");
        return await getOutboundHistory({
          limit: input.limit,
          materialId: input.materialId,
          batchId: input.batchId,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined
        });
      }),

    // 재고 조정 (LOT 단위)
    adjustInventory: workerProcedure
      .input(
        z.object({
          materialId: z.number(),
          lotId: z.number(),
          quantityChange: z.number(),
          unit: z.string(),
          reason: z.string(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { adjustInventory } = await import("./db/inventoryAdjustment");
        return await adjustInventory({
          materialId: input.materialId,
          lotId: input.lotId,
          quantityChange: input.quantityChange,
          unit: input.unit,
          reason: input.reason,
          notes: input.notes,
          createdBy: ctx.user?.id || 0
        });
      }),

    // 재고 조정 이력 조회
    getAdjustmentHistory: protectedProcedure
      .input(
        z.object({
          limit: z.number().optional(),
          materialId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input }) => {
        const { getAdjustmentHistory } = await import("./db/inventoryAdjustment");
        return await getAdjustmentHistory({
          limit: input.limit,
          materialId: input.materialId,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined
        });
      }),
    
    // 사용량 패턴 분석
    getUsagePattern: protectedProcedure
      .input(
        z.object({
          materialId: z.number(),
          days: z.number().optional().default(30)
        })
      )
      .query(async ({ input }) => {
        const { calculateUsagePattern } = await import("./api/inventoryForecast");
        return await calculateUsagePattern(input.materialId, input.days);
      }),
    
    // 재고 소진 예상 일자
    predictStockout: protectedProcedure
      .input(
        z.object({
          materialId: z.number()
        })
      )
      .query(async ({ input }) => {
        const { predictStockout } = await import("./api/inventoryForecast");
        return await predictStockout(input.materialId);
      }),
    
    // 구매 추천
    recommendPurchase: protectedProcedure
      .input(
        z.object({
          materialId: z.number()
        })
      )
      .query(async ({ input }) => {
        const { recommendPurchase } = await import("./api/inventoryForecast");
        return await recommendPurchase(input.materialId);
      }),
    
    // 모든 원재료 구매 추천
    getAllPurchaseRecommendations: publicProcedure.query(async () => {
      const { getAllPurchaseRecommendations } = await import("./api/inventoryForecast");
      return await getAllPurchaseRecommendations();
    }),

    // 재고 부족 예상 감지
    checkLowStockPrediction: publicProcedure.query(async () => {
      const { checkLowStockPrediction } = await import("./api/inventoryForecast");
      return await checkLowStockPrediction();
    }),

    // 재고 부족 알림 생성
    createLowStockNotifications: publicProcedure.mutation(async () => {
      return await createLowStockNotifications();
      const { createLowStockNotifications } = await import("./api/inventoryForecast");
    }),
    
    // 원재료 ID로 조회
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getMaterialById } = await import("./db.js");
        return await getMaterialById(input.id);
      }),
    create: adminProcedure
      .input(
        z.object({
          materialName: z.string().min(1),
          materialCode: z.string().min(1),
          category: z.string().optional(),
          categoryId: z.number().optional(), // 카테고리 ID
          unit: z.string().optional(),
          safetyStock: z.number().optional(),
          expiryWarningDays: z.number().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createMaterial } = await import("./db.js");
        return await createMaterial({ ...input, tenantId: ctx.user.tenantId });
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          materialName: z.string().optional(),
          materialCode: z.string().optional(),
          category: z.string().optional(),
          categoryId: z.number().optional(), // 카테곣리 ID
          unit: z.string().optional(),
          safetyStock: z.number().optional(),
          expiryWarningDays: z.number().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updateMaterial } = await import("./db.js");
        const { id, ...data } = input;
        return await updateMaterial(id, data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteMaterial } = await import("./db.js");
        return await deleteMaterial(input.id, ctx.user.tenantId);
      }),
    updatePrice: adminProcedure
      .input(
        z.object({
          id: z.number(),
          unitPrice: z.number(),
          reason: z.string().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updateMaterialPrice } = await import("./db.js");
        return await updateMaterialPrice(input.id, input.unitPrice, undefined, input.reason);
      }),
    
    // 원재료 단가 이력 조회
    getPriceHistory: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMaterialPriceHistory } = await import("./db/priceHistory.js");
        return await getMaterialPriceHistory(input.materialId, ctx.user.tenantId);
      }),

    // 자동 코드 생성
    generateCode: protectedProcedure
      .query(async ({ ctx }) => {
        const { generateMaterialCode } = await import("./db/codeGenerator.js");
        return await generateMaterialCode(ctx.user.tenantId);
      }),
    
    // 원재료 일괄 등록
    bulkCreate: adminProcedure
      .input(
        z.object({
          materials: z.array(
            z.object({
              materialName: z.string().min(1),
              unit: z.string().min(1),
              safetyStock: z.number().min(0),
              category: z.string().optional(),
              expiryWarningDays: z.number().optional(),
              storageMethod: z.string().optional(),
              notes: z.string().optional()
            })
          )
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createMaterial } = await import("./db.js");
        const { generateMaterialCode } = await import("./db/codeGenerator.js");
        const { createUploadHistory } = await import("./db/uploadHistory.js");
        
        const results = {
          success: true,
          successCount: 0,
          failureCount: 0,
          errors: [] as Array<{ row: number; code?: string; message: string }>
        };
        
        for (let i = 0; i < input.materials.length; i++) {
          try {
            const material = input.materials[i];
            const materialCode = await generateMaterialCode();
            
            await createMaterial({
              materialName: material.materialName,
              materialCode: materialCode,
              unit: material.unit,
              safetyStock: material.safetyStock,
              category: material.category,
              expiryWarningDays: material.expiryWarningDays,
              isActive: 1
            });
            
            results.successCount++;
          } catch (error: any) {
            results.failureCount++;
            results.errors.push({
              row: i + 1,
              message: error.message || "등록 실패"
            });
          }
        }
        
        results.success = results.failureCount === 0;
        
        // 업로드 이력 저장
        await createUploadHistory({
          uploadType: "material",
          userId: ctx.user.id,
          userName: ctx.user.name,
          fileName: "Excel Upload",
          totalCount: input.materials.length,
          successCount: results.successCount,
          errorCount: results.failureCount,
          errors: results.errors
        });
        
        return results;
      }),
    
    // 안전 재고 수준 업데이트
    updateSafetyStock: adminProcedure
      .input(
        z.object({
          materialId: z.number(),
          safetyStockLevel: z.number()
        })
      )
      .mutation(async ({ input }) => {
        const { updateMaterial } = await import("./db.js");
        await updateMaterial(input.materialId, {
          safetyStock: input.safetyStockLevel
        });
        return { success: true };
      }),

    // 원재료별 유통기한 알림 기준일 일괄 업데이트
    batchUpdateExpiryWarningDays: protectedProcedure
      .input(
        z.object({
          expiryWarningDays: z.number().int().min(1).max(365)
        })
      )
      .mutation(async ({ input }) => {
        const { batchUpdateExpiryWarningDays } = await import("./db.js");
        const count = await batchUpdateExpiryWarningDays(input.expiryWarningDays);
        return { success: true, count };
      }),
    
    // 원재료 가격 변동 추이 조회
    getPriceTrend: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMaterialPriceHistory } = await import("./db/priceHistory");
        return await getMaterialPriceHistory(input.materialId, ctx.user.tenantId);
      })
  }),
  
  // 혼합재제 (Intermediate Materials)
  intermediate: router({
    // 혼합재제 목록 조회
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getIntermediates } = await import("./db/intermediateAPI");
      return await getIntermediates(ctx.user.tenantId);
    }),
    
    // 혼합재제 상세 조회 (구성 포함)
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getIntermediateDetail } = await import("./db/intermediateAPI");
        return await getIntermediateDetail(input.id, ctx.user.tenantId);
      }),
    
    // 혼합재제 생성
    create: adminProcedure
      .input(
        z.object({
          materialCode: z.string().min(1),
          materialName: z.string().min(1),
          category: z.string().optional(),
          unit: z.string().min(1),
          supplierId: z.number().optional(),
          shelfLifeDays: z.number().optional(),
          unitPrice: z.string().optional(),
          description: z.string().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { createIntermediate } = await import("./db/intermediateAPI");
        return await createIntermediate(input);
      }),
    
    // 혼합재제 수정
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          materialName: z.string().optional(),
          category: z.string().optional(),
          unit: z.string().optional(),
          supplierId: z.number().optional(),
          shelfLifeDays: z.number().optional(),
          unitPrice: z.string().optional(),
          description: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updateIntermediate } = await import("./db/intermediateAPI");
        const { id, ...data } = input;
        return await updateIntermediate(id, data);
      }),
    
    // 혼합재제 삭제
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteIntermediate } = await import("./db/intermediateAPI");
        return await deleteIntermediate(input.id, ctx.user.tenantId);
      }),
    
    // 혼합재제 구성 추가
    addComponent: adminProcedure
      .input(
        z.object({
          intermediateMaterialId: z.number(),
          componentMaterialId: z.number(),
          ratioPercent: z.string().optional(),
          gramsPerKg: z.string().optional(),
          note: z.string().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { addIntermediateComponent } = await import("./db/intermediateAPI");
        return await addIntermediateComponent(input);
      }),
    
    // 혼합재제 구성 수정
    updateComponent: adminProcedure
      .input(
        z.object({
          id: z.number(),
          ratioPercent: z.string().optional(),
          gramsPerKg: z.string().optional(),
          note: z.string().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updateIntermediateComponent } = await import("./db/intermediateAPI");
        const { id, ...data } = input;
        return await updateIntermediateComponent(id, data);
      }),
    
    // 혼합재제 구성 삭제
    deleteComponent: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteIntermediateComponent } = await import("./db/intermediateAPI");
        return await deleteIntermediateComponent(input.id, ctx.user.tenantId);
      })
  }),
  
  // 품목제조보고 (Manufacturing Report)
  mfReport: router({
    // 품목제조보고 목록 조회
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getMfReports } = await import("./db/mfReportAPI");
      return await getMfReports(ctx.user.tenantId);
    }),
    
    // 품목제조보고 상세 조회
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportDetail } = await import("./db/mfReportAPI");
        return await getMfReportDetail(input.id, ctx.user.tenantId);
      }),
    
    // 품목제조보고 생성
    create: adminProcedure
      .input(
        z.object({
          productId: z.number(),
          reportNo: z.string().min(1),
          reportDate: z.string(),
          flavorId: z.number().optional(),
          ingredients: z.array(
            z.object({
              materialId: z.number().optional(),
              intermediateId: z.number().optional(),
              quantity: z.number(),
              unit: z.string(),
              isDeductible: z.number(),
              materialType: z.enum(["RAW", "MIXED", "FLAVOR_SPECIFIC"]),
              flavorName: z.string().optional(),
              processGroupId: z.number().optional(),
              adjustedWeightKg: z.number().optional(),
              isAdditional: z.number().optional()
            })
          ).optional(),
          createdBy: z.number().optional(),
          // 배치 정보 필드
          yieldBasis: z.enum(["UNIT", "BATCH"]).optional(),
          unitWeightG: z.number().optional(),
          batchTargetKg: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createMfReport } = await import("./db/mfReportAPI");
        return await createMfReport(input, ctx.user.tenantId);
      }),
    // 품목제조보고 수정 (기존 보고서 업데이트)
    update: adminProcedure
      .input(
        z.object({
          mfReportId: z.number(),
          reportNo: z.string().optional(),
          reportDate: z.string().optional(),
          yieldBasis: z.string().optional(),
          unitWeightG: z.number().optional(),
          batchTargetKg: z.number().optional(),
          ingredients: z.array(
            z.object({
              materialId: z.number().optional(),
              intermediateId: z.number().optional(),
              quantity: z.number(),
              unit: z.string(),
              isDeductible: z.number(),
              materialType: z.enum(["RAW", "MIXED", "FLAVOR_SPECIFIC"]),
              flavorName: z.string().optional(),
              processGroupId: z.number().optional(),
              adjustedWeightKg: z.number().optional(),
              isAdditional: z.number().optional()
            })
          ).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateMfReport } = await import("./db/mfReportAPI");
        return await updateMfReport(input, ctx.user.tenantId);
      }),
    
    // 품목제조보고 버전 생성
    createVersion: adminProcedure
      .input(
        z.object({
          mfReportId: z.number(),
          effectiveFrom: z.string(),
          changeReason: z.string().optional(),
          compositionTotalRule: z.string().optional(),
          createdBy: z.number().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { createMfReportVersion } = await import("./db/mfReportAPI");
        return await createMfReportVersion(input);
      }),
    
    // 품목제조보고 버전 승인
    approveVersion: adminProcedure
      .input(z.object({ versionId: z.number(), comment: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { approveMfReportVersion } = await import("./db/mfReportAPI");
        return await approveMfReportVersion(input.versionId, ctx.user.id, input.comment, ctx.user.tenantId);
      }),
    
    // 품목제조보고 버전 목록 조회
    getVersions: protectedProcedure
      .input(z.object({ mfReportId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportVersions } = await import("./db/mfReportAPI");
        return await getMfReportVersions(input.mfReportId, ctx.user.tenantId);
      }),
    
    // 품목제조보고 버전 상세 조회
    getVersionDetail: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportVersionDetail } = await import("./db/mfReportAPI");
        return await getMfReportVersionDetail(input.versionId, ctx.user.tenantId);
      }),
    
    // 특정 날짜에 유효한 버전 조회
    getVersionByDate: protectedProcedure
      .input(
        z.object({
          mfReportId: z.number(),
          date: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getMfReportVersionByDate } = await import("./db/mfReportAPI");
        return await getMfReportVersionByDate(input.mfReportId, input.date, ctx.user.tenantId);
      }),
    
    // 맛(Flavor) 목록 조회
    listFlavors: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
      return await db.select().from(hMfFlavors);
    }),
    
    // 맛(Flavor) 생성
    createFlavor: adminProcedure
      .input(
        z.object({
          mfReportVersionId: z.number(),
          flavorCode: z.string().min(1),
          flavorName: z.string().min(1),
          appliesToSku: z.string().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { createMfFlavor } = await import("./db/mfReportAPI");
        return await createMfFlavor(input);
      }),
    
    // 원재료 구성 추가
    addIngredient: adminProcedure
      .input(
        z.object({
          mfReportVersionId: z.number(),
          lineNo: z.number(),
          materialId: z.number().optional(),
          intermediateId: z.number().optional(),
          quantity: z.string(),
          unit: z.string(),
          isDeductible: z.number()
        })
      )
      .mutation(async ({ input }) => {
        const { addMfIngredient } = await import("./db/mfReportAPI");
        return await addMfIngredient(input);
      }),
    
    // 원재료 구성 수정
    updateIngredient: adminProcedure
      .input(
        z.object({
          ingredientId: z.number(),
          percent: z.string().optional(),
          isDeductible: z.number().optional(),
          labelNameOverride: z.string().optional(),
          allergens: z.string().optional(),
          originNote: z.string().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updateMfIngredient } = await import("./db/mfReportAPI");
        const { ingredientId, ...data } = input;
        return await updateMfIngredient(ingredientId, data);
      }),
    
    // 원재료 구성 삭제
    deleteIngredient: adminProcedure
      .input(z.object({ ingredientId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteMfIngredient } = await import("./db/mfReportAPI");
        return await deleteMfIngredient(input.ingredientId, ctx.user.tenantId);
      }),
    
    // 일괄 상태 변경
    bulkUpdateStatus: adminProcedure
      .input(
        z.object({
          ids: z.array(z.number()),
          status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"])
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { bulkUpdateMfReportStatus } = await import("./db/mfReportAPI");
        return await bulkUpdateMfReportStatus(input.ids, input.status, ctx.user.tenantId);
      }),
    
    // 일괄 삭제
    bulkDelete: adminProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { bulkDeleteMfReports } = await import("./db/mfReportAPI");
        return await bulkDeleteMfReports(input.ids, ctx.user.tenantId);
      }),
    
    // 일괄 PDF 출력
    bulkExportPdf: adminProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { bulkExportMfReportsPdf } = await import("./db/mfReportAPI");
        return await bulkExportMfReportsPdf(input.ids, ctx.user.tenantId);
      }),
    
    // 배치 생산량 g 환산 계산
    calculateBatchRequirements: protectedProcedure
      .input(
        z.object({
          versionId: z.number(),
          batchKg: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { calculateBatchRequirements } = await import("./db/mfReportAPI");
        return await calculateBatchRequirements(input.versionId, input.batchKg, ctx.user.tenantId);
      }),
    
    // 승인 요청
    requestApproval: protectedProcedure
      .input(
        z.object({
          versionId: z.number(),
          comment: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { requestMfReportApproval } = await import("./db/mfReportAPI");
        return await requestMfReportApproval(input.versionId, ctx.user.id, input.comment, ctx.user.tenantId);
      }),
    
    // 승인 처리
    approve: adminProcedure
      .input(
        z.object({
          versionId: z.number(),
          comment: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveMfReportVersion } = await import("./db/mfReportAPI");
        return await approveMfReportVersion(input.versionId, ctx.user.id, input.comment);
      }),
    // 반려 처리
    reject: adminProcedure
      .input(
        z.object({
          versionId: z.number(),
          reason: z.string().min(1)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { rejectMfReportVersion } = await import("./db/mfReportAPI");
        return await rejectMfReportVersion(input.versionId, ctx.user.id, input.reason, ctx.user.tenantId);
      }),
    
    // 승인 이력 조회
    getApprovalHistory: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getMfReportApprovalHistory } = await import("./db/mfReportAPI");
        return await getMfReportApprovalHistory(input.versionId, ctx.user.tenantId);
      }),
    
    // 보정 배합비 재계산
    recalculateCorrectedRatios: adminProcedure
      .input(z.object({ versionId: z.number() }))
      .mutation(async ({ input }) => {
        const { calculateAndSaveCorrectedRatios } = await import("./db/mfReportAPI");
        return await calculateAndSaveCorrectedRatios(input.versionId);
      }),

    // 오차 분석 (배치 학습 기반)
    getDeviationAnalysis: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input }) => {
        const { getDeviationAnalysis } = await import("./db/mfReportAPI");
        return await getDeviationAnalysis(input.versionId);
      }),

    // 재고 차감 (원재료/중간재/부재료 정책 적용)
    deductInventory: adminProcedure
      .input(
        z.object({
          versionId: z.number(),
          batchKg: z.number(),
          productionDate: z.string(),
          producedQuantity: z.number(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { deductInventoryByMfReport } = await import("./db/mfReportAPI");
        return await deductInventoryByMfReport({
          ...input,
          createdBy: ctx.user.id
        });
      }),
    
    // 표시사항 출력 (요약형/상세형)
    generateLabel: protectedProcedure
      .input(
        z.object({
          versionId: z.number(),
          mode: z.enum(["summary", "detailed"])
        })
      )
      .query(async ({ input, ctx }) => {
        const { generateIngredientLabel } = await import("./db/mfReportAPI");
        const pdfBuffer = await generateIngredientLabel(input.versionId, input.mode, ctx.user.tenantId);
        return {
          pdfBase64: pdfBuffer.toString("base64")
        };
      }),
    
    // 생산 이력 조회
    getProductionLogs: protectedProcedure
      .input(
        z.object({
          versionId: z.number()
        })
      )
      .query(async ({ input }) => {
        const { getProductionLogsByVersionId } = await import("./db/productionLogAPI");
        return await getProductionLogsByVersionId(input.versionId);
      }),
    
    // 재고 차감 이력 조회
    getInventoryDeductionLogs: protectedProcedure
      .input(
        z.object({
          versionId: z.number()
        })
      )
      .query(async ({ input }) => {
        const { getAllInventoryDeductionLogsByVersionId } = await import("./db/productionLogAPI");
        return await getAllInventoryDeductionLogsByVersionId(input.versionId);
      }),
    // === 공정그룹 재료 매핑 & 배치 배합비 조정 API ===
    
    // 재료-공정 매핑 조회
    getIngredientProcessMappings: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getIngredientProcessMappings } = await import("./db/mfReportAPI");
        return await getIngredientProcessMappings(input.versionId, ctx.user.tenantId);
      }),

    // 재료-공정 매핑 일괄 저장
    saveIngredientProcessMappings: protectedProcedure
      .input(z.object({
        versionId: z.number(),
        mappings: z.array(z.object({
          ingredientId: z.number(),
          processGroupId: z.number().nullable(),
          processCategory: z.enum(["DOUGH", "FILLING", "TOPPING", "NONE"]),
          sortOrder: z.number().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { saveIngredientProcessMappings } = await import("./db/mfReportAPI");
        return await saveIngredientProcessMappings(input.versionId, ctx.user.tenantId, input.mappings);
      }),

    // 공정별 조정 파라미터 조회
    getProcessAdjustments: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getProcessAdjustments } = await import("./db/mfReportAPI");
        return await getProcessAdjustments(input.versionId, ctx.user.tenantId);
      }),

    // 공정별 조정 파라미터 일괄 저장
    saveProcessAdjustments: protectedProcedure
      .input(z.object({
        versionId: z.number(),
        adjustments: z.array(z.object({
          processGroupId: z.number().nullable(),
          processCategory: z.enum(["DOUGH", "FILLING", "TOPPING", "NONE"]),
          yieldFactor: z.number().optional(),
          yieldMaterialId: z.number().nullable().optional(),
          waterAdditionKg: z.number().optional(),
          steamAbsorptionPct: z.number().optional(),
          targetOutputKg: z.number().nullable().optional(),
          inputTiming: z.enum(["BEFORE_PROCESS", "DURING_PROCESS", "AFTER_PROCESS"]).optional(),
          weightChange: z.number().optional(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { saveProcessAdjustments } = await import("./db/mfReportAPI");
        return await saveProcessAdjustments(input.versionId, ctx.user.tenantId, input.adjustments);
      }),

    // 공정그룹 기반 배치 배합비 계산
    calculateAdjustedBatchFormula: protectedProcedure
      .input(z.object({
        versionId: z.number(),
        batchKg: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        const { calculateAdjustedBatchFormula } = await import("./db/mfReportAPI");
        return await calculateAdjustedBatchFormula(input.versionId, input.batchKg, ctx.user.tenantId);
      }),
  }),
  
  // 대시보드 (Dashboard)
  dashboard: router({
    // 대시보드 통계 조회
    getStats: protectedProcedure
      .query(async ({ ctx }) => {
        const { getDashboardStats } = await import("./db");
        return await getDashboardStats(ctx.user.tenantId);
      }),
    
    // 회계 요약 데이터 조회
    getAccountingSummary: protectedProcedure
      .query(async () => {
        const { getMonthlyAccountingSummary } = await import("./db/accountingSummary");
        return await getMonthlyAccountingSummary();
      }),
    
    // 계정 과목별 지출 집계
    getExpensesByCategory: protectedProcedure
      .query(async () => {
        const { getExpensesByCategory } = await import("./db/accountingSummary");
        return await getExpensesByCategory();
      }),
    
    // 오늘 점검 예정 CCP 일정 조회
    getTodaySchedules: protectedProcedure
      .query(async () => {
        const { getTodayCcpSchedules } = await import("./db");
        return await getTodayCcpSchedules();
      }),
    
    // 검사 통계
    inspectionStats: router({
    // 기존 검사 통계 API
    getStatisticsOld: protectedProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional()
          })
          .optional()
      )
      .query(async ({ input }) => {
        const { getInspectionStatistics } = await import("./db");
        return await getInspectionStatistics(input);
      }),
    
    // 검사 통계 대시보드
    getStatistics: protectedProcedure
      .input(
        z.object({
          type: z.enum(["material", "hygiene", "shipping"]),
          range: z.enum(["week", "month", "quarter"])
        })
      )
      .query(async ({ input }) => {
        const { getInspectionDashboardStatistics } = await import("./db");
        return await getInspectionDashboardStatistics(input);
      })
  }),
    // 배치 진행 현황
    batchProgress: protectedProcedure.query(async () => {
      const { getBatchProgress } = await import("./db");
      return await getBatchProgress();
    }),
    // CCP 이탈 알림
    ccpDeviations: protectedProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            limit: z.number().optional()
          })
          .optional()
      )
      .query(async ({ input }) => {
        const { getCcpDeviations } = await import("./db");
        return await getCcpDeviations(input);
      }),
    // 최근 활동
    recentActivities: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().optional()
          })
          .optional()
      )
      .query(async ({ input }) => {
        const { getRecentActivities } = await import("./db");
        return await getRecentActivities(input?.limit);
      }),
    
    // CCP 이탈 추이 (최근 7일)
    getCcpDeviationTrend: protectedProcedure.query(async () => {
      const { getCcpDeviationTrend } = await import("./db");
      return await getCcpDeviationTrend();
    }),

    // 재고 부족 경고
    getLowStockWarnings: protectedProcedure.query(async () => {
      const { getLowStockWarnings } = await import("./db");
      return await getLowStockWarnings();
    }),

    // 유통기한 임박 원재료
    getExpiringMaterials: publicProcedure.query(async () => {
      const { getExpiringMaterials } = await import("./db");
      return await getExpiringMaterials();
    }),

    // 배치 생산 추이 (기간 선택 가능)
    getProductionTrend: publicProcedure
      .input(z.object({ days: z.number().optional().default(7) }).optional())
      .query(async ({ input }) => {
        const { getProductionTrend } = await import("./db");
        return await getProductionTrend(input?.days || 7);
      }),

    // 원재료 소비 통계
    getMaterialConsumption: publicProcedure.query(async () => {
      const { getMaterialConsumption } = await import("./db");
      return await getMaterialConsumption();
    }),

    // 월별 CCP 이탈 비율 (기간 선택 가능)
    getMonthlyCcpDeviationRate: publicProcedure
      .input(z.object({ days: z.number().optional().default(30) }).optional())
      .query(async ({ input }) => {
        const { getMonthlyCcpDeviationRate } = await import("./db");
        return await getMonthlyCcpDeviationRate(input?.days || 30);
      }),
    
    // 위젯 설정 조회
    getWidgetSettings: protectedProcedure
      .query(async ({ ctx }) => {
        const { getUserWidgetSettings } = await import("./db/widgetSettings");
        return await getUserWidgetSettings(ctx.user.id, ctx.user.tenantId);
      }),
    
    // 위젯 표시/숨김 업데이트
    updateWidgetVisibility: protectedProcedure
      .input(z.object({
        widgetId: z.string(),
        isVisible: z.number()
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateWidgetVisibility } = await import("./db/widgetSettings");
        return await updateWidgetVisibility({
          userId: ctx.user.id,
          widgetId: input.widgetId,
          isVisible: input.isVisible
        });
      }),

    // ============================================================
    // 통합 대시보드 탭별 API (Phase 134)
    // ============================================================

    // 생산 효율성 탭 통합 데이터 조회
    getProductionEfficiencyData: protectedProcedure
      .input(
        z.object({
          siteId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          productId: z.number().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getProductionEfficiencyData } = await import("./db");
        const siteId = input.siteId || ctx.user.siteId;
        if (!siteId) throw new Error("사이트 ID가 필요합니다");
        return await getProductionEfficiencyData({ ...input, siteId });
      }),

    // 재고 추이 탭 통합 데이터 조회
    getInventoryTrendData: protectedProcedure
      .input(
        z.object({
          siteId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          materialId: z.number().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getInventoryTrendData } = await import("./db");
        const siteId = input.siteId || ctx.user.siteId;
        if (!siteId) throw new Error("사이트 ID가 필요합니다");
        return await getInventoryTrendData({ ...input, siteId });
      })
  }),
  
  // CCP 점검 일정 (CCP Schedule)
  ccpSchedule: router({
    // 점검 일정 조회
    list: protectedProcedure
      .input(z.object({
        ccpInstanceId: z.number().optional(),
        status: z.enum(["pending", "completed", "skipped"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getCcpSchedules } = await import("./db");
        return await getCcpSchedules({
          tenantId: ctx.user.tenantId,
          ccpInstanceId: input.ccpInstanceId,
          status: input.status,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined
        });
      }),
    
    // 점검 완료 처리
    complete: protectedProcedure
      .input(z.object({
        scheduleId: z.number(),
        note: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { completeCcpSchedule } = await import("./db");
        await completeCcpSchedule(
          input.scheduleId,
          ctx.user?.id || 0,
          input.note
        );
        return { success: true, message: "점검이 완료되었습니다." };
      }),
    
    // 점검 일정 날짜 변경
    updateDate: protectedProcedure
      .input(z.object({
        scheduleId: z.number(),
        newDate: z.string()
      }))
      .mutation(async ({ input }) => {
        const { updateCcpScheduleDate } = await import("./db");
        await updateCcpScheduleDate(
          input.scheduleId,
          new Date(input.newDate)
        );
        return { success: true, message: "일정이 변경되었습니다." };
      })
  }),
  
  // PDF 보고서 생성
  report: router({
    // 배치별 PDF 보고서 생성
    generateBatchPDF: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input }) => {
        const { generateBatchReport } = await import("./db");
        const { generateBatchPDF } = await import("./pdfGenerator");
        
        const reportData = await generateBatchReport(input.batchId);
        const pdfBuffer = await generateBatchPDF(reportData);
        
        // PDF를 Base64로 인코딩하여 반환
        const base64PDF = pdfBuffer.toString("base64");
        
        return {
          success: true,
          pdf: base64PDF,
          filename: `batch_${reportData.batch.batchCode}_report.pdf`
        };
      }),
    
    // CCP 점검 보고서 생성
    generateCcpReport: protectedProcedure
      .input(
        z.object({
          reportType: z.enum(["daily", "weekly", "monthly"]),
          startDate: z.string(),
          endDate: z.string(),
          ccpType: z.string().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { generatePdfReport } = await import("./services/report.service");
        
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        
        let title = "";
        let period = "";
        
        switch (input.reportType) {
          case "daily":
            title = "일일 CCP 점검 리포트";
            period = `${startDate.toLocaleDateString('ko-KR')}`;
            break;
          case "weekly":
            title = "주간 CCP 점검 리포트";
            period = `${startDate.toLocaleDateString('ko-KR')} ~ ${endDate.toLocaleDateString('ko-KR')}`;
            break;
          case "monthly":
            title = "월간 CCP 점검 리포트";
            period = `${startDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}`;
            break;
        }
        
        const pdfBuffer = await generatePdfReport({
          title,
          period,
          startDate,
          endDate,
          ccpType: input.ccpType
        });
        
        // PDF를 Base64로 인코딩하여 반환
        const base64Pdf = Buffer.from(pdfBuffer).toString('base64');
        
        return {
          success: true,
          pdf: base64Pdf,
          filename: `${input.reportType}_ccp_report_${startDate.toISOString().split('T')[0]}.pdf`
        };
      })
  }),
  
  // 알림 관리
  notification: router({
    // 알림 목록 조회
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getNotifications } = await import("./db");
      return await getNotifications(ctx.user.id, ctx.user.tenantId);
    }),
    
    // 알림 읽음 처리
    markAsRead: protectedProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input }) => {
        const { markNotificationAsRead } = await import("./db");
        await markNotificationAsRead(input.notificationId, ctx.user.tenantId);
        return { success: true };
      }),
    
    // 알림 삭제
    delete: protectedProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteNotification } = await import("./db");
        await deleteNotification(input.notificationId, ctx.user.tenantId);
        return { success: true };
      }),
    
    // 모든 알림 읽음 처리
    markAllAsRead: protectedProcedure
      .mutation(async ({ ctx }) => {
        const { markAllNotificationsAsRead } = await import("./db");
        await markAllNotificationsAsRead(ctx.user.id);
        return { success: true };
      }),
    
    // 모든 알림 삭제
    deleteAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        const { deleteAllNotifications } = await import("./db");
        await deleteAllNotifications(ctx.user.id);
        return { success: true };
      }),
    
    // 알림 조치 완료 처리
    markAsResolved: protectedProcedure
      .input(z.object({ notificationId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { markNotificationAsResolved } = await import("./db");
        await markNotificationAsResolved(input.notificationId, ctx.user.tenantId);
        return { success: true };
      }),
    
    // 알림 타입별 개수 조회 (읽지 않은 알림만)
    countsByType: protectedProcedure.query(async ({ ctx }) => {
      const { getNotificationCountsByType } = await import("./db");
      return await getNotificationCountsByType(ctx.user.id, ctx.user.tenantId);
    }),
    
    getStatistics: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }).optional())
      .query(async ({ input, ctx }) => {
        const { getNotificationStatistics } = await import("./db");
        return await getNotificationStatistics(input?.startDate, input?.endDate, ctx.user.tenantId);
      }),
    
    // 재고 만료 알림 자동 생성 (테스트용)
    checkExpiry: protectedProcedure.mutation(async () => {
      const { checkAndCreateExpiryNotifications } = await import("./db");
      const count = await checkAndCreateExpiryNotifications();
      return { success: true, count, message: `${count}개의 알림이 생성되었습니다.` };
    }),
    
    // 선택한 알림 읽음 처리
    markMultipleAsRead: protectedProcedure
      .input(z.object({ notificationIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        const { markMultipleNotificationsAsRead } = await import("./db");
        await markMultipleNotificationsAsRead(input.notificationIds);
        return { success: true, count: input.notificationIds.length };
      }),
    
    // 선택한 알림 삭제
    deleteMultiple: protectedProcedure
      .input(z.object({ notificationIds: z.array(z.number()) }))
      .mutation(async ({ input }) => {
        const { deleteMultipleNotifications } = await import("./db");
        await deleteMultipleNotifications(input.notificationIds);
        return { success: true, count: input.notificationIds.length };
      }),
       // 알림 삭제
    deleteOldReadNotifications: protectedProcedure
      .input(z.object({ days: z.number().min(1) }))
      .mutation(async ({ input }) => {
        const { deleteOldReadNotifications } = await import("./db");
        const deletedCount = await deleteOldReadNotifications(input.days, ctx.user.tenantId);
        return { deletedCount, message: `${deletedCount}개의 오래된 알림을 삭제했습니다` };
      }),
    
    // 알림 보관 정책 설정 조회
    getNotificationRetentionPolicy: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
        
        const [setting] = await db
          .select()
          .from(hSystemSettings)
          .where(eq(hSystemSettings.settingKey, "notification_retention_days"));
        
        return {
          days: setting ? parseInt(setting.settingValue || "30", 10) : 30
        };
      }),
    
    // 알림 보관 정책 설정 저장
    setNotificationRetentionPolicy: adminProcedure
      .input(z.object({ days: z.number().min(1).max(365) }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database connection failed" });
        
        // 기존 설정 확인
        const [existing] = await db
          .select()
          .from(hSystemSettings)
          .where(eq(hSystemSettings.settingKey, "notification_retention_days"));
        
        if (existing) {
          // 업데이트
          await db
            .update(hSystemSettings)
            .set({
              settingValue: input.days.toString(),
              updatedBy: Number(ctx.user.id)
            })
            .where(eq(hSystemSettings.settingKey, "notification_retention_days"));
        } else {
          // 새로 삽입
          await db.insert(hSystemSettings).values({
            settingKey: "notification_retention_days",
            settingValue: input.days.toString(),
            settingType: "number",
            category: "notification",
            description: "알림 자동 삭제 기준일 (읽은 알림)",
            isEditable: 1,
            updatedBy: Number(ctx.user.id)
          });
        }
        
        return { message: `알림 보관 기간이 ${input.days}일로 설정되었습니다` };
      }),
    // 특정 타입 알림 자동 아카이브
    archiveByType: adminProcedure
      .input(z.object({ type: z.string() }))
      .mutation(async ({ input }) => {
        const { archiveNotificationsByType } = await import("./db");
        const result = await archiveNotificationsByType(input.type, ctx.user.tenantId);
        return { success: true, archivedCount: result.archivedCount };
      })
  }),
  
  // 사용자 관리 라우터
  user: router({
    // 모든 사용자 조회 (관리자만, tenant 격리)
    list: adminProcedure.query(async ({ ctx }) => {
      const { getAllUsers } = await import("./db");
      // 모든 관리자(슈퍼관리자 포함)는 자신의 tenant_id로 필터링
      // 슈퍼관리자가 모든 테넌트를 관리하려면 시스템 모니터링 페이지 사용
      return await getAllUsers(ctx.user.tenantId);
    }),
    
    // 사용자 역할 변경 (관리자만)
    updateRole: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["admin", "worker", "monitor"])
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateUserRole, createAuditLog, getUserById } = await import("./db");
        
        // 변경 전 사용자 정보 조회
        const targetUser = await getUserById(input.userId);
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.'
          });
        }
        
        // tenant 격리 검증
        if (targetUser.tenantId !== ctx.user.tenantId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '다른 회사의 사용자는 관리할 수 없습니다.'
          });
        }
        
        const oldRole = targetUser?.role;
        
        // 역할 변경
        await updateUserRole(input.userId, input.role);
        
        // 역할 변경 시 자동으로 승인 처리 (pending 상태인 경우)
        const db = await (await import("./db")).getDb();
        if (db && targetUser?.approvalStatus === 'pending') {
          const { users } = await import("../drizzle/schema_main");
          const { eq } = await import("drizzle-orm");
          await db.update(users)
            .set({ 
              approvalStatus: 'approved',
              isActive: 1 
            })
            .where(eq(users.id, input.userId));
        }
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.updateRole",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            oldRole,
            newRole: input.role,
            targetUserEmail: targetUser?.email
          },
          description: `사용자 ${targetUser?.email}의 역할을 ${oldRole}에서 ${input.role}로 변경`
        });
        
        return { success: true };
      }),
    
    // 사용자 승인 (관리자만)
    approve: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["admin", "worker", "monitor"]).default("worker")
      }))
      .mutation(async ({ input, ctx }) => {
        const { approveUser, createAuditLog, getUserById } = await import("./db");
        
        // 사용자 정보 조회
        const targetUser = await getUserById(input.userId);
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.'
          });
        }
        
        // tenant 격리 검증
        if (targetUser.tenantId !== ctx.user.tenantId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '다른 회사의 사용자는 승인할 수 없습니다.'
          });
        }
        
        // 사용자 승인
        await approveUser(input.userId, input.role);
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.approve",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            approvalStatus: "approved",
            role: input.role,
            targetUserEmail: targetUser?.email
          },
          description: `사용자 ${targetUser?.email}를 승인하고 역할을 ${input.role}로 설정`
        });
        
        return { success: true, message: "사용자가 승인되었습니다" };
      }),
      
      // 사용자 활성화/비활성화 (관리자만)
    toggleActive: adminProcedure
      .input(z.object({
        userId: z.number(),
        isActive: z.boolean()
      }))
      .mutation(async ({ input, ctx }) => {
        const { toggleUserActive, getUserById } = await import("./db");
        
        // 사용자 정보 조회
        const targetUser = await getUserById(input.userId);
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.'
          });
        }
        
        // tenant 격리 검증
        if (targetUser.tenantId !== ctx.user.tenantId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '다른 회사의 사용자는 관리할 수 없습니다.'
          });
        }
        
        await toggleUserActive(input.userId, input.isActive);
        return { success: true };
      }),
    
    // 일괄 승인 (관리자만)
    batchApprove: adminProcedure
      .input(z.object({
        userIds: z.array(z.number()),
        role: z.enum(["admin", "worker", "monitor"]).default("worker")
      }))
      .mutation(async ({ input, ctx }) => {
        const { batchApproveUsers, createAuditLog } = await import("./db");
        
        // 일괄 승인
        await batchApproveUsers(input.userIds, input.role);
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.batchApprove",
          entityType: "user",
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            userIds: input.userIds,
            role: input.role
          },
          description: `${input.userIds.length}명의 사용자를 일괄 승인`
        });
        
        return { success: true, message: `${input.userIds.length}명의 사용자가 승인되었습니다` };
      }),
    
    // 개별 거부 (관리자만)
    reject: adminProcedure
      .input(z.object({
        userId: z.number()
      }))
      .mutation(async ({ input, ctx }) => {
        const { rejectUser, createAuditLog, getUserById } = await import("./db");
        
        // 사용자 정보 조회
        const targetUser = await getUserById(input.userId);
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.'
          });
        }
        
        // tenant 격리 검증
        if (targetUser.tenantId !== ctx.user.tenantId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '다른 회사의 사용자는 거부할 수 없습니다.'
          });
        }
        
        // 사용자 거부
        await rejectUser(input.userId);
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.reject",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            approvalStatus: "rejected",
            targetUserEmail: targetUser?.email
          },
          description: `사용자 ${targetUser?.email}를 거부`
        });
        
        return { success: true, message: "사용자가 거부되었습니다" };
      }),
    
    // 일괄 거부 (관리자만)
    batchReject: adminProcedure
      .input(z.object({
        userIds: z.array(z.number())
      }))
      .mutation(async ({ input, ctx }) => {
        const { batchRejectUsers, createAuditLog } = await import("./db");
        
        // 일괄 거부
        await batchRejectUsers(input.userIds);
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.batchReject",
          entityType: "user",
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            userIds: input.userIds
          },
          description: `${input.userIds.length}명의 사용자를 일괄 거부`
        });
        
        return { success: true, message: `${input.userIds.length}명의 사용자가 거부되었습니다` };
      }),
    
    // 사용자 초대 (관리자만)
    invite: adminProcedure
      .input(z.object({
        email: z.string().email(),
        name: z.string(),
        role: z.enum(["admin", "worker", "monitor"]).default("worker"),
        userMemo: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { inviteUser, createAuditLog } = await import("./db");
        
        // 사용자 초대
        const { userId, tempPassword } = await inviteUser(
          input.email,
          input.name,
          input.role,
          ctx.user.id,
          input.userMemo
        );
        
        // 감사 로그 생성
        await createAuditLog({
          action: "user.invite",
          entityType: "user",
          entityId: userId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          changes: {
            email: input.email,
            name: input.name,
            role: input.role
          },
          description: `사용자 ${input.email}를 초대`
        });
        
        return { 
          success: true, 
          message: "사용자가 초대되었습니다",
          userId,
          tempPassword
        };
      }),
    
    // 사용자 삭제 (관리자만)
    delete: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteUser, getUserById } = await import("./db");
        
        // 자기 자신은 삭제할 수 없음
        if (input.userId === ctx.user.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "자기 자신을 삭제할 수 없습니다."
          });
        }
        
        // 사용자 정보 조회
        const targetUser = await getUserById(input.userId);
        
        if (!targetUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.'
          });
        }
        
        // tenant 격리 검증
        if (targetUser.tenantId !== ctx.user.tenantId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: '다른 회사의 사용자는 삭제할 수 없습니다.'
          });
        }
        
        await deleteUser(input.userId);
        
        return { success: true, message: "사용자가 삭제되었습니다" };
      })
  }),
  
  // 테넌트 관리 라우터 (슈퍼관리자만)
  opscoreSync: opscoreSyncRouter,
  tenant: router({
    // 모든 테넌트 목록 조회
    list: adminProcedure.query(async () => {
      const { getAllTenants } = await import("./db");
      return await getAllTenants();
    }),
    
    // 테넌트 상세 정보 조회
    getDetail: adminProcedure
      .input(z.object({
        tenantId: z.number()
      }))
      .query(async ({ input }) => {
        const { getTenantDetail } = await import("./db");
        return await getTenantDetail(input.tenantId);
      })
  }),
  
  // 체크리스트 템플릿 라우터
  checklistTemplate: router({
    // 템플릿 목록 조회
    list: protectedProcedure
      .input(z.object({
        category: z.string().optional(),
        ccpType: z.string().optional(),
        isActive: z.boolean().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getChecklistTemplates } = await import("./db");
        return await getChecklistTemplates({ ...input, tenantId: ctx.user.tenantId });
      }),
    
    // 템플릿 상세 조회 (항목 포함)
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getChecklistTemplateById } = await import("./db");
        const template = await getChecklistTemplateById(input.id);
        if (!template) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "템플릿을 찾을 수 없습니다."
          });
        }
        return template;
      }),
    
    // 템플릿 생성 (관리자만)
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1, "템플릿 이름은 필수입니다"),
        description: z.string().optional(),
        category: z.enum(["CCP", "SANITATION", "QUALITY", "SAFETY", "TRAINING", "MAINTENANCE"]),
        ccpType: z.string().optional(),
        priority: z.number().default(0),
        autoTriggerRules: z.any().optional(),
        items: z.array(
          z.object({
            sortOrder: z.number(),
            itemName: z.string().min(1, "항목 텍스트는 필수입니다"),
            itemType: z.enum(["checkbox", "number", "text", "select", "time", "date", "temperature", "pressure"]).default("checkbox"),
            required: z.boolean().default(true),
            validationRules: z.any().optional(),
            defaultValue: z.string().optional(),
            helpText: z.string().optional()
          })
        )
      }))
      .mutation(async ({ input, ctx }) => {
        const { createChecklistTemplateWithItems, createAuditLog } = await import("./db");
        const template = await createChecklistTemplateWithItems({
          ...input,
          createdBy: ctx.user.id
        });
        
        // 감사 로그 기록
        await createAuditLog({
          userId: ctx.user.id,
          action: "checklist_template.create",
          entityType: "checklist_template",
          entityId: template?.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `체크리스트 템플릿 생성: ${input.name}`
        });
        
        return template;
      }),
    
    // 템플릿 수정 (관리자만)
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        category: z.enum(["CCP", "SANITATION", "QUALITY", "SAFETY", "TRAINING", "MAINTENANCE"]).optional(),
        ccpType: z.string().optional(),
        priority: z.number().optional(),
        autoTriggerRules: z.any().optional(),
        isActive: z.boolean().optional(),
        items: z.array(
          z.object({
            id: z.number().optional(),
            sortOrder: z.number(),
            itemName: z.string().min(1),
            itemType: z.enum(["checkbox", "number", "text", "select", "time", "date", "temperature", "pressure"]),
            required: z.boolean(),
            description: z.string().optional(),
            validationRules: z.any().optional(),
            defaultValue: z.string().optional(),
            helpText: z.string().optional()
          })
        ).optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateChecklistTemplate, createAuditLog } = await import("./db");
        const { id, items, ...templateData } = input;
        const template = await updateChecklistTemplate(id, templateData, items);
        
        // 감사 로그 기록
        await createAuditLog({
          userId: ctx.user.id,
          action: "checklist_template.update",
          entityType: "checklist_template",
          entityId: id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `체크리스트 템플릿 수정: ${input.name || id}`
        });
        
        return template;
      }),
    
    // 템플릿 삭제 (비활성화, 관리자만)
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteChecklistTemplate, createAuditLog } = await import("./db");
        const result = await deleteChecklistTemplate(input.id);
        
        // 감사 로그 기록
        await createAuditLog({
          userId: ctx.user.id,
          action: "checklist_template.delete",
          entityType: "checklist_template",
          entityId: input.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `체크리스트 템플릿 삭제: ${input.id}`
        });
        
        return result;
      }),
    
    // 템플릿 복제 (관리자만)
    duplicate: adminProcedure
      .input(z.object({
        id: z.number(),
        newName: z.string().min(1)
      }))
      .mutation(async ({ input, ctx }) => {
        const { getChecklistTemplateById, createChecklistTemplateWithItems, createAuditLog } = await import("./db");
        const template = await getChecklistTemplateById(input.id);
        if (!template) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "템플릿을 찾을 수 없습니다."
          });
        }
        
        const newTemplate = await createChecklistTemplateWithItems({
          name: input.newName,
          description: template.description || undefined,
          category: template.category as any,
          ccpType: template.ccpType || undefined,
          priority: template.priority,
          autoTriggerRules: template.autoTriggerRules,
          createdBy: ctx.user.id,
          items: template.items.map((item: any) => ({
            sortOrder: item.sortOrder,
            itemName: item.itemName,
            itemType: item.itemType as any,
            required: Boolean(item.required),
            validationRules: item.validationRules,
            defaultValue: item.defaultValue || undefined,
            helpText: item.helpText || undefined
          }))
        });
        
        // 감사 로그 기록
        await createAuditLog({
          userId: ctx.user.id,
          action: "checklist_template.duplicate",
          entityType: "checklist_template",
          entityId: newTemplate?.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `체크리스트 템플릿 복제: ${input.newName}`
        });
        
        return newTemplate;
      })
  }),
  
  // 체크리스트 인스턴스 라우터
  
  // 감사 로그 라우터
  auditLog: router({
    // 감사 로그 목록 조회 (관리자만)
    list: adminProcedure
      .input(z.object({ limit: z.number().optional().default(100) }))
      .query(async ({ input }) => {
        const { getAuditLogs } = await import("./db");
        return await getAuditLogs(input.limit);
      }),
    
    // 특정 엔티티의 감사 로그 조회
    getByEntity: protectedProcedure
      .input(z.object({
        entityType: z.string(),
        entityId: z.number()
      }))
      .query(async ({ input }) => {
        const { getAuditLogsByEntity } = await import("./db");
        return await getAuditLogsByEntity(input.entityType, input.entityId);
      }),
    
    // 사용자별 감사 로그 조회
    getByUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
        limit: z.number().optional().default(50)
      }))
      .query(async ({ input }) => {
        const { getAuditLogsByUser } = await import("./db");
        return await getAuditLogsByUser(input.userId, input.limit);
      })
  }),

  // Excel 내보내기 라우터
  excel: router({
    // 배치 데이터 Excel 내보내기
    exportBatches: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        status: z.string().optional()
      }))
      .mutation(async ({ input }) => {
        const { getAllBatches } = await import("./db");
        const { exportBatchesToExcel } = await import("./excel");
        
        // 배치 목록 조회
        const batchData = await getAllBatches();
        const batches = batchData.items;
        
        // Excel 파일 생성
        const buffer = await exportBatchesToExcel(batches);
        
        // Base64 인코딩
        const base64 = buffer.toString("base64");
        
        return {
          data: base64,
          filename: `batches_${new Date().toISOString().split("T")[0]}.xlsx`
        };
      }),
    
    // 재고 데이터 Excel 내보내기
    exportInventory: protectedProcedure
      .mutation(async () => {
        const { getAllInventoryLots } = await import("./db");
        const { exportInventoryToExcel } = await import("./excel");
        
        // 재고 목록 조회
        const inventory = await getAllInventoryLots();
        
        // Excel 파일 생성
        const buffer = await exportInventoryToExcel(inventory);
        
        // Base64 인코딩
        const base64 = buffer.toString("base64");
        
        return {
          data: base64,
          filename: `inventory_${new Date().toISOString().split("T")[0]}.xlsx`
        };
      }),
    
    // 배치 템플릿 다운로드
    downloadBatchTemplate: protectedProcedure
      .mutation(async () => {
        const { generateBatchTemplate } = await import("./excel");
        
        const buffer = await generateBatchTemplate();
        const base64 = buffer.toString("base64");
        
        return {
          data: base64,
          filename: "batch_template.xlsx"
        };
      }),
    
    // 재고 템플릿 다운로드
    downloadInventoryTemplate: protectedProcedure
      .mutation(async () => {
        const { generateInventoryTemplate } = await import("./excel");
        
        const buffer = await generateInventoryTemplate();
        const base64 = buffer.toString("base64");
        
        return {
          data: base64,
          filename: "inventory_template.xlsx"
        };
      })
  }),

  // 검사 시스템 (Inspection System)
  // 원재료 마스터 관리 (h_materials)
  material: router({
    // 원재료 목록 조회 - itemMaster 기반 (h_mf_ingredients.material_id와 일치)
    list: protectedProcedure
      .input(
        z.object({
          page: z.number().default(1),
          limit: z.number().default(20),
          search: z.string().optional(),
          category: z.string().optional(),
          kind: z.enum(["RAW", "PACKAGING", "SUBSIDIARY"]).optional(),
          isActive: z.number().optional(),
          sortBy: z.enum(["materialCode", "materialName", "category", "createdAt"]).optional(),
          sortOrder: z.enum(["asc", "desc"]).optional()
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const { itemMaster } = await import("../drizzle/schema.js");
        
        const page = input?.page || 1;
        const limit = input?.limit || 20;
        const offset = (page - 1) * limit;
        
        // WHERE 조건 구성 - itemMaster 기반
        const conditions: any[] = [
          eq(itemMaster.tenantId, ctx.user.tenantId),
          eq(itemMaster.itemType, "raw_material")
        ];
        
        if (input?.search) {
          conditions.push(
            or(
              like(itemMaster.itemName, `%${input.search}%`),
              like(itemMaster.itemCode, `%${input.search}%`)
            )!
          );
        }
        
        if (input?.category) {
          conditions.push(eq(itemMaster.category, input.category));
        }
        
        // P0 FIX: 기본적으로 활성 데이터만 조회
        if (input?.isActive !== undefined) {
          conditions.push(eq(itemMaster.isActive, input.isActive));
        } else {
          conditions.push(eq(itemMaster.isActive, 1));
        }
        
        // 전체 개수 조회
        const totalResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(itemMaster)
          .where(and(...conditions));
        
        const total = Number(totalResult[0]?.count || 0);
        
        // 목록 조회 - materialName/materialCode 호환 필드명 유지
        const items = await db
          .select({
            id: itemMaster.id,
            materialCode: itemMaster.itemCode,
            materialName: itemMaster.itemName,
            category: itemMaster.category,
            unit: itemMaster.baseUnit,
            tenantId: itemMaster.tenantId,
            isActive: itemMaster.isActive,
            supplierId: itemMaster.supplierId,
            description: itemMaster.description,
            createdAt: itemMaster.createdAt,
            updatedAt: itemMaster.updatedAt,
          })
          .from(itemMaster)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset)
          .orderBy(
            input?.sortBy === "materialCode" 
              ? (input?.sortOrder === "desc" ? desc(itemMaster.itemCode) : asc(itemMaster.itemCode))
              : input?.sortBy === "materialName"
              ? (input?.sortOrder === "desc" ? desc(itemMaster.itemName) : asc(itemMaster.itemName))
              : input?.sortBy === "category"
              ? (input?.sortOrder === "desc" ? desc(itemMaster.category) : asc(itemMaster.category))
              : desc(itemMaster.createdAt)
          );
        
        return {
          items,
          total,
          page,
          limit
        };
      }),

    // 원재료 전체 내보내기 (엑셀 다운로드용)
    exportAll: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        
        const items = await db
          .select()
          .from(hMaterials)
          .where(and(
            eq(hMaterials.tenantId, ctx.user.tenantId),
            eq(hMaterials.isActive, 1)
          ))
          .orderBy(asc(hMaterials.materialCode));
        
        return { items, total: items.length };
      }),
    
    // 원재료 상세 조회
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        
        const materials = await db
          .select()
          .from(hMaterials)
          .where(
            and(
              eq(hMaterials.id, input.id),
              eq(hMaterials.tenantId, ctx.user.tenantId)
            )
          )
          .limit(1);
        
        if (materials.length === 0) {
          throw new Error("원재료를 찾을 수 없습니다");
        }
        
        return materials[0];
      }),
    
    // 원재료 생성
    create: workerProcedure
      .input(
        z.object({
          materialCode: z.string(),
          materialName: z.string(),
          kind: z.enum(["RAW", "PACKAGING", "SUBSIDIARY"]),
          category: z.string().optional(),
          categoryId: z.number().optional(),
          unit: z.string().optional(),
          supplierId: z.number().optional(),
          shelfLifeDays: z.number().optional(),
          expiryWarningDays: z.number().optional(),
          safetyStockLevel: z.number().optional(),
          unitPrice: z.number().optional(),
          purchaseUnit: z.string().optional(),
          conversionRate: z.number().optional(),
          defaultPackagingSize: z.number().optional(),
          description: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        
        // 중복 코드 체크
        const existing = await db
          .select()
          .from(hMaterials)
          .where(
            and(
              eq(hMaterials.materialCode, input.materialCode),
              eq(hMaterials.tenantId, ctx.user.tenantId)
            )
          )
          .limit(1);
        
        if (existing.length > 0) {
          throw new Error("이미 존재하는 원재료 코드입니다");
        }
        
        const result = await db.insert(hMaterials).values({
          ...input,
          tenantId: ctx.user.tenantId
        });
        const newMaterialId = Number(result[0].insertId);
        
        // item_master 테이블에도 동기화 생성
        try {
          const { itemMaster } = await import("../drizzle/schema/schema_dual_unit.js");
          await db.insert(itemMaster).values({
            tenantId: ctx.user.tenantId,
            itemCode: input.materialCode,
            itemName: input.materialName,
            itemType: 'raw_material',
            category: input.category || null,
            baseUnit: input.unit || 'kg',
            supplierId: input.supplierId || null,
            purchaseUnit: input.purchaseUnit || null,
            purchaseConversionRate: input.conversionRate ? String(input.conversionRate) : '1.0000',
            shelfLifeDays: input.shelfLifeDays || null,
            description: input.description || null,
            legacyMaterialId: newMaterialId,
            isActive: input.isActive ?? 1,
          });
        } catch (syncErr) {
          console.error('item_master 동기화 생성 실패 (material):', syncErr);
        }
        
        return {
          success: true,
          id: newMaterialId
        };
      }),
    
    // 원재료 수정
    update: workerProcedure
      .input(
        z.object({
          id: z.number(),
          materialCode: z.string().optional(),
          materialName: z.string().optional(),
          kind: z.enum(["RAW", "PACKAGING", "SUBSIDIARY"]).optional(),
          category: z.string().optional(),
          categoryId: z.number().optional(),
          unit: z.string().optional(),
          supplierId: z.number().optional(),
          shelfLifeDays: z.number().optional(),
          expiryWarningDays: z.number().optional(),
          safetyStockLevel: z.number().optional(),
          unitPrice: z.number().optional(),
          purchaseUnit: z.string().optional(),
          conversionRate: z.number().optional(),
          defaultPackagingSize: z.number().optional(),
          description: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        
        const { id, ...data } = input;
        
        await db
          .update(hMaterials)
          .set(data)
          .where(
            and(
              eq(hMaterials.id, id),
              eq(hMaterials.tenantId, ctx.user.tenantId)
            )
          );
        
        // item_master 테이블 동기화 (legacyMaterialId로 연결)
        try {
          const { itemMaster } = await import("../drizzle/schema/schema_dual_unit.js");
          const syncData: any = {};
          if (data.materialName) syncData.itemName = data.materialName;
          if (data.materialCode) syncData.itemCode = data.materialCode;
          if (data.category) syncData.category = data.category;
          if (data.unit) syncData.baseUnit = data.unit;
          if (data.shelfLifeDays !== undefined) syncData.shelfLifeDays = data.shelfLifeDays;
          if (data.description) syncData.description = data.description;
          if (Object.keys(syncData).length > 0) {
            await db.update(itemMaster).set(syncData).where(
              and(eq(itemMaster.legacyMaterialId, id), eq(itemMaster.tenantId, ctx.user.tenantId))
            );
          }
        } catch (syncErr) {
          console.error('item_master 동기화 실패 (material):', syncErr);
        }
        
        return { success: true };
      }),
    
    // 원재료 삭제 (soft delete)
    delete: workerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        
        // list는 itemMaster 기반이므로 input.id는 itemMaster.id
        // 먼저 itemMaster에서 legacyMaterialId를 조회
        const { itemMaster } = await import("../drizzle/schema/schema_dual_unit.js");
        const [item] = await db.select({ legacyMaterialId: itemMaster.legacyMaterialId })
          .from(itemMaster)
          .where(
            and(
              eq(itemMaster.id, input.id),
              eq(itemMaster.tenantId, ctx.user.tenantId)
            )
          )
          .limit(1);
        
        // itemMaster 비활성화
        await db.update(itemMaster).set({ isActive: 0 }).where(
          and(eq(itemMaster.id, input.id), eq(itemMaster.tenantId, ctx.user.tenantId))
        );
        
        // hMaterials도 비활성화 (legacyMaterialId로 연결)
        if (item?.legacyMaterialId) {
          await db
            .update(hMaterials)
            .set({ isActive: 0 })
            .where(
              and(
                eq(hMaterials.id, item.legacyMaterialId),
                eq(hMaterials.tenantId, ctx.user.tenantId)
              )
            );
        }
        
        return { success: true };
      }),
    
    // 원재료 대량 등록 (엑셀 업로드)
    bulkCreate: workerProcedure
      .input(
        z.object({
          materials: z.array(
            z.object({
              materialName: z.string(),
              unit: z.string().optional(),
              safetyStock: z.number().optional(),
              category: z.string().optional(),
              expiryWarningDays: z.number().optional(),
              storageMethod: z.string().optional(),
              notes: z.string().optional(),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        
        let insertCount = 0;
        let updateCount = 0;
        let failureCount = 0;
        const errors: { row: number; name: string; error: string }[] = [];
        
        // MAX 코드 번호를 루프 밖에서 한 번만 조회
        const maxCodeResult = await db.execute(sql`
          SELECT COALESCE(MAX(CAST(SUBSTRING(material_code, 5) AS UNSIGNED)), 0) as max_num 
          FROM h_materials WHERE tenant_id = ${ctx.user.tenantId}
        `);
        // drizzle db.execute returns [rows, fields] for MySQL
        const maxRows = Array.isArray((maxCodeResult as any)[0]) ? (maxCodeResult as any)[0] : maxCodeResult;
        let codeCounter = Number((maxRows as any)[0]?.max_num || 0);
        console.log("[bulkCreate] MAX code query result:", JSON.stringify(maxCodeResult), "=> codeCounter:", codeCounter);
        
        for (let i = 0; i < input.materials.length; i++) {
          const mat = input.materials[i];
          try {
            const trimmedName = mat.materialName.trim();
            if (!trimmedName) {
              errors.push({ row: i + 1, name: mat.materialName, error: "원재료명이 비어있습니다" });
              failureCount++;
              continue;
            }
            
            // 기존 원재료 조회 (원재료명으로 매칭)
            const existing = await db
              .select()
              .from(hMaterials)
              .where(
                and(
                  eq(hMaterials.materialName, trimmedName),
                  eq(hMaterials.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);
            
            if (existing.length > 0) {
              // UPSERT: 이미 존재하면 변경된 필드만 업데이트
              const updates: Record<string, any> = {};
              if (mat.unit && mat.unit !== existing[0].unit) updates.unit = mat.unit;
              if (mat.category !== undefined && mat.category !== existing[0].category) updates.category = mat.category || null;
              if (mat.safetyStock !== undefined) {
                const newSafety = String(mat.safetyStock);
                if (newSafety !== existing[0].safetyStockLevel) updates.safetyStockLevel = newSafety;
              }
              if (mat.expiryWarningDays !== undefined && mat.expiryWarningDays !== existing[0].expiryWarningDays) {
                updates.expiryWarningDays = mat.expiryWarningDays;
              }
              const newDesc = [mat.storageMethod, mat.notes].filter(Boolean).join(" / ") || null;
              if (newDesc !== existing[0].description) updates.description = newDesc;
              
              if (Object.keys(updates).length > 0) {
                await db.update(hMaterials)
                  .set(updates)
                  .where(eq(hMaterials.id, existing[0].id));
                updateCount++;
              } else {
                updateCount++; // 변경 없어도 성공으로 카운트
              }
            } else {
              // INSERT: 신규 등록
              codeCounter++;
              const materialCode = `MAT-${String(codeCounter).padStart(3, '0')}`;
              
              const matInsertResult = await db.insert(hMaterials).values({
                materialCode,
                materialName: trimmedName,
                kind: "RAW",
                category: mat.category || null,
                unit: mat.unit || "kg",
                safetyStockLevel: mat.safetyStock !== undefined ? String(mat.safetyStock) : "0.000",
                expiryWarningDays: mat.expiryWarningDays || 7,
                description: [mat.storageMethod, mat.notes].filter(Boolean).join(" / ") || null,
                tenantId: ctx.user.tenantId,
              });
              
              // item_master 동기화
              try {
                const { itemMaster } = await import("../drizzle/schema/schema_dual_unit.js");
                await db.insert(itemMaster).values({
                  tenantId: ctx.user.tenantId,
                  itemCode: materialCode,
                  itemName: trimmedName,
                  itemType: 'raw_material',
                  category: mat.category || null,
                  baseUnit: mat.unit || 'kg',
                  shelfLifeDays: mat.expiryWarningDays || null,
                  description: [mat.storageMethod, mat.notes].filter(Boolean).join(" / ") || null,
                  legacyMaterialId: Number(matInsertResult[0].insertId),
                  isActive: 1,
                });
              } catch (syncErr) {
                console.error('item_master 동기화 실패 (material bulkCreate):', syncErr);
              }
              insertCount++;
            }
          } catch (err: any) {
            errors.push({ row: i + 1, name: mat.materialName, error: err.message });
            failureCount++;
          }
        }
        
        return {
          success: failureCount === 0,
          successCount: insertCount + updateCount,
          insertCount,
          updateCount,
          failureCount,
          errors,
          total: input.materials.length,
        };
      }),

    // 가격 이력 조회
    getPriceHistory: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        
        // 원재료 입고 이력에서 가격 정보 추출
        const history = await db.execute(sql`
          SELECT 
            il.receivedAt as date,
            il.unitPrice as price,
            il.quantity,
            s.supplierName as supplier
          FROM h_inventory_lots il
          LEFT JOIN h_suppliers s ON il.supplierId = s.id
          WHERE il.materialId = ${input.materialId}
            AND il.tenantId = ${ctx.user.tenantId}
            AND il.unitPrice IS NOT NULL
          ORDER BY il.receivedAt DESC
          LIMIT 50
        `);
        
        return history;
      })
  }),

  inspection: router({
    // 검사 통계 대시보드
    getStatistics: protectedProcedure
      .input(
        z.object({
          type: z.enum(["material", "hygiene", "shipping"]),
          range: z.enum(["week", "month", "quarter"])
        })
      )
      .query(async ({ input }) => {
        const { getInspectionDashboardStatistics } = await import("./db");
        return await getInspectionDashboardStatistics(input);
      }),
    
    // 원재료 검사
    material: router({
      // 원재료 검사 기록 생성
      create: workerProcedure
        .input(
          z.object({
            materialId: z.number(),
            materialCode: z.string(),
            materialName: z.string(),
            lotNumber: z.string(),
            inspectionDate: z.string(),
            inspectorName: z.string(),
            supplierName: z.string().optional(),
            notes: z.string().optional(),
            items: z.array(
              z.object({
                itemName: z.string(),
                standard: z.string().optional(),
                result: z.string().optional(),
                passed: z.enum(["pass", "fail", "na"]),
                sortOrder: z.number()
              })
            )
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { createMaterialInspectionRecord, addMaterialInspectionItem } = await import("./db");
          
          const recordId = await createMaterialInspectionRecord({
            ...input,
            inspectorId: ctx.user.id
          });

          for (const item of input.items) {
            await addMaterialInspectionItem({ recordId, ...item });
          }

          return { success: true, recordId };
        }),

      // 원재료 검사 기록 목록 조회
      list: protectedProcedure
        .input(
          z
            .object({
              startDate: z.string().optional(),
              endDate: z.string().optional(),
              status: z.string().optional(),
              inspectionResult: z.string().optional()
            })
            .optional()
        )
        .query(async ({ input }) => {
          const { getMaterialInspectionRecords } = await import("./db");
          return await getMaterialInspectionRecords(input);
        }),

      // 원재료 검사 기록 상세 조회
      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const { getMaterialInspectionRecordById } = await import("./db");
          return await getMaterialInspectionRecordById(input.id);
        }),

      // 원재료 검사 기록 상태 변경
      updateStatus: workerProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "completed", "rejected"]),
            inspectionResult: z.enum(["pass", "fail", "conditional"]).optional()
          })
        )
        .mutation(async ({ input }) => {
          const { updateMaterialInspectionStatus } = await import("./db");
          return await updateMaterialInspectionStatus(
            input.id,
            input.status,
            input.inspectionResult
          );
        }),
      // 원재료 검사 기록 수정
      update: workerProcedure
        .input(
          z.object({
            id: z.number(),
            materialName: z.string().optional(),
            lotNumber: z.string().optional(),
            inspectionDate: z.string().optional(),
            inspector: z.string().optional(),
            supplier: z.string().optional(),
            appearance: z.string().optional(), // 외관
            odor: z.string().optional(), // 냄새
            color: z.string().optional(), // 색상
            temperature: z.number().optional(), // 온도
            result: z.enum(["pass", "fail", "conditional"]).optional(), // 검사 결과
            inspectionResult: z.enum(["pass", "fail"]).optional(),
            status: z.enum(["pending", "completed", "rejected"]).optional(),
            items: z.array(
              z.object({
                id: z.number().optional(),
                itemName: z.string(),
                standard: z.string(),
                result: z.string(),
                passed: z.boolean(),
                sortOrder: z.number()
              })
            ).optional()
          })
        )
        .mutation(async ({ input }) => {
          const { updateMaterialInspectionRecord } = await import("./db");
          const { id, ...data } = input;
          await updateMaterialInspectionRecord(id, {
            ...data,
            inspectionDate: data.inspectionDate ? new Date(data.inspectionDate) : undefined
          });
          return { success: true, message: "검사 기록이 수정되었습니다." };
        })
    }),

    // 출하 검사
    shipping: router({
      // 출하 검사 기록 생성
      create: workerProcedure
        .input(
          z.object({
            batchId: z.number(),
            batchCode: z.string(),
            productCode: z.string(),
            productName: z.string(),
            inspectionDate: z.string(),
            inspectorName: z.string(),
            quantity: z.string().optional(),
            notes: z.string().optional(),
            items: z.array(
              z.object({
                itemName: z.string(),
                standard: z.string().optional(),
                result: z.string().optional(),
                passed: z.enum(["pass", "fail", "na"]),
                sortOrder: z.number()
              })
            )
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { createShippingInspectionRecord, addShippingInspectionItem } = await import("./db");
          
          const recordId = await createShippingInspectionRecord({
            ...input,
            inspectorId: ctx.user.id
          });

          for (const item of input.items) {
            await addShippingInspectionItem({ recordId, ...item });
          }

          return { success: true, recordId };
        }),

      // 출하 검사 기록 목록 조회
      list: protectedProcedure
        .input(
          z
            .object({
              startDate: z.string().optional(),
              endDate: z.string().optional(),
              status: z.string().optional(),
              inspectionResult: z.string().optional()
            })
            .optional()
        )
        .query(async ({ input }) => {
          const { getShippingInspectionRecords } = await import("./db");
          return await getShippingInspectionRecords(input);
        }),

      // 출하 검사 기록 상세 조회
      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const { getShippingInspectionRecordById } = await import("./db");
          return await getShippingInspectionRecordById(input.id);
        }),

      // 출하 검사 기록 상태 변경
      updateStatus: workerProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "completed", "rejected"]),
            inspectionResult: z.enum(["pass", "fail", "hold"]).optional()
          })
        )
        .mutation(async ({ input }) => {
          const { updateShippingInspectionStatus } = await import("./db");
          return await updateShippingInspectionStatus(
            input.id,
            input.status,
            input.inspectionResult
          );
        }),
      // 출하 검사 기록 수정
      update: workerProcedure
        .input(
          z.object({
            id: z.number(),
            productName: z.string().optional(),
            batchCode: z.string().optional(),
            quantity: z.number().optional(),
            inspectionDate: z.string().optional(),
            inspector: z.string().optional(),
            inspectionResult: z.enum(["pass", "fail"]).optional(),
            status: z.enum(["pending", "completed", "rejected"]).optional(),
            items: z.array(
              z.object({
                id: z.number().optional(),
                itemName: z.string(),
                standard: z.string(),
                result: z.string(),
                passed: z.boolean(),
                sortOrder: z.number()
              })
            ).optional()
          })
        )
        .mutation(async ({ input }) => {
          const { updateShippingInspectionRecord } = await import("./db");
          const { id, ...data } = input;
          await updateShippingInspectionRecord(id, {
            ...data,
            inspectionDate: data.inspectionDate ? new Date(data.inspectionDate) : undefined
          });
          return { success: true, message: "검사 기록이 수정되었습니다." };
        })
    }),

    // 위생 검사
    hygiene: router({
      // 위생 검사 기록 생성
      create: workerProcedure
        .input(
          z.object({
            inspectionDate: z.string(),
            inspectionArea: z.string(),
            inspectorName: z.string(),
            notes: z.string().optional(),
            items: z.array(
              z.object({
                itemName: z.string(),
                standard: z.string().optional(),
                result: z.string().optional(),
                passed: z.enum(["pass", "fail", "na"]),
                sortOrder: z.number()
              })
            )
          })
        )
        .mutation(async ({ input, ctx }) => {
          const { createHygieneInspectionRecord, addHygieneInspectionItem } = await import("./db");
          
          const recordId = await createHygieneInspectionRecord({
            ...input,
            inspectorId: ctx.user.id
          });

          for (const item of input.items) {
            await addHygieneInspectionItem({ recordId, ...item });
          }

          return { success: true, recordId };
        }),

      // 위생 검사 기록 목록 조회
      list: protectedProcedure
        .input(
          z
            .object({
              startDate: z.string().optional(),
              endDate: z.string().optional(),
              status: z.string().optional(),
              result: z.string().optional()
            })
            .optional()
        )
        .query(async ({ input }) => {
          const { getHygieneInspectionRecords } = await import("./db");
          return await getHygieneInspectionRecords(input);
        }),

      // 위생 검사 기록 상세 조회
      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const { getHygieneInspectionRecordById } = await import("./db");
          return await getHygieneInspectionRecordById(input.id);
        }),

      // 위생 검사 기록 상태 변경
      updateStatus: workerProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "completed", "action_required"]),
            result: z.enum(["good", "fair", "poor"]).optional()
          })
        )
        .mutation(async ({ input }) => {
          const { updateHygieneInspectionStatus } = await import("./db");
          return await updateHygieneInspectionStatus(
            input.id,
            input.status,
            input.result
          );
        }),
      // 위생 검사 기록 수정
      update: workerProcedure
        .input(
          z.object({
            id: z.number(),
            inspectionArea: z.string().optional(),
            inspectionDate: z.string().optional(),
            inspector: z.string().optional(),
            result: z.enum(["pass", "fail"]).optional(),
            status: z.enum(["pending", "completed", "action_required"]).optional(),
            items: z.array(
              z.object({
                id: z.number().optional(),
                itemName: z.string(),
                standard: z.string(),
                result: z.string(),
                passed: z.boolean(),
                sortOrder: z.number()
              })
            ).optional()
          })
        )
        .mutation(async ({ input }) => {
          const { updateHygieneInspectionRecord } = await import("./db");
          const { id, ...data } = input;
          await updateHygieneInspectionRecord(id, {
            ...data,
            inspectionDate: data.inspectionDate ? new Date(data.inspectionDate) : undefined
          });
          return { success: true, message: "검사 기록이 수정되었습니다." };
        })
     })
  }),
  // 체크리스트 관리
  checklist: router({
    // 템플릿 관리
    template: router({
      // 템플릿 목록 조회
      list: protectedProcedure
        .input(
          z
            .object({
              category: z.string().optional()
            })
            .optional()
        )
        .query(async ({ input }) => {
          const { getChecklistTemplates } = await import("./db");
          return await getChecklistTemplates({
            category: input?.category as any
          });
        }),
      // 템플릿 상세 조회
      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const { getChecklistTemplateById } = await import("./db");
          return await getChecklistTemplateById(input.id);
        }),
      // 템플릿 생성
      create: workerProcedure
        .input(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            category: z.string(),
            items: z.array(
              z.object({
                itemName: z.string(),
                itemType: z.string(),
                sortOrder: z.number(),
                required: z.boolean()
              })
            )
          })
        )
        .mutation(async ({ input }) => {
          const { createChecklistTemplate } = await import("./db");
          return await createChecklistTemplate({
            ...input,
            category: input.category as any
          });
        }),
      // 템플릿 수정
      update: workerProcedure
        .input(
          z.object({
            id: z.number(),
            name: z.string().optional(),
            description: z.string().optional(),
            category: z.string().optional(),
            items: z
              .array(
                z.object({
                  id: z.number().optional(),
                  itemName: z.string(),
                  itemType: z.string(),
                  sortOrder: z.number(),
                  required: z.boolean()
                })
              )
              .optional()
          })
        )
        .mutation(async ({ input }) => {
          const { updateChecklistTemplate } = await import("./db");
          const { id, ...data } = input;
          return await updateChecklistTemplate(id, {
            ...data,
            category: data.category as any
          });
        }),
      // 템플릿 삭제
      delete: workerProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const { deleteChecklistTemplate } = await import("./db");
          return await deleteChecklistTemplate(input.id);
        })
    }),
    // 인스턴스 관리
    instance: router({
      // 인스턴스 목록 조회
      list: protectedProcedure
        .input(
          z
            .object({
              templateId: z.number().optional(),
              status: z.string().optional(),
              startDate: z.string().optional(),
              endDate: z.string().optional()
            })
            .optional()
        )
        .query(async ({ input }) => {
          const { getChecklistInstancesByBatch } = await import("./db");
          // 기존 함수는 batchId만 지원하므로 모든 인스턴스 조회는 별도 구현 필요
          // 임시로 빈 배열 반환
          return [];
        }),
      // 인스턴스 상세 조회
      getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const { getChecklistInstanceById } = await import("./db");
          return await getChecklistInstanceById(input.id);
        }),
      // 인스턴스 생성
      create: workerProcedure
        .input(
          z.object({
            templateId: z.number(),
            checkDate: z.string(),
            checkedBy: z.string(),
            notes: z.string().optional(),
            items: z.array(
              z.object({
                itemName: z.string(),
                itemType: z.string(),
                sortOrder: z.number(),
                required: z.boolean(),
                value: z.string().optional(),
                checked: z.boolean()
              })
            )
          })
        )
        .mutation(async ({ input }) => {
          const { createChecklistInstanceFromTemplate } = await import("./db");
          return await createChecklistInstanceFromTemplate({
            templateId: input.templateId,
            batchId: undefined,
            ccpRecordId: undefined,
            scheduledDate: input.checkDate,
            createdBy: 0, // 사용자 ID는 추후 ctx.user.id로 대체
          });
        }),
      // 인스턴스 항목 업데이트
      updateItem: workerProcedure
        .input(
          z.object({
            itemId: z.number(),
            value: z.string().optional(),
            checked: z.boolean().optional()
          })
        )
        .mutation(async ({ input }) => {
          const { updateChecklistInstanceItem } = await import("./db");
          const { itemId, ...data } = input;
          return await updateChecklistInstanceItem(itemId, data);
        }),
      // 인스턴스 상태 변경
      updateStatus: workerProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["pending", "in_progress", "completed", "skipped", "cancelled"])
          })
        )
        .mutation(async ({ input }) => {
          const { completeChecklistInstance } = await import("./db");
          if (input.status === "completed") {
            return await completeChecklistInstance(input.id, 0); // 사용자 ID는 추후 ctx.user.id로 대체
          }
          return { success: true };
        })
    })
  }),

  // CCP 템플릿 관리
  ccpTemplate: router({
    list: publicProcedure.query(async () => {
      const { getAllCcpTemplates } = await import("./db");
      return await getAllCcpTemplates();
    }),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getCcpTemplateById } = await import("./db");
        return await getCcpTemplateById(input.id);
      }),
    create: adminProcedure
      .input(
        z.object({
          templateName: z.string().min(1),
          productNamePattern: z.string().min(1),
          ccpType: z.string().min(1),
          description: z.string().optional(),
          priority: z.number().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { createCcpTemplate } = await import("./db");
        return await createCcpTemplate(input);
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          templateName: z.string().optional(),
          productNamePattern: z.string().optional(),
          ccpType: z.string().optional(),
          description: z.string().optional(),
          priority: z.number().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updateCcpTemplate } = await import("./db");
        const { id, ...data } = input;
        return await updateCcpTemplate(id, data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteCcpTemplate } = await import("./db");
        return await deleteCcpTemplate(input.id);
      })
  }),

  supplier: router({
    getAll: protectedProcedure
      .input(
        z.object({
          page: z.number().default(1),
          limit: z.number().default(20),
          search: z.string().optional(),
          sortBy: z.enum(["supplierCode", "supplierName", "supplierType", "createdAt"]).optional(),
          sortOrder: z.enum(["asc", "desc"]).optional()
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const { getSupplierPartners } = await import("./partners");
        return await getSupplierPartners({
          page: input?.page,
          limit: input?.limit,
          search: input?.search,
          sortBy: input?.sortBy,
          sortOrder: input?.sortOrder,
        }, ctx.user.tenantId);
      }),
    // 거래처 전체 내보내기 (엑셀 다운로드용)
    exportAll: protectedProcedure
      .query(async ({ ctx }) => {
        const { getSupplierPartners } = await import("./partners");
        const result = await getSupplierPartners({ page: 1, limit: 10000 }, ctx.user.tenantId);
        return { items: result.items, total: result.total };
      }),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getSupplierById } = await import("./db");
        return await getSupplierById(input.id);
      }),
    create: adminProcedure
      .input(
        z.object({
          supplierName: z.string().min(1),
          supplierCode: z.string().optional(),
          businessNumber: z.string().optional(),
          contactPerson: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().email().optional(),
          address: z.string().optional(),
          supplierType: z.string().optional(),
          certifications: z.string().optional(),
          rating: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createSupplierPartner } = await import("./partners");
        return await createSupplierPartner({ ...input, tenantId: ctx.user.tenantId });
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          supplierName: z.string().optional(),
          supplierCode: z.string().optional(),
          businessNumber: z.string().optional(),
          contactPerson: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().email().optional(),
          address: z.string().optional(),
          supplierType: z.string().optional(),
          certifications: z.string().optional(),
          rating: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updateSupplierPartner } = await import("./partners");
        const { id, ...data } = input;
        return await updateSupplierPartner(id, data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteSupplierPartner } = await import("./partners");
        return await deleteSupplierPartner(input.id, ctx.user.tenantId);
      }),

    // 자동 코드 생성
    generateCode: protectedProcedure
      .query(async () => {
        const { generateSupplierCode } = await import("./db/codeGenerator.js");
        return await generateSupplierCode();
      }),
    
    // 거래처 일괄 등록 (UPSERT - 동일 거래처명 있으면 수정, 없으면 신규)
    bulkCreate: adminProcedure
      .input(
        z.object({
          suppliers: z.array(
            z.object({
              supplierName: z.string().min(1),
              businessNumber: z.string().optional(),
              contactPerson: z.string().optional(),
              phone: z.string().optional(),
              email: z.string().email().optional().or(z.literal("")),
              address: z.string().optional(),
              supplierType: z.string().optional(),
              notes: z.string().optional()
            })
          )
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const { createUploadHistory } = await import("./db/uploadHistory.js");
        
        const results = { successCount: 0, insertCount: 0, updateCount: 0, failureCount: 0, errors: [] as any[] };
        
        // 현재 최대 코드 번호 조회
        const maxResult = await db.execute(sql`SELECT MAX(CAST(SUBSTRING(supplier_code, 5) AS UNSIGNED)) as maxNum FROM h_suppliers WHERE tenant_id = ${ctx.user.tenantId} AND supplier_code REGEXP '^SUP-[0-9]+$'`);
        let codeCounter = Number((maxResult as any)[0]?.[0]?.maxNum || (maxResult as any)[0]?.maxNum || 0);
        
        for (let i = 0; i < input.suppliers.length; i++) {
          try {
            const supplier = input.suppliers[i];
            if (!supplier.supplierName?.trim()) {
              results.errors.push({ row: i + 2, supplierName: "", message: "거래처명이 비어있습니다" });
              results.failureCount++;
              continue;
            }
            
            const existing = await db.select().from(hSuppliers)
              .where(and(eq(hSuppliers.tenantId, ctx.user.tenantId), eq(hSuppliers.supplierName, supplier.supplierName.trim())))
              .limit(1);
            
            if (existing.length > 0) {
              const updateData: any = {};
              if (supplier.businessNumber !== undefined) updateData.businessNumber = supplier.businessNumber;
              if (supplier.contactPerson !== undefined) updateData.contactPerson = supplier.contactPerson;
              if (supplier.phone !== undefined) updateData.phone = supplier.phone;
              if (supplier.email && supplier.email !== "") updateData.email = supplier.email;
              if (supplier.address !== undefined) updateData.address = supplier.address;
              if (supplier.supplierType !== undefined) updateData.supplierType = supplier.supplierType;
              
              if (Object.keys(updateData).length > 0) {
                await db.update(hSuppliers).set(updateData).where(eq(hSuppliers.id, existing[0].id));
              }
              results.updateCount++;
            } else {
              codeCounter++;
              const supplierCode = "SUP-" + String(codeCounter).padStart(3, "0");
              
              await db.insert(hSuppliers).values({
                tenantId: ctx.user.tenantId,
                supplierCode,
                supplierName: supplier.supplierName.trim(),
                businessNumber: supplier.businessNumber || null,
                contactPerson: supplier.contactPerson || null,
                phone: supplier.phone || null,
                email: (supplier.email && supplier.email !== "") ? supplier.email : null,
                address: supplier.address || null,
                supplierType: supplier.supplierType || null,
              });
              results.insertCount++;
            }
            results.successCount++;
          } catch (error: any) {
            results.failureCount++;
            results.errors.push({ row: i + 2, supplierName: input.suppliers[i].supplierName, message: error.message || "등록 실패" });
          }
        }
        
        await createUploadHistory({
          uploadType: "supplier",
          userId: ctx.user.id,
          userName: ctx.user.name,
          fileName: "Excel Upload",
          totalCount: input.suppliers.length,
          successCount: results.successCount,
          errorCount: results.failureCount,
          errors: results.errors
        });
        
        return results;
      }),
  }),

  // 생산 관리 (Production Management)
  production: router({
    // 평가 생성
    create: adminProcedure
      .input(
        z.object({
          supplierId: z.number(),
          evaluationDate: z.string(),
          qualityScore: z.number().min(1).max(5),
          deliveryScore: z.number().min(1).max(5),
          priceScore: z.number().min(1).max(5),
          serviceScore: z.number().min(1).max(5),
          responseScore: z.number().min(1).max(5),
          comments: z.string().optional(),
          strengths: z.string().optional(),
          weaknesses: z.string().optional(),
          recommendations: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createSupplierEvaluation } = await import("./db");
        const evaluationId = await createSupplierEvaluation({
          ...input,
          evaluationDate: new Date(input.evaluationDate),
          evaluatedBy: ctx.user.id
        });
        return { success: true, evaluationId };
      }),

    // 평가 목록 조회
    list: protectedProcedure
      .input(z.object({ supplierId: z.number().optional() }))
      .query(async ({ input }) => {
        const { getSupplierEvaluations } = await import("./db");
        return await getSupplierEvaluations(input.supplierId);
      }),

    // 평가 통계 조회
    getStats: protectedProcedure
      .input(z.object({ supplierId: z.number() }))
      .query(async ({ input }) => {
        const { getSupplierEvaluationStats } = await import("./db");
        return await getSupplierEvaluationStats(input.supplierId);
      })
  }),

  // 승인 워크플로우
  approval: router({
    // 승인 대시보드 - 전체 승인 대기 항목 조회
    getPendingApprovals: protectedProcedure.query(async () => {
      const { getPendingApprovals } = await import("./db");
      return await getPendingApprovals(ctx.user.tenantId);
    }),
    
    // 범용 승인 요청 생성
    createRequest: protectedProcedure
      .input(
        z.object({
          requestType: z.string(),
          referenceType: z.string().optional(),
          referenceId: z.number().optional(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("./db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.user.tenantId,
          siteId: ctx.user.siteId || 1,
          requestType: input.requestType,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // 승인 요청 목록 조회
    list: protectedProcedure
      .input(
        z.object({
          status: z.string().optional(),
          requestType: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getApprovalRequests } = await import("./db");
        if (!ctx.user.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "tenantId is required" });
        }
        return await getApprovalRequests({ ...input, tenantId: ctx.user.tenantId });
      }),

    // 승인 요청 상세 조회
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getApprovalRequestById } = await import("./db");
        return await getApprovalRequestById(input.id);
      }),

    // 배치 승인 요청
    requestBatchApproval: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("./db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.user.tenantId,
          siteId: ctx.user.siteId || 1,
          requestType: "batch_approval",
          referenceType: "batch",
          referenceId: input.batchId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // CCP 검토 승인 요청
    requestCcpReview: workerProcedure
      .input(
        z.object({
          ccpInstanceId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("./db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.user.tenantId,
          siteId: ctx.user.siteId || 1,
          requestType: "ccp_review",
          referenceType: "ccp_instance",
          referenceId: input.ccpInstanceId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // 승인 처리
    approve: monitorProcedure
      .input(
        z.object({
          requestId: z.number(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveRequest, getApprovalRequestById, createNotification } = await import("./db");
        
        // 승인 처리
        const result = await approveRequest(input.requestId, ctx.user.id, input.notes);
        
        // 요청 정보 조회
        const request = await getApprovalRequestById(input.requestId);
        if (request) {
          // 요청자에게 알림 전송
          await createNotification({
            userId: request.requestedBy,
            notificationType: "approval_completed",
            title: "승인 완료",
            message: `"${request.title}" 요청이 승인되었습니다. 승인자: ${ctx.user.name}${input.notes ? ` (\n코멘트: ${input.notes})` : ""}`,
            referenceType: request.referenceType || undefined,
            referenceId: request.referenceId || undefined
          });
        }
        
        return result;
      }),

    // 일괄 승인 처리
    bulkApprove: monitorProcedure
      .input(
        z.object({
          requestIds: z.array(z.number()),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveRequest, getApprovalRequestById, createNotification } = await import("./db");
        
        const results = [];
        const errors = [];
        
        for (const requestId of input.requestIds) {
          try {
            const result = await approveRequest(requestId, ctx.user.id, input.notes);
            results.push({ requestId, success: true, result });
            
            const request = await getApprovalRequestById(requestId);
            if (request) {
              await createNotification({
                userId: request.requestedBy,
                notificationType: "approval_completed",
                title: "승인 완료",
                message: `"${request.title}" 요청이 승인되었습니다. 승인자: ${ctx.user.name}${input.notes ? ` (코멘트: ${input.notes})` : ""}`,
                referenceType: request.referenceType || undefined,
                referenceId: request.referenceId || undefined
              });
            }
          } catch (error: any) {
            errors.push({ requestId, error: error.message });
            results.push({ requestId, success: false, error: error.message });
          }
        }
        
        return {
          total: input.requestIds.length,
          succeeded: results.filter(r => r.success).length,
          failed: errors.length,
          results,
          errors
        };
      }),

    // 거부 처리
    reject: monitorProcedure
      .input(
        z.object({
          requestId: z.number(),
          rejectionReason: z.string()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { rejectRequest, getApprovalRequestById, createNotification } = await import("./db");
        
        // 거부 처리
        const result = await rejectRequest(input.requestId, ctx.user.id, input.rejectionReason);
        
        // 요청 정보 조회
        const request = await getApprovalRequestById(input.requestId);
        if (request) {
          // 요청자에게 알림 전송
          await createNotification({
            userId: request.requestedBy,
            notificationType: "approval_rejected",
            title: "승인 거부",
            message: `"${request.title}" 요청이 거부되었습니다. 거부 사유: ${input.rejectionReason}`,
            referenceType: request.referenceType || undefined,
            referenceId: request.referenceId || undefined
          });
        }
        
        return result;
      }),

    // 승인 이력 조회
    getHistory: protectedProcedure
      .input(z.object({ requestId: z.number() }))
      .query(async ({ input }) => {
        const { getApprovalHistory } = await import("./db");
        return await getApprovalHistory(input.requestId);
      }),

    // 대기 중인 승인 요청 개수
    getPendingCount: protectedProcedure.query(async ({ ctx }) => {
      const { getPendingApprovalCount } = await import("./db");
      return await getPendingApprovalCount(ctx.user.tenantId);
    }),

    // 재고 조정 승인 요청
    requestInventoryAdjustment: workerProcedure
      .input(
        z.object({
          adjustmentId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("./db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.user.tenantId,
          siteId: ctx.user.siteId || 1,
          requestType: "inventory_adjustment",
          referenceType: "inventory_adjustment",
          referenceId: input.adjustmentId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // 승인 요청 취소
    cancelRequest: protectedProcedure
      .input(
        z.object({
          requestId: z.number(),
          reason: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { cancelApprovalRequest } = await import("./db");
        return await cancelApprovalRequest(input.requestId, ctx.user.id, input.reason);
      })
  }),

  // ============================================================
  // 알림 설정 (Notification Settings)
  // ============================================================
  notificationSettings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const { getNotificationSettings } = await import("./db");
      const settings = await getNotificationSettings(ctx.user.id);
      return settings || {
        userId: ctx.user.id,
        ccpDeviationEnabled: 1,
        stockLowEnabled: 1,
        expiryWarningEnabled: 1,
        batchCompletedEnabled: 1,
        approvalRequestEnabled: 1,
        inspectionCompletedEnabled: 1,
        systemNotificationEnabled: 1,
        emailEnabled: 0,
        smsEnabled: 0,
        businessHoursOnly: 0,
        businessHoursStart: "09:00",
        businessHoursEnd: "18:00"
      };
    }),
    
    save: protectedProcedure
      .input(z.object({
        ccpDeviationEnabled: z.number().optional(),
        stockLowEnabled: z.number().optional(),
        expiryWarningEnabled: z.number().optional(),
        batchCompletedEnabled: z.number().optional(),
        approvalRequestEnabled: z.number().optional(),
        inspectionCompletedEnabled: z.number().optional(),
        systemNotificationEnabled: z.number().optional(),
        emailEnabled: z.number().optional(),
        smsEnabled: z.number().optional(),
        businessHoursOnly: z.number().optional(),
        businessHoursStart: z.string().optional(),
        businessHoursEnd: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const { saveNotificationSettings } = await import("./db");
        const settings = await saveNotificationSettings({
          userId: ctx.user.id,
          ...input
        });
        return { success: true, settings };
       })
  }),

  // 위험 분석 시스템 (HACCP 원칙 1)
  hazardAnalysis: hazardAnalysisRouter,
  haccpPlanVerification: haccpPlanVerificationRouter,
  internalAudit: internalAuditRouter,
  nonconformingProduct: nonconformingProductRouter,
  recallSimulation: recallSimulationRouter,
  supplierAudit: supplierAuditRouter,

  // 시정 조치 관리 시스템
  correctiveAction: correctiveActionRouter,

  // 교육 훈련 관리 시스템
  training: trainingRouter,

  // 일일일지 시스템

  // HACCP 7원칙 보고서
  reports: reportsRouter,

  // LOT 추적성
  traceability: traceabilityRouter,

  // 관리자 기능
  admin: adminRouter,

  // 테넌트 관리 (멀티 테넌트 시스템)
  tenants: tenantsRouter,

  // 슈퍼관리자 승인 관리
  superadminApproval: superadminApprovalRouter,

  // 슈퍼관리자 대시보드
  superadminDashboard: superadminDashboardRouter,

  // 감사 로그
  auditLogs: auditLogsRouter,

  // 클라이언트 관리자 직원 관리
  adminEmployee: adminEmployeeRouter,

  // 공개 테넌트 정보
  tenantsPublic: tenantsPublicRouter,

  // 구독 관리
  subscription: subscriptionRouter,

  // 배너 관리
  banner: bannerRouter,

  // 스케줄러 모니터링
  scheduler: router({
    // 스케줄러 실행 이력 조회
    getLogs: adminProcedure
      .input(
        z.object({
          limit: z.number().optional().default(50)
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

        const { hSchedulerLogs } = await import("../drizzle/schema");
        const logs = await db
          .select()
          .from(hSchedulerLogs)
          .orderBy(hSchedulerLogs.executionTime)
          .limit(input.limit);

        return logs;
      }),

    // 스케줄러 수동 실행
    runManually: adminProcedure.mutation(async () => {
      const executionTime = new Date();
      let status = "success";
      let resultMessage = "";
      let deletedCount = 0;

      try {
        // 설정값 로드
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

        const settings = await db
          .select()
          .from(hSystemSettings)
          .where(eq(hSystemSettings.settingKey, "notification_retention_days"));

        const retentionDays = settings[0]?.settingValue ? parseInt(settings[0].settingValue, 10) : 30;

        // 알림 삭제
        const { deleteOldReadNotifications } = await import("./db");
        const result = await deleteOldReadNotifications(retentionDays);
        deletedCount = result.deletedCount;

        resultMessage = `${deletedCount}개 삭제 완료 (기준: ${retentionDays}일)`;
      } catch (error) {
        status = "error";
        resultMessage = error instanceof Error ? error.message : String(error);
      } finally {
        // 실행 이력 저장
        try {
          const db = await getDb();
          if (db) {
            const { hSchedulerLogs } = await import("../drizzle/schema");
            await db.insert(hSchedulerLogs).values({
              schedulerName: "notification_cleanup_manual",
              executionTime,
              status,
              resultMessage,
              deletedCount
            });
          }
        } catch (logError) {
          console.error("[스케줄러] 실행 이력 저장 실패:", logError);
        }
      }

      return {
        success: status === "success",
        deletedCount,
        message: resultMessage
      };
    })
  }),

  // 즐겨찾기 관리
  favorites: router({
    // 즐겨찾기 목록 조회
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getUserFavorites } = await import("./db/favorites");
      return await getUserFavorites(ctx.user.id);
    }),

    // 즐겨찾기 추가
    add: protectedProcedure
      .input(z.object({
        menuPath: z.string(),
        menuLabel: z.string(),
        menuIcon: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const { addUserFavorite } = await import("./db/favorites");
        const id = await addUserFavorite(
          ctx.user.id,
          input.menuPath,
          input.menuLabel,
          input.menuIcon,
          ctx.tenantId ?? undefined
        );
        return { id };
      }),

    // 즐겨찾기 제거
    remove: protectedProcedure
      .input(z.object({ favoriteId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { removeUserFavorite } = await import("./db/favorites");
        await removeUserFavorite(ctx.user.id, input.favoriteId);
        return { success: true };
      }),

    // 즐겨찾기 순서 변경
    updateOrder: protectedProcedure
      .input(z.object({
        updates: z.array(z.object({
          favoriteId: z.number(),
          displayOrder: z.number()
        }))
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateFavoriteOrder } = await import("./db/favorites");
        for (const update of input.updates) {
          await updateFavoriteOrder(ctx.user.id, update.favoriteId, update.displayOrder);
        }
        return { success: true };
      })
  }),

  // 품질 체크리스트
  qualityChecklist: qualityChecklistRouter,

  // 체크리스트 스케줄 관리
  checklistSchedule: checklistScheduleRouter,

  // 체크리스트 인스턴스 관리
  checklistInstance: checklistInstanceRouter,

  // CCP 모니터링
  ccpMonitoring: ccpMonitoringRouter,

  // 설비 프로필 관리 (Equipment Profile Management)
  equipment: router({
    // 설비 프로필 생성
    create: protectedProcedure
      .input(z.object({
        code: z.string(),
        name: z.string(),
        type: z.string(),
        ccpType: z.string().optional(),
        defaultTemperature: z.string().optional(),
        edgeTemperature: z.string().optional(),
        centerTemperature: z.string().optional(),
        defaultPressure: z.string().optional(),
        defaultTime: z.number().optional(),
        batchOperationTime: z.number().optional(),
        monitoringInterval: z.number().optional(),
        rowsPerBatch: z.number().optional(),
        status: z.string().optional(),
        notes: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const { createEquipment, createAuditLog } = await import("./db");
        
        const equipmentId = await createEquipment(input);
        
        await createAuditLog({
          userId: ctx.user.id,
          action: "equipment.create",
          entityType: "equipment",
          entityId: equipmentId,
          changes: input,
          ipAddress: "",
          description: `설비 프로필 생성: ${input.name}`
        });
        
        return { equipmentId };
      }),
    
    // 설비 프로필 목록 조회
    list: protectedProcedure
      .input(z.object({
        type: z.string().optional(),
        ccpType: z.string().optional(),
        status: z.string().optional(),
        page: z.number().optional(),
        limit: z.number().optional()
      }))
      .query(async ({ input }) => {
        const { getAllEquipments } = await import("./db");
        return await getAllEquipments(input);
      }),
    
    // 설비 프로필 상세 조회
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getEquipmentById } = await import("./db");
        const equipment = await getEquipmentById(input.id);
        
        if (!equipment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "설비 프로필을 찾을 수 없습니다."
          });
        }
        
        return equipment;
      }),
    
    // 설비 프로필 수정
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().optional(),
        name: z.string().optional(),
        type: z.string().optional(),
        ccpType: z.string().optional(),
        defaultTemperature: z.string().optional(),
        edgeTemperature: z.string().optional(),
        centerTemperature: z.string().optional(),
        defaultPressure: z.string().optional(),
        defaultTime: z.number().optional(),
        batchOperationTime: z.number().optional(),
        feSensitivity: z.string().optional(),
        stsSensitivity: z.string().optional(),
        detectionSpeed: z.string().optional(),
        batchLinkMode: z.string().optional(),
        dailyProductCount: z.number().optional(),
        workStartTime: z.string().optional(),
        workEndTime: z.string().optional(),
        lunchStartTime: z.string().optional(),
        lunchEndTime: z.string().optional(),
        monitoringInterval: z.number().optional(),
        rowsPerBatch: z.number().optional(),
        status: z.string().optional(),
        notes: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateEquipment, getEquipmentById, createAuditLog } = await import("./db");
        
        const oldEquipment = await getEquipmentById(input.id);
        if (!oldEquipment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "설비 프로필을 찾을 수 없습니다."
          });
        }
        
        const { id, ...updates } = input;
        await updateEquipment(id, updates);
        
        await createAuditLog({
          userId: ctx.user.id,
          action: "equipment.update",
          entityType: "equipment",
          entityId: id,
          changes: updates,
          ipAddress: "",
          description: `설비 프로필 수정: ${oldEquipment.name}`
        });
        
        return { success: true };
      }),
    
    // 설비 프로필 삭제
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteEquipment, getEquipmentById, createAuditLog } = await import("./db");
        
        const equipment = await getEquipmentById(input.id);
        if (!equipment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "설비 프로필을 찾을 수 없습니다."
          });
        }
        
        await deleteEquipment(input.id);
        
        await createAuditLog({
          userId: ctx.user.id,
          action: "equipment.delete",
          entityType: "equipment",
          entityId: input.id,
          changes: {},
          ipAddress: "",
          description: `설비 프로필 삭제: ${equipment.name}`
        });
        
        return { success: true };
      }),
    
    // CCP 유형별 설비 목록 조회
    getByCcpType: protectedProcedure
      .input(z.object({ ccpType: z.string() }))
      .query(async ({ input }) => {
        const { getEquipmentsByCcpType } = await import("./db");
        return await getEquipmentsByCcpType(input.ccpType);
      })
  }),

  // 체크리스트 상태 조회
  checklistStats: router({
    // 카테고리별 상태 조회
    getByCategory: protectedProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getChecklistStatsByCategory } = await import("./db/checklistStats");
        return await getChecklistStatsByCategory(input.category, ctx.user.tenantId);
      }),

    // 오늘 전체 상태 조회
    getToday: protectedProcedure.query(async () => {
      const { getTodayChecklistStats } = await import("./db/checklistStats");
      return await getTodayChecklistStats(ctx.user.tenantId);
    })
  }),

  // 생산 일정 관리 (Production Schedule)
  productionSchedule: router({
    // 기간별 배치 일정 조회 (캘린더용)
    getBatchSchedule: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          siteId: z.number().optional(),
          status: z.string().optional()
        })
      )
      .query(async ({ input }) => {
        const { getBatchSchedule } = await import("./db");
        return await getBatchSchedule(input);
      }),

    // 배치별 원재료 소요량 계산
    calculateMaterialRequirements: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const { calculateMaterialRequirements } = await import("./db");
        return await calculateMaterialRequirements(input.batchId);
      }),

    // 생산 능력 분석 (일별/주별)
    analyzeProductionCapacity: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          siteId: z.number().optional(),
          groupBy: z.enum(["day", "week"]).optional()
        })
      )
      .query(async ({ input }) => {
        const { analyzeProductionCapacity } = await import("./db");
        return await analyzeProductionCapacity(input);
      }),

    // 제품별 생산 능력 분석
    analyzeProductionCapacityByProduct: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          siteId: z.number().optional()
        })
      )
      .query(async ({ input }) => {
        const { analyzeProductionCapacityByProduct } = await import("./db");
        return await analyzeProductionCapacityByProduct(input);
      }),
    
    // 생산 일정 최적화 제안 조회
    optimizeSchedule: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string()
      }))
      .query(async ({ input }) => {
        const { optimizeProductionSchedule } = await import("./db");
        return await optimizeProductionSchedule(input);
      }),
    
    // 최적화 제안 적용 (배치 일정 변경)
    applyOptimization: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        newPlannedDate: z.string()
      }))
      .mutation(async ({ input }) => {
        const { applyScheduleOptimization } = await import("./db");
        return await applyScheduleOptimization(input);
      }),
    
    // 배치별 원가 분석
    getCostAnalysis: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input }) => {
        const { getBatchCostAnalysis } = await import("./db");
        return await getBatchCostAnalysis(input);
      }),
    
    // 생산 시간 추이 분석
    getProductionTimeAnalysis: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input }) => {
        const { getProductionTimeAnalysis } = await import("./db");
        return await getProductionTimeAnalysis(input);
      }),
    
    // 불량률 분석
    getDefectRateAnalysis: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input }) => {
        const { getDefectRateAnalysis } = await import("./db");
        return await getDefectRateAnalysis(input);
      })
  }),

  // 생산일보 (Production Daily Report)
  dailyReport: router({
    // 일별 생산 실적 조회
    getProduction: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getDailyProduction } = await import("./db/dailyReport");
        return await getDailyProduction(input.date, ctx.user.tenantId);
      }),
    
    // 일별 CCP 기록 조회
    getCcpRecords: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getDailyCcpRecords } = await import("./db/dailyReport");
        return await getDailyCcpRecords(input.date, ctx.user.tenantId);
      }),
    
    // 일별 이상 사항 조회
    getIssues: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getDailyIssues } = await import("./db/dailyReport");
        return await getDailyIssues(input.date, ctx.user.tenantId);
      }),
    
    // 일별 요약 통계
    getSummary: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getDailySummary } = await import("./db/dailyReport");
        return await getDailySummary(input.date, ctx.user.tenantId);
      })
  }),

  // 배치 생산 대시보드 (Production Dashboard)
  productionDashboard: router({
    // 진행 중인 배치 목록 조회
    getActiveBatches: protectedProcedure
      .query(async () => {
        const { getActiveBatches } = await import("./db/productionDashboard");
        return await getActiveBatches();
      }),
    // 배치 상태별 통계 조회
    getBatchStats: protectedProcedure
      .query(async () => {
        const { getBatchStats } = await import("./db/productionDashboard");
        return await getBatchStats(ctx.user.tenantId);
      })
  }),
  // 배치 생산 예측 (Production Prediction)
  productionPrediction: router({
    getPredictionData: protectedProcedure
      .input(z.object({ productId: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const { getProductionPredictionData } = await import("./db/productionPrediction");
        return await getProductionPredictionData(input?.productId, ctx.user.tenantId);
      })
  }),
  // AI 기반 원가 절감 제안
  costSavingAI: router({
    // 원재료 가격 변동 추이 분석
    analyzePriceTrend: protectedProcedure
      .input(
        z.object({
          materialId: z.number(),
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input }) => {
        const { analyzePriceTrend } = await import("./db/costSavingAI");
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        return await analyzePriceTrend(input.materialId, startDate, endDate);
      }),
    
    // 최적 구매 시점 추천
    recommendPurchaseTiming: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input }) => {
        const { recommendPurchaseTiming } = await import("./db/costSavingAI");
        return await recommendPurchaseTiming(input.materialId);
      }),
    
    // 대체 공급업체 추천
    recommendAlternativeSuppliers: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input }) => {
        const { recommendAlternativeSuppliers } = await import("./db/costSavingAI");
        return await recommendAlternativeSuppliers(input.materialId);
      }),
    
    // AI 기반 원가 절감 제안 생성
    generateProposal: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input }) => {
        const { generateCostSavingProposal } = await import("./db/costSavingAI");
        return await generateCostSavingProposal(input.materialId);
      })
  }),
  
  // 품목제조보고 승인 관리
  recipeApproval: router({
    // 승인 대기 중인 품목제조보고 목록 조회
    getPending: protectedProcedure
      .query(async () => {
        const { getPendingRecipes } = await import("./api/recipeApproval");
        return await getPendingRecipes();
      }),
    
    // 품목제조보고 승인
    approve: adminProcedure
      .input(z.object({ recipeId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { approveRecipe } = await import("./api/recipeApproval");
        return await approveRecipe({ recipeId: input.recipeId, userId: ctx.user.id });
      }),
    
    // 품목제조보고 승인 이력 조회
    getHistory: protectedProcedure
      .input(z.object({
        approvalStatus: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }).optional())
      .query(async ({ input }) => {
        const { getRecipeApprovalHistory } = await import("./api/recipeApproval");
        return await getRecipeApprovalHistory(input);
      }),
    
    // 품목제조보고 반려
    reject: adminProcedure
      .input(z.object({
        recipeId: z.number(),
        reason: z.string().min(1, "반려 사유는 필수입니다")
      }))
      .mutation(async ({ input, ctx }) => {
        const { rejectRecipe } = await import("./api/recipeApproval");
        return await rejectRecipe({
          recipeId: input.recipeId,
          userId: ctx.user.id,
          reason: input.reason
        });
      }),
    
    // 품목제조보고 상세 조회 (승인 정보 포함)
    getDetail: protectedProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input }) => {
        const { getRecipeWithApprovalInfo } = await import("./api/recipeApproval");
        return await getRecipeWithApprovalInfo(input.recipeId);
      })
  }),

  // 생산일정 최적화
  scheduleOptimization: router({
    // AI 기반 생산일정 최적화
    optimize: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        facilityIds: z.array(z.number()).optional()
      }))
      .query(async ({ input }) => {
        const { optimizeProductionSchedule } = await import("./api/scheduleOptimization");
        return await optimizeProductionSchedule(input);
      }),
    
    // 재고 수준 기반 생산 우선순위 계산
    getPriority: protectedProcedure
      .query(async () => {
        const { calculateProductionPriority } = await import("./api/scheduleOptimization");
        return await calculateProductionPriority();
      })
  }),

  // 직원 관리
  employee: employeeRouter,

  // 건강진단서 관리
  healthCertificate: healthCertificateRouter,

  // 검교정 관리
  calibration: calibrationRouter,
  hygiene: hygieneRouter,
  pestControl: pestControlRouter,

  // 체크리스트 대시보드
  checklistDashboard: checklistDashboardRouter,

  // 11개 미구현 HACCP 체크리스트
  waterQualityTest: waterQualityTestRouter,
  airCompressor: airCompressorRouter,
  validityEvaluation: validityEvaluationRouter,
  personalHygieneCheck: personalHygieneCheckRouter,
  waterUsageCheck: waterUsageCheckRouter,
  equipmentCleaningRecord: equipmentCleaningRecordRouter,
  foreignMaterialRecord: foreignMaterialRecordRouter,
  refrigerationCheck: refrigerationCheckRouter,
  packagingStorageRecord: packagingStorageRecordRouter,
  qualityIssueRecord: qualityIssueRecordRouter,
  capaRecord: capaRecordRouter,
  genericChecklist: genericChecklistRouter,

  // 조직도 및 결재자 설정 관리
  organization: organizationRouter,
  itemMaster: itemMasterRouter,
  productSku: productSkuRouter,
  productionVerification: productionVerificationRouter,
  accountingAccounts: accountingAccountsRouter,
  accountCategories: accountCategoriesRouter,
  accountingAccountCategories: accountCategoriesRouter,
  bankAccount: bankAccountRouter,
  bankTransaction: bankTransactionRouter,
  bankTransactionBulk: bankTransactionBulkRouter,
  
  // 템플릿 설정 관리
  templateSettings: router({
    // 사용자의 템플릿 설정 목록 조회
    getList: protectedProcedure
      .input(z.object({ templateType: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getUserTemplateSettings } = await import("./db/templateSettings.js");
        return await getUserTemplateSettings(ctx.user.id, input.templateType, ctx.user.tenantId);
      }),
    
    // 템플릿 설정 생성
    create: protectedProcedure
      .input(z.object({
        templateType: z.string(),
        templateName: z.string(),
        selectedFields: z.array(z.string())
      }))
      .mutation(async ({ input, ctx }) => {
        const { createTemplateSetting } = await import("./db/templateSettings.js");
        return await createTemplateSetting({
          userId: ctx.user.id,
          templateType: input.templateType,
          templateName: input.templateName,
          selectedFields: input.selectedFields
        });
      }),
    
    // 템플릿 설정 조회
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getTemplateSetting } = await import("./db/templateSettings.js");
        return await getTemplateSetting(input.id, ctx.user.id, ctx.user.tenantId);
      }),
    
    // 템플릿 설정 삭제
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteTemplateSetting } = await import("./db/templateSettings.js");
        return await deleteTemplateSetting(input.id, ctx.user.id, ctx.user.tenantId);
      })
  }),

  // 공급업체 평가 관리
  supplierEvaluation: router({
    // 평가 목록 조회
    list: protectedProcedure
      .input(z.object({ supplierId: z.number().optional() }))
      .query(async ({ input }) => {
        // 모든 평가 또는 특정 공급업체 평가 반환
        return [] as Array<{
          id: number;
          supplierId: number;
          evaluationDate: string;
          qualityScore: number;
          deliveryScore: number;
          priceScore: number;
          serviceScore: number;
          responseScore: number;
          overallScore: number;
          comments?: string;
          strengths?: string;
          weaknesses?: string;
          recommendations?: string;
          createdAt: string;
        }>;
      }),
    
    // 평가 통계 조회
    getStats: protectedProcedure
      .input(z.object({ supplierId: z.number().optional() }))
      .query(async ({ input }) => {
        // 평가 통계 반환
        return {
          averageScore: 0,
          totalEvaluations: 0,
          categoryScores: {},
          avgQuality: 0,
          avgDelivery: 0,
          avgPrice: 0,
          avgService: 0,
          avgResponse: 0,
          avgOverall: 0
        };
      }),
    
    // 평가 생성
    create: protectedProcedure
      .input(z.object({
        supplierId: z.number(),
        evaluationDate: z.string(),
        qualityScore: z.number(),
        deliveryScore: z.number(),
        priceScore: z.number(),
        serviceScore: z.number(),
        responseScore: z.number(),
        comments: z.string().optional(),
        strengths: z.string().optional(),
        weaknesses: z.string().optional(),
        recommendations: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        // 평가 생성 로직 (실제 구현 시 DB 저장)
        const overallScore = (
          input.qualityScore +
          input.deliveryScore +
          input.priceScore +
          input.serviceScore +
          input.responseScore
        ) / 5;
        
        return { 
          success: true,
          id: Date.now(), // 임시 ID
          overallScore
        };
      })
  }),

  // 업로드 이력 관리
  uploadHistory: router({
    // 전체 이력 조회
    getAll: protectedProcedure.query(async () => {
      const { getAllUploadHistory } = await import("./db/uploadHistory.js");
      return await getAllUploadHistory();
    }),
    
    // 타입별 이력 조회
    getByType: protectedProcedure
      .input(z.object({ uploadType: z.string() }))
      .query(async ({ input }) => {
        const { getUploadHistoryByType } = await import("./db/uploadHistory.js");
        return await getUploadHistoryByType(input.uploadType);
      }),
    
    // 사용자별 이력 조회
    getByUser: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        const { getUploadHistoryByUser } = await import("./db/uploadHistory.js");
        return await getUploadHistoryByUser(input.userId);
      }),
    
    // 이력 삭제
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteUploadHistory } = await import("./db/uploadHistory.js");
        return await deleteUploadHistory(input.id);
      })
  }),

  // ==================== 사용자 그룹 관리 ====================
  group: router({
    // 그룹 생성
    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1, "그룹 이름은 필수입니다"),
          description: z.string().optional(),
          groupType: z.enum(["department", "team", "project", "custom"]).default("custom")
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createGroup } = await import("./db");
        const groupId = await createGroup({
          ...input,
          createdBy: ctx.user.id
        });
        return { success: true, groupId };
      }),

    // 그룹 목록 조회
    list: protectedProcedure.query(async () => {
      const { getAllGroups } = await import("./db");
      return await getAllGroups();
    }),

    // 그룹 정보 수정
    update: adminProcedure
      .input(
        z.object({
          groupId: z.number(),
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          groupType: z.enum(["department", "team", "project", "custom"]).optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updateGroup } = await import("./db");
        const { groupId, ...data } = input;
        await updateGroup(groupId, data);
        return { success: true };
      }),

    // 그룹 삭제
    delete: adminProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteGroup } = await import("./db");
        await deleteGroup(input.groupId);
        return { success: true };
      }),

    // 그룹에 멤버 추가
    addMember: adminProcedure
      .input(
        z.object({
          groupId: z.number(),
          userId: z.number(),
          role: z.enum(["member", "leader", "admin"]).default("member")
        })
      )
      .mutation(async ({ input }) => {
        const { addGroupMember } = await import("./db");
        await addGroupMember(input);
        return { success: true };
      }),

    // 그룹에서 멤버 제거
    removeMember: adminProcedure
      .input(
        z.object({
          groupId: z.number(),
          userId: z.number()
        })
      )
      .mutation(async ({ input }) => {
        const { removeGroupMember } = await import("./db");
        await removeGroupMember(input.groupId, input.userId);
        return { success: true };
      }),

    // 그룹 멤버 목록 조회
    getMembers: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ input }) => {
        const { getGroupMembers } = await import("./db");
        return await getGroupMembers(input.groupId);
      }),

    // 사용자가 속한 그룹 목록 조회
    getUserGroups: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        const { getUserGroups } = await import("./db");
        return await getUserGroups(input.userId);
      })
  }),

  // ==================== 회계 관리 ====================
  accounting: router({
    // 계정 과목 목록 조회
    getCategories: protectedProcedure.query(async ({ ctx }) => {
      const { getAllCategories } = await import("./accounting");
      return await getAllCategories();
    }),

    // 거래 등록
    createTransaction: adminProcedure
      .input(
        z.object({
          transactionDate: z.string(),
          type: z.enum(["income", "expense"]),
          amount: z.string(),
          categoryId: z.number(),
          description: z.string().optional(),
          referenceType: z.string().optional(),
          referenceId: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createTransaction } = await import("./accounting");
        const transactionId = await createTransaction({
          ...input,
          tenantId: ctx.user.tenantId,
          createdBy: ctx.user.id
        });
        return { success: true, transactionId };
      }),

    // 거래 목록 조회
    listTransactions: protectedProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          type: z.enum(["income", "expense"]).optional(),
          categoryId: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional()
        })
      )
      .query(async ({ input }) => {
        const { getTransactions } = await import("./accounting");
        return await getTransactions(input);
      }),

    // 거래 상세 조회
    getTransaction: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getTransactionById } = await import("./accounting");
        return await getTransactionById(input.id);
      }),

    // 거래 수정
    updateTransaction: adminProcedure
      .input(
        z.object({
          id: z.number(),
          transactionDate: z.string().optional(),
          type: z.enum(["income", "expense"]).optional(),
          amount: z.string().optional(),
          categoryId: z.number().optional(),
          description: z.string().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updateTransaction } = await import("./accounting");
        const { id, transactionDate, ...rest } = input;
        const data: any = { ...rest };
        if (transactionDate) {
          data.transactionDate = transactionDate;
        }
        await updateTransaction(id, data);
        return { success: true };
      }),

    // 거래 삭제
    deleteTransaction: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteTransaction } = await import("./accounting");
        await deleteTransaction(input.id);
        return { success: true };
      }),

    // 일일 집계
    getDailySummary: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input }) => {
        const { getDailySummary } = await import("./accounting");
        return await getDailySummary(input.date);
      }),
    // 월간 집계
    getMonthlySummary: protectedProcedure
      .input(
        z.object({
          year: z.number(),
          month: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getMonthlySummary } = await import("./accounting");
        return await getMonthlySummary(input.year, input.month, ctx.user.tenantId);
      }),

    // 계정 과목별 분석
    getCategoryBreakdown: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          type: z.enum(["income", "expense"])
        })
      )
      .query(async ({ input }) => {
        const { getCategoryBreakdown } = await import("./accounting");
        return await getCategoryBreakdown(input.startDate, input.endDate, input.type);
      }),

    // 재무 현황 요약
    getFinancialOverview: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input }) => {
        const { getFinancialOverview } = await import("./accounting");
        return await getFinancialOverview(input.startDate, input.endDate);
      }),

    // 기본 계정 과목 초기화
    initializeCategories: adminProcedure.mutation(async () => {
      const { initializeDefaultCategories } = await import("./accounting");
      await initializeDefaultCategories();
      return { success: true };
    })
  }),

  // ============================================
  // 거래처 관리 (Partners)
  // ============================================
  partners: router({
    // 거래처 생성
    create: protectedProcedure
      .input(
        z.object({
          partnerType: z.enum(["supplier", "customer", "subcontractor"]),
          bizNo: z.string().optional(),
          companyName: z.string(),
          ceoName: z.string().optional(),
          bizType: z.string().optional(),
          bizItem: z.string().optional(),
          address: z.string().optional(),
          phone: z.string().optional(),
          fax: z.string().optional(),
          email: z.string().optional(),
          bankName: z.string().optional(),
          bankAccount: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createPartner } = await import("./partners");
        const id = await createPartner({ ...input, tenantId: ctx.user.tenantId });
        return { id };
      }),

    // 거래처 목록 조회 (tenantId 필터링 추가)
    list: protectedProcedure
      .input(
        z
          .object({
            partnerType: z.enum(["supplier", "customer", "subcontractor"]).optional(),
            isActive: z.number().optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const { getAllPartners } = await import("./partners");
        return await getAllPartners(input, ctx.user.tenantId);
      }),

    // 거래처 상세 조회
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getPartnerById } = await import("./partners");
        return await getPartnerById(input.id);
      }),

    // 거래처 수정
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          companyName: z.string().optional(),
          ceoName: z.string().optional(),
          bizType: z.string().optional(),
          bizItem: z.string().optional(),
          address: z.string().optional(),
          contactPerson: z.string().optional(),
          phone: z.string().optional(),
          fax: z.string().optional(),
          email: z.string().optional(),
          bankName: z.string().optional(),
          bankAccount: z.string().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updatePartner } = await import("./partners");
        const { id, ...data } = input;
        await updatePartner(id, data);
        return { success: true };
      }),

    // 거래처 삭제
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deletePartner } = await import("./partners");
        await deletePartner(input.id);
        return { success: true };
      }),

    // 사업자번호로 검색
    getByBizNo: protectedProcedure
      .input(z.object({ bizNo: z.string() }))
      .query(async ({ input }) => {
        const { getPartnerByBizNo } = await import("./partners");
        return await getPartnerByBizNo(input.bizNo);
      })
  }),

  // ============================================
  // 매입 원장 (AP Ledger)
  // ============================================
  apLedger: router({
    // 매입 거래 생성
    create: adminProcedure
      .input(
        z.object({
          supplierPartnerId: z.number(),
          occurredAt: z.string(),
          apEntryType: z.enum(["bill", "payment", "credit", "adjust"]),
          amount: z.string(),
          refType: z.string().optional(),
          refId: z.number().optional(),
          memo: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApLedgerEntry } = await import("./partners");
        const id = await createApLedgerEntry({
          ...input,
          occurredAt: new Date(input.occurredAt),
          createdBy: ctx.user.id
        });
        return { id };
      }),

    // 매입 원장 목록 조회
    list: protectedProcedure
      .input(
        z
          .object({
            supplierPartnerId: z.number().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            apEntryType: z.enum(["bill", "payment", "credit", "adjust"]).optional()
          })
          .optional()
      )
      .query(async ({ input }) => {
        const { getApLedger } = await import("./partners");
        return await getApLedger(input);
      }),

    // 매입 원장 상세 조회
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getApLedgerById } = await import("./partners");
        return await getApLedgerById(input.id);
      }),

    // 공급업체별 매입 집계
    summaryBySupplier: protectedProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input }) => {
        const { getApSummaryBySupplier } = await import("./partners");
        return await getApSummaryBySupplier(input.startDate, input.endDate);
      })
  }),

  // ============================================
  // 매출 원장 (AR Ledger)
  // ============================================
  arLedger: router({
    // 매출 거래 생성
    create: adminProcedure
      .input(
        z.object({
          customerPartnerId: z.number(),
          occurredAt: z.string(),
          arEntryType: z.enum(["debit", "payment", "credit", "writeoff", "adjust"]),
          amount: z.string(),
          dueDate: z.string().optional(),
          refType: z.string().optional(),
          refId: z.number().optional(),
          memo: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createArLedgerEntry } = await import("./partners");
        const { occurredAt, dueDate, ...rest } = input;
        const id = await createArLedgerEntry({
          ...rest,
          occurredAt: new Date(occurredAt),
          dueDate: dueDate ? new Date(dueDate) : undefined,
          createdBy: ctx.user.id
        });
        return { id };
      }),

    // 매출 원장 목록 조회
    list: protectedProcedure
      .input(
        z
          .object({
            customerPartnerId: z.number().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            arEntryType: z.enum(["debit", "payment", "credit", "writeoff", "adjust"]).optional()
          })
          .optional()
      )
      .query(async ({ input }) => {
        const { getArLedger } = await import("./partners");
        return await getArLedger(input);
      }),

    // 매출 원장 상세 조회
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { getArLedgerById } = await import("./partners");
        return await getArLedgerById(input.id);
      }),

    // 고객사별 매출 집계
    summaryByCustomer: protectedProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input }) => {
        const { getArSummaryByCustomer } = await import("./partners");
        return await getArSummaryByCustomer(input.startDate, input.endDate);
      }),

    // 매입/매출 통합 집계
    financialSummary: protectedProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input }) => {
        const { getFinancialSummary } = await import("./partners");
        return await getFinancialSummary(input.startDate, input.endDate);
      }),

  }),
  // ============================================
  // 커뮤니케이션 로그 (Communication Logs)
  // ============================================
  communicationLogs: router({
    // 커뮤니케이션 로그 생성
    create: protectedProcedure
      .input(
        z.object({
          partnerId: z.number(),
          content: z.string().min(1, "내용은 필수입니다"),
          status: z.enum(["received", "in_progress", "completed"]).default("received"),
          mentions: z.string().optional(), // JSON 문자열
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createCommunicationLog } = await import("./routers/communicationLog");
        const id = await createCommunicationLog({
          ...input,
          tenantId: ctx.user.tenantId,
          authorId: ctx.user.id,
        });
        return { id, success: true };
      }),

    // 커뮤니케이션 로그 목록 조회
    list: protectedProcedure
      .input(
        z.object({
          partnerId: z.number().optional(),
          status: z.enum(["received", "in_progress", "completed"]).optional(),
          authorId: z.number().optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const { getCommunicationLogs } = await import("./routers/communicationLog");
        return await getCommunicationLogs({
          tenantId: ctx.user.tenantId,
          partnerId: input?.partnerId,
          status: input?.status,
          authorId: input?.authorId,
        });
      }),

    // 커뮤니케이션 로그 상세 조회
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCommunicationLogById } = await import("./routers/communicationLog");
        return await getCommunicationLogById(input.id, ctx.user.tenantId);
      }),

    // 커뮤니케이션 로그 수정
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          content: z.string().optional(),
          status: z.enum(["received", "in_progress", "completed"]).optional(),
          mentions: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateCommunicationLog } = await import("./routers/communicationLog");
        const { id, ...data } = input;
        await updateCommunicationLog(id, data, ctx.user.tenantId, ctx.user.id);
        return { success: true };
      }),

    // 커뮤니케이션 로그 삭제
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteCommunicationLog } = await import("./routers/communicationLog");
        await deleteCommunicationLog(input.id, ctx.user.tenantId, ctx.user.id);
        return { success: true };
      }),

    // 커뮤니케이션 로그 상태 변경
    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["received", "in_progress", "completed"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateCommunicationLogStatus } = await import("./routers/communicationLog");
        await updateCommunicationLogStatus({ id: input.id, status: input.status, tenantId: ctx.user.tenantId, userId: ctx.user.id });
        return { success: true };
      }),

    // 거래처별 통계
    stats: protectedProcedure
      .input(z.object({ partnerId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCommunicationLogStats } = await import("./routers/communicationLog");
        return await getCommunicationLogStats(input.partnerId, ctx.user.tenantId);
      }),
    // 댓글 생성
    createComment: protectedProcedure
      .input(z.object({ logId: z.number(), content: z.string().min(1), mentions: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { createComment } = await import("./routers/communicationLog");
        const id = await createComment({ ...input, tenantId: ctx.user.tenantId, authorId: ctx.user.id });
        return { id, success: true };
      }),
    // 댓글 목록 조회
    getComments: protectedProcedure
      .input(z.object({ logId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getComments } = await import("./routers/communicationLog");
        return await getComments(input.logId, ctx.user.tenantId);
      }),
    // 댓글 삭제
    deleteComment: protectedProcedure
      .input(z.object({ commentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteComment } = await import("./routers/communicationLog");
        await deleteComment(input.commentId, ctx.user.tenantId, ctx.user.id);
        return { success: true };
      }),
  }),
  // ============================================
  // 매칭 규칙 관리 (Matching Rules)
  // ============================================
  matchingRules: router({
    // 매칭 규칙 목록 조회
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const { matchingRules } = await import("../drizzle/schema_main");
      return await db.select().from(matchingRules)
        .where(eq(matchingRules.tenantId, ctx.user.tenantId))
        .orderBy(matchingRules.priority);
    }),

    // 매칭 규칙 생성
    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1, "규칙 이름은 필수입니다"),
          ruleType: z.enum(["keyword", "amount", "pattern"]),
          keyword: z.string().optional(),
          conditions: z.record(z.string(), z.any()).optional(),
          targetType: z.enum(["partner", "account", "both"]),
          targetPartnerId: z.number().optional(),
          targetAccountId: z.number().optional(),
          priority: z.number().min(0).max(1000).default(500),
          weight: z.number().min(0).max(10).default(5),
          isActive: z.boolean().default(true)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const { matchingRules } = await import("../drizzle/schema_main");
        const [newRule] = await db.insert(matchingRules).values({
          ...input,
          conditions: input.conditions ? JSON.stringify(input.conditions) : null,
          tenantId: ctx.user.tenantId,
          userId: ctx.user.id
        }).$returningId();
        return { id: newRule.id, success: true };
      }),

    // 매칭 규칙 수정
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          ruleType: z.enum(["keyword", "amount", "pattern"]).optional(),
          keyword: z.string().optional(),
          conditions: z.record(z.string(), z.any()).optional(),
          targetType: z.enum(["partner", "account", "both"]).optional(),
          targetPartnerId: z.number().optional(),
          targetAccountId: z.number().optional(),
          priority: z.number().min(0).max(1000).optional(),
          weight: z.number().min(0).max(10).optional(),
          isActive: z.boolean().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const { matchingRules } = await import("../drizzle/schema_main");
        const { id, ...data } = input;
        const dataToUpdate: Record<string, any> = {};
        if (data.name !== undefined) dataToUpdate.name = data.name;
        if (data.ruleType !== undefined) dataToUpdate.ruleType = data.ruleType;
        if (data.keyword !== undefined) dataToUpdate.keyword = data.keyword;
        if (data.conditions !== undefined) dataToUpdate.conditions = JSON.stringify(data.conditions);
        if (data.targetType !== undefined) dataToUpdate.targetType = data.targetType;
        if (data.targetPartnerId !== undefined) dataToUpdate.targetPartnerId = data.targetPartnerId;
        if (data.targetAccountId !== undefined) dataToUpdate.targetAccountId = data.targetAccountId;
        if (data.priority !== undefined) dataToUpdate.priority = data.priority;
        if (data.weight !== undefined) dataToUpdate.weight = data.weight.toString();
        if (data.isActive !== undefined) dataToUpdate.isActive = data.isActive ? 1 : 0;
        await db.update(matchingRules).set(dataToUpdate).where(
          and(eq(matchingRules.id, id), eq(matchingRules.tenantId, ctx.user.tenantId))
        );
        return { success: true };
      }),

    // 매칭 규칙 삭제
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const { matchingRules } = await import("../drizzle/schema_main");
        await db.delete(matchingRules).where(
          and(eq(matchingRules.id, input.id), eq(matchingRules.tenantId, ctx.user.tenantId))
        );
        return { success: true };
      })
  }),

  // ============================================
  // 일일 마감 (Accounting Daily Close)
  // ============================================
  accountingDaily: router({
    // 일일 마감 실행
    execute: adminProcedure
      .input(
        z.object({
          closeDate: z.date(),
          largeAmountChecked: z.boolean().default(false)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { executeDailyClose } = await import("./db/accountingDailyClose");
        const dailyCloseResult = await executeDailyClose({
          closeDate: input.closeDate,
          largeAmountChecked: input.largeAmountChecked,
          userId: ctx.user.id
        }, ctx.user.tenantId);
        
        // === 원료수불부 일일 마감 연동 ===
        try {
          const { autoUpdateFromDailyClose } = await import("./db/materialLedger");
          await autoUpdateFromDailyClose(input.closeDate, ctx.user.tenantId);
          console.log("[원료수불부] 일일 마감 자동 업데이트 완료:", input.closeDate);
        } catch (ledgerError) {
          console.error("[원료수불부] 일일 마감 연동 실패:", ledgerError);
        }
        
        return dailyCloseResult;
      }),

    // 일일 마감 통계 조회
    getStats: protectedProcedure
      .input(z.object({ targetDate: z.date() }))
      .query(async ({ input, ctx }) => {
        const { getDailyCloseStats } = await import("./db/accountingDailyClose");
        return await getDailyCloseStats(input.targetDate, ctx.user.tenantId);
      }),

    // 마감 이력 조회
    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const { getDailyCloseHistory } = await import("./db/accountingDailyClose");
        return await getDailyCloseHistory(input.limit, ctx.user.tenantId);
      }),

    // 특정 날짜 마감 여부 확인
    isClosed: protectedProcedure
      .input(z.object({ targetDate: z.date() }))
      .query(async ({ input, ctx }) => {
        const { isDayClosed } = await import("./db/accountingDailyClose");
        return await isDayClosed(input.targetDate, ctx.user.tenantId);
      })
  }),

  // ============================================
  // 월간 마감 v2 (Accounting Monthly Summary)
  // ============================================
  accountingMonthly: router({  
    // 월 마감 집계 생성
    generateSummary: adminProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12),
          highAmountThreshold: z.number().optional().default(1000000)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const summaryDb = await import("./db/accountingMonthlySummary");

        // 1. 월간 집계 계산
        const calculated = await summaryDb.calculateMonthlySummary(input.year, input.month, ctx.user.tenantId);

        // 2. 월 마감 요약 저장/업데이트
        const summaryId = await summaryDb.upsertMonthlySummary({
          year: input.year,
          month: input.month,
          totalDeposit: calculated.totalDeposit,
          totalWithdrawal: calculated.totalWithdrawal,
          netCashFlow: calculated.netCashFlow,
          totalDays: calculated.totalDays,
          closedDays: calculated.closedDays,
          missingDays: calculated.missingDays,
          highAmountThreshold: input.highAmountThreshold.toFixed(2),
          status: "draft"
        }, ctx.user.tenantId);

        // 3. 고액 거래 추출
        const highAmountCount = await summaryDb.extractHighAmountTransactions(
          summaryId,
          input.year,
          input.month,
          input.highAmountThreshold,
          ctx.user.tenantId
        );

        // 4. 고액 거래 건수 업데이트
        await summaryDb.upsertMonthlySummary({
          year: input.year,
          month: input.month,
          totalDeposit: calculated.totalDeposit,
          totalWithdrawal: calculated.totalWithdrawal,
          netCashFlow: calculated.netCashFlow,
          totalDays: calculated.totalDays,
          closedDays: calculated.closedDays,
          missingDays: calculated.missingDays,
          highAmountCount,
          highAmountThreshold: input.highAmountThreshold.toFixed(2),
          status: "draft"
        }, ctx.user.tenantId);

        return {
          success: true,
          summaryId,
          totalDeposit: calculated.totalDeposit,
          totalWithdrawal: calculated.totalWithdrawal,
          netCashFlow: calculated.netCashFlow,
          closedDays: calculated.closedDays,
          totalDays: calculated.totalDays,
          missingDays: JSON.parse(calculated.missingDays),
          highAmountCount
        };
      }),
    // 월 마감 확정
    confirmClose: adminProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const summaryDb = await import("./db/accountingMonthlySummary");

        const summary = await summaryDb.getMonthlySummary(input.year, input.month);
        if (!summary) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "월 마감 데이터가 존재하지 않습니다. 먼저 집계를 생성해주세요."
          });
        }

        if (summary.status === "locked") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "이미 잠금된 월 마감입니다."
          });
        }

        await summaryDb.updateMonthlySummaryStatus(summary.id, "confirmed", ctx.user.id, ctx.user.tenantId);

        return {
          success: true,
          message: "월 마감이 확정되었습니다."
        };
      }),
    // 월 마감 잠금
    lockClose: adminProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const summaryDb = await import("./db/accountingMonthlySummary");

        const summary = await summaryDb.getMonthlySummary(input.year, input.month);
        if (!summary) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "월 마감 데이터가 존재하지 않습니다."
          });
        }

        if (summary.status !== "confirmed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "확정된 월 마감만 잠금할 수 있습니다."
          });
        }

        await summaryDb.updateMonthlySummaryStatus(summary.id, "locked", ctx.user.id);

        return {
          success: true,
          message: "월 마감이 잠금되었습니다. 더 이상 수정할 수 없습니다."
        };
      }),
    // 월 마감 목록 조회
    list: protectedProcedure
      .input(
        z.object({
          limit: z.number().optional().default(12)
        })
      )
      .query(async ({ input, ctx }) => {
        const summaryDb = await import("./db/accountingMonthlySummary");
        return await summaryDb.listMonthlySummaries(input.limit, ctx.user.tenantId);
      }),

    // 월 마감 상세 조회
    getDetail: protectedProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12)
        })
      )
      .query(async ({ input, ctx }) => {
        const summaryDb = await import("./db/accountingMonthlySummary");
        
        const summary = await summaryDb.getMonthlySummary(input.year, input.month);
        if (!summary) {
          return null;
        }

        // 고액 거래 목록 조회
        const highAmountTransactions = await summaryDb.getHighAmountTransactions(summary.id, ctx.user.tenantId);

        // 리포트 목록 조회
        const reports = await summaryDb.getMonthlyReports(summary.id, ctx.user.tenantId);

        return {
          ...summary,
          missingDays: summary.missingDays ? JSON.parse(summary.missingDays) : [],
          highAmountTransactions,
          reports
        };
      }),
    // PDF 리포트 생성 (placeholder)
    generatePDF: adminProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const summaryDb = await import("./db/accountingMonthlySummary");
        const { generatePDF, generateMonthlyReportHTML } = await import("./_core/pdfGenerator");

        const summary = await summaryDb.getMonthlySummary(input.year, input.month);
        if (!summary) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "월 마감 데이터가 존재하지 않습니다."
          });
        }

        // 고액 거래 데이터 조회
        const highAmountTransactions = await summaryDb.getHighAmountTransactions(summary.id);

        // HTML 템플릿 생성
        const html = generateMonthlyReportHTML({
          year: input.year,
          month: input.month,
          totalIncome: parseFloat(summary.totalDeposit),
          totalExpense: parseFloat(summary.totalWithdrawal),
          netCashFlow: parseFloat(summary.netCashFlow),
          highAmountTransactions: highAmountTransactions.map(tx => ({
            date: new Date(tx.transactionDate).toLocaleDateString('ko-KR'),
            description: tx.description || '',
            amount: parseFloat(tx.amount),
            type: tx.transactionType
          })),
          missingDates: summary.missingDays ? JSON.parse(summary.missingDays) : []
        });

        // PDF 생성 및 S3 업로드
        const fileName = `${input.year}년_${input.month}월_월마감리포트`;
        const { url: fileUrl, key: fileKey } = await generatePDF({
          html,
          filename: fileName,
          format: "A4",
          landscape: false,
          tenantId: ctx.user.tenantId
        });

        // 리포트 메타데이터 저장
        const reportId = await summaryDb.saveMonthlyReport({
          summaryId: summary.id,
          fileKey,
          fileUrl,
          fileName: `${fileName}.pdf`,
          fileSize: null, // puppeteer는 파일 크기를 반환하지 않음
          generatedBy: ctx.user.id
        }, ctx.user.tenantId);

        return {
          success: true,
          reportId,
          fileUrl,
          fileName: `${fileName}.pdf`
        };
      })
  }),
  // ============================================
  // HACCP 통합 (HACCP Integration))
  // ============================================
  haccpIntegration: router({
    // 재고 입고 → 매입 거래 생성
    createPurchaseFromReceipt: adminProcedure
      .input(
        z.object({
          inventoryTransactionId: z.number(),
          partnerId: z.number().optional(),
          itemName: z.string(),
          quantity: z.string(),
          unit: z.string(),
          unitPrice: z.string(),
          taxRate: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createPurchaseFromReceipt } = await import("./db/haccpIntegration");
        return await createPurchaseFromReceipt({
          ...input,
          createdBy: ctx.user.id
        }, ctx.user.tenantId);
      }),

    // 매입 거래 상세 조회
    getPurchaseById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getPurchaseById } = await import("./db/haccpIntegration");
        return await getPurchaseById(input.id, ctx.user.tenantId);
      }),

    getSaleById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getSaleById } = await import("./db/haccpIntegration");
        return await getSaleById(input.id, ctx.user.tenantId);
      }),

    generatePurchasePdf: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { generatePurchasePdf } = await import("./db/haccpIntegration");
        const pdfUrl = await generatePurchasePdf(input.id, ctx.user.tenantId);
        return { pdfUrl };
      }),

    generateSalePdf: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { generateSalePdf } = await import("./db/haccpIntegration");
        const pdfUrl = await generateSalePdf(input.id, ctx.user.tenantId);
        return { pdfUrl };
      }),

    // 재고 출고 → 매출 거래 생성
    createSaleFromUsage: protectedProcedure
      .input(
        z.object({
          inventoryTransactionId: z.number().optional(),
          partnerId: z.number().optional(),
          itemName: z.string(),
          quantity: z.string(),
          unit: z.string(),
          unitPrice: z.string(),
          taxRate: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createSaleFromUsage } = await import("./db/haccpIntegration");
        return await createSaleFromUsage({
          ...input,
          createdBy: ctx.user.id
        }, ctx.user.tenantId);
      }),

    // 재고 거래 ID로 회계 거래 조회
    getAccountingByInventoryTransaction: adminProcedure
      .input(z.object({ inventoryTransactionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getAccountingByInventoryTransaction } = await import("./db/haccpIntegration");
        return await getAccountingByInventoryTransaction(input.inventoryTransactionId, ctx.user.tenantId);
      }),

    // 매입 거래 목록 조회
    getAllPurchases: adminProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            partnerId: z.number().optional(),
            itemName: z.string().optional(),
            status: z.string().optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const { getAllPurchases } = await import("./db/haccpIntegration");
        return await getAllPurchases(input, ctx.user.tenantId);
      }),

    // 매입 거래 직접 생성 (품목 단위)
    createPurchase: adminProcedure
      .input(
        z.object({
          transactionDate: z.string(),
          partnerId: z.number(),
          itemName: z.string(),
          materialId: z.number().optional(), // 원재료 ID (레거시 호환)
          itemMasterId: z.number().optional(), // item_master ID (통합 기준)
          quantity: z.number(),
          packagingSize: z.number().optional(), // 포장규격
          unitPrice: z.number(),
          amount: z.number(),
          taxAmount: z.number(),
          memo: z.string().optional(),
          accountCategoryId: z.number().optional(),
          expiryDate: z.string().optional(), // 소비기한
          productionDate: z.string().optional(), // 생산일자
          unit: z.string().optional(), // 단위
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createPurchase } = await import("./db/haccpIntegration");
        return await createPurchase({
          ...input,
          createdBy: ctx.user.id
        }, ctx.user.tenantId);
      }),

    // 매출 거래 목록 조회
    getAllSales: adminProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            partnerId: z.number().optional(),
            itemName: z.string().optional(),
            status: z.string().optional()
          })
          .optional()
      )
      .query(async ({ input, ctx }) => {
        const { getAllSales } = await import("./db/haccpIntegration");
        return await getAllSales(input, ctx.user.tenantId);
      }),

    // 매출 거래 직접 생성 (품목 단위)
    createSale: adminProcedure
      .input(
        z.object({
          transactionDate: z.string(),
          partnerId: z.number(),
          itemName: z.string(),
          quantity: z.number(),
          unitPrice: z.number(),
          amount: z.number(),
          taxAmount: z.number(),
          memo: z.string().optional(),
          accountCategoryId: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createSale } = await import("./db/haccpIntegration");
        return await createSale({
          ...input,
          createdBy: ctx.user.id
        }, ctx.user.tenantId);
      }),

    // 매입 거래 수정
    updatePurchase: adminProcedure
      .input(
        z.object({
          id: z.number(),
          transactionDate: z.string().optional(),
          partnerId: z.number().optional(),
          itemName: z.string().optional(),
          category: z.string().optional(),
          quantity: z.number().optional(),
          unit: z.string().optional(),
          unitPrice: z.number().optional(),
          totalAmount: z.number().optional(),
          taxAmount: z.number().optional(),
          status: z.string().optional(),
          notes: z.string().optional(),
          accountCategoryId: z.number().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updatePurchase } = await import("./db/haccpIntegration");
        const { id, ...data } = input;
        return await updatePurchase(id, data);
      }),

    // 매입 거래 삭제
    deletePurchase: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deletePurchase } = await import("./db/haccpIntegration");
        return await deletePurchase(input.id, ctx.user.tenantId);
      }),

    // 매출 거래 수정
    updateSale: adminProcedure
      .input(
        z.object({
          id: z.number(),
          transactionDate: z.string().optional(),
          partnerId: z.number().optional(),
          itemName: z.string().optional(),
          category: z.string().optional(),
          quantity: z.number().optional(),
          unit: z.string().optional(),
          unitPrice: z.number().optional(),
          totalAmount: z.number().optional(),
          taxAmount: z.number().optional(),
          status: z.string().optional(),
          notes: z.string().optional(),
          accountCategoryId: z.number().optional()
        })
      )
      .mutation(async ({ input }) => {
        const { updateSale } = await import("./db/haccpIntegration");
        const { id, ...data } = input;
        return await updateSale(id, data);
      }),

    // 매출 거래 삭제
    deleteSale: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteSale } = await import("./db/haccpIntegration");
        return await deleteSale(input.id, ctx.user.tenantId);
      }),

    // 매입 거래명세표 PDF 생성
    generatePurchasePDF: protectedProcedure
      .input(z.object({ purchaseId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { generatePurchaseStatementPDF } = await import("./db/transactionStatement");
        const pdfBuffer = await generatePurchaseStatementPDF(input.purchaseId, ctx.user.tenantId);
        
        // Base64로 변환하여 반환
        return {
          pdf: pdfBuffer.toString("base64"),
          filename: `매입거래명세표_${input.purchaseId}_${new Date().toISOString().split("T")[0]}.pdf`
        };
      }),

    // 매출 거래명세표 PDF 생성
    generateSalePDF: protectedProcedure
      .input(z.object({ saleId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { generateSaleStatementPDF } = await import("./db/transactionStatement");
        const pdfBuffer = await generateSaleStatementPDF(input.saleId, ctx.user.tenantId);
        
        // Base64로 변환하여 반환
        return {
          pdf: pdfBuffer.toString("base64"),
          filename: `매출거래명세표_${input.saleId}_${new Date().toISOString().split("T")[0]}.pdf`
        };
      })
  }),

  // ============================================
  // 외부회계 문서함 (Accounting Documents)
  // ============================================
  accountingDocuments: router({
    // 문서 업로드
    upload: protectedProcedure
      .input(
        z.object({
          category: z.enum(["monthly_report", "tax_invoice", "receipt", "journal_entry", "other"]),
          year: z.number().int().optional(),
          month: z.number().int().optional(),
          fileKey: z.string(),
          fileUrl: z.string(),
          fileName: z.string(),
          fileSize: z.number().optional(),
          mimeType: z.string().optional(),
          title: z.string(),
          description: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const docsDb = await import("./db/accountingDocuments");

        const documentId = await docsDb.createDocument({
          ...input,
          uploadedBy: ctx.user.id
        }, ctx.user.tenantId);

        return {
          success: true,
          documentId
        };
      }),

    // 문서 목록 조회
    list: protectedProcedure
      .input(
        z.object({
          category: z.string().optional(),
          year: z.number().int().optional(),
          month: z.number().int().optional(),
          limit: z.number().optional().default(50)
        })
      )
      .query(async ({ input }) => {
        const docsDb = await import("./db/accountingDocuments");
        return await docsDb.listDocuments(input);
      }),

    // 문서 상세 조회
    getDetail: protectedProcedure
      .input(
        z.object({
          id: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const docsDb = await import("./db/accountingDocuments");
        
        const document = await docsDb.getDocument(input.id, ctx.user.tenantId);
        if (!document) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "문서를 찾을 수 없습니다."
          });
        }

        // 워크플로우 이력 조회
        const workflow = await docsDb.getDocumentWorkflow(input.id, ctx.user.tenantId);
        const latestStatus = await docsDb.getDocumentLatestStatus(input.id, ctx.user.tenantId);

        return {
          ...document,
          workflow,
          latestStatus
        };
      }),

    // 문서 삭제
    delete: adminProcedure
      .input(
        z.object({
          id: z.number()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const docsDb = await import("./db/accountingDocuments");
        await docsDb.deleteDocument(input.id, ctx.user.tenantId);

        return {
          success: true,
          message: "문서가 삭제되었습니다."
        };
      }),

    // 문서 상태 변경
    updateStatus: protectedProcedure
      .input(
        z.object({
          documentId: z.number(),
          status: z.enum(["requested", "uploaded", "reviewed", "completed", "rejected"]),
          comment: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const docsDb = await import("./db/accountingDocuments");

        await docsDb.updateDocumentStatus(
          input.documentId,
          input.status,
          ctx.user.id,
          input.comment
        , ctx.user.tenantId);

        return {
          success: true,
          message: "문서 상태가 변경되었습니다."
        };
      }),

    // 워크플로우 이력 조회
    getWorkflow: protectedProcedure
      .input(
        z.object({
          documentId: z.number()
        })
      )
      .query(async ({ input }) => {
        const docsDb = await import("./db/accountingDocuments");
        return await docsDb.getDocumentWorkflow(input.documentId);
      }),
    // HACCP 연동 자동화: 재료 입고 시 매입 거래 자동 생성
    autoCreatePurchaseFromReceipt: adminProcedure
      .input(z.object({ transactionId: z.number() }))
      .mutation(async ({ input }) => {
        const { createPurchaseFromReceipt } = await import("./db/haccpAccountingIntegration");
        return await createPurchaseFromReceipt(input.transactionId);
      }),

    // HACCP 연동 자동화: 제품 출고 시 매출 거래 자동 생성
    autoCreateSaleFromUsage: adminProcedure
      .input(z.object({ transactionId: z.number() }))
      .mutation(async ({ input }) => {
        const { createSaleFromUsage } = await import("./db/haccpAccountingIntegration");
        return await createSaleFromUsage(input.transactionId);
      }),

    // HACCP 연동 자동화: 기존 재고 거래 일괄 처리 (마이그레이션용)
    batchCreateAccountingTransactions: adminProcedure
      .mutation(async () => {
        const { batchCreateAccountingTransactions } = await import("./db/haccpAccountingIntegration");
        return await batchCreateAccountingTransactions();
      })
  }),

  // 카테고리 관리
  categories: router({
    // 카테고리 목록 조회 (유형별)
    listByType: protectedProcedure
      .input(z.object({ type: z.enum(["material", "product", "purchase", "sale"]) }))
      .query(async ({ input, ctx }) => {
        const { getCategoriesByType } = await import("./db/categories");
        return await getCategoriesByType(input.type, ctx.user.tenantId);
      }),

    // 모든 카테고리 조회
    listAll: protectedProcedure
      .query(async ({ ctx }) => {
        const { getAllCategories } = await import("./db/categories");
        return await getAllCategories();
      }),

    // 카테고리 생성
    create: protectedProcedure
      .input(z.object({
        type: z.enum(["material", "product", "purchase", "sale"]),
        name: z.string().min(1),
        code: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        sortOrder: z.number().optional(),
        dateManagementType: z.enum(["none", "expiry", "production", "both"]).optional(),
        alertDays: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { createCategory } = await import("./db/categories");
        return await createCategory(input, ctx.user.tenantId);
      }),

    // 카테고리 수정
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        code: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
        dateManagementType: z.enum(["none", "expiry", "production", "both"]).optional(),
        alertDays: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...updateData } = input;
        const { updateCategory } = await import("./db/categories");
        return await updateCategory(id, updateData, ctx.user.tenantId);
      }),

    // 카테고리 삭제
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteCategory } = await import("./db/categories");
        return await deleteCategory(input.id, ctx.user.tenantId);
      }),

    // 카테고리 순서 변경
    reorder: adminProcedure
      .input(z.object({
        type: z.enum(["material", "product", "purchase", "sale"]),
        categoryIds: z.array(z.number())
      }))
      .mutation(async ({ input, ctx }) => {
        const { reorderCategories } = await import("./db/categories");
        return await reorderCategories(input.type, input.categoryIds, ctx.user.tenantId);
      }),

    // 기본 카테고리 시드
    seedDefaults: adminProcedure
      .mutation(async ({ ctx }) => {
        const { seedDefaultCategories } = await import("./db/categories");
        return await seedDefaultCategories(ctx.user.tenantId);
      })
  }),

  // ============================================
  // 매칭 규칙 관리 (Matching Rules)
  // ============================================

  // 재고-회계 통합
  inventoryAccounting: inventoryAccountingRouter,

  // 재고 알람 관리
  stockAlerts: router({
    // 알람 목록 조회
    list: protectedProcedure
      .input(
        z.object({
          resolved: z.boolean().optional(), // true: 해제된 알람만, false: 미해제 알람만, undefined: 전체
          alertType: z.enum(["low_stock", "expiring_soon", "expired", "overstock"]).optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        const { hStockAlerts, hInventoryLots, hInventory } = await import("../drizzle/schema/part2");
        const { eq, and, isNull, isNotNull, desc } = await import("drizzle-orm");

        const conditions = [eq(hStockAlerts.tenantId, ctx.user.tenantId)];
        if (input.resolved !== undefined) {
          conditions.push(input.resolved ? isNotNull(hStockAlerts.resolvedAt) : isNull(hStockAlerts.resolvedAt));
        }
        if (input.alertType) {
          conditions.push(eq(hStockAlerts.alertType, input.alertType));
        }

        const alerts = await db
          .select({
            id: hStockAlerts.id,
            alertType: hStockAlerts.alertType,
            alertDate: hStockAlerts.alertDate,
            message: hStockAlerts.message,
            severity: hStockAlerts.severity,
            resolvedAt: hStockAlerts.resolvedAt,
            resolvedBy: hStockAlerts.resolvedBy,
            inventoryId: hStockAlerts.inventoryId,
            lotId: hStockAlerts.lotId,
            createdAt: hStockAlerts.createdAt,
            // LOT 정보
            lotNumber: hInventoryLots.lotNumber,
            expiryDate: hInventoryLots.expiryDate,
            productionDate: hInventoryLots.productionDate,
            // 재고 정보
            itemName: hInventory.itemName
          })
          .from(hStockAlerts)
          .leftJoin(hInventoryLots, eq(hStockAlerts.lotId, hInventoryLots.id))
          .leftJoin(hInventory, eq(hStockAlerts.inventoryId, hInventory.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(hStockAlerts.createdAt));

        return alerts;
      }),

    // 알람 해제
    resolve: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        const { hStockAlerts } = await import("../drizzle/schema/part2");
        const { eq, and } = await import("drizzle-orm");

        await db
          .update(hStockAlerts)
          .set({
            resolvedAt: new Date(),
            resolvedBy: ctx.user.name
          })
          .where(and(eq(hStockAlerts.id, input.id), eq(hStockAlerts.tenantId, ctx.user.tenantId)));

        return { success: true };
      }),

    // 알람 통계
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const { hStockAlerts } = await import("../drizzle/schema/part2");
      const { eq, count, isNull, and } = await import("drizzle-orm");

      const tenantFilter = eq(hStockAlerts.tenantId, ctx.user.tenantId);

      const [totalResult] = await db.select({ count: count() }).from(hStockAlerts).where(and(tenantFilter, isNull(hStockAlerts.resolvedAt)));

      const [expiringResult] = await db
        .select({ count: count() })
        .from(hStockAlerts)
        .where(and(tenantFilter, eq(hStockAlerts.alertType, "expiring_soon"), isNull(hStockAlerts.resolvedAt)));

      const [expiredResult] = await db
        .select({ count: count() })
        .from(hStockAlerts)
        .where(and(tenantFilter, eq(hStockAlerts.alertType, "expired"), isNull(hStockAlerts.resolvedAt)));

      const [lowStockResult] = await db
        .select({ count: count() })
        .from(hStockAlerts)
        .where(and(tenantFilter, eq(hStockAlerts.alertType, "low_stock"), isNull(hStockAlerts.resolvedAt)));

      return {
        total: totalResult.count,
        expiringSoon: expiringResult.count,
        expired: expiredResult.count,
        lowStock: lowStockResult.count
      };
    })
  }),
  weeklyLog: weeklyLogsRouter,
  monthlyLog: monthlyLogsRouter,
  yearlyLog: yearlyLogsRouter,
  dailyLog: router({
    // 일일일지 생성 (단절3 보강 - 실제 구현)
    create: protectedProcedure
      .input(z.object({
        logDate: z.string(),
        siteId: z.number().optional(),
        batchId: z.number().optional(),
        notes: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("데이터베이스 연결 실패");
          
          // 해당 날짜의 배치 정보 조회 (테넌트 격리)
          const batchData = await db.execute(sql`
            SELECT b.id, b.batch_code, b.status, b.planned_quantity, b.actual_quantity,
                   p.product_name, p.id as product_id
            FROM h_batches b
            LEFT JOIN h_products_v2 p ON b.product_id = p.id
            WHERE DATE(b.planned_date) = ${input.logDate}
            AND b.tenant_id = ${ctx.user.tenantId}
            ${input.siteId ? sql`AND b.site_id = ${input.siteId}` : sql``}
            ${input.batchId ? sql`AND b.id = ${input.batchId}` : sql``}
          `);
          
          // CCP 기록 조회 (테넌트 격리)
          const ccpData = await db.execute(sql`
            SELECT ci.id, ci.batch_id, ci.status, ci.measured_value, ci.result,
                   cc.ccp_name, cc.hazard_type
            FROM h_ccp_instances ci
            LEFT JOIN h_ccp_criteria cc ON ci.ccp_criteria_id = cc.id
            WHERE DATE(ci.work_date) = ${input.logDate}
            AND ci.tenant_id = ${ctx.user.tenantId}
            ${input.siteId ? sql`AND ci.site_id = ${input.siteId}` : sql``}
          `);
          
          // 일일일지 요약 생성
          const batches = Array.isArray(batchData) && Array.isArray(batchData[0]) ? batchData[0] : ((batchData as any).rows || batchData);
          const ccpRecords = Array.isArray(ccpData) && Array.isArray(ccpData[0]) ? ccpData[0] : ((ccpData as any).rows || ccpData);
          
          const summary = {
            date: input.logDate,
            totalBatches: batches.length,
            completedBatches: batches.filter((b: any) => b.status === 'completed').length,
            inProgressBatches: batches.filter((b: any) => b.status === 'in_progress').length,
            totalCcpChecks: ccpRecords.length,
            passedCcpChecks: ccpRecords.filter((c: any) => c.result === 'pass' || c.status === 'completed').length,
            failedCcpChecks: ccpRecords.filter((c: any) => c.result === 'fail' || c.result === 'deviation').length,
            products: [...new Set(batches.map((b: any) => b.product_name).filter(Boolean))],
            notes: input.notes || ''
          };
          
          // h_daily_reports 테이블에 저장
          const reportResult = await db.execute(sql`
            INSERT INTO h_daily_reports (site_id, report_date, report_type, summary, generated_at, tenant_id)
            VALUES (
              ${input.siteId},
              ${input.logDate},
              'daily_log',
              ${JSON.stringify(summary)},
              NOW(),
              ${ctx.user.tenantId}
            )
            ON DUPLICATE KEY UPDATE summary = ${JSON.stringify(summary)}, generated_at = NOW()
          `);
          
          const reportId = (reportResult as any).insertId || 1;
          
          console.log(`[파이프라인] 일일일지 생성 완료: ${input.logDate}, 배치 ${summary.totalBatches}건, CCP ${summary.totalCcpChecks}건`);
          
          return {
            success: true,
            id: reportId,
            summary,
            message: `일일일지가 생성되었습니다. (배치 ${summary.totalBatches}건, CCP ${summary.totalCcpChecks}건)`
          };
        } catch (error) {
          console.error('[dailyLog.create] 오류:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : '일일일지 생성 중 오류가 발생했습니다.'
          });
        }
      }),
    
    // 일일일지 조회
    getByDate: protectedProcedure
      .input(z.object({
        logDate: z.string(),
        siteId: z.number().optional()
      }))
      .query(async ({ input, ctx }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("데이터베이스 연결 실패");
          
          const result = await db.execute(sql`
            SELECT id, site_id, report_date, report_type, summary, generated_at
            FROM h_daily_reports
            WHERE report_date = ${input.logDate}
            AND tenant_id = ${ctx.user.tenantId}
            ${input.siteId ? sql`AND site_id = ${input.siteId}` : sql``}
            AND report_type = 'daily_log'
            ORDER BY generated_at DESC
            LIMIT 1
          `);
          
          const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : ((result as any).rows || result);
          if ((rows as any[]).length === 0) return null;
          
          const report = (rows as any[])[0];
          return {
            id: report.id,
            siteId: report.site_id,
            reportDate: report.report_date,
            summary: typeof report.summary === 'string' ? JSON.parse(report.summary) : report.summary,
            generatedAt: report.generated_at
          };
        } catch (error) {
          console.error('[dailyLog.getByDate] 오류:', error);
          return null;
        }
      }),
    
    // 일일일지 목록 조회
    list: protectedProcedure
      .input(z.object({
        siteId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0)
      }).optional())
      .query(async ({ input = { limit: 50, offset: 0 }, ctx }) => {
        try {
          const db = await getDb();
          if (!db) throw new Error("데이터베이스 연결 실패");
          
          const result = await db.execute(sql`
            SELECT id, site_id, report_date, report_type, summary, generated_at
            FROM h_daily_reports
            WHERE report_type = 'daily_log'
            AND tenant_id = ${ctx.user.tenantId}
            ${input.siteId ? sql`AND site_id = ${input.siteId}` : sql``}
            ${input.startDate ? sql`AND report_date >= ${input.startDate}` : sql``}
            ${input.endDate ? sql`AND report_date <= ${input.endDate}` : sql``}
            ORDER BY report_date DESC
            LIMIT ${input.limit} OFFSET ${input.offset}
          `);
          
          const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : ((result as any).rows || result);
          return (rows as any[]).map((r: any) => ({
            id: r.id,
            siteId: r.site_id,
            reportDate: r.report_date,
            summary: typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary,
            generatedAt: r.generated_at
          }));
        } catch (error) {
          console.error('[dailyLog.list] 오류:', error);
          return [];
        }
      })
  }),
  tenant: router({
    // 모든 테넌트 목록 조회
    list: adminProcedure.query(async () => {
      const { getAllTenants } = await import("./db");
      return await getAllTenants();
    }),
    
    // 테넌트 상세 정보 조회
    getDetail: adminProcedure
      .input(z.object({
        tenantId: z.number()
      }))
      .query(async ({ input }) => {
        const { getTenantDetail } = await import("./db");
        return await getTenantDetail(input.tenantId);
      })
  }),

  // ============================================================================
  // 문서 승인 라우터 (단절 5 보강 - 일괄 승인 포함)
  // ============================================================================
  documentApproval: documentApprovalRouter,
  
  // ============================================================================
  // 문서 출력 라우터 (단절 6 보강 - 일괄 출력 포함)
  // ============================================================================
  documentPrint: documentPrintRouter,
  
  // ============================================================================
  // 파이프라인 대시보드 (추가 개선)
  // ============================================================================
  pipeline: router({
    // 파이프라인 상태 대시보드
    getStatus: protectedProcedure
      .input(z.object({ siteId: z.number(), workDate: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("데이터베이스 연결 실패");
        return await getPipelineStatus(db, input.siteId, input.workDate);
      }),
    
    // 원료 재고 사전 체크
    checkMaterial: protectedProcedure
      .input(z.object({ batchId: z.number(), siteId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("데이터베이스 연결 실패");
        return await checkMaterialAvailability(db, input.batchId, input.siteId);
      }),
    
    // 일일 마감 (기존 - siteId 기반)
    runDailyClosing: protectedProcedure
      .input(z.object({ siteId: z.number(), workDate: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("데이터베이스 연결 실패");
        return await runDailyClosing(db, input.siteId, input.workDate);
      }),
    
    // 수동 일일 마감 실행 (스케줄러와 동일한 전체 프로세스)
    runManualClosing: protectedProcedure
      .input(z.object({ tenantId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { runDailyClosingProcess } = await import("./services/dailyClosingScheduler");
        const summaries = await runDailyClosingProcess();
        return { success: true, summaries };
      }),
    
    // 일일 마감 보고서 조회
    getDailyClosingReport: protectedProcedure
      .input(z.object({ 
        tenantId: z.number(), 
        reportDate: z.string().optional(),
        limit: z.number().optional()
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("데이터베이스 연결 실패");
        
        if (input.reportDate) {
          // 특정 날짜 보고서 조회
          const resultRaw = await db.execute(sql`
            SELECT id, site_id, report_date, report_type, summary, generated_at, tenant_id
            FROM h_daily_reports
            WHERE tenant_id = ${input.tenantId}
              AND report_date = ${input.reportDate}
              AND report_type = 'daily_closing'
            ORDER BY generated_at DESC
            LIMIT 1
          `);
          const result = Array.isArray(resultRaw) && Array.isArray(resultRaw[0]) ? resultRaw[0] : resultRaw;
          const row = (result as any[])[0];
          if (!row) return null;
          return {
            ...row,
            summary: typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary
          };
        } else {
          // 최근 보고서 목록 조회
          const limit = input.limit || 30;
          const resultRaw2 = await db.execute(sql`
            SELECT id, site_id, report_date, report_type, summary, generated_at, tenant_id
            FROM h_daily_reports
            WHERE tenant_id = ${input.tenantId}
              AND report_type = 'daily_closing'
            ORDER BY report_date DESC
            LIMIT ${limit}
          `);
          const result2 = Array.isArray(resultRaw2) && Array.isArray(resultRaw2[0]) ? resultRaw2[0] : resultRaw2;
          return (result2 as any[]).map((row: any) => ({
            ...row,
            summary: typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary
          }));
        }
      }),
    
    // 마감 알림 목록 조회 (일일마감 관련 알림만)
    getClosingNotifications: protectedProcedure
      .input(z.object({ 
        tenantId: z.number(),
        limit: z.number().optional()
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("데이터베이스 연결 실패");
        const limit = input.limit || 50;
        const resultRaw3 = await db.execute(sql`
          SELECT id, user_id, notification_type, title, message, reference_type, reference_id, 
                 priority, is_read, action_url, is_resolved, created_at
          FROM h_notifications
          WHERE tenant_id = ${input.tenantId}
            AND notification_type IN (
              'batch_incomplete_warning', 'pending_approval_summary', 
              'low_stock_critical', 'low_stock_warning', 'daily_closing_report'
            )
          ORDER BY created_at DESC
          LIMIT ${limit}
        `);
        const result3 = Array.isArray(resultRaw3) && Array.isArray(resultRaw3[0]) ? resultRaw3[0] : resultRaw3;
        return result3 as any[];
      }),
  }),
  // ===== 원료수불부 =====
  materialLedger: router({
    // 일별 원료수불 조회
    getDaily: publicProcedure
      .input(z.object({ date: z.string(), tenantId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { getDailyLedger } = await import("./db/materialLedger");
        return getDailyLedger(input.date, tenantId);
      }),
    
    // 일별 수불 데이터 upsert
    upsertDaily: publicProcedure
      .input(z.object({
        materialId: z.number(),
        ledgerDate: z.string(),
        receivingQty: z.number().optional(),
        usageQty: z.number().optional(),
        adjustmentQty: z.number().optional(),
        notes: z.string().optional(),
        source: z.string().optional(),
        tenantId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { upsertDailyLedger } = await import("./db/materialLedger");
        return upsertDailyLedger(input, tenantId);
      }),
    
    // 일별 수불 삭제
    deleteDaily: publicProcedure
      .input(z.object({ id: z.number(), tenantId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { deleteDailyLedger } = await import("./db/materialLedger");
        return deleteDailyLedger(input.id, tenantId);
      }),
    
    // 월별 원료수불부 조회
    getMonthly: publicProcedure
      .input(z.object({ yearMonth: z.string(), tenantId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { getMonthlyLedger } = await import("./db/materialLedger");
        return getMonthlyLedger(input.yearMonth, tenantId);
      }),
    
    // 월별 집계 실행
    aggregateMonthly: publicProcedure
      .input(z.object({ yearMonth: z.string(), tenantId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { aggregateMonthlyLedger } = await import("./db/materialLedger");
        return aggregateMonthlyLedger(input.yearMonth, tenantId);
      }),
    
    // 월마감 승인 상태 조회
    getApproval: publicProcedure
      .input(z.object({ yearMonth: z.string(), tenantId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { getApprovalStatus } = await import("./db/materialLedger");
        return getApprovalStatus(input.yearMonth, tenantId);
      }),
    
    // 월마감 제출
    submitApproval: publicProcedure
      .input(z.object({ yearMonth: z.string(), userId: z.number(), tenantId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { submitForApproval } = await import("./db/materialLedger");
        return submitForApproval(input.yearMonth, input.userId, tenantId);
      }),
    
    // 월마감 승인
    approve: publicProcedure
      .input(z.object({ yearMonth: z.string(), userId: z.number(), tenantId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { approveMonthlyClose } = await import("./db/materialLedger");
        return approveMonthlyClose(input.yearMonth, input.userId, tenantId);
      }),
    
    // 월마감 반려
    reject: publicProcedure
      .input(z.object({ yearMonth: z.string(), userId: z.number(), reason: z.string(), tenantId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { rejectMonthlyClose } = await import("./db/materialLedger");
        return rejectMonthlyClose(input.yearMonth, input.userId, input.reason, tenantId);
      }),
    
    // 일일 마감 후 자동 업데이트
    autoUpdate: publicProcedure
      .input(z.object({ closeDate: z.string(), tenantId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { autoUpdateFromDailyClose } = await import("./db/materialLedger");
        return autoUpdateFromDailyClose(input.closeDate, tenantId);
      }),

    downloadExcel: publicProcedure
      .input(z.object({ yearMonth: z.string(), tenantId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = input.tenantId || (ctx as any)?.tenantId || 2;
        const { generateMonthlyExcel } = await import("./db/materialLedgerExcel");
        const buffer = await generateMonthlyExcel(input.yearMonth, tenantId);
        return { base64: buffer.toString("base64"), filename: `원료수불부_${input.yearMonth}.xlsx` };
      }),
    // 대시보드 요약 통계
    getDashboard: protectedProcedure
      .query(async ({ ctx }) => {
        const { getDashboardSummary } = await import("./db/materialLedger");
        return getDashboardSummary(ctx.user.tenantId);
      }),
    // 체크리스트 연동 - 해당 일자의 원재료 입고/사용 요약
    getChecklistData: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getMaterialChecklistData } = await import("./db/materialLedger");
        return getMaterialChecklistData(input.date, ctx.user.tenantId);
      }),
    // 회계 연동 - 원재료 거래를 회계에 동기화
    syncAccounting: protectedProcedure
      .input(z.object({
        type: z.enum(['purchase', 'usage']),
        date: z.string(),
        materialName: z.string(),
        quantity: z.number(),
        unitPrice: z.number()
      }))
      .mutation(async ({ input, ctx }) => {
        const { syncToAccounting } = await import("./db/materialLedger");
        return syncToAccounting(
          ctx.user.tenantId, input.type, input.date,
          input.materialName, input.quantity, input.unitPrice, ctx.user.id
        );
      }),
  }),
});

