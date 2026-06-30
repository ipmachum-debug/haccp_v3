/**
 * 배치 CRUD (생성/조회/수정/삭제/CCP생성)
 */
import { monitorProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lt, or, sql } from "drizzle-orm";
import { getDb, getRawConnection } from "../../db";
import { toKSTDate, todayKST, formatLocalDate } from "../../utils/timezone";

export const batchCrudRouter = router({

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

        const tenantId = ctx.tenantId;
        const workDate = formatLocalDate(input.plannedStartDate);

        // ★ PR #263: CCP 공정그룹 매핑 사전 검증 (fail-fast)
        // 매핑이 없으면 배치 생성 자체를 차단하고 사용자에게 친절한 안내 메시지를 띄움.
        // 4월 17일 batch 580 (흑임자인절미) 0건 CCP form record 사고 재발 방지.
        const productMeta = await getProductById(input.productId, tenantId);
        const productNameLabel = (productMeta as any)?.productName || `제품 #${input.productId}`;
        const { validateProductCcpMapping } = await import("../../services/validateProductCcpMapping");
        const ccpValidation = await validateProductCcpMapping({
          productId: input.productId,
          productName: productNameLabel,
          tenantId,
        });
        if (!ccpValidation.valid) {
          const { TRPCError } = await import("@trpc/server");
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: ccpValidation.message,
            cause: {
              guidance: ccpValidation.guidance,
              bomMappingCount: ccpValidation.bomMappingCount,
              manualMappingCount: ccpValidation.manualMappingCount,
              hasApprovedBom: ccpValidation.hasApprovedBom,
              hasMetalDetection: ccpValidation.hasMetalDetection,
            },
          });
        }

        // STEP 1. 배치 헤더 생성 (h_products_v2.id를 직접 사용)
        const batchId = await createBatch({
          tenantId,
          siteId: input.siteId,
          productId: input.productId,
          batchCode: input.batchNumber,
          plannedQuantity: input.plannedQuantity.toString(),
          plannedDate: input.plannedStartDate,
          createdBy: ctx.user.id,
          mode: input.mode,
          batchStartTime: input.batchStartTime,
        });

        // STEP 2. 제품 정보 조회
        const product = await getProductById(input.productId, tenantId);
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
            productId: input.productId,
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
          if (!finalProductName && input.productId) {
            const { getRawConnection: _rcProd } = await import("../../db");
            const _poolProd = await _rcProd();
            const [_pRows] = await _poolProd.execute(
              `SELECT p.product_name
               FROM h_products_v2 p
               WHERE p.id = ? AND p.tenant_id = ?`,
              [input.productId, tenantId]
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
                [input.productId, tenantId]
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
              const frProductId = grp.ccp_type === 'CCP-4P' ? null : input.productId;
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
            const { syncCcpRowsToFormRows } = await import("../../db/haccp/ccpFormRecords");
            const syncResult = await syncCcpRowsToFormRows({ batchId, tenantId });
          } catch (syncErr) {
            console.error("[파이프라인] CCP form rows 동기화 실패 (계속):", syncErr);
          }
        }


        // STEP 4. 승인 요청 큐 자동 등록 (pending_review)
        // ★ 2026-04-15 수정:
        //   - 제목: "[CCP 기록지]" prefix 로 생산일지와 구분 (중복 표시 오해 방지)
        //   - 중복 방지: 동일 batchId 에 batch_production AR 이 이미 있으면 skip
        if (ccpCreated) {
          try {
            const { getRawConnection: _rc4 } = await import("../../db");
            const _pool4 = await _rc4(); // Pool 싱글턴
            // 중복 생성 방지 체크
            const [existingBp] = await _pool4.execute<any[]>(
              `SELECT id FROM h_approval_requests
               WHERE tenant_id = ? AND request_type = 'batch_production'
                 AND reference_type = 'batch' AND reference_id = ?
               LIMIT 1`,
              [tenantId, batchId]
            );
            if ((existingBp as any[]).length > 0) {
              approvalRequestId = Number((existingBp as any[])[0].id);
              console.log(`[파이프라인] 배치 #${batchId} batch_production AR 이미 존재 → skip (id=${approvalRequestId})`);
            } else {
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
                  `[CCP 기록지]${modeLabel} ${input.batchNumber} (${finalProductName || ""})`,
                  `제품: ${finalProductName || ""}\n계획일: ${workDate}\nCCP ${ccpCount}건 자동 생성 완료\n배치코드: ${input.batchNumber}\nCCP 공정: ${ccpGroupNames}\n[작성자 자동승인 → 검토자 대기]`,
                  ctx.user.id,
                ]
              );
              approvalRequestId = Number((insResult as any).insertId ?? 0);
              console.log(`[파이프라인] 배치 #${batchId} batch_production AR 등록 (pending_review, id=${approvalRequestId})`);
            }
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
          const { createBatchSchedule } = await import("../../db/production/batchSchedules");
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
            // ★ 2026-05-09 (PR #281): SKU 번들 자동 매칭 — child SKU 가 어떤 parent 에 속하는지 룩업
            const { resolveBundleSkuIdsBulk } = await import(
              "../../lib/production/resolveBundleSkuId.js"
            );
            const childSkuIds = input.skuOutputs
              .map((o: any) => o.skuId)
              .filter((id: number) => Number.isFinite(id));
            const bundleMap = await resolveBundleSkuIdsBulk(db, tenantId, childSkuIds);

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
                bundleSkuId: bundleMap.get(skuOut.skuId) ?? null,
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
          const { autoGenerateDailyReport } = await import('../../lib/production/autoDailyReport');
          dailyLogResult = await autoGenerateDailyReport(batchId, ctx.user.id, workDate);
        } catch (dlErr: any) {
          console.error('[파이프라인 STEP8] 일일일지 생성 실패 (배치 생성 유지):', dlErr?.message || dlErr);
        }

        // STEP 8.5. 주간/월간/연간 일지 자동 생성 (auto 모드만)
        let periodicLogsResult: any = null;
        try {
          const { autoGenerateAllPeriodicLogs } = await import('../../lib/production/autoPeriodicLogs');
          periodicLogsResult = await autoGenerateAllPeriodicLogs(
            input.mode,
            ctx.tenantId,
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
          const { autoRegenerateProductionDaily } = await import('../../lib/production/autoProductionDaily');
          await autoRegenerateProductionDaily(tenantId, workDate);
        } catch (pdErr) {
          console.error('[파이프라인 STEP9] 생산일지 갱신 실패:', pdErr);
        }

        // STEP 10. 체크리스트 자동 생성 (frequency=batch_create 템플릿)
        let checklistResult: any = null;
        try {
          const { autoCreateChecklistsForBatch } = await import('../../lib/production/autoChecklistFromBatch');
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
          [ctx.tenantId, `DAY-${dateStr}-%`],
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
              tenantId: ctx.tenantId,
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

        // ★ 2026-04-15: 하위 단계 실패를 수집하여 프론트엔드에 리턴
        //   이전: 각 try/catch 가 console.error 만 하고 끝 → 사용자는 성공/실패 구분 못 함
        //   현재: subFailures 배열에 수집 후 응답 payload 에 포함
        const subFailures: Array<{ step: string; error: string }> = [];

        // === 3. 그룹 레벨 일일일지 생성 (전체 배치 묶음) ===
        //  - autoGenerateDailyReport 는 동일 날짜에 checklist 가 있으면 업데이트만 수행
        //    (첫 배치에서만 AR 생성, 이후 배치는 기존 checklist 에 배치 정보 추가)
        let groupApprovalRequestId: number | null = null;
        let groupDailyReportCreated = false;
        if (successResults.length > 0) {
          try {
            const { autoGenerateDailyReport } = await import("../../lib/production/autoDailyReport");
            for (const r of successResults) {
              const dailyResult = await autoGenerateDailyReport(r.batchId, ctx.user.id, input.workDate);
              if (dailyResult.success) {
                groupDailyReportCreated = true;
                if (dailyResult.approvalRequestId) {
                  groupApprovalRequestId = dailyResult.approvalRequestId;
                }
              } else if (dailyResult.message) {
                subFailures.push({ step: `autoGenerateDailyReport(batch=${r.batchId})`, error: dailyResult.message });
              }
            }
          } catch (dailyErr: any) {
            console.error("[bulkCreateForDay] 그룹 일일일지 생성 실패:", dailyErr);
            subFailures.push({ step: "autoGenerateDailyReport", error: dailyErr?.message || String(dailyErr) });
          }

          // 3.5. 주간/월간/연간 일지 자동 생성 (bulk auto 모드)
          try {
            const { autoGenerateAllPeriodicLogs } = await import("../../lib/production/autoPeriodicLogs");
            const firstBatch = successResults[0];
            const periodicResult = await autoGenerateAllPeriodicLogs(
              input.defaultMode,
              ctx.tenantId,
              input.siteId,
              input.workDate,
              ctx.user.id,
              { batchId: firstBatch.batchId, productName: firstBatch.productName, plannedQty: input.items[0]?.plannedQuantityKg || 0 },
            );
            if (periodicResult) {
              // 각 subresult 의 실패를 수집
              for (const key of ["weekly", "monthly", "yearly"] as const) {
                const r = (periodicResult as any)[key];
                if (r && !r.success && r.message) {
                  subFailures.push({ step: `${key}Log`, error: r.message });
                }
              }
              const newLogs = [periodicResult.weekly, periodicResult.monthly, periodicResult.yearly]
                .filter((r: any) => r?.isNew);
              if (newLogs.length > 0) {
                console.log(`[bulkCreateForDay] 기간별 일지 ${newLogs.length}건 신규 생성`);
              }
            }
          } catch (periodicErr: any) {
            console.error("[bulkCreateForDay] 기간별 일지 생성 실패:", periodicErr);
            subFailures.push({ step: "autoGenerateAllPeriodicLogs", error: periodicErr?.message || String(periodicErr) });
          }

          // 3.5b. 체크리스트 자동 생성 (일반위생관리/공정점검표 등)
          // ★ 일일 문서는 1회만 생성 (첫 번째 배치 기준, 중복 방지는 함수 내부에서 처리)
          try {
            const { autoCreateChecklistsForBatch } = await import('../../lib/production/autoChecklistFromBatch');
            const firstBatchResult = successResults[0];
            await autoCreateChecklistsForBatch(ctx.tenantId, firstBatchResult.batchId, ctx.user.id, input.workDate);
          } catch (clErr: any) {
            console.error("[bulkCreateForDay] 체크리스트 자동생성 실패 (배치 생성 유지):", clErr?.message || clErr);
            subFailures.push({ step: "autoCreateChecklistsForBatch", error: clErr?.message || String(clErr) });
          }

          // [v2-rebuild] 묶음 승인요청(batch_plan) 제거
          // CCP-1B는 제품별 개별 문서이므로 그룹 승인이 혼란을 줌
          // → 개별 배치별 batch_production 승인만 생성

          // ★ 2026-04-13: 개별 배치 batch_production 승인요청은 batchOrchestrator 6.3
          //    (createSingleBatch 내부) 에서 이미 생성됨 → 여기서 중복 생성 제거
        }

        // === 3.8 CCP-4P 금속검출 일일 통합 기록지 자동 승인요청 ===
        // CCP-4P는 날짜별 1건의 통합 기록지 → 모든 배치 생성 완료 후 승인요청 생성
        // ★ 2026-04-15 강화:
        //   - stale approval_request_id 감지 (실제 AR 이 없으면 NULL 처리 후 재생성)
        //   - form_record 가 없으면 생성 시도
        //   - 실패 사유를 subFailures 에 수집
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

            if ((ccp4pRecs as any[]).length === 0) {
              // form_record 가 없음 → batchOrchestrator 에서 생성 실패한 것
              // 여기서 경고만 남기고 다음 기회로 넘김
              console.warn(`[bulkCreateForDay] CCP-4P form_record 없음 (date=${input.workDate}) — BOM 에 CCP-4P 공정그룹이 없거나 orchestrator 에서 실패`);
              subFailures.push({
                step: "ccp4p-formrecord-missing",
                error: `${input.workDate} CCP-4P form_record 가 생성되지 않음`,
              });
            } else {
              const ccp4pRec = (ccp4pRecs as any[])[0];
              // stale approval_request_id 감지: 실제 AR 이 존재하는지 확인
              let needsNew = !ccp4pRec.approval_request_id;
              if (ccp4pRec.approval_request_id) {
                const [arCheck] = await conn4p.execute<any[]>(
                  `SELECT id, status FROM h_approval_requests WHERE id = ? AND tenant_id = ? LIMIT 1`,
                  [ccp4pRec.approval_request_id, ctx.tenantId],
                );
                if ((arCheck as any[]).length === 0) {
                  // AR 이 삭제된 상태 → stale 으로 판단하고 NULL 복원 후 재생성
                  console.warn(`[bulkCreateForDay] CCP-4P form_record #${ccp4pRec.id} → stale approval_request_id=${ccp4pRec.approval_request_id} 감지, 재생성`);
                  await conn4p.execute(
                    `UPDATE h_ccp_form_records SET approval_request_id=NULL WHERE id=? AND tenant_id=?`,
                    [ccp4pRec.id, ctx.tenantId],
                  );
                  needsNew = true;
                }
              }

              if (needsNew) {
                // 상태를 submitted으로 변경
                await conn4p.execute(
                  `UPDATE h_ccp_form_records SET status='submitted', submitted_at=NOW(), writer_id=? WHERE id=? AND tenant_id=?`,
                  [ctx.user.id, ccp4pRec.id, ctx.tenantId],
                );
                // 승인요청 생성
                const productNames = successResults.map((r: any) => r.productName).filter(Boolean).join(", ");
                const title4p = `[CCP 기록지-CCP-4P] ${input.workDate} 금속검출 통합`;
                const desc4p = `금속검출공정 CCP 기록지 (일일 통합)\n작업일: ${input.workDate}\n제품: ${productNames}\n배치 수: ${successResults.length}건\n그룹: ${dayBatchGroup}\n[작성자 자동승인 → 검토자 대기]`;
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
              } else {
                console.log(`[bulkCreateForDay] CCP-4P 승인요청 이미 존재 (id=${ccp4pRec.approval_request_id}) → skip`);
              }
            }
          } catch (ccp4pErr: any) {
            console.error("[bulkCreateForDay] CCP-4P 승인요청 생성 실패:", ccp4pErr);
            subFailures.push({ step: "ccp4p-ar-creation", error: ccp4pErr?.message || String(ccp4pErr) });
          }
        }

        // === 4. 금속탐지 배정 ===
        let metalPassResult = null;
        if (successResults.length > 0) {
          try {
            metalPassResult = await allocateMetalPassLogsForDay({
              tenantId: ctx.tenantId, siteId: input.siteId,
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
              tenantId: ctx.tenantId, siteId: input.siteId,
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
          const { autoRegenerateProductionDaily } = await import('../../lib/production/autoProductionDaily');
          await autoRegenerateProductionDaily(ctx.tenantId, input.workDate);
        } catch (pdErr: any) {
          console.error('[bulkCreateForDay] 생산일지(production_daily) 자동 갱신 실패:', pdErr);
          subFailures.push({ step: "autoRegenerateProductionDaily", error: pdErr?.message || String(pdErr) });
        }

        const failedResults = results.filter((r: any) => r.batchId === 0);
        if (failedResults.length > 0) {
          console.error(`[bulkCreateForDay] ${failedResults.length}건 실패:`,
            failedResults.map((r: any) => `productId=${r.productId}: ${r.error}`).join("; "));
        }
        if (subFailures.length > 0) {
          console.warn(`[bulkCreateForDay] 하위 단계 ${subFailures.length}건 실패:`,
            subFailures.map(f => `${f.step}: ${f.error}`).join(" | "));
        }

        return {
          success: successResults.length > 0,
          dayBatchGroup,
          createdCount: successResults.length,
          totalRequested: input.items.length,
          batchIds: successResults.map((r: any) => r.batchId),
          batches: results,
          errors: failedResults.map((r: any) => ({ productId: r.productId, error: r.error })),
          // ★ 2026-04-15: 하위 단계 실패 리스트 — 프론트엔드에서 노출 가능
          subFailures,
          metalPass: metalPassResult,
          schedule: scheduleResult,
          groupApprovalRequestId,
          groupDailyReportCreated,
        };
      }),

// ═══════════════════════════════════════════════════════════════
// 배치 CRUD (조회, 수정, 삭제)
// ═══════════════════════════════════════════════════════════════

    /** 배치 목록 조회 (tenantId 필터, 페이지네이션, planned_date 범위) */
    list: tenantRequiredProcedure
      .input(
        z.object({
          siteId: z.number().optional(),
          status: z.string().optional(),
          productId: z.number().optional(),
          page: z.number().optional(),
          limit: z.number().optional(),
          /** planned_date >= fromDate (YYYY-MM-DD). 캘린더 월 범위 조회용 */
          fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          /** planned_date <= toDate (YYYY-MM-DD). 캘린더 월 범위 조회용 */
          toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const { getAllBatches } = await import("../../db");
        const batches = await getAllBatches({ ...input, tenantId: ctx.tenantId });
        
        return batches;
      }),

    /** 배치 상세 조회 (최신 PDF URL 포함) */
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchById } = await import("../../db");
        const { getLatestSuccessPdfUrl } = await import("../../db/production/batchPdfLogs");
        
        const batch = await getBatchById(input.id, ctx.tenantId);
        
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
        const batch = await getBatchById(input.id, ctx.tenantId);
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
        const batch = await getBatchById(input.id, ctx.tenantId);
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
        
        await updateBatchStatus(input.id, input.status, ctx.tenantId);

        // === 파이프라인 자동화: 배치 시작 시 원료 자동 출고 ===
        let autoIssueResult = null;
        if (input.status === 'in_progress') {
          try {
            // 2026-04-29 (F2-2-d): dispatcher 경유 — env 기본값 v1 (운영 안전).
            // USE_AUTO_ISSUE_V2 / USE_AUTO_ISSUE_V2_TENANTS 로 점진 v2 전환 가능.
            const { autoIssueMaterialsDispatch } = await import('../../lib/production/autoMaterialIssueDispatcher');
            autoIssueResult = await autoIssueMaterialsDispatch(input.id, batch.createdBy || ctx.user.id, ctx.tenantId) as any;
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
          const { autoRegenerateProductionDaily } = await import('../../lib/production/autoProductionDaily');
          const batchDateStr = batch.plannedDate
            ? toKSTDate(new Date(batch.plannedDate))
            : todayKST();
          await autoRegenerateProductionDaily(ctx.tenantId, batchDateStr);
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

        const batch = await getBatchById(input.id, ctx.tenantId);
        if (!batch) {
          throw new TRPCError({ code: "NOT_FOUND", message: "배치를 찾을 수 없습니다." });
        }

        // 락 체크: 완료된 배치는 admin만 삭제 가능
        const isAdmin = ctx.user?.role === 'admin' || ctx.user?.role === 'super_admin';
        if (batch.status === 'completed' && !isAdmin) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "완료된 배치는 삭제할 수 없습니다."
          });
        }
        
        await deleteBatch(input.id, ctx.tenantId);

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

    /** 날짜별 일괄 배치 삭제 (롤백용) — admin 전용 */
    deleteByDate: tenantRequiredProcedure
      .input(z.object({ plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(async ({ input, ctx }) => {
        const isAdmin = ctx.user?.role === 'admin' || ctx.user?.role === 'super_admin';
        if (!isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "관리자만 일괄 삭제할 수 있습니다." });
        }
        const { deleteBatchesByDate } = await import("../../db/production/batchFunctions");
        const result = await deleteBatchesByDate(input.plannedDate, ctx.tenantId);
        return { success: true, ...result, message: `${input.plannedDate} 배치 ${result.deletedCount}건 삭제 완료` };
      }),

// ═══════════════════════════════════════════════════════════════
// CCP 자동생성 및 HACCP 보고서
// ═══════════════════════════════════════════════════════════════

    /** 배치 번호 자동 생성 */

});
