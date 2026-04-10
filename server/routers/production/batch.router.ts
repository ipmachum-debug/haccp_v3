// ═══════════════════════════════════════════════════════════════
// batch.router.ts - 배치(Batch) 생산 관리 tRPC 라우터
// 배치 CRUD, 라이프사이클(시작/완료/되돌리기), CCP 자동생성,
// 승인 워크플로, 원가/수익성, 생산 통계, Hydration 등
// ═══════════════════════════════════════════════════════════════
import { monitorProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lt, or, sql } from "drizzle-orm";
import { getDb, getRawConnection } from "../../db";

import { toKSTDate, todayKST, formatLocalDate} from "../../utils/timezone";

export const batchRouter = router({

// ═══════════════════════════════════════════════════════════════
// 배치 생성 (단건 + 일괄)
// ═══════════════════════════════════════════════════════════════

    /** 배치 생성 - MES + HACCP + ERP 트랜잭션 오케스트레이션 (10단계 파이프라인) */
    create: workerProcedure
      .input(
        z.object({
          siteId: z.number(),
          productId: z.number(),
          batchNumber: z.string(),
          plannedQuantity: z.number(),
          plannedStartDate: z.date(),
          plannedEndDate: z.date().optional(),
          // auto: CCP 자동 생성 후 승인관리 자동 이동
          // 배치 시작시간 (HH:mm)
          batchStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          // manual: CCP 생성 후 사람이 확인, 수동 승인
          mode: z.enum(["auto", "manual"]).default("auto"),
          manualStartTime: z.string().optional(),
          manualEndTime: z.string().optional(),
          // SKU 실제 생산수량 (배치 생성 시 함께 저장 가능)
          skuOutputs: z.array(z.object({
            skuId: z.number(),
            plannedQty: z.number(),
            actualQty: z.number().optional(),
            defectiveQty: z.number().default(0),
            notes: z.string().optional(),
          })).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createBatch, createAuditLog, getProductById, getDb } = await import("../../db");
        const { autoCreateCcpInstancesForBatch } = await import("../../services/ccp-batch");
        const { resolveToHProductId } = await import("../../services/batchOrchestrator");

        const tenantId = ctx.tenantId!;
        const workDate = formatLocalDate(input.plannedStartDate);

        // STEP 0. 제품 ID 변환 (h_products_v2.id → h_products.id)
        const resolvedProductId = await resolveToHProductId(input.productId, tenantId);

        // STEP 1. 배치 헤더 생성
        const batchId = await createBatch({
          tenantId,
          siteId: input.siteId,
          productId: resolvedProductId,
          batchCode: input.batchNumber,
          plannedQuantity: input.plannedQuantity.toString(),
          plannedDate: input.plannedStartDate,
          createdBy: ctx.user.id,
          mode: input.mode,
          batchStartTime: input.batchStartTime,
        });

        // STEP 2. 제품 정보 조회
        const product = await getProductById(resolvedProductId, tenantId);
        const productName = product?.productName || "";

        // STEP 3. BOM -> 공정그룹 -> CCP 인스턴스 + 기본 행 자동 생성
        let ccpCreated = false;
        let ccpCount = 0;
        let ccpGroups: any[] = [];
        try {
          const result = await autoCreateCcpInstancesForBatch({
            siteId: input.siteId,
            workDate,
            batchId,
            productId: resolvedProductId,
            productName,
            createdBy: ctx.user.id,
            tenantId,
            plannedQuantity: input.plannedQuantity,
          });
          ccpCreated = result.instanceIds.length > 0;
          ccpCount = result.instanceIds.length;
          ccpGroups = result.groups || [];
        } catch (err) {
          console.error("[파이프라인] CCP 자동 생성 실패 (배치 생성 유지):", err);
        }

        // STEP 3-B + STEP 4: 제품명 확보 → CCP 기록지 자동생성 → 승인요청 등록
        // ※ getRawConnection()은 Pool 싱글턴 → .end() 절대 호출 금지, Pool을 그대로 사용
        let approvalRequestId: number | null = null;
        // 제품명 보완: h_products_v2 조회 (STEP 3-B, 4 공통 사용)
        let finalProductName = productName;
        try {
          if (!finalProductName && resolvedProductId) {
            const { getRawConnection: _rcProd } = await import("../../db");
            const _poolProd = await _rcProd();
            const [_pRows] = await _poolProd.execute(
              `SELECT p.product_name
               FROM h_products_v2 p
               WHERE p.id = ? AND p.tenant_id = ?`,
              [resolvedProductId, tenantId]
            );
            finalProductName = (_pRows as any[])[0]?.product_name || "";
          }
        } catch (_pe) { /* ignore */ }

        // STEP 3-B. CCP 기록지(h_ccp_form_records) 자동 생성
        // ★ FIX: bom_batch_kg와 batch_count를 초기 생성 시 계산하여 포함
        //    이전에는 이 값이 누락되어 batch_count=1로 기본 생성 → 나중에 getOrCreate 호출 시 재계산 → 지연 발생
        if (ccpCreated && ccpGroups.length > 0) {
          try {
            const { getRawConnection: _rc3 } = await import("../../db");
            const _pool3 = await _rc3(); // Pool 싱글턴 (end() 호출 금지)

            // BOM에서 batch_target_kg (1배치 기준 중량) 조회
            let bomBatchKg: number | null = null;
            try {
              const [bomRows] = await _pool3.execute(
                `SELECT v.batch_target_kg
                 FROM h_mf_reports r
                 JOIN h_mf_report_versions v ON v.mf_report_id = r.id AND v.approval_status = 'APPROVED'
                 WHERE r.product_id = ? AND r.tenant_id = ?
                 ORDER BY v.id DESC LIMIT 1`,
                [resolvedProductId, tenantId]
              );
              if ((bomRows as any[]).length > 0 && (bomRows as any[])[0]?.batch_target_kg) {
                bomBatchKg = parseFloat((bomRows as any[])[0].batch_target_kg);
              }
              // h_recipes 폴백 제거 — BOM(h_mf_report_versions) APPROVED만 사용
            } catch (bomErr) {
              console.error('[파이프라인] BOM batch_target_kg 조회 실패:', bomErr);
            }

            // batch_count 계산: 총생산량 / BOM 1배치 기준 중량
            let batchCount = 1;
            if (bomBatchKg && bomBatchKg > 0 && input.plannedQuantity > 0) {
              batchCount = Math.ceil(input.plannedQuantity / bomBatchKg);
              if (batchCount < 1) batchCount = 1;
            }
            for (const grp of ccpGroups) {
              // CCP-4P는 날짜별 1건 통합 → batch_id가 아닌 work_date로 중복 체크
              const existQuery = grp.ccp_type === 'CCP-4P'
                ? 'SELECT id FROM h_ccp_form_records WHERE ccp_type=? AND work_date=? AND tenant_id=? LIMIT 1'
                : 'SELECT id FROM h_ccp_form_records WHERE batch_id=? AND ccp_type=? AND tenant_id=? LIMIT 1';
              const existParams = grp.ccp_type === 'CCP-4P'
                ? [grp.ccp_type, workDate, tenantId]
                : [batchId, grp.ccp_type, tenantId];
              const [existFR] = await _pool3.execute(existQuery, existParams);
              if ((existFR as any[]).length > 0) continue;
              const clHeatTimeMinLo = grp.time_min ?? null;
              const clHeatTimeMinHi = grp.time_max ?? null;
              const clHeatTempLo    = grp.temperature_min ?? null;
              const clPressureMpaLo = grp.pressure_min ?? null;
              // 공정그룹에서 배치 운영 설정 가져오기 (Single Source of Truth)
              const equipGroupMode   = grp.equip_group_mode ?? 'sequential';
              const equipIntervalMin = grp.equip_interval_min ?? 10;
              // CCP-4P: 일일 통합 기록지 (product_id=NULL, product_name='금속검출 통합')
              const frProductId = grp.ccp_type === 'CCP-4P' ? null : resolvedProductId;
              const frProductName = grp.ccp_type === 'CCP-4P' ? '금속검출 통합' : (finalProductName || productName || null);
              await _pool3.execute(
                `INSERT INTO h_ccp_form_records
                   (tenant_id, site_id, batch_id, ccp_type, work_date,
                    product_id, product_name, process_group_id, process_group_name,
                    planned_qty_kg, writer_id, status,
                    cl_heat_time_min_lo, cl_heat_time_min_hi, cl_heat_temp_lo, cl_pressure_mpa_lo,
                    equip_group_mode, equip_interval_min,
                    bom_batch_kg, batch_count)
                 VALUES (?,?,?,?,?, ?,?,?,?, ?,?,'draft', ?,?,?,?, ?,?, ?,?)`,
                [
                  tenantId, input.siteId || ctx.user.siteId || ctx.tenantId, batchId, grp.ccp_type, workDate,
                  frProductId, frProductName, grp.id, grp.name,
                  input.plannedQuantity, ctx.user.id,
                  clHeatTimeMinLo, clHeatTimeMinHi, clHeatTempLo, clPressureMpaLo,
                  equipGroupMode, equipIntervalMin,
                  bomBatchKg, batchCount,
                ]
              );
            }
          } catch (frErr) {
            console.error('[파이프라인] CCP 기록지 자동 생성 실패 (계속):', frErr);
          }
        }

        // STEP 3-C. h_ccp_rows → h_ccp_form_rows 동기화 (설비 기준값 → 인쇄용 기록지 행)
        if (ccpCreated) {
          try {
            const { syncCcpRowsToFormRows } = await import("../../db/ccpFormRecords");
            const syncResult = await syncCcpRowsToFormRows({ batchId, tenantId });
          } catch (syncErr) {
            console.error("[파이프라인] CCP form rows 동기화 실패 (계속):", syncErr);
          }
        }


        // STEP 4. 승인 요청 큐 자동 등록 (pending_review)
        if (ccpCreated) {
          try {
            const { getRawConnection: _rc4 } = await import("../../db");
            const _pool4 = await _rc4(); // Pool 싱글턴
            const ccpGroupNames = ccpGroups.map((g: any) => `${g.name}(${g.ccp_type})`).join(", ");
            const modeLabel = input.mode === "auto" ? "[자동]" : "[수동]";
            const [insResult] = await _pool4.execute(
              `INSERT INTO h_approval_requests
                 (site_id, tenant_id, request_type, reference_type, reference_id,
                  title, description, status, priority, requested_by)
               VALUES (?, ?, 'batch_production', 'batch', ?, ?, ?, 'pending_review', 'high', ?)`,
              [
                (input.siteId || ctx.user.siteId || ctx.tenantId),
                tenantId,
                batchId,
                `${modeLabel} 배치 CCP 승인 - ${input.batchNumber} (${finalProductName || ""})`,
                `제품: ${finalProductName || ""}\n계획일: ${workDate}\nCCP ${ccpCount}건 자동 생성 완료\n배치코드: ${input.batchNumber}\nCCP 공정: ${ccpGroupNames}\n처리방식: ${input.mode === "auto" ? "자동(승인관리 자동이동)" : "수동(배치상세 확인 후 이동)"}`,
                ctx.user.id,
              ]
            );
            approvalRequestId = Number((insResult as any).insertId ?? 0);
          } catch (appErr) {
            console.error("[파이프라인] 승인 요청 생성 실패 (배치 생성 유지):", appErr);
          }
        }

        // STEP 4-B. CCP-4P 금속검출 통합 승인요청 자동 생성
        if (ccpCreated && ccpGroups.some((g: any) => g.ccp_type === "CCP-4P")) {
          try {
            const { getRawConnection: _rc4p } = await import("../../db");
            const _pool4p = await _rc4p();
            const [ccp4pRecs] = await _pool4p.execute<any[]>(
              `SELECT id, status, approval_request_id
               FROM h_ccp_form_records
               WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ?
               ORDER BY id ASC LIMIT 1`,
              [tenantId, workDate],
            );
            if ((ccp4pRecs as any[]).length > 0) {
              const ccp4pRec = (ccp4pRecs as any[])[0];
              if (!ccp4pRec.approval_request_id) {
                await _pool4p.execute(
                  `UPDATE h_ccp_form_records SET status='submitted', submitted_at=NOW(), writer_id=? WHERE id=? AND tenant_id=?`,
                  [ctx.user.id, ccp4pRec.id, tenantId],
                );
                const title4p = `[CCP-CCP-4P] ${workDate} 금속검출 통합`;
                const desc4p = `금속검출공정 CCP 기록지 (일일 통합)\n작업일: ${workDate}\n제품: ${finalProductName || ""}\n배치코드: ${input.batchNumber}`;
                const [ar4p] = await _pool4p.execute(
                  `INSERT INTO h_approval_requests
                    (site_id, tenant_id, request_type, reference_type, reference_id,
                     title, description, status, priority, requested_by, created_at)
                   VALUES (?, ?, 'ccp_form', 'ccp_form_record', ?, ?, ?, 'pending_review', 'high', ?, NOW())`,
                  [input.siteId || ctx.user.siteId || ctx.tenantId, tenantId, ccp4pRec.id, title4p, desc4p, ctx.user.id],
                );
                const approvalId4p = (ar4p as any).insertId;
                await _pool4p.execute(
                  `UPDATE h_ccp_form_records SET approval_request_id=? WHERE id=? AND tenant_id=?`,
                  [approvalId4p, ccp4pRec.id, tenantId],
                );
                console.log(`[파이프라인] CCP-4P 금속검출 통합 승인요청 생성: approvalId=${approvalId4p}`);
              }
            }
          } catch (ccp4pErr) {
            console.error("[파이프라인] CCP-4P 승인요청 생성 실패:", ccp4pErr);
          }
        }

        // STEP 5. 일정 자동 생성
        let scheduleCreated = false;
        try {
          const { createBatchSchedule } = await import("../../db/batchSchedules");
          await createBatchSchedule({
            tenantId,
            batchId,
            scheduledDate: input.plannedStartDate,
            status: "scheduled",
            notes: `${input.mode === "auto" ? "[자동]" : "[수동]"} 배치: ${input.batchNumber}`,
          });
          scheduleCreated = true;
        } catch (err) {
          console.error("[파이프라인] 일정 생성 실패:", err);
        }

        // STEP 6. SKU 생산 실적 저장 (선택 입력)
        if (input.skuOutputs && input.skuOutputs.length > 0) {
          try {
            const db = await getDb();
            if (!db) throw new Error("DB unavailable");
            const { productionSkuOutput, productSkus: pSkus } = await import(
              "../../../drizzle/schema/schema_dual_unit.js"
            );
            const { eq: eqOp } = await import("drizzle-orm");

            for (const skuOut of input.skuOutputs) {
              const qty = skuOut.actualQty ?? skuOut.plannedQty;
              if (!qty || qty <= 0) continue;
              const [skuRow] = await db.select().from(pSkus).where(eqOp(pSkus.id, skuOut.skuId));
              const kgPerUnit = skuRow ? Number((skuRow as any).kgPerSalesUnit ?? 1) : 1;
              const totalKg = (qty * kgPerUnit).toFixed(3);
              await db.insert(productionSkuOutput).values({
                tenantId,
                batchId,
                skuId: skuOut.skuId,
                quantity: qty,
                defectiveQty: skuOut.defectiveQty ?? 0,
                totalKg,
                notes: skuOut.notes ?? null,
              } as any);
            }
          } catch (skuErr) {
            console.error("[파이프라인] SKU 저장 실패 (배치 생성 유지):", skuErr);
          }
        }

        // STEP 7. 감사 로그
        await createAuditLog({
          action: "batch.create",
          entityType: "batch",
          entityId: batchId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 생성: ${input.batchNumber} (${input.mode === "auto" ? "자동" : "수동"}모드)` +
            (ccpCreated ? ` CCP ${ccpCount}건` : "") +
            (approvalRequestId ? ` 승인요청 자동등록` : ""),
          changes: { created: { batchId, mode: input.mode, productId: input.productId } },
        });

        // STEP 8. 일일일지 자동 생성 (배치 생성 시 당일 최초 1회만)
        // 설계: 배치 완료가 아닌 배치 생성(planned) 시점에 생성 → 승인관리에서 즉시 확인 가능
        // 당일 동일 site_id+tenant_id 조합의 일일일지가 이미 있으면 배치 목록만 업데이트
        let dailyLogResult: any = null;
        try {
          const { autoGenerateDailyReport } = await import('../../lib/autoDailyReport');
          dailyLogResult = await autoGenerateDailyReport(batchId, ctx.user.id);
        } catch (dlErr: any) {
          console.error('[파이프라인 STEP8] 일일일지 생성 실패 (배치 생성 유지):', dlErr?.message || dlErr);
        }

        // STEP 8.5. 주간/월간/연간 일지 자동 생성 (auto 모드만)
        let periodicLogsResult: any = null;
        try {
          const { autoGenerateAllPeriodicLogs } = await import('../../lib/autoPeriodicLogs');
          periodicLogsResult = await autoGenerateAllPeriodicLogs(
            input.mode,
            ctx.tenantId!,
            input.siteId,
            workDate,
            ctx.user.id,
            { batchId, productName: product?.productName || "", plannedQty: input.plannedQuantity },
          );
          if (periodicLogsResult) {
            const newLogs = [periodicLogsResult.weekly, periodicLogsResult.monthly, periodicLogsResult.yearly]
              .filter((r: any) => r?.isNew);
          }
        } catch (plErr) {
          console.error('[파이프라인 STEP8.5] 기간별 일지 생성 실패:', plErr);
        }

        // STEP 9. 생산일지(production_daily) 자동 생성/갱신
        try {
          const { autoRegenerateProductionDaily } = await import('../../lib/autoProductionDaily');
          await autoRegenerateProductionDaily(tenantId, workDate);
        } catch (pdErr) {
          console.error('[파이프라인 STEP9] 생산일지 갱신 실패:', pdErr);
        }

        // STEP 10. 체크리스트 자동 생성 (frequency=batch_create 템플릿)
        let checklistResult: any = null;
        try {
          const { autoCreateChecklistsForBatch } = await import('../../lib/autoChecklistFromBatch');
          checklistResult = await autoCreateChecklistsForBatch(tenantId, batchId, ctx.user.id, workDate);
        } catch (clErr: any) {
          console.error('[파이프라인 STEP10] 체크리스트 자동생성 실패 (배치 생성 유지):', clErr?.message || clErr);
        }

        return {
          success: true,
          batchId,
          ccpCreated,
          ccpCount,
          scheduleCreated,
          approvalRequestId,
          dailyLogResult,
          periodicLogsResult,
          checklistResult,
          mode: input.mode,
          autoNavigateToApproval: input.mode === "auto" && ccpCreated,
          message: ccpCreated
            ? `배치 및 CCP ${ccpCount}건이 생성되었습니다.` +
              (input.mode === "auto" ? " 승인관리에서 확인하세요." : " CCP 기록지를 확인 후 승인하세요.")
            : `배치가 생성되었습니다. BOM -> 공정그룹 매핑을 확인해주세요.`,
        };
      }),

    /** 하루 복수 품목 일괄 배치 생성 (DAY-YYYYMMDD 그룹코드, 금속탐지 배정, 공정 스케줄 포함) */
    bulkCreateForDay: workerProcedure
      .input((() => {
        const zSkuOut = z.object({
          skuId: z.number(),
          plannedQty: z.number().nonnegative().default(0),
          actualQty: z.number().nonnegative().optional(),
          defectiveQty: z.number().nonnegative().optional(),
          note: z.string().optional(),
        });
        const zItem = z.object({
          productId: z.number(),
          plannedQuantityKg: z.number().positive(),
          skuOutputs: z.array(zSkuOut).optional(),
          startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          mode: z.enum(["auto", "manual"]).optional(),
          batchCode: z.string().optional(),
        });
        return z.object({
          siteId: z.number(),
          workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          dayStartTime: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
          defaultMode: z.enum(["auto", "manual"]).default("auto"),
          metalDetectorEquipmentId: z.number().optional(),
          scheduling: z.object({
            applyProcessSchedule: z.boolean().default(true),
            metalAllocation: z.enum(["EQUAL", "PROPORTIONAL"]).default("PROPORTIONAL"),
            passOrder: z.enum(["INPUT_ORDER", "PLANNED_QTY_DESC", "CUSTOM"]).default("INPUT_ORDER"),
            customSkuOrder: z.array(z.number()).optional(),
          }).default({ applyProcessSchedule: true, metalAllocation: "PROPORTIONAL", passOrder: "INPUT_ORDER" }),
          items: z.array(zItem).min(1).max(50),
          memo: z.string().optional(),
        });
      })())
      .mutation(async ({ input, ctx }) => {
        const { createSingleBatch } = await import("../../services/batchOrchestrator");
        const { allocateMetalPassLogsForDay } = await import("../../services/metalPassAllocator");
        const { createProcessScheduleForDay } = await import("../../services/processScheduler");

        // === 1. 일일 배치 그룹 코드 생성 (DAY-YYYYMMDD-XXX) ===
        const { getRawConnection } = await import("../../db");
        const conn = await getRawConnection();
        const dateStr = input.workDate.replace(/-/g, "");
        const [grpCntRows] = await conn.execute<any[]>(
          "SELECT COUNT(DISTINCT day_batch_group) as cnt FROM h_batches WHERE tenant_id=? AND day_batch_group LIKE ?",
          [ctx.tenantId!, `DAY-${dateStr}-%`],
        );
        const grpSeq = ((grpCntRows as any[])[0]?.cnt || 0) + 1;
        const dayBatchGroup = `DAY-${dateStr}-${String(grpSeq).padStart(3, "0")}`;

        const results: any[] = [];

        // === 2. 품목별 배치 순차 생성 (그룹코드 공유, 승인/일지는 그룹 레벨에서) ===
        for (let idx = 0; idx < input.items.length; idx++) {
          const item = input.items[idx];
          try {
            const mode = item.mode ?? input.defaultMode;
            const result = await createSingleBatch({
              tenantId: ctx.tenantId!,
              siteId: input.siteId,
              workDate: input.workDate,
              startTime: item.startTime ?? input.dayStartTime,
              productId: item.productId,
              plannedQuantityKg: item.plannedQuantityKg,
              batchCode: item.batchCode,
              dayBatchGroup,
              batchOrder: idx + 1,
              skuOutputs: item.skuOutputs?.map(s => ({
                skuId: s.skuId,
                plannedQty: s.plannedQty,
                actualQty: s.actualQty,
                defectiveQty: s.defectiveQty,
                note: s.note,
              })),
              mode,
              userId: ctx.user.id,
              userEmail: ctx.user.email,
              userRole: ctx.user.role,
              skipGroupActions: true,
            });
            results.push(result);
          } catch (err: any) {
            console.error(`[bulkCreateForDay] 품목 ${item.productId} 실패:`, err);
            results.push({
              batchId: 0, batchCode: "", productId: item.productId, productName: "",
              ccpCreated: false, ccpCount: 0, ccpGroups: [], approvalRequestId: null,
              scheduleCreated: false, dailyReportCreated: false,
              error: err.message || "생성 실패",
            });
          }
        }

        const successResults = results.filter((r: any) => r.batchId > 0);

        // === 3. 그룹 레벨 일일일지 생성 (전체 배치 묶음) ===
        let groupApprovalRequestId: number | null = null;
        let groupDailyReportCreated = false;
        if (successResults.length > 0) {
          try {
            const { autoGenerateDailyReport } = await import("../../lib/autoDailyReport");
            for (const r of successResults) {
              const dailyResult = await autoGenerateDailyReport(r.batchId, ctx.user.id);
              if (dailyResult.success) groupDailyReportCreated = true;
            }
          } catch (dailyErr) {
            console.error("[bulkCreateForDay] 그룹 일일일지 생성 실패:", dailyErr);
          }

          // 3.5. 주간/월간/연간 일지 자동 생성 (bulk auto 모드)
          try {
            const { autoGenerateAllPeriodicLogs } = await import("../../lib/autoPeriodicLogs");
            const firstBatch = successResults[0];
            const periodicResult = await autoGenerateAllPeriodicLogs(
              input.defaultMode,
              ctx.tenantId!,
              input.siteId,
              input.workDate,
              ctx.user.id,
              { batchId: firstBatch.batchId, productName: firstBatch.productName, plannedQty: input.items[0]?.plannedQuantityKg || 0 },
            );
            if (periodicResult) {
              const newLogs = [periodicResult.weekly, periodicResult.monthly, periodicResult.yearly]
                .filter((r: any) => r?.isNew);
            }
          } catch (periodicErr) {
            console.error("[bulkCreateForDay] 기간별 일지 생성 실패:", periodicErr);
          }

          // 승인 요청: 그룹 단위로 1건만 생성
          try {
            const productNames = successResults.map((r: any) => r.productName).join(", ");
            const totalCcpCount = successResults.reduce((s: number, r: any) => s + (r.ccpCount || 0), 0);
            const totalQty = successResults.reduce((s: number, r: any) => {
              const item = input.items.find((i: any) => i.productId === r.productId);
              return s + (item?.plannedQuantityKg || 0);
            }, 0);

            const { getDb } = await import("../../db");
            const db = await getDb();
            const approvalTitle = `[일일배치] ${input.workDate} ${successResults.length}품목 (${dayBatchGroup})`;
            const approvalDesc =
              `일일 배치 그룹: ${dayBatchGroup}\n` +
              `작업일: ${input.workDate}\n` +
              `품목 수: ${successResults.length}건\n` +
              `제품: ${productNames}\n` +
              `총 계획수량: ${totalQty.toFixed(1)}kg\n` +
              `CCP: ${totalCcpCount}건\n` +
              `배치: ${successResults.map((r: any) => r.batchCode).join(", ")}\n` +
              `[배치 계획 등록 - 검토 필요]`;

            const approvalInsert = await db.execute(sql`
              INSERT INTO h_approval_requests
                (site_id, tenant_id, request_type, reference_type, reference_id,
                 title, description, status, priority, requested_by, created_at)
              VALUES
                (${input.siteId}, ${ctx.tenantId}, 'batch_plan', 'batch_group', ${successResults[0].batchId},
                 ${approvalTitle}, ${approvalDesc}, 'pending_review', 'medium', ${ctx.user.id}, NOW())
            `);
            groupApprovalRequestId = Number((approvalInsert as any)[0]?.insertId || 0);
          } catch (approvalErr) {
            console.error("[bulkCreateForDay] 그룹 승인요청 생성 실패:", approvalErr);
          }

          // 3.7 개별 배치별 batch_production 승인요청 생성 (CCP 기록지 인쇄용)
          try {
            const db2 = await (await import("../../db")).getDb();
            for (const r of successResults) {
              if (r.ccpCreated && r.ccpCount > 0) {
                const ccpGroupNames = (r.ccpGroups || []).map((g: any) => `${g.name || g.ccp_type}(${g.ccp_type})`).join(", ");
                const item = input.items.find((i: any) => i.productId === r.productId);
                const modeLabel = (item as any)?.mode === "manual" ? "[수동]" : "[자동]";
                const indivTitle = `${modeLabel} 배치 CCP 승인 - ${r.batchCode} (${r.productName || ""})`;
                const indivDesc = `제품: ${r.productName || ""}\n계획일: ${input.workDate}\nCCP ${r.ccpCount}건 자동 생성 완료\n배치코드: ${r.batchCode}\nCCP 공정: ${ccpGroupNames}\n그룹: ${dayBatchGroup}`;
                await db2.execute(sql`
                  INSERT INTO h_approval_requests
                    (site_id, tenant_id, request_type, reference_type, reference_id,
                     title, description, status, priority, requested_by, created_at)
                  VALUES
                    (${input.siteId}, ${ctx.tenantId}, 'batch_production', 'batch', ${r.batchId},
                     ${indivTitle}, ${indivDesc},
                     'pending_review', 'high', ${ctx.user.id}, NOW())
                `);
              }
            }
          } catch (indivApprovalErr) {
            console.error("[bulkCreateForDay] 개별 batch_production 승인요청 생성 실패:", indivApprovalErr);
          }
        }

        // === 3.8 CCP-4P 금속검출 일일 통합 기록지 자동 승인요청 ===
        // CCP-4P는 날짜별 1건의 통합 기록지 → 모든 배치 생성 완료 후 승인요청 생성
        if (successResults.length > 0) {
          try {
            const conn4p = await getRawConnection();
            // 당일 CCP-4P form record 조회
            const [ccp4pRecs] = await conn4p.execute<any[]>(
              `SELECT id, batch_id, status, approval_request_id
               FROM h_ccp_form_records
               WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ?
               ORDER BY id ASC LIMIT 1`,
              [ctx.tenantId, input.workDate],
            );
            if ((ccp4pRecs as any[]).length > 0) {
              const ccp4pRec = (ccp4pRecs as any[])[0];
              // 승인요청이 아직 없는 경우에만 생성
              if (!ccp4pRec.approval_request_id) {
                // 상태를 submitted으로 변경
                await conn4p.execute(
                  `UPDATE h_ccp_form_records SET status='submitted', submitted_at=NOW(), writer_id=? WHERE id=? AND tenant_id=?`,
                  [ctx.user.id, ccp4pRec.id, ctx.tenantId],
                );
                // 승인요청 생성
                const productNames = successResults.map((r: any) => r.productName).filter(Boolean).join(", ");
                const title4p = `[CCP-CCP-4P] ${input.workDate} 금속검출 통합`;
                const desc4p = `금속검출공정 CCP 기록지 (일일 통합)\n작업일: ${input.workDate}\n제품: ${productNames}\n배치 수: ${successResults.length}건\n그룹: ${dayBatchGroup}`;
                const [approvalResult4p] = await conn4p.execute(
                  `INSERT INTO h_approval_requests
                    (site_id, tenant_id, request_type, reference_type, reference_id,
                     title, description, status, priority, requested_by, created_at)
                   VALUES (?, ?, 'ccp_form', 'ccp_form_record', ?, ?, ?, 'pending_review', 'high', ?, NOW())`,
                  [input.siteId, ctx.tenantId, ccp4pRec.id, title4p, desc4p, ctx.user.id],
                );
                const approvalId4p = (approvalResult4p as any).insertId;
                await conn4p.execute(
                  `UPDATE h_ccp_form_records SET approval_request_id=? WHERE id=? AND tenant_id=?`,
                  [approvalId4p, ccp4pRec.id, ctx.tenantId],
                );
                console.log(`[bulkCreateForDay] CCP-4P 금속검출 통합 승인요청 생성: approvalId=${approvalId4p}, formRecordId=${ccp4pRec.id}`);
              }
            }
          } catch (ccp4pErr) {
            console.error("[bulkCreateForDay] CCP-4P 승인요청 생성 실패:", ccp4pErr);
          }
        }

        // === 4. 금속탐지 배정 ===
        let metalPassResult = null;
        if (successResults.length > 0) {
          try {
            metalPassResult = await allocateMetalPassLogsForDay({
              tenantId: ctx.tenantId!, siteId: input.siteId,
              workDate: input.workDate, dayStartTime: input.dayStartTime,
              metalDetectorEquipmentId: input.metalDetectorEquipmentId,
              batches: successResults.map((r: any) => ({
                batchId: r.batchId, productId: r.productId,
                productName: r.productName, skuOutputs: [],
              })),
              policy: {
                metalAllocation: input.scheduling.metalAllocation,
                passOrder: input.scheduling.passOrder,
                customSkuOrder: input.scheduling.customSkuOrder,
              },
            });
          } catch (metalErr) {
            console.error("[bulkCreateForDay] 금속탐지 배정 실패:", metalErr);
          }
        }

        // === 5. 공정 스케줄 생성 ===
        let scheduleResult = null;
        if (input.scheduling.applyProcessSchedule && successResults.length > 0) {
          try {
            scheduleResult = await createProcessScheduleForDay({
              tenantId: ctx.tenantId!, siteId: input.siteId,
              workDate: input.workDate, dayStartTime: input.dayStartTime,
              batches: successResults.map((r: any) => ({
                batchId: r.batchId, productId: r.productId,
                productName: r.productName, ccpGroups: r.ccpGroups,
              })),
            });
          } catch (schedErr) {
            console.error("[bulkCreateForDay] 공정 스케줄 생성 실패:", schedErr);
          }
        }

        // === 6. 생산일지(production_daily) 자동 생성/갱신 ===
        try {
          const { autoRegenerateProductionDaily } = await import('../../lib/autoProductionDaily');
          await autoRegenerateProductionDaily(ctx.tenantId!, input.workDate);
        } catch (pdErr) {
          console.error('[bulkCreateForDay] 생산일지(production_daily) 자동 갱신 실패:', pdErr);
        }

        const failedResults = results.filter((r: any) => r.batchId === 0);
        if (failedResults.length > 0) {
          console.error(`[bulkCreateForDay] ${failedResults.length}건 실패:`,
            failedResults.map((r: any) => `productId=${r.productId}: ${r.error}`).join("; "));
        }

        return {
          success: successResults.length > 0,
          dayBatchGroup,
          createdCount: successResults.length,
          totalRequested: input.items.length,
          batchIds: successResults.map((r: any) => r.batchId),
          batches: results,
          errors: failedResults.map((r: any) => ({ productId: r.productId, error: r.error })),
          metalPass: metalPassResult,
          schedule: scheduleResult,
          groupApprovalRequestId,
          groupDailyReportCreated,
        };
      }),

// ═══════════════════════════════════════════════════════════════
// 배치 CRUD (조회, 수정, 삭제)
// ═══════════════════════════════════════════════════════════════

    /** 배치 목록 조회 (tenantId 필터, 페이지네이션) */
    list: tenantRequiredProcedure
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
        const { getAllBatches } = await import("../../db");
        const batches = await getAllBatches({ ...input, tenantId: ctx.tenantId! });
        
        return batches;
      }),

    /** 배치 상세 조회 (최신 PDF URL 포함) */
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchById } = await import("../../db");
        const { getLatestSuccessPdfUrl } = await import("../../db/batchPdfLogs");
        
        const batch = await getBatchById(input.id, ctx.tenantId!);
        
        if (!batch) {
          throw new Error("배치를 찾을 수 없습니다.");
        }
        
        // 최신 PDF URL 조회
        const latestPdfUrl = await getLatestSuccessPdfUrl(input.id);
        
        return {
          ...batch,
          latestPdfUrl
        };
      }),

    /** 배치 일정 변경 (드래그 앤 드롭) */
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
        const tenantId = ctx.tenantId;
        const { updateBatchSchedule, createAuditLog } = await import("../../db");
        await updateBatchSchedule(input.id, {
          plannedDate: input.plannedDate,
          startTime: input.startTime,
          endTime: input.endTime
        }, tenantId ?? undefined);
        
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

    /** 배치 수정 (완료된 배치 수정 불가) */
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
        const { getBatchById, updateBatch, createAuditLog } = await import("../../db");
        
        // 락 체크: 완료된 배치 수정 금지
        const batch = await getBatchById(input.id, ctx.tenantId!);
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
    
    /** 배치 상태 변경 (in_progress 시 원료 자동 출고 트리거) */
    updateStatus: workerProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.string()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getBatchById, updateBatchStatus } = await import("../../db");
        
        // 락 체크: 완료된 배치 수정 금지
        const batch = await getBatchById(input.id, ctx.tenantId!);
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
        
        await updateBatchStatus(input.id, input.status, ctx.tenantId ?? undefined);

        // === 파이프라인 자동화: 배치 시작 시 원료 자동 출고 ===
        let autoIssueResult = null;
        if (input.status === 'in_progress') {
          try {
            const { autoIssueMaterialsForBatch } = await import('../../lib/autoMaterialIssue');
            autoIssueResult = await autoIssueMaterialsForBatch(input.id, batch.createdBy || ctx.user.id) as any;
            if (!autoIssueResult?.success) {
              console.warn('[파이프라인] 원료 자동 출고 일부 실패:', autoIssueResult?.errors);
            }
          } catch (autoIssueError) {
            console.error('[파이프라인] 원료 자동 출고 오류:', autoIssueError);
          }
        }
        // === 파이프라인 자동화 끝 ===
        
        // === 생산일지 자동 갱신 (배치 상태 변경 시) ===
        try {
          const { autoRegenerateProductionDaily } = await import('../../lib/autoProductionDaily');
          const batchDateStr = batch.plannedDate
            ? toKSTDate(new Date(batch.plannedDate))
            : todayKST();
          await autoRegenerateProductionDaily(ctx.tenantId!, batchDateStr);
        } catch (pdErr) {
          console.error('[파이프라인] 생산일지 자동 갱신 오류:', pdErr);
        }
        
        return {
          success: true,
          message: "배치 상태가 변경되었습니다.",
          autoIssueResult
        };
      }),
    
    /** 배치 삭제 (완료된 배치 삭제 불가, 일일일지에서 배치 제거) */
    delete: workerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getBatchById, deleteBatch } = await import("../../db");
        
        // 락 체크: 완료된 배치 삭제 금지
        const batch = await getBatchById(input.id, ctx.tenantId!);
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
        
        await deleteBatch(input.id, ctx.tenantId!);

        // 일일일지 form_data에서 삭제된 배치 제거
        // 배치가 당일 최초였다면: 일일일지 자체를 draft 상태로 유지 (다음 배치가 추가될 수 있음)
        // 배치가 완료(completed) 상태가 아닐 때만 삭제 가능하므로, 일일일지에서 해당 배치 제거
        try {
          const db = await (await import("../../db")).getDb();
          if (db) {
            const { sql: rawSql } = await import("drizzle-orm");
            // 배치의 plannedDate 기준으로 일일일지 조회 (오늘 날짜가 아닌 작업 날짜)
            const batchDate = batch.plannedDate
              ? toKSTDate(new Date(batch.plannedDate as any))
              : todayKST();
            const existingChecklist = await db.execute(rawSql`
              SELECT id, form_data FROM h_generic_checklist_records
              WHERE form_type = 'daily_log'
                AND form_date = ${batchDate}
                AND site_id = ${Number(batch.siteId) || ctx.tenantId}
                AND tenant_id = ${ctx.tenantId}
              LIMIT 1
            `);
            const clRows = (existingChecklist as any)[0] || [];
            if (clRows.length > 0) {
              const cl = clRows[0];
              let formData: any = {};
              try { formData = typeof cl.form_data === 'string' ? JSON.parse(cl.form_data) : (cl.form_data || {}); } catch {}
              if (Array.isArray(formData.batches)) {
                formData.batches = formData.batches.filter((b: any) => b.batchId !== input.id);
                formData.totalBatches = formData.batches.length;
                formData.totalProduction = formData.batches.reduce((s: number, b: any) => s + (b.actualQuantity || 0), 0);
                await db.execute(rawSql`
                  UPDATE h_generic_checklist_records
                  SET form_data = ${JSON.stringify(formData)}, updated_at = NOW()
                  WHERE id = ${Number(cl.id)}
                `);
                // 배치가 모두 삭제된 경우 승인요청도 cancelled 처리
                if (formData.batches.length === 0) {
                  await db.execute(rawSql`
                    UPDATE h_approval_requests
                    SET status = 'cancelled', updated_at = NOW()
                    WHERE reference_type = 'checklist'
                      AND reference_id = ${Number(cl.id)}
                      AND request_type = 'daily_log'
                      AND status = 'pending_review'
                  `);
                }
              }
            }
          }
        } catch (dlErr) {
          console.error('[배치삭제] 일일일지 배치 제거 실패 (무시):', dlErr);
        }

        return { success: true, message: "배치가 삭제되었습니다." };
      }),
    
// ═══════════════════════════════════════════════════════════════
// CCP 자동생성 및 HACCP 보고서
// ═══════════════════════════════════════════════════════════════

    /** 배치 번호 자동 생성 */
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
          [ctx.tenantId!, input.batchId, input.batchId, ctx.tenantId!]
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
          tenantId: ctx.tenantId!
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
        const { getBatchDashboardData } = await import("../../db/batchDashboard");
        return await getBatchDashboardData(ctx.tenantId!);
      }),
    
    /** 진행 중인 배치 목록 조회 */
    getInProgress: tenantRequiredProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input, ctx }) => {
        const { getInProgressBatches } = await import("../../db/batchDashboard");
        return await getInProgressBatches(input.limit, ctx.tenantId!);
      }),
    
    /** 완료된 배치 목록 조회 */
    getCompleted: tenantRequiredProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input, ctx }) => {
        const { getCompletedBatches } = await import("../../db/batchDashboard");
        return await getCompletedBatches(input.limit, ctx.tenantId!);
      }),
    
    /** 승인 대기 중인 배치 목록 조회 */
    getPendingApproval: tenantRequiredProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ input, ctx }) => {
        const { getPendingApprovalBatches } = await import("../../db/batchDashboard");
        return await getPendingApprovalBatches(input.limit, ctx.tenantId!);
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
        const batch = await getBatchById(input.batchId, ctx.tenantId!);
        if (!batch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "배치를 찾을 수 없습니다."
          });
        }
        
        // 배치 상태를 under_review로 변경
        await updateBatchStatus(input.batchId, "under_review", ctx.tenantId ?? undefined);

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
            tenantId: ctx.tenantId!,
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
        const { approveBatch } = await import("../../db/batchApprovals");
        const { updateBatchStatus, createAuditLog } = await import("../../db");
        
        await approveBatch({
          batchId: input.batchId,
          approverId: ctx.user.id,
          notes: input.notes
        });
        
        // 배치 상태를 approved로 변경
        await updateBatchStatus(input.batchId, "approved", ctx.tenantId ?? undefined);

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
        const { rejectBatch } = await import("../../db/batchApprovals");
        const { updateBatchStatus, createAuditLog } = await import("../../db");
        
        await rejectBatch({
          batchId: input.batchId,
          approverId: ctx.user.id,
          rejectionReason: input.rejectionReason,
          notes: input.notes
        });
        
        // 배치 상태를 rejected로 변경
        await updateBatchStatus(input.batchId, "rejected", ctx.tenantId ?? undefined);

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
        const { getBatchApprovals } = await import("../../db/batchApprovals");
        return await getBatchApprovals(input.batchId, ctx.tenantId!);
      }),
    
    /** 배치 승인 상태 확인 */
    getApprovalStatus: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchApprovalStatus } = await import("../../db/batchApprovals");
        return await getBatchApprovalStatus(input.batchId, ctx.tenantId!);
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
        return await getProfitabilityByProduct({ ...input, tenantId: ctx.tenantId! });
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
        return await getProfitabilityTrendByMonth(input.startDate, input.endDate, ctx.tenantId!);
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
        return await getProfitabilityTrendByQuarter(input.startDate, input.endDate, ctx.tenantId!);
      }),
    
// ═══════════════════════════════════════════════════════════════
// 수익성 예측 (지수 평활법 + 트렌드)
// ═══════════════════════════════════════════════════════════════

    /** 배치 수익성 예측 (지수 평활법 + 트렌드 기반) */
    getProfitabilityForecast: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getProfitabilityForecast } = await import("../../db");
        return await getProfitabilityForecast(ctx.tenantId!);
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
        return await getProfitabilityForecastHistory(ctx.tenantId!);
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
      return await getActiveBatches(ctx.tenantId ?? undefined);
    }),
    
    /** 배치 완성도 체크 (미작성 문서 추적) */
    checkCompletion: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { checkBatchCompletion } = await import("../../db/batchCompletion");
        return await checkBatchCompletion(input.batchId, ctx.tenantId!);
      }),
    
    /** 배치 완료 전 필수 체크리스트 확인 */
    checkCompletionReadiness: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { checkBatchCompletionReadiness } = await import("../../db");
        return await checkBatchCompletionReadiness(input.batchId, ctx.tenantId ?? undefined);
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
            tenantId: ctx.tenantId ?? undefined
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
              const { addRetryTask } = await import("../../db/batchCompletionRetries");
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
                const { logPdfSuccess } = await import("../../db/batchPdfLogs");
                await logPdfSuccess(input.batchId, pdfUrl);
              } catch (logError) {
                console.error("[배치 완료] PDF 성공 로그 저장 실패:", logError);
              }
            }
          } catch (pdfError) {
            console.error("[배치 완료] PDF 생성 실패:", pdfError);
            
            // PDF 생성 실패 로그 저장
            try {
              const { logPdfFailure } = await import("../../db/batchPdfLogs");
              await logPdfFailure(
                input.batchId,
                pdfError instanceof Error ? pdfError.message : "PDF 생성 실패"
              );
            } catch (logError) {
              console.error("[배치 완료] PDF 실패 로그 저장 실패:", logError);
            }
            
            // 재시도 큐에 추가
            try {
              const { addRetryTask } = await import("../../db/batchCompletionRetries");
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
            const { autoGenerateDailyReport } = await import('../../lib/autoDailyReport');
            dailyReportResult = await autoGenerateDailyReport(input.batchId, ctx.user.id);
          } catch (dailyError: any) {
            console.error('[파이프라인] 일일일지 생성 오류:', dailyError?.message || dailyError);
          }
          
          // 단절 4-1: 법적 선행 체크리스트 자동생성
          let checklistResult = null;
          try {
            const { getBatchById } = await import("../../db");
            const batch = await getBatchById(input.batchId, ctx.tenantId!);
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
            const { autoCreateApprovalRequest } = await import('../../lib/autoApprovalRequest');
            approvalResult = await autoCreateApprovalRequest(input.batchId, ctx.user.id, pdfUrl);
          } catch (approvalError) {
            console.error('[파이프라인] 승인 요청 생성 오류:', approvalError);
          }
          // 단절 4-2: 템플릿 기반 체크리스트 자동생성 (frequency=batch_complete)
          let templateChecklistResult = null;
          try {
            const { autoCreateChecklistsForBatchComplete } = await import('../../lib/autoChecklistFromBatch');
            templateChecklistResult = await autoCreateChecklistsForBatchComplete(ctx.tenantId!, input.batchId, ctx.user.id);
          } catch (tclErr: any) {
            console.error('[파이프라인] 템플릿 체크리스트 자동생성 실패:', tclErr?.message || tclErr);
          }

          // === 파이프라인 자동화 끝 ===

          // === 원료수불부 사용 연동 ===
          try {
            const { onBatchCompleted } = await import("../../db/materialLedger");
            const completionDate = todayKST();
            await onBatchCompleted({
              batchId: input.batchId,
              completionDate,
            }, ctx.tenantId!);
          } catch (ledgerError) {
            console.error("[원료수불부] 배치 사용 반영 실패:", ledgerError);
          }
          // 생산일지(production_daily) 자동 갱신 (배치 완료 시)
          try {
            const { autoRegenerateProductionDaily } = await import('../../lib/autoProductionDaily');
            const batchInfo = await (await import("../../db")).getBatchById(input.batchId, ctx.tenantId!);
            const bDate = batchInfo?.plannedDate ? toKSTDate(new Date(batchInfo.plannedDate)) : todayKST();
            await autoRegenerateProductionDaily(ctx.tenantId!, bDate);
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
    getMaterialCostBreakdown: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        productId: z.number().optional(),
        status: z.string().optional()
      }))
      .query(async ({ ctx, input }) => {
        const { getMaterialCostBreakdown } = await import("../../db");
        
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

    /** 배치 비용 분석 (기간별 원가 집계) */
    getCostAnalysis: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getBatchCostAnalysis } = await import("../../db/batchCostAnalysis");
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getBatchCostAnalysis({ startDate, endDate, limit: input.limit }, ctx.tenantId!);
      }),

    /** 특정 배치의 원재료별 비용 분석 */
    getMaterialCostBreakdownByBatch: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchMaterialCostBreakdown } = await import("../../db/batchCostAnalysis");
        return await getBatchMaterialCostBreakdown(input.batchId, ctx.tenantId!);
      }),

    /** 기간별 비용 분석 집계 (월/주/일 단위) */
    getCostAnalysisPeriodSummary: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        groupBy: z.enum(["month", "week", "day"])
      }))
      .query(async ({ input, ctx }) => {
        const { getCostAnalysisPeriodSummary } = await import("../../db/batchCostAnalysis");
        return await getCostAnalysisPeriodSummary({
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          groupBy: input.groupBy
        }, ctx.tenantId!);
      }),

    /** 원재료별 비용 분석 (기간 내 원재료별 총 비용) */
    getMaterialCostAnalysis: tenantRequiredProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getMaterialCostAnalysis } = await import("../../db/batchCostAnalysis");
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getMaterialCostAnalysis({ startDate, endDate }, ctx.tenantId!);
      }),
    
    /** 배치 원가율 계산 (BOM 기반 실제 원가) */
    getCostRate: workerProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { calculateBatchCost } = await import("../../db/batchCostCalculation");
        return await calculateBatchCost(input.batchId, ctx.tenantId!);
      }),

// ═══════════════════════════════════════════════════════════════
// 생산 통계 및 차트 데이터
// ═══════════════════════════════════════════════════════════════

    /** 생산현황 서버사이드 통계 (오늘 계획/진행중/완료 + 상세 목록) */
    productionStats: tenantRequiredProcedure
      .input(z.object({
        date: z.string().optional(), // YYYY-MM-DD, default today
      }).optional())
      .query(async ({ input, ctx }) => {
        const conn = await getRawConnection();
        if (!conn) return { todayPlanned: 0, inProgress: 0, completedToday: 0, total: 0, todayBatches: [], inProgressBatches: [], completedTodayBatches: [] };

        const targetDate = input?.date || todayKST();
        const tenantId = ctx.tenantId!;

        // 통계 카운트
        const [stats] = await conn.execute<any[]>(
          `SELECT
            SUM(CASE WHEN planned_date = ? THEN 1 ELSE 0 END) as today_planned,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'completed' AND DATE(COALESCE(end_time, updated_at)) = ? THEN 1 ELSE 0 END) as completed_today,
            COUNT(*) as total
          FROM h_batches WHERE tenant_id = ?`,
          [targetDate, targetDate, tenantId]
        );
        const s = (stats as any[])[0] || {};

        // 오늘 계획 배치 상세
        const [todayRows] = await conn.execute<any[]>(
          `SELECT b.*, p.product_name, p.product_code
           FROM h_batches b
           LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
           WHERE b.tenant_id = ? AND b.planned_date = ?
           ORDER BY b.batch_code`,
          [tenantId, targetDate]
        );

        // 진행중 배치 상세
        const [ipRows] = await conn.execute<any[]>(
          `SELECT b.*, p.product_name, p.product_code
           FROM h_batches b
           LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
           WHERE b.tenant_id = ? AND b.status = 'in_progress'
           ORDER BY b.planned_date DESC LIMIT 100`,
          [tenantId]
        );

        // 오늘 완료 배치 상세
        const [compRows] = await conn.execute<any[]>(
          `SELECT b.*, p.product_name, p.product_code
           FROM h_batches b
           LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
           WHERE b.tenant_id = ? AND b.status = 'completed'
             AND DATE(COALESCE(b.end_time, b.updated_at)) = ?
           ORDER BY b.batch_code`,
          [tenantId, targetDate]
        );

        const mapRow = (r: any) => ({
          id: r.id, batchCode: r.batch_code, productId: r.product_id,
          productName: r.product_name || null, productCode: r.product_code || null,
          plannedQuantity: r.planned_quantity, actualQuantity: r.actual_quantity,
          plannedDate: r.planned_date, status: r.status,
          startTime: r.start_time, endTime: r.end_time, createdAt: r.created_at,
        });

        return {
          todayPlanned: Number(s.today_planned) || 0,
          inProgress: Number(s.in_progress) || 0,
          completedToday: Number(s.completed_today) || 0,
          total: Number(s.total) || 0,
          todayBatches: (todayRows as any[]).map(mapRow),
          inProgressBatches: (ipRows as any[]).map(mapRow),
          completedTodayBatches: (compRows as any[]).map(mapRow),
        };
      }),

    /** 생산량 추이 차트 데이터 (일간/주간/월간 집계) */
    productionChartData: tenantRequiredProcedure
      .input(z.object({
        period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
      }).optional())
      .query(async ({ input, ctx }) => {
        const conn = await getRawConnection();
        if (!conn) return [];
        const tenantId = ctx.tenantId!;
        const period = input?.period || "daily";

        if (period === "daily") {
          const [rows] = await conn.execute<any[]>(
            `SELECT DATE(planned_date) as date_key,
                    SUM(COALESCE(actual_quantity, planned_quantity)) as quantity,
                    COUNT(*) as count
             FROM h_batches
             WHERE tenant_id = ? AND status = 'completed'
               AND planned_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY DATE(planned_date)
             ORDER BY date_key`,
            [tenantId]
          );
          return (rows as any[]).map((r: any) => ({
            date: r.date_key, quantity: Number(r.quantity) || 0, count: Number(r.count) || 0,
          }));
        } else if (period === "weekly") {
          const [rows] = await conn.execute<any[]>(
            `SELECT DATE(DATE_SUB(planned_date, INTERVAL WEEKDAY(planned_date) DAY)) as week_key,
                    SUM(COALESCE(actual_quantity, planned_quantity)) as quantity,
                    COUNT(*) as count
             FROM h_batches
             WHERE tenant_id = ? AND status = 'completed'
               AND planned_date >= DATE_SUB(CURDATE(), INTERVAL 12 WEEK)
             GROUP BY week_key
             ORDER BY week_key`,
            [tenantId]
          );
          return (rows as any[]).map((r: any) => ({
            week: r.week_key, quantity: Number(r.quantity) || 0, count: Number(r.count) || 0,
          }));
        } else {
          const [rows] = await conn.execute<any[]>(
            `SELECT DATE_FORMAT(planned_date, '%Y-%m') as month_key,
                    SUM(COALESCE(actual_quantity, planned_quantity)) as quantity,
                    COUNT(*) as count
             FROM h_batches
             WHERE tenant_id = ? AND status = 'completed'
               AND planned_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
             GROUP BY month_key
             ORDER BY month_key`,
            [tenantId]
          );
          return (rows as any[]).map((r: any) => ({
            month: r.month_key, quantity: Number(r.quantity) || 0, count: Number(r.count) || 0,
          }));
        }
      }),

// ═══════════════════════════════════════════════════════════════
// 배치 Hydration (누락 연관 데이터 자동 복구)
// ═══════════════════════════════════════════════════════════════

    /** 누락 데이터 분석 (dry-run) */
    hydrateAnalyze: workerProcedure
      .input(z.object({
        batchIds: z.array(z.number()).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const { findBatchesNeedingHydration } = await import("../../services/batchHydrator");
        return await findBatchesNeedingHydration(ctx.tenantId!, input?.batchIds);
      }),

    /** 누락 연관 데이터 자동 생성 실행 */
    hydrateExecute: workerProcedure
      .input(z.object({
        batchIds: z.array(z.number()).optional(),
        steps: z.object({
          batchInputs: z.boolean().optional(),
          ccp: z.boolean().optional(),
          schedule: z.boolean().optional(),
          approval: z.boolean().optional(),
          dailyReport: z.boolean().optional(),
          materialLedger: z.boolean().optional(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { hydrateBatches } = await import("../../services/batchHydrator");
        return await hydrateBatches({
          tenantId: ctx.tenantId!,
          siteId: 1, // default site
          userId: ctx.user.id,
          batchIds: input.batchIds,
          steps: input.steps,
        });
      }),
});
