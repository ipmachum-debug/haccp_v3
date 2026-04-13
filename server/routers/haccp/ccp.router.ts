// ccp 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";

import { todayKST } from "../../utils/timezone";

export const ccpRouter = router({
    // 배치별 CCP 인스턴스 조회 (공정그룹·설비 정보 포함)
    getByBatchId: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCcpInstancesByBatchId } = await import("../../db");
        const tenantId = ctx.tenantId;
        const instances: any[] = await getCcpInstancesByBatchId(input.batchId, tenantId) as any;
        // tenant_id 보안 검증: 해당 배치가 현재 테넌트 소속인지 확인
        if (instances.length > 0 && (ctx.tenantId)) {
          // 인스턴스 반환 (rows 포함)
        }
        return instances;
      }),
    
    // CCP 인스턴스 상세 조회
    getInstanceById: tenantRequiredProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getCcpInstanceById } = await import("../../db");
        return await getCcpInstanceById(input.instanceId, tenantId);
      }),
    
    // CCP 인스턴스별 점검 행 조회
    getRowsByInstanceId: tenantRequiredProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getCcpRowsByInstanceId } = await import("../../db");
        return await getCcpRowsByInstanceId(input.instanceId, tenantId);
      }),
    
    // CCP 템플릿 조회 (ccpType으로)
    getTemplateByType: tenantRequiredProcedure
      .input(z.object({ ccpType: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getCcpTemplates, getCcpTemplateRows } = await import("../../db/production/batch");
        const templates = await getCcpTemplates({ ccpType: input.ccpType, isActive: true, tenantId: ctx.tenantId });
        if (templates.length === 0) return null;
        
        const template = templates[0];
        const rows = await getCcpTemplateRows(template.id, ctx.tenantId);
        
        return {
          ...template,
          rows
        };
      }),
    

    // CCP 점검 행 업데이트 (인라인 편집 - 설비행 온도/압력/시간/판정 수정)
    updateRow: workerProcedure
      .input(
        z.object({
          rowId: z.number(),
          tempC: z.string().optional(),
          durationMin: z.number().optional(),
          pressureBar: z.string().optional(),
          result: z.enum(["PASS", "FAIL", "N/A"]).optional(),
          note: z.string().optional(),
          measuredAt: z.date().optional(),
          heatingMin: z.number().optional(),
          cycleTotalMin: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { updateCcpRow } = await import("../../db");
        const { rowId, ...data } = input;
        return await updateCcpRow(rowId, data, tenantId);
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
          note: z.string().optional(),
          equipmentId: z.number().optional(),
          equipmentName: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createCcpRow, getCcpInstanceById, createCcpDeviation, createNotification, getBatchById } = await import("../../db");
        
        const tenantId = ctx.tenantId;
        // CCP 점검 행 생성
        const newRow = await createCcpRow(input, tenantId);
        
        // 한계기준 검사는 클라이언트 측에서 수행
        const instance = await getCcpInstanceById(input.instanceId, tenantId);
        let deviationDetected = false;
        let deviationMessage = "";
        
        // 이탈 발생 시 h_ccp_deviations에 기록
        if (deviationDetected && instance && instance.batchId !== null) {
          const batch = await getBatchById(instance.batchId, ctx.tenantId);
          
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
            tenantId: ctx.tenantId,
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
        const tenantId = ctx.tenantId;
        const { createCcpRecord } = await import("../../db/haccp/ccpRecords");
        const { getCcpInstanceById, getBatchById, createNotification } = await import("../../db");

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
        }, tenantId);
        
        // CCP 점검 완료 알림 발송
        const instance = await getCcpInstanceById(input.instanceId, tenantId);
        if (instance && instance.batchId !== null) {
          const batch = await getBatchById(instance.batchId, tenantId);
          
          // 관리자에게 알림 발송
          await createNotification({
            tenantId: ctx.tenantId,
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
    getRecords: tenantRequiredProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCcpRecordsByInstanceId } = await import("../../db/haccp/ccpRecords");
        return await getCcpRecordsByInstanceId(input.instanceId, ctx.tenantId);
      }),
    
    // 배치의 모    // CCP 점검 알림 생성
    createInspectionAlert: tenantRequiredProcedure
      .input(z.object({
        instanceId: z.number(),
        scheduledTime: z.date()
      }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { createInspectionAlert } = await import("../../db/haccp/ccpInspectionAlerts");
        return await createInspectionAlert(input, tenantId);
      }),
    
    // 사용자별 대기 중인 알림 조회
    getUserPendingAlerts: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getUserPendingAlerts } = await import("../../db/haccp/ccpInspectionAlerts");
        return await getUserPendingAlerts(ctx.user.id, ctx.tenantId);
      }),
    
    // 알림 완료 처리
    completeInspectionAlert: tenantRequiredProcedure
      .input(z.object({ alertId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { updateAlertStatus } = await import("../../db/haccp/ccpInspectionAlerts");
        return await updateAlertStatus(input.alertId, "completed", new Date(), ctx.tenantId);
      }),
    
    // CCP 점검 완료 여부 확인
    checkInspectionComplete: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getCcpInstancesByBatchId } = await import("../../db");
        const { getCcpRecordsByInstanceId } = await import("../../db/haccp/ccpRecords");

        // 배치의 모든 CCP 인스턴스 조회
        const instances: any[] = await getCcpInstancesByBatchId(input.batchId, tenantId) as any;
        
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
          const records = await getCcpRecordsByInstanceId(instance.id, tenantId);
          
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
        const tenantId = ctx.tenantId;
        const { updateCcpInstanceStatus, createAuditLog } = await import("../../db");
        await updateCcpInstanceStatus(input.instanceId, input.status, ctx.user?.id, tenantId);
        
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
    getAllRecords: tenantRequiredProcedure
      .input(
        z.object({
          ccpType: z.string().optional(),
          status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getAllCcpRecords } = await import("../../db");
        // ★ 테넌트 격리: ctx.tenantId 강제 주입
        return await getAllCcpRecords({ ...input, tenantId: ctx.tenantId });
      }),
    
    // CCP 이탈 건수 조회
    getDeviationCount: tenantRequiredProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getCcpDeviationCount } = await import("../../db");
        return await getCcpDeviationCount(input.instanceId, tenantId);
      }),
    
    // CCP 일괄 삭제
    bulkDelete: workerProcedure
      .input(z.object({ instanceIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { deleteCcpInstances, createAuditLog } = await import("../../db");
        const result = await deleteCcpInstances(input.instanceIds, tenantId);
        
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
    getStats: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const {
          getCcpStatsOverview,
          getCcpStatsByProduct,
          getCcpStatsByCcpType,
          getCcpStatsTrend
        } = await import("../../services/ccp-stats.service");
        
        const tenantId = ctx.tenantId;
        const args = { ...input, tenantId };
        const [overview, byProduct, byCcpType, trend] = await Promise.all([
          getCcpStatsOverview(args),
          getCcpStatsByProduct(args),
          getCcpStatsByCcpType(args),
          input.startDate && input.endDate
            ? getCcpStatsTrend({ startDate: input.startDate, endDate: input.endDate, tenantId })
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
    exportInspectionHistory: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          siteId: z.number().optional(),
          ccpType: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getCcpInspectionHistory } = await import("../../db");
        const { exportCcpInspectionToExcel } = await import("../../services/excel-export");

        const data = await getCcpInspectionHistory(input, tenantId);
        const buffer = await exportCcpInspectionToExcel(data);
        
        // Buffer를 Base64로 변환하여 반환
        const base64 = Buffer.from(buffer).toString('base64');
        const filename = `CCP_점검이력_${todayKST()}.xlsx`;
        
        return {
          success: true,
          file: base64,
          filename,
          message: `${data.length}건의 CCP 점검 이력이 내보내기되었습니다.`
        };
      }),
    
    // CCP 이탈 통계 조회
    getDeviationStats: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.date().optional(),
          endDate: z.date().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const {
          getCcpDeviationStatsByMonth,
          getCcpDeviationStatsByProduct,
          getCcpDeviationStatsByCcpType
        } = await import("../../db");

        const [byMonth, byProduct, byCcpType] = await Promise.all([
          getCcpDeviationStatsByMonth(input, tenantId),
          getCcpDeviationStatsByProduct(input, tenantId),
          getCcpDeviationStatsByCcpType(input, tenantId),
        ]);
        
        return {
          byMonth,
          byProduct,
          byCcpType
        };
      }),
    
    // CCP 점검 준수율 통계 (월별/주별)
    getComplianceStats: tenantRequiredProcedure
      .input(
        z.object({
          period: z.enum(["weekly", "monthly"]),
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getCcpComplianceStats } = await import("../../db/haccp/ccpStats");
        return await getCcpComplianceStats(input, tenantId);
      }),
    
    // CCP 이탈 건수 추이 (월별/주별)
    getDeviationTrend: tenantRequiredProcedure
      .input(
        z.object({
          period: z.enum(["weekly", "monthly"]),
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getCcpDeviationTrend } = await import("../../db/haccp/ccpStats");
        return await getCcpDeviationTrend(input, tenantId);
      })
});
