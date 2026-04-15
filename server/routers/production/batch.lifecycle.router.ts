/**
 * 배치 라이프사이클 (상태조회/승인/완료)
 */
import { monitorProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lt, or, sql } from "drizzle-orm";
import { getDb, getRawConnection } from "../../db";
import { toKSTDate, todayKST, formatLocalDate } from "../../utils/timezone";

export const batchLifecycleRouter = router({
    generateBatchCode: tenantRequiredProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { generateBatchCode } = await import("../../db");
        const batchCode = await generateBatchCode(input.productId, tenantId ?? undefined);
        return { batchCode };
      }),
    
    /** CCP 자동 생성 (BOM 공정그룹 기반) */
    generateCcp: workerProcedure
      .input(z.object({ 
        batchId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { autoCreateCcpInstancesForBatch } = await import("../../services/ccp-batch");
        const { getBatchById, getProductById } = await import("../../db");

        // 배치 정보 조회
        const tenantId = ctx.tenantId;
        const batch = await getBatchById(input.batchId, tenantId ?? undefined);
        if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "배치를 찾을 수 없습니다." });

        // 이미 CCP 인스턴스가 있는지 확인
        // ★ CCP-4P는 같은 날짜의 다른 배치에 이미 연결되어 있을 수 있으므로,
        //    직접 연결(batch_id) + 같은 날짜 CCP-4P 둘 다 확인
        const { getRawConnection } = await import("../../db");
        const conn = await getRawConnection();
        const [existing] = await conn.execute(
          `SELECT COUNT(*) as cnt FROM h_ccp_instances 
           WHERE tenant_id=? AND (
             batch_id=?
             OR (ccp_type='CCP-4P' AND work_date = (
               SELECT planned_date FROM h_batches WHERE id=? AND tenant_id=? LIMIT 1
             ))
           )`,
          [ctx.tenantId, input.batchId, input.batchId, ctx.tenantId]
        );
        const existingCount = Number((existing as any)[0]?.cnt || 0);
        if (existingCount > 0) {
          return {
            success: true,
            ccpCount: existingCount,
            message: `이미 CCP ${existingCount}건이 존재합니다.`,
            alreadyExists: true
          };
        }

        const product = await getProductById(batch.productId, tenantId ?? undefined);
        const workDate = batch.plannedDate
          ? toKSTDate(new Date(batch.plannedDate))
          : todayKST();

        const result = await autoCreateCcpInstancesForBatch({
          siteId: batch.siteId,
          workDate,
          batchId: input.batchId,
          productId: batch.productId,
          productName: product?.productName || "",
          createdBy: ctx.user.id,
          tenantId: ctx.tenantId
        });

        const groupNames = (result.groups || []).map((g: any) => `${g.name}(${g.ccp_type})`).join(", ");

        return {
          success: true,
          ccpCount: result.instanceIds.length,
          instanceIds: result.instanceIds,
          groups: result.groups,
          message: result.instanceIds.length > 0
            ? `CCP ${result.instanceIds.length}건이 생성되었습니다. [${groupNames}]`
            : "BOM에 연결된 공정그룹이 없습니다. 제품의 BOM(품목제조보고)을 확인해주세요."
        };
      }),
    
    /** 배치 원재료 비용 조회 */
    getCost: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getBatchCost } = await import("../../db");
        return await getBatchCost(input.batchId, tenantId ?? undefined);
      }),
    
    /** 배치 대시보드 통계 데이터 조회 */
    getDashboardData: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getBatchDashboardData } = await import("../../db/production/batchDashboard");
        return await getBatchDashboardData(ctx.tenantId);
      }),
    
    /** 진행 중인 배치 목록 조회 */
    getInProgress: tenantRequiredProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input, ctx }) => {
        const { getInProgressBatches } = await import("../../db/production/batchDashboard");
        return await getInProgressBatches(input.limit, ctx.tenantId);
      }),
    
    /** 완료된 배치 목록 조회 */
    getCompleted: tenantRequiredProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input, ctx }) => {
        const { getCompletedBatches } = await import("../../db/production/batchDashboard");
        return await getCompletedBatches(input.limit, ctx.tenantId);
      }),
    
    /** 승인 대기 중인 배치 목록 조회 */
    getPendingApproval: tenantRequiredProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input, ctx }) => {
        const { getPendingApprovalBatches } = await import("../../db/production/batchDashboard");
        return await getPendingApprovalBatches(input.limit, ctx.tenantId);
      }),
    
    /** HACCP 보고서 PDF 생성 (base64 반환) */
    generateHaccpReport: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const { generateHaccpReportPdf } = await import("../../lib/generateHaccpReport");
          const pdfBuffer = await generateHaccpReportPdf(input.batchId);
          
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
    
// ═══════════════════════════════════════════════════════════════
// 승인 워크플로 (요청, 승인, 반려, 이력)
// ═══════════════════════════════════════════════════════════════

    /** 배치 승인 요청 (관리자/검사자에게 알림 발송) */
    requestApproval: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getBatchById, updateBatchStatus, createAuditLog, getUsersByRole, createNotification } = await import("../../db");
        
        // 배치 정보 조회
        const batch = await getBatchById(input.batchId, ctx.tenantId);
        if (!batch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "배치를 찾을 수 없습니다."
          });
        }
        
        // 배치 상태를 under_review로 변경
        await updateBatchStatus(input.batchId, "under_review", ctx.tenantId);

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
            tenantId: ctx.tenantId,
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
    
    /** 배치 승인 (monitorProcedure 권한 필요) */
    approve: monitorProcedure
      .input(
        z.object({
          batchId: z.number(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveBatch } = await import("../../db/production/batchApprovals");
        const { updateBatchStatus, createAuditLog } = await import("../../db");
        
        await approveBatch({
          batchId: input.batchId,
          approverId: ctx.user.id,
          notes: input.notes
        });
        
        // 배치 상태를 approved로 변경
        await updateBatchStatus(input.batchId, "approved", ctx.tenantId);

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
    
    /** 배치 반려 (반려 사유 필수) */
    reject: monitorProcedure
      .input(
        z.object({
          batchId: z.number(),
          rejectionReason: z.string().min(1, "반려 사유를 입력해주세요"),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { rejectBatch } = await import("../../db/production/batchApprovals");
        const { updateBatchStatus, createAuditLog } = await import("../../db");
        
        await rejectBatch({
          batchId: input.batchId,
          approverId: ctx.user.id,
          rejectionReason: input.rejectionReason,
          notes: input.notes
        });
        
        // 배치 상태를 rejected로 변경
        await updateBatchStatus(input.batchId, "rejected", ctx.tenantId);

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
    
    /** 배치 승인 이력 조회 */
    getApprovals: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchApprovals } = await import("../../db/production/batchApprovals");
        return await getBatchApprovals(input.batchId, ctx.tenantId);
      }),
    
    /** 배치 승인 상태 확인 */
    getApprovalStatus: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchApprovalStatus } = await import("../../db/production/batchApprovals");
        return await getBatchApprovalStatus(input.batchId, ctx.tenantId);
      }),
    
// ═══════════════════════════════════════════════════════════════
// 원가 / 수익성 분석
// ═══════════════════════════════════════════════════════════════

    /** 여러 배치 비용 요약 조회 */
    getCostSummary: tenantRequiredProcedure
      .input(z.object({ batchIds: z.array(z.number()) }))
      .query(async ({ input, ctx }) => {
        const { getBatchCostSummary } = await import("../../db");
        return await getBatchCostSummary(input.batchIds);
      }),
    
    /** 배치 수익성 조회 (원가, 매출, 수익률) */
    getProfitability: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchProfitability } = await import("../../db");
        return await getBatchProfitability(input.batchId);
      }),
    
    /** 제품별 수익성 통계 조회 */
    getProfitabilityByProduct: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getProfitabilityByProduct } = await import("../../db");
        return await getProfitabilityByProduct({ ...input, tenantId: ctx.tenantId });
      }),
    
    /** 배치 매출액 업데이트 */
    updateRevenue: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          revenue: z.number()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateBatchRevenue } = await import("../../db");
        return await updateBatchRevenue(input.batchId, input.revenue);
      }),
    
    /** 월별 수익률 추이 조회 */
    getProfitabilityTrendByMonth: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getProfitabilityTrendByMonth } = await import("../../db");
        return await getProfitabilityTrendByMonth(input.startDate, input.endDate, ctx.tenantId);
      }),
    
    /** 분기별 수익률 추이 조회 */
    getProfitabilityTrendByQuarter: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getProfitabilityTrendByQuarter } = await import("../../db");
        return await getProfitabilityTrendByQuarter(input.startDate, input.endDate, ctx.tenantId);
      }),
    
// ═══════════════════════════════════════════════════════════════
// 수익성 예측 (지수 평활법 + 트렌드)
// ═══════════════════════════════════════════════════════════════

    /** 배치 수익성 예측 (지수 평활법 + 트렌드 기반) */
    getProfitabilityForecast: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getProfitabilityForecast } = await import("../../db");
        return await getProfitabilityForecast(ctx.tenantId);
      }),
    
    /** 수익성 예측값 저장 */
    saveForecast: tenantRequiredProcedure
      .input(z.object({
        targetMonth: z.string(),
        predictedRevenue: z.number(),
        predictedCost: z.number(),
        predictedProfitMargin: z.number()
      }))
      .mutation(async ({ input, ctx }) => {
        const { saveProfitabilityForecast } = await import("../../db");
        return await saveProfitabilityForecast(input);
      }),
    
    /** 과거 예측값 조회 (실제값과 비교) */
    getForecastHistory: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getProfitabilityForecastHistory } = await import("../../db");
        return await getProfitabilityForecastHistory(ctx.tenantId);
      }),
    
    /** 실제 수익성 업데이트 (월 마감 후) */
    updateActualProfitability: tenantRequiredProcedure
      .input(z.object({
        targetMonth: z.string(),
        actualRevenue: z.number(),
        actualCost: z.number(),
        actualProfitMargin: z.number()
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateActualProfitability } = await import("../../db");
        return await updateActualProfitability(input);
      }),
    
// ═══════════════════════════════════════════════════════════════
// 배치 라이프사이클 (완성도 체크, 완료, 모니터링)
// ═══════════════════════════════════════════════════════════════

    /** 활성 배치 목록 조회 (실시간 모니터링용) */
    getActiveBatches: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getActiveBatches } = await import("../../db");
      return await getActiveBatches(ctx.tenantId);
    }),
    
    /** 배치 완성도 체크 (미작성 문서 추적) */
    checkCompletion: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { checkBatchCompletion } = await import("../../db/production/batchCompletion");
        return await checkBatchCompletion(input.batchId, ctx.tenantId);
      }),
    
    /** 배치 완료 전 필수 체크리스트 확인 */
    checkCompletionReadiness: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { checkBatchCompletionReadiness } = await import("../../db");
        return await checkBatchCompletionReadiness(input.batchId, ctx.tenantId);
      }),
    
    /** 배치 완료 - 재고정산, 원가확정, CCP종결, PDF생성, 일일일지, 승인요청 (admin 전용) */
    complete: tenantRequiredProcedure
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
        
        const { createAuditLog, completeBatch } = await import("../../db");
        const { notifyOwner } = await import("../../_core/notification");
        
        try {
          // 1. 배치 완료 처리 (재고 정산, 원가 확정, CCP 종결, idempotency 키 검증)
          const result = await completeBatch({
            batchId: input.batchId,
            actualQuantity: input.actualQuantity,
            defectQuantity: input.defectQuantity,
            revenue: input.revenue,
            completionNotes: input.completionNotes,
            idempotencyKey: input.idempotencyKey,
            tenantId: ctx.tenantId
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
              const { addRetryTask } = await import("../../db/production/batchCompletionRetries");
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
            const { generateHaccpReportPdf } = await import("../../lib/generateHaccpReport");
            const pdfBuffer = await generateHaccpReportPdf(input.batchId);
            
            // PDF를 S3에 업로드
            const { storagePut } = await import("./storage");
            const timestamp = Date.now();
            const fileKey = `tenant-${ctx.tenantId}/haccp-reports/batch-${input.batchId}-${timestamp}.pdf`;
            const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
            pdfUrl = url;
            pdfGenerated = true;
            
            // PDF 생성 성공 로그 저장
            if (pdfUrl) {
              try {
                const { logPdfSuccess } = await import("../../db/production/batchPdfLogs");
                await logPdfSuccess(input.batchId, pdfUrl);
              } catch (logError) {
                console.error("[배치 완료] PDF 성공 로그 저장 실패:", logError);
              }
            }
          } catch (pdfError) {
            console.error("[배치 완료] PDF 생성 실패:", pdfError);
            
            // PDF 생성 실패 로그 저장
            try {
              const { logPdfFailure } = await import("../../db/production/batchPdfLogs");
              await logPdfFailure(
                input.batchId,
                pdfError instanceof Error ? pdfError.message : "PDF 생성 실패"
              );
            } catch (logError) {
              console.error("[배치 완료] PDF 실패 로그 저장 실패:", logError);
            }
            
            // 재시도 큐에 추가
            try {
              const { addRetryTask } = await import("../../db/production/batchCompletionRetries");
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
            const { autoGenerateDailyReport } = await import('../../lib/production/autoDailyReport');
            dailyReportResult = await autoGenerateDailyReport(input.batchId, ctx.user.id);
          } catch (dailyError: any) {
            console.error('[파이프라인] 일일일지 생성 오류:', dailyError?.message || dailyError);
          }
          
          // 단절 4-1: 법적 선행 체크리스트 자동생성
          let checklistResult = null;
          try {
            const { getBatchById } = await import("../../db");
            const batch = await getBatchById(input.batchId, ctx.tenantId);
            if (batch) {
              const today = todayKST();
              const { sql: rawSql } = await import("drizzle-orm");
              const dbConn = await (await import("../../db")).getDb();
              if (dbConn) {
                // 해당 날짜에 이미 생성된 체크리스트가 있는지 확인
                const existing = await dbConn.execute(rawSql`
                  SELECT id FROM h_daily_checklists 
                  WHERE site_id = ${batch.siteId || ctx.user.siteId || ctx.tenantId} 
                    AND check_date = ${today} 
                    AND tenant_id = ${ctx.tenantId}
                  LIMIT 1
                `);
                
                const existingRows = (existing as any)[0] || [];
                
                if (existingRows.length === 0) {
                  // 일일 체크리스트 자동 생성
                  const insertRes = await dbConn.execute(rawSql`
                    INSERT INTO h_daily_checklists (site_id, check_date, shift, area, status, notes, tenant_id)
                    VALUES (${batch.siteId || ctx.user.siteId || ctx.tenantId}, ${today}, 'day', '생산구역', 'pending', 
                            ${JSON.stringify({ batchId: input.batchId, autoGenerated: true })}, 
                            ${ctx.tenantId})
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
                      VALUES (${checklistId}, ${defaultItems[i]}, NULL, ${i + 1}, ${ctx.tenantId})
                    `);
                  }
                  
                  checklistResult = { success: true, checklistId, message: '일일 체크리스트 자동 생성 완료' };
                } else {
                  checklistResult = { success: true, checklistId: existingRows[0].id, message: '기존 체크리스트 사용' };
                }
              }
            }
          } catch (checklistError) {
            console.error('[파이프라인] 체크리스트 자동생성 오류:', checklistError);
          }
          
          // 단절 4: 승인 대기 문서 자동 등록
          try {
            const { autoCreateApprovalRequest } = await import('../../lib/production/autoApprovalRequest');
            approvalResult = await autoCreateApprovalRequest(input.batchId, ctx.user.id, pdfUrl);
          } catch (approvalError) {
            console.error('[파이프라인] 승인 요청 생성 오류:', approvalError);
          }
          // 단절 4-2: 템플릿 기반 체크리스트 자동생성 (frequency=batch_complete)
          let templateChecklistResult = null;
          try {
            const { autoCreateChecklistsForBatchComplete } = await import('../../lib/production/autoChecklistFromBatch');
            templateChecklistResult = await autoCreateChecklistsForBatchComplete(ctx.tenantId, input.batchId, ctx.user.id);
          } catch (tclErr: any) {
            console.error('[파이프라인] 템플릿 체크리스트 자동생성 실패:', tclErr?.message || tclErr);
          }

          // === 파이프라인 자동화 끝 ===

          // === 원료수불부 사용 연동 ===
          try {
            const { onBatchCompleted } = await import("../../db/accounting/materialLedger");
            const completionDate = todayKST();
            await onBatchCompleted({
              batchId: input.batchId,
              completionDate,
            }, ctx.tenantId);
          } catch (ledgerError) {
            console.error("[원료수불부] 배치 사용 반영 실패:", ledgerError);
          }
          // 생산일지(production_daily) 자동 갱신 (배치 완료 시)
          try {
            const { autoRegenerateProductionDaily } = await import('../../lib/production/autoProductionDaily');
            const batchInfo = await (await import("../../db")).getBatchById(input.batchId, ctx.tenantId);
            const bDate = batchInfo?.plannedDate ? toKSTDate(new Date(batchInfo.plannedDate)) : todayKST();
            await autoRegenerateProductionDaily(ctx.tenantId, bDate);
          } catch (pdErr) {
            console.error('[파이프라인] 생산일지 갱신 실패 (배치완료):', pdErr);
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
    
// ═══════════════════════════════════════════════════════════════
// 비용 분석 (원재료별, 기간별, 원가율)
// ═══════════════════════════════════════════════════════════════

    /** 원재료별 원가 비중 집계 */

});
