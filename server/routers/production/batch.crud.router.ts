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
        // 단건 생성도 일괄 생성과 같은 생성 계약 (2026-10-20, 생산계획 생애주기 검토 4) — 머리글+원료 계획 한 트랜잭션,
        //   필수 준비(CCP·기록지·행·SKU) 확인 뒤에만 완료, 오늘·미래는 예정. 이전의 별도 10단계 파이프라인(오류를 로그만 남김)은 쓰지 않는다.
        const tenantId = ctx.tenantId;
        const workDate = formatLocalDate(input.plannedStartDate);
        const { createSingleBatch } = await import("../../services/batchOrchestrator");
        const r = await createSingleBatch({
          tenantId, siteId: input.siteId, workDate, startTime: input.batchStartTime ?? "09:00",
          productId: input.productId, plannedQuantityKg: input.plannedQuantity, batchCode: input.batchNumber, mode: input.mode,
          skuOutputs: input.skuOutputs?.map((x) => ({ skuId: x.skuId, plannedQty: x.plannedQty, actualQty: x.actualQty, defectiveQty: x.defectiveQty, note: x.notes })),
          userId: ctx.user.id, userEmail: ctx.user.email, userRole: ctx.user.role,
        });
        if (r.setupMissing.length) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `생산 건 #${r.batchId} 준비가 끝나지 않았습니다 (${r.setupMissing.slice(0, 3).join(", ")}) — 생산 계획 화면에서 같은 내용으로 다시 생성하세요.` });
        }
        const planOnly = workDate >= todayKST();
        let checklistResult: any = null;
        if (!planOnly) {
          // 지난 날짜(즉시 실행)만 — 생산일지·체크리스트 (오늘·미래는 그날 첫 확인 때)
          try {
            const { autoRegenerateProductionDaily } = await import('../../lib/production/autoProductionDaily');
            await autoRegenerateProductionDaily(tenantId, workDate);
          } catch (pdErr) {
            console.error('[batch.create] 생산일지 갱신 실패 (선택 단계):', pdErr);
          }
          try {
            const { autoCreateChecklistsForBatch } = await import('../../lib/production/autoChecklistFromBatch');
            checklistResult = await autoCreateChecklistsForBatch(tenantId, r.batchId, ctx.user.id, workDate);
          } catch (clErr: any) {
            console.error('[batch.create] 체크리스트 자동생성 실패 (선택 단계):', clErr?.message || clErr);
          }
        }
        return {
          success: true,
          batchId: r.batchId,
          ccpCreated: r.ccpCreated,
          ccpCount: r.ccpCount,
          scheduleCreated: r.scheduleCreated,
          approvalRequestId: r.approvalRequestId,
          dailyLogResult: r.dailyReportCreated,
          periodicLogsResult: r.periodicLogsResult,
          checklistResult,
          mode: input.mode,
          planOnly,
          autoNavigateToApproval: !planOnly && input.mode === "auto" && r.ccpCreated,
          message: planOnly
            ? `예정 생산 건과 CCP ${r.ccpCount}건을 만들었습니다 — 원료는 현장에서 처음 확인할 때 출고됩니다.`
            : `배치 및 CCP ${r.ccpCount}건이 생성되었습니다.` + (input.mode === "auto" ? " 승인관리에서 확인하세요." : " CCP 기록지를 확인 후 승인하세요."),
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
          /** 하루 총생산량 kg — 또는 batchCount (배치 수 × BOM 1회 기준량, 하루 생산 흐름 2026-10-19) */
          plannedQuantityKg: z.number().positive().optional(),
          batchCount: z.number().int().positive().max(1000).optional(),
          skuOutputs: z.array(zSkuOut).optional(),
          startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          /** 오늘만 바꾼 시작시각 — CCP 계획에서 설비 작업 시작보다 우선 (PR-B) */
          startTimeOverride: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          mode: z.enum(["auto", "manual"]).optional(),
          batchCode: z.string().optional(),
          /** 입력 줄 키 — requestKey 와 함께 같은 줄은 한 번만 생성 (PR-B) */
          rowKey: z.string().min(1).max(64).optional(),
          /** 같은 날 같은 제품을 실제로 따로 만드는 생산 건 (LOT·생산지시 분리) — 명시할 때만 (F-PROD-01) */
          separateRun: z.boolean().optional(),
        });
        return z.object({
          /** 요청 키 — 재시도·더블클릭에도 같은 줄은 한 번만, 실패 줄만 다시 (PR-B) */
          requestKey: z.string().min(8).max(64).optional(),
          /** 오늘만 쓰지 않는 설비 (PR-B) */
          excludedEquipmentIds: z.array(z.number()).max(200).optional(),
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
        let dayBatchGroup = `DAY-${dateStr}-${String(grpSeq).padStart(3, "0")}`;

        // 요청 키 — 같은 요청의 재시도면 같은 그룹, 이미 만든 줄은 다시 만들지 않는다 (PR-B)
        const reqKeys = await import("../../lib/production/batchCreateRequests");
        const useKeys = !!input.requestKey && (await reqKeys.requestKeysAvailable(conn));
        if (useKeys) dayBatchGroup = (await reqKeys.existingDayGroup(conn, ctx.tenantId, input.requestKey!)) ?? dayBatchGroup;

        // 입력량 = 제품의 하루 총생산량 — 같은 제품을 여러 줄·다시 보내 생산 건·원료 차감이 불어나지 않게 (F-PROD-01)
        const guard = await import("../../lib/production/dayProductionGuard");
        const dupLines = guard.duplicateLineProblems(input.items);
        if (dupLines.size) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `같은 제품이 여러 줄입니다 — ${Array.from(dupLines.entries()).map(([i, m]) => `${i + 1}번 줄: ${m}`).join(" / ")}` });
        }
        // 이 요청이 이미 만든 생산 건만 중복 검사에서 뺀다 (재시도 때 자기 자신) — 그룹 전체를 빼지 않는다
        const ownBatchIds = useKeys ? await reqKeys.batchesOfRequest(conn, ctx.tenantId, input.requestKey!) : [];
        const sameDay = await guard.existingSameDayRuns(conn, ctx.tenantId, input.workDate, input.items.map((i) => i.productId), ownBatchIds);

        const results: any[] = [];

        // === 2. 품목별 배치 순차 생성 (그룹코드 공유, 승인/일지는 그룹 레벨에서) ===
        for (let idx = 0; idx < input.items.length; idx++) {
          const item = input.items[idx];
          const rowKey = item.rowKey ?? `row-${idx + 1}`;
          const already = sameDay.get(item.productId);
          if (already && !item.separateRun) {
            results.push({
              rowKey, status: "failed", batchId: 0, batchCode: "", productId: item.productId, productName: "",
              ccpCreated: false, ccpCount: 0, ccpGroups: [], approvalRequestId: null, scheduleCreated: false, dailyReportCreated: false,
              error: guard.existingRunProblem(`제품 #${item.productId}`, already),
            });
            continue;
          }
          // 생성 계약 (2026-10-20, 생산계획 생애주기 검토 1·4): 요청 줄 ↔ 생산 건 연결로 재시도는 이어서, 다른 내용이면 충돌
          let requestRowId: number | null = null;
          let resumeBatchId: number | null = null;
          if (useKeys) {
            const fp = reqKeys.rowFingerprint({
              workDate: input.workDate, siteId: input.siteId, productId: item.productId, plannedQuantityKg: item.plannedQuantityKg, batchCount: item.batchCount,
              mode: item.mode ?? input.defaultMode, startTime: item.startTime ?? input.dayStartTime, startTimeOverride: item.startTimeOverride, separateRun: item.separateRun,
              skuOutputs: [...(item.skuOutputs ?? [])].sort((x, y) => x.skuId - y.skuId), excluded: [...(input.excludedEquipmentIds ?? [])].sort((x, y) => x - y),
            });
            const claim = await reqKeys.claimRow(conn, ctx.tenantId, input.requestKey!, rowKey, dayBatchGroup, fp);
            requestRowId = claim.requestRowId ?? null;
            if (claim.state === "conflict") {
              results.push({ rowKey, status: "failed", conflict: true, batchId: claim.batchId ?? 0, batchCode: "", productId: item.productId, productName: "",
                error: "같은 요청 키로 다른 내용(작업일·제품·수량 등)이 왔습니다 — 처리하지 않았습니다. 화면을 새로 고친 뒤 다시 생성하세요." });
              continue;
            }
            const linked = requestRowId != null ? await reqKeys.linkedBatch(conn, ctx.tenantId, requestRowId) : null;
            if (claim.state === "done" && (!linked || !linked.setupPending)) {
              // 이미 만든 줄 — 다시 만들지 않고 그 배치를 알려 준다
              const bid = linked?.id ?? claim.batchId ?? 0;
              const [bRows] = await conn.execute<any[]>(
                `SELECT b.batch_code, p.product_name FROM h_batches b LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id WHERE b.id = ? AND b.tenant_id = ?`,
                [bid, ctx.tenantId],
              );
              results.push({ rowKey, status: "reused", reused: true, batchId: bid, batchCode: (bRows as any[])[0]?.batch_code ?? "", productId: item.productId, productName: (bRows as any[])[0]?.product_name ?? "" });
              continue;
            }
            if (claim.state === "processing") {
              results.push({ rowKey, status: "in_progress", batchId: linked?.id ?? 0, batchCode: "", productId: item.productId, productName: "", error: "같은 요청이 아직 처리 중입니다 — 잠시 뒤 다시 확인하세요." });
              continue;
            }
            // new·retry(이전 실패·멈춤) — 이 요청 줄로 이미 만든 생산 건이 있으면 그것을 이어서 완성 (새로 만들지 않음)
            if (linked) resumeBatchId = linked.id;
          }
          let madeBatchId: number | null = resumeBatchId;
          try {
            const mode = item.mode ?? input.defaultMode;
            // 배치 수 → kg (미리보기와 같은 계산). 계산할 수 없으면 이 줄은 실패
            const { resolvePlannedKg } = await import("../../lib/production/planQuantity");
            const q = await resolvePlannedKg(conn, ctx.tenantId, item);
            if (q.kg == null) throw new Error(q.error ?? "계획량이 없습니다.");
            const result = await createSingleBatch({
              tenantId: ctx.tenantId,
              siteId: input.siteId,
              workDate: input.workDate,
              startTime: item.startTime ?? input.dayStartTime,
              productId: item.productId,
              plannedQuantityKg: q.kg,
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
              startTimeOverride: item.startTimeOverride ?? null,
              excludedEquipmentIds: input.excludedEquipmentIds,
              createRequestId: requestRowId,
              resumeBatchId,
            });
            madeBatchId = result.batchId;
            if (result.setupMissing.length) {
              // 생산 건은 남기되(요청 줄에 연결) 생성 완료로 보지 않는다 — 같은 요청으로 다시 보내면 이 생산 건을 이어서 준비
              const why = `생산 건 준비가 끝나지 않았습니다 (${result.setupMissing.slice(0, 3).join(", ")}) — 같은 내용으로 다시 생성하면 이어서 준비합니다.`;
              if (useKeys) await reqKeys.failRow(conn, ctx.tenantId, input.requestKey!, rowKey, why, result.batchId).catch(() => {});
              results.push({ ...result, rowKey, status: "failed", incomplete: true, error: why });
              continue;
            }
            if (useKeys) await reqKeys.finishRow(conn, ctx.tenantId, input.requestKey!, rowKey, result.batchId);
            // 이어서 완성한 줄도 이번에 완료됐으니 그룹 후속 처리 대상 (completedNow)
            results.push({ ...result, rowKey, status: result.resumed ? "reused" : "created", reused: result.resumed, completedNow: true });
          } catch (err: any) {
            console.error(`[bulkCreateForDay] 품목 ${item.productId} 실패:`, err);
            // 이미 만든 생산 건이 있으면 그 번호를 남긴다 (생산 건 쪽 요청 줄 연결이 정본 — 재시도가 이어서 완성)
            if (useKeys) await reqKeys.failRow(conn, ctx.tenantId, input.requestKey!, rowKey, err?.message || "생성 실패", madeBatchId).catch(() => {});
            results.push({
              rowKey, status: "failed",
              batchId: madeBatchId ?? 0, batchCode: "", productId: item.productId, productName: "",
              ccpCreated: false, ccpCount: 0, ccpGroups: [], approvalRequestId: null,
              scheduleCreated: false, dailyReportCreated: false,
              error: err.message || "생성 실패",
            });
          }
        }

        // 이번에 준비까지 완료된 줄만 그룹 후속 처리 (이미 완료된 줄은 그때 처리됨, 준비 미완·실패 줄은 제외 — 생산 건 번호가 있어도)
        const successResults = results.filter((r: any) => r.batchId > 0 && r.completedNow);

        // ★ 2026-04-15: 하위 단계 실패를 수집하여 프론트엔드에 리턴
        //   이전: 각 try/catch 가 console.error 만 하고 끝 → 사용자는 성공/실패 구분 못 함
        //   현재: subFailures 배열에 수집 후 응답 payload 에 포함
        const subFailures: Array<{ step: string; error: string }> = [];

        // ★ 2026-10-19 (현장 1): 미래 날짜는 '예정' — 일지·금속검출 승인요청·생산일지 같은 그날 실행 단계를 미리 만들지 않는다
        //   (각 생산 건은 createSingleBatch 가 plan_only 로 만들고, 그날 확인 때 ensureBatchActivated 가 실행)
        const { todayKST: _today } = await import("../../utils/timezone");
        //   ★ 2026-10-19 (하루 생산 흐름): 오늘도 예정 — 현장 첫 확인에서 실행 (지난 날짜만 바로)
        const planOnlyDay = input.workDate >= _today();

        // === 3. 그룹 레벨 일일일지 생성 (전체 배치 묶음) ===
        //  - autoGenerateDailyReport 는 동일 날짜에 checklist 가 있으면 업데이트만 수행
        //    (첫 배치에서만 AR 생성, 이후 배치는 기존 checklist 에 배치 정보 추가)
        let groupApprovalRequestId: number | null = null;
        let groupDailyReportCreated = false;
        let groupChecklistResult: any = null;
        if (!planOnlyDay && successResults.length > 0) {
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
            groupChecklistResult = await autoCreateChecklistsForBatch(ctx.tenantId, firstBatchResult.batchId, ctx.user.id, input.workDate);
            // ★ 템플릿이 없어 0건인 경우도 사용자에게 보이도록 수집 (조용한 무동작 방지)
            if (groupChecklistResult?.skippedReason) {
              subFailures.push({ step: "autoCreateChecklistsForBatch", error: groupChecklistResult.skippedReason });
            }
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
        if (!planOnlyDay && successResults.length > 0) {
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
                const { syncCcpInstanceStatusFromForm } = await import("../../db/haccp/ccpStatusSync");
                await syncCcpInstanceStatusFromForm(ccp4pRec.id, ctx.tenantId);
              } else {
                console.log(`[bulkCreateForDay] CCP-4P 승인요청 이미 존재 (id=${ccp4pRec.approval_request_id}) → skip`);
              }
            }
          } catch (ccp4pErr: any) {
            console.error("[bulkCreateForDay] CCP-4P 승인요청 생성 실패:", ccp4pErr);
            subFailures.push({ step: "ccp4p-ar-creation", error: ccp4pErr?.message || String(ccp4pErr) });
          }
        }

        // === 4. 금속탐지 배정 — 계획 전용 표 쓰기라 꺼짐 (정본은 기록지 행, server/lib/haccp/metalRecordSource.ts) ===
        let metalPassResult = null;
        const { WRITE_METAL_PLAN_TABLES } = await import("../../lib/haccp/metalRecordSource");
        if (WRITE_METAL_PLAN_TABLES && successResults.length > 0) {
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

        // === 6. 생산일지(production_daily) 자동 생성/갱신 — 예정일(미래)은 그날 확인 때 ===
        if (!planOnlyDay) try {
          const { autoRegenerateProductionDaily } = await import('../../lib/production/autoProductionDaily');
          await autoRegenerateProductionDaily(ctx.tenantId, input.workDate);
        } catch (pdErr: any) {
          console.error('[bulkCreateForDay] 생산일지(production_daily) 자동 갱신 실패:', pdErr);
          subFailures.push({ step: "autoRegenerateProductionDaily", error: pdErr?.message || String(pdErr) });
        }

        const failedResults = results.filter((r: any) => r.status === "failed" || r.status === "in_progress");
        if (failedResults.length > 0) {
          console.error(`[bulkCreateForDay] ${failedResults.length}건 실패:`,
            failedResults.map((r: any) => `productId=${r.productId}: ${r.error}`).join("; "));
        }
        if (subFailures.length > 0) {
          console.warn(`[bulkCreateForDay] 하위 단계 ${subFailures.length}건 실패:`,
            subFailures.map(f => `${f.step}: ${f.error}`).join(" | "));
        }

        return {
          success: successResults.length > 0 || results.some((r: any) => r.reused),
          dayBatchGroup,
          createdCount: results.filter((r: any) => r.status === "created").length,
          reusedCount: results.filter((r: any) => r.reused).length,
          totalRequested: input.items.length,
          batchIds: results.filter((r: any) => r.batchId > 0).map((r: any) => r.batchId),
          batches: results,
          errors: failedResults.map((r: any) => ({ rowKey: r.rowKey, productId: r.productId, error: r.error })),
          // ★ 2026-04-15: 하위 단계 실패 리스트 — 프론트엔드에서 노출 가능
          subFailures,
          metalPass: metalPassResult,
          schedule: scheduleResult,
          groupApprovalRequestId,
          groupDailyReportCreated,
          groupChecklistResult,
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
          /**
           * 정렬 (2026-10-16): 기본 'created' = 입력일 최신순 (기존 그대로).
           * 'planned' = 생산일(planned_date) 최신순, 같은 날은 id 최신순, 생산일 없는 행은 뒤로 — 대시보드 최근 생산 배치용.
           */
          sort: z.enum(["created", "planned"]).optional(),
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
    /**
     * 일정 변경 (달력 끌어 옮기기) — 손 안 댄 예정 생산 건만, 재계획으로 (2026-10-20, 생산계획 생애주기 검토 3)
     *   날짜·시작시각이 바뀌면 원료 계획·CCP 회차·설비 배정·예정 시각·금속검출 연결을 같은 계획 함수로 다시 맞춘다.
     */
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
        const kst = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
        const hm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
        const workDate = input.startTime ? kst(input.startTime) : input.plannedDate ? kst(input.plannedDate) : null;
        const startTime = input.startTime ? hm(input.startTime) : null;
        const { replanBatch, ReplanRejectedError } = await import("../../services/batchReplan");
        try {
          const r = await replanBatch({ tenantId: ctx.tenantId, userId: ctx.user.id, batchId: input.id, workDate, startTime });
          return { success: true, setupMissing: r.setupMissing, changed: r.changed };
        } catch (e: any) {
          if (e instanceof ReplanRejectedError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message });
          throw e;
        }
      }),

    /**
     * 배치 수정 — 코드·수량·날짜 (2026-10-20, 생산계획 생애주기 검토 2·3)
     *   상태는 여기서 바꾸지 않는다 (생산 단계 버튼·완료 창·승인 관리). 승인·완료·출하·보관·취소·무효 생산 건은 수정하지 않는다.
     *   수량·날짜는 손 안 댄 예정 생산 건만 — 재계획(원료·CCP·금속검출 함께)으로.
     */
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
        const { getBatchById, createAuditLog } = await import("../../db");
        const batch = await getBatchById(input.id, ctx.tenantId);
        if (!batch) {
          throw new TRPCError({ code: "NOT_FOUND", message: "배치를 찾을 수 없습니다." });
        }
        if (input.status !== undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "상태는 여기서 바꾸지 않습니다 — 생산 단계 버튼·[완료] 창·승인 관리에서 바꿉니다." });
        }
        const conn: any = await getRawConnection();
        const [[meta]]: any = await conn.execute(`SELECT status, voided_at FROM h_batches WHERE id = ? AND tenant_id = ?`, [input.id, ctx.tenantId]);
        if (meta?.voided_at || ["completed", "approved", "shipped", "archived", "cancelled", "under_review"].includes(String(meta?.status))) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "완료·승인·출하·보관·취소·무효 생산 건은 수정할 수 없습니다 (정정은 이력 보존 경로로)." });
        }
        let replan: any = null;
        if (input.plannedQuantity !== undefined || input.plannedStartDate !== undefined) {
          const kst = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
          const { replanBatch, ReplanRejectedError } = await import("../../services/batchReplan");
          try {
            replan = await replanBatch({ tenantId: ctx.tenantId, userId: ctx.user.id, batchId: input.id,
              plannedQuantityKg: input.plannedQuantity ?? null, workDate: input.plannedStartDate ? kst(input.plannedStartDate) : null });
          } catch (e: any) {
            if (e instanceof ReplanRejectedError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message });
            throw e;
          }
        }
        if (input.batchNumber !== undefined && input.batchNumber.trim()) {
          await conn.execute(`UPDATE h_batches SET batch_code = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`, [input.batchNumber.trim(), input.id, ctx.tenantId]);
        }
        await createAuditLog({
          action: "batch.update",
          entityType: "batch",
          entityId: input.id,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 수정: ${input.batchNumber || input.id}`,
          changes: { updated: { ...input, status: undefined }, replan: replan?.changed ?? null },
        });
        return {
          success: true,
          setupMissing: replan?.setupMissing ?? [],
          message: replan?.setupMissing?.length ? `수정했지만 준비가 끝나지 않았습니다 (${replan.setupMissing.slice(0, 3).join(", ")}) — 같은 수정을 다시 저장하면 이어서 준비합니다.` : replan?.resumed ? "멈춰 있던 준비를 이어서 마쳤습니다." : "배치가 수정되었습니다.",
        };
      }),
    
    /**
     * 배치 상태 변경 — 생산 단계 버튼 (2026-10-20, 생산계획 생애주기 검토 2: 전이 규칙)
     *   계획 → 진행 중: 시작 경로(예정이면 첫 확인과 같은 실행·원료 출고)
     *   진행 중 → 계획: 아무 일도 없었을 때만 (원료 출고·확인·결재 흔적이 있으면 거부)
     *   완료: [완료] 창(batch.complete — 실제 생산량·재고 정산·관리자) 으로만. 승인: 승인 관리(결재 관문) 로만.
     *   출하됨: 관리자, 완료·승인된 생산 건만.
     *   승인·보관·취소·무효 생산 건은 이 버튼으로 바꾸지 않는다.
     */
    updateStatus: workerProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["planned", "in_progress", "completed", "shipped", "approved", "cancelled", "archived", "pending"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getBatchById, updateBatchStatus } = await import("../../db");
        const batch = await getBatchById(input.id, ctx.tenantId);
        if (!batch) {
          throw new TRPCError({ code: "NOT_FOUND", message: "배치를 찾을 수 없습니다." });
        }
        const conn: any = await getRawConnection();
        const [[meta]]: any = await conn.execute(`SELECT status, voided_at, setup_pending FROM h_batches WHERE id = ? AND tenant_id = ?`, [input.id, ctx.tenantId]);
        const cur = String(meta?.status ?? batch.status);
        if (meta?.voided_at) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "무효 처리된 생산 건은 상태를 바꿀 수 없습니다." });
        if (cur === input.status) return { success: true, message: "이미 그 상태입니다.", autoIssueResult: null };
        if (["approved", "archived", "cancelled"].includes(cur)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "승인·보관·취소된 생산 건은 상태를 바꿀 수 없습니다 (반려·정정은 승인 관리·이력 보존 경로로)." });
        }
        if (input.status === "completed") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "완료는 [완료] 창에서 실제 생산량과 함께 처리합니다 (재고 정산·원가·CCP 관문)." });
        }
        if (input.status === "approved") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "승인은 승인 관리에서만 합니다 (CCP 기록지·원료 출고 관문)." });
        }
        if (["cancelled", "archived", "pending"].includes(input.status)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "이 상태는 여기서 바꿀 수 없습니다 — 취소는 삭제(손 안 댄 계획) 또는 무효 처리(이력 보존)로 합니다." });
        }
        if (input.status === "shipped") {
          if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "출하 상태는 관리자만 바꿉니다." });
          if (!["completed"].includes(cur)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "완료된 생산 건만 출하로 바꿀 수 있습니다." });
        }
        if (input.status === "planned") {
          const { batchHistoryReasons } = await import("../../lib/production/batchTouchGuard");
          const why = (await batchHistoryReasons(conn, input.id, ctx.tenantId)).filter((x) => !x.startsWith("상태가"));
          if (cur !== "in_progress" || why.length) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `계획으로 되돌릴 수 없습니다 — ${why.length ? why.join(", ") : `지금 상태 '${cur}'`} (실행된 생산 건은 이력 보존 경로로).` });
          }
        }
        if (input.status === "in_progress") {
          if (cur !== "planned") throw new TRPCError({ code: "PRECONDITION_FAILED", message: `'${cur}' 에서 진행 중으로 바꿀 수 없습니다.` });
          if (Number(meta?.setup_pending ?? 0) === 1) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "생산 건 준비(원료 계획·CCP 기록지)가 끝나지 않았습니다 — 같은 내용으로 다시 생성하면 이어서 준비합니다." });
          // 예정 생산 건(오늘·미래로 만든 것)은 시작할 때 먼저 실행 단계를 한 번 (예정일 전이면 거부) — 현장 1
          const { ensureBatchActivated } = await import("../../services/batchOrchestrator");
          try { await ensureBatchActivated(input.id, ctx.tenantId, ctx.user.id); } catch (e: any) { throw new TRPCError({ code: "PRECONDITION_FAILED", message: e?.message ?? "예정 생산 건을 시작하지 못했습니다." }); }
        }

        await updateBatchStatus(input.id, input.status, ctx.tenantId);

        // === 파이프라인 자동화: 배치 시작 시 원료 자동 출고 ===
        let autoIssueResult = null;
        if (input.status === 'in_progress') {
          try {
            // 자동출고 공통 진입점 (배치 잠금·회사 확인·줄 단위 트랜잭션, 2026-10-17)
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

        // 손 안 댄 계획만 지운다 — 실행 흔적(출고·확인·결재·LOT)이 있으면 이력 보존 경로로 (2026-10-20, 생산계획 생애주기 검토 6)
        try {
          await deleteBatch(input.id, ctx.tenantId);
        } catch (e: any) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: e?.message ?? "생산 건을 지우지 못했습니다." });
        }

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
        let result: { deletedCount: number };
        try {
          result = await deleteBatchesByDate(input.plannedDate, ctx.tenantId);
        } catch (e: any) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: e?.message ?? "일괄 삭제하지 못했습니다." });
        }
        return { success: true, ...result, message: `${input.plannedDate} 배치 ${result.deletedCount}건 삭제 완료` };
      }),

// ═══════════════════════════════════════════════════════════════
// CCP 자동생성 및 HACCP 보고서
// ═══════════════════════════════════════════════════════════════

    /** 배치 번호 자동 생성 */

});
