// ccpForm 라우터 - routers.ts에서 분리됨
import { router, tenantRequiredProcedure, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const ccpFormRouter = router({

    /** 배치에 연결된 CCP 기록지 목록 조회 */
    getByBatch: tenantRequiredProcedure
      .input(z.object({ batchId: z.number(), includeRows: z.boolean().optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        if (input.includeRows) {
          const { getCcpFormRecordsWithRowsByBatch } = await import("../../db/haccp/ccpFormRecords");
          return getCcpFormRecordsWithRowsByBatch(input.batchId, tenantId);
        }
        const { getCcpFormRecordsByBatch } = await import("../../db/haccp/ccpFormRecords");
        return getCcpFormRecordsByBatch(input.batchId, tenantId);
      }),







    /** 배치 그룹(day_batch_group)에 속한 모든 배치의 CCP 기록지 조회 */
    getByBatchGroup: tenantRequiredProcedure
      .input(z.object({ batchId: z.number(), includeRows: z.boolean().optional() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getRawConnection } = await import("../../db");
        const pool = await getRawConnection();
        // 1) batchId로 day_batch_group 조회
        const [groupRows] = await pool.execute<any[]>(
          "SELECT day_batch_group FROM h_batches WHERE id=? AND tenant_id=?",
          [input.batchId, tenantId]
        );
        const dayBatchGroup = (groupRows as any[])[0]?.day_batch_group;
        if (!dayBatchGroup) {
          // 그룹이 없으면 단일 배치로 처리
          if (input.includeRows) {
            const { getCcpFormRecordsWithRowsByBatch } = await import("../../db/haccp/ccpFormRecords");
            return getCcpFormRecordsWithRowsByBatch(input.batchId, tenantId);
          }
          const { getCcpFormRecordsByBatch } = await import("../../db/haccp/ccpFormRecords");
          return getCcpFormRecordsByBatch(input.batchId, tenantId);
        }
        // 2) 같은 day_batch_group의 모든 배치 ID 조회
        const [batchRows] = await pool.execute<any[]>(
          "SELECT id FROM h_batches WHERE day_batch_group=? AND tenant_id=? ORDER BY batch_order, id",
          [dayBatchGroup, tenantId]
        );
        const batchIds = (batchRows as any[]).map((r: any) => r.id);
        // 3) 모든 배치의 CCP 기록지 조회 (CCP-4P 중복 제거)
        const allRecords: any[] = [];
        const seenRecordIds = new Set<number>();
        for (const bid of batchIds) {
          let records: any[] = [];
          if (input.includeRows) {
            const { getCcpFormRecordsWithRowsByBatch } = await import("../../db/haccp/ccpFormRecords");
            records = (await getCcpFormRecordsWithRowsByBatch(bid, tenantId)) || [];
          } else {
            const { getCcpFormRecordsByBatch } = await import("../../db/haccp/ccpFormRecords");
            records = (await getCcpFormRecordsByBatch(bid, tenantId)) || [];
          }
          // CCP-4P는 일일 통합이므로 동일 record.id가 여러 배치에서 중복 반환됨 → 중복 제거
          for (const rec of records) {
            const recId = rec.id;
            if (!seenRecordIds.has(recId)) {
              seenRecordIds.add(recId);
              allRecords.push(rec);
            }
          }
        }
        return allRecords;
      }),

    /** 작업일 기준 공식 기록지 목록 — Today "오늘 쓸 기록지" (2026-10-14, 0-1)
     *  정본은 h_ccp_form_records. 설비행 사본(h_ccp_instances) 이 아니라 기록지 상태로 미작성·제출·승인을 가른다. */
    listByWorkDate: tenantRequiredProcedure
      .input(z.object({ workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(async ({ input, ctx }) => {
        const { getRawConnection } = await import("../../db/connection");
        const conn = await getRawConnection();
        const [rows] = await conn.execute<any[]>(
          `SELECT f.id, f.ccp_type AS ccpType, f.status, f.batch_id AS batchId,
                  DATE_FORMAT(f.work_date, '%Y-%m-%d') AS workDate,
                  b.batch_code AS batchCode, p.product_name AS productName,
                  (SELECT COUNT(*) FROM h_ccp_form_rows r WHERE r.form_record_id = f.id AND r.tenant_id = f.tenant_id) AS rowCount,
                  (SELECT COUNT(*) FROM h_ccp_form_rows r WHERE r.form_record_id = f.id AND r.tenant_id = f.tenant_id AND r.is_deviation = 1) AS deviationCount
           FROM h_ccp_form_records f
           LEFT JOIN h_batches b ON b.id = f.batch_id AND b.tenant_id = f.tenant_id
           LEFT JOIN h_products_v2 p ON p.id = f.product_id AND p.tenant_id = f.tenant_id
           WHERE f.tenant_id = ? AND f.work_date = ? AND f.voided_at IS NULL
           ORDER BY (f.status = 'draft') DESC, f.ccp_type, f.id`,
          [ctx.tenantId, input.workDate],
        );
        return (rows as any[]).map((r) => ({
          id: Number(r.id),
          ccpType: String(r.ccpType),
          status: String(r.status) as "draft" | "submitted" | "approved" | "rejected",
          batchId: r.batchId != null ? Number(r.batchId) : null,
          workDate: r.workDate ?? null,
          batchCode: r.batchCode ?? null,
          productName: r.productName ?? null,
          rowCount: Number(r.rowCount ?? 0),
          deviationCount: Number(r.deviationCount ?? 0),
        }));
      }),

    /** CCP 기록지 단건 (행 포함) 조회 */
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCcpFormRecordById } = await import("../../db/haccp/ccpFormRecords");
        return getCcpFormRecordById(input.id, ctx.tenantId);
      }),

    /** CCP 기록지 생성 또는 기존 조회 */
    getOrCreate: workerProcedure
      .input(z.object({
        batchId: z.number(),
        ccpType: z.string(),
        workDate: z.string(),
        productId: z.number().optional(),
        productName: z.string().optional(),
        processGroupId: z.number().optional(),
        processGroupName: z.string().optional(),
        bomBatchKg: z.number().optional(),
        plannedQtyKg: z.number().optional(),
        clHeatTimeMinLo: z.number().optional(),
        clHeatTimeMinHi: z.number().optional(),
        clHeatTempLo: z.number().optional(),
        clPressureMpaLo: z.number().optional(),
        clProductTempLo: z.number().optional(),
        clMetalSensitivity: z.number().optional(),
        clFeMm: z.number().optional(),
        clSusMm: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getOrCreateCcpFormRecord } = await import("../../db/haccp/ccpFormRecords");
        return getOrCreateCcpFormRecord({
          tenantId: ctx.tenantId,
          siteId: (ctx.user.siteId ?? ctx.tenantId) as number,
          batchId: input.batchId,
          ccpType: input.ccpType,
          workDate: input.workDate,
          productId: input.productId,
          productName: input.productName,
          processGroupId: input.processGroupId,
          processGroupName: input.processGroupName,
          bomBatchKg: input.bomBatchKg,
          plannedQtyKg: input.plannedQtyKg,
          writerId: ctx.user.id,
          clHeatTimeMinLo: input.clHeatTimeMinLo,
          clHeatTimeMinHi: input.clHeatTimeMinHi,
          clHeatTempLo: input.clHeatTempLo,
          clPressureMpaLo: input.clPressureMpaLo,
          clProductTempLo: input.clProductTempLo,
          clMetalSensitivity: input.clMetalSensitivity,
          clFeMm: input.clFeMm,
          clSusMm: input.clSusMm,
        });
      }),

    /** CCP 기록지 헤더 업데이트 */
    updateRecord: workerProcedure
      .input(z.object({
        id: z.number(),
        equipGroupMode: z.enum(["concurrent", "sequential"]).optional(),
        equipIntervalMin: z.number().optional(),
        clHeatTimeMinLo: z.number().optional(),
        clHeatTimeMinHi: z.number().optional(),
        clHeatTempLo: z.number().optional(),
        clPressureMpaLo: z.number().optional(),
        clProductTempLo: z.number().optional(),
        clHeatTempHi: z.number().nullable().optional(),
        clPressureMpaHi: z.number().nullable().optional(),
        clMetalSensitivity: z.number().optional(),
        clFeMm: z.number().optional(),
        clSusMm: z.number().optional(),
        batchCount: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateCcpFormRecord } = await import("../../db/haccp/ccpFormRecords");
        const { id, ...rest } = input;
        // 숫자 판정 기준(CL)을 기존 기록지에 바꾸는 것은 명시적 저장 — 승인된 기록지는 거부, 바뀌면 기록지 버전을 올려
        //   기존 제출 확인을 무효로 하고(다시 제출 = 새 기준으로 재검증) 이력을 남긴다. 조회·인쇄에서 몰래 바꾸지 않는다 (2026-10-20 검토 3).
        await saveRecordCriteria(id, ctx.tenantId, ctx.user, rest as Record<string, unknown>);
        const updateData: Record<string, unknown> = {};
        if (rest.equipGroupMode !== undefined) updateData.equipGroupMode = rest.equipGroupMode;
        if (rest.equipIntervalMin !== undefined) updateData.equipIntervalMin = rest.equipIntervalMin;
        if (rest.batchCount !== undefined) updateData.batchCount = rest.batchCount;
        if (rest.clMetalSensitivity !== undefined) updateData.clMetalSensitivity = rest.clMetalSensitivity;
        if (rest.clFeMm !== undefined) updateData.clFeMm = rest.clFeMm.toString();
        if (rest.clSusMm !== undefined) updateData.clSusMm = rest.clSusMm.toString();
        if (Object.keys(updateData).length) await updateCcpFormRecord(id, updateData, ctx.tenantId);
        
        // batchCount가 변경되면 누락된 행만 추가 (사용자 데이터 보호)
        if (rest.batchCount !== undefined) {
          try {
            const { getRawConnection } = await import("../../db");
            const pool = await getRawConnection();
            const [frRows] = await pool.execute<any[]>(
              `SELECT batch_id FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`,
              [id, ctx.tenantId]
            );
            const bId = (frRows as any[])[0]?.batch_id;
            if (bId) {
              // batch_count 초과 빈 행만 삭제 (사용자 입력 보호)
              await pool.execute(
                `DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ? AND batch_seq > ? AND (result IS NULL OR result = '')`,
                [id, ctx.tenantId, rest.batchCount]
              );
              // 누락된 행 추가
              const { syncCcpRowsToFormRows } = await import("../../db/haccp/ccpFormRecords");
              await syncCcpRowsToFormRows({ batchId: bId, tenantId: ctx.tenantId });
            }
          } catch (resyncErr) {
            console.error("[updateRecord] batchCount 변경 후 재동기화 실패:", resyncErr);
          }
        }
        
        return { success: true };
      }),

    /** CCP 기록 행 저장 */
    /** CCP 기록지 행 재동기화 (누락된 행 추가, 사용자 데이터 보호) */
    resyncRows: workerProcedure
      .input(z.object({ batchId: z.number(), forceReset: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getRawConnection } = await import("../../db");
        const pool = await getRawConnection();
        const [frRows] = await pool.execute<any[]>(
          `SELECT id, ccp_type, batch_count FROM h_ccp_form_records WHERE batch_id = ? AND tenant_id = ?`,
          [input.batchId, tenantId]
        );
        
        // 사람 손이 닿은 기록지(승인·확인·저장·행 확인)는 지우지 않는다 (2026-10-20, #611 검토)
        const { isFormRecordProtected } = await import("../../db/haccp/ccpFormSettings");
        const editable: any[] = [];
        for (const fr of frRows as any[]) if (!(await isFormRecordProtected(pool, Number(fr.id), tenantId))) editable.push(fr);
        if (input.forceReset) {
          // 강제 리셋: 모든 행 삭제 후 재생성
          for (const fr of editable) {
            await pool.execute(
              `DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`,
              [fr.id, tenantId]
            );
          }
        } else {
          // 스마트 리셋: batch_count 초과 빈 행만 삭제
          for (const fr of editable) {
            if (fr.ccp_type !== 'CCP-4P') {
              const bc = fr.batch_count ? Number(fr.batch_count) : 1;
              await pool.execute(
                `DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ? AND batch_seq > ? AND (result IS NULL OR result = '')`,
                [fr.id, tenantId, bc]
              );
            }
          }
        }
        // 재동기화 (누락된 행만 추가)
        const { syncCcpRowsToFormRows } = await import("../../db/haccp/ccpFormRecords");
        const result = await syncCcpRowsToFormRows({ batchId: input.batchId, tenantId });
        return { success: true, synced: result.synced };
      }),

    saveRow: workerProcedure
      .input(z.object({
        formRecordId: z.number(),
        batchSeq: z.number().default(1),
        equipmentId: z.number().optional(),
        equipmentName: z.string().optional(),
        equipmentType: z.string().optional(),
        productName: z.string().optional(),
        measurementTime: z.string().optional(),
        inputQtyKg: z.number().optional(),
        result: z.enum(["적합", "부적합"]).optional(),
        heatTimeMin: z.number().optional(),
        heatTempC: z.number().optional(),
        siruName: z.string().optional(),
        pressureMpa: z.number().optional(),
        tempEdgeC: z.number().optional(),
        tempCenterC: z.number().optional(),
        metalPassTime: z.string().optional(),
        metalFeMid: z.string().optional(),
        metalSusMid: z.string().optional(),
        metalProductOnly: z.string().optional(),
        metalFeProduct: z.string().optional(),
        metalSusProduct: z.string().optional(),
        passTimeStart: z.string().optional(),
        passTimeEnd: z.string().optional(),
        passQty: z.number().optional(),
        detectedQty: z.number().optional(),
        specialNote: z.string().optional(),
        isDeviation: z.boolean().optional(),
        deviationNote: z.string().optional(),
        correctiveAction: z.string().optional(),
        actionBy: z.string().optional(),
        confirmedBy: z.string().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { upsertCcpFormRow, syncFormRowToCcpRow } = await import("../../db/haccp/ccpFormRecords");
        const data = {
          tenantId: ctx.tenantId,
          formRecordId: input.formRecordId,
          batchSeq: input.batchSeq,
          equipmentId: input.equipmentId,
          equipmentName: input.equipmentName,
          equipmentType: input.equipmentType,
          productName: input.productName,
          measurementTime: input.measurementTime,
          inputQtyKg: input.inputQtyKg?.toString(),
          result: input.result,
          heatTimeMin: input.heatTimeMin,
          heatTempC: input.heatTempC?.toString(),
          siruName: input.siruName,
          pressureMpa: input.pressureMpa?.toString(),
          tempEdgeC: input.tempEdgeC?.toString(),
          tempCenterC: input.tempCenterC?.toString(),
          metalPassTime: input.metalPassTime,
          metalFeMid: input.metalFeMid,
          metalSusMid: input.metalSusMid,
          metalProductOnly: input.metalProductOnly,
          metalFeProduct: input.metalFeProduct,
          metalSusProduct: input.metalSusProduct,
          passTimeStart: input.passTimeStart,
          passTimeEnd: input.passTimeEnd,
          passQty: input.passQty,
          detectedQty: input.detectedQty,
          specialNote: input.specialNote,
          isDeviation: input.isDeviation ? 1 : 0,
          deviationNote: input.deviationNote,
          correctiveAction: input.correctiveAction,
          actionBy: input.actionBy,
          confirmedBy: input.confirmedBy,
          note: input.note,
        };
        // 현장 확인 기록지면 저장·확인 무효·이력을 한 트랜잭션으로 (2026-10-20, #611 검토). 예전 기록지는 예전 저장 그대로
        const { saveFieldRowFromLegacy } = await import("../../services/fieldWork");
        const fieldRowId = await saveFieldRowFromLegacy({ tenantId: ctx.tenantId, userId: ctx.user.id, formRecordId: input.formRecordId, batchSeq: input.batchSeq, data: data as any,
          meta: { deviceId: (ctx.req?.headers?.["x-device-id"] as string) ?? null, sessionId: (ctx.req?.headers?.["x-session-id"] as string) ?? null } });
        let rowId: number;
        if (fieldRowId != null) {
          rowId = fieldRowId;
          await syncFormRowToCcpRow(data as any); // 점검 기록(h_ccp_rows) 동기화 — 예전 저장과 같은 보조 동기화
        } else {
          rowId = await upsertCcpFormRow(data as any);
        }
        return { success: true, rowId };
      }),

    /** 기록 행 삭제 */
    deleteRow: workerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteCcpFormRow } = await import("../../db/haccp/ccpFormRecords");
        await deleteCcpFormRow(input.id, ctx.tenantId);
        return { success: true };
      }),

    /** 기록지 일괄 삭제 (header + rows cascade) */
    bulkDelete: workerProcedure
      .input(z.object({ formRecordIds: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        const { deleteCcpFormRecords } = await import("../../db/haccp/ccpFormRecords");
        const result = await deleteCcpFormRecords(input.formRecordIds, ctx.tenantId);
        return {
          success: true,
          deletedCount: result.deletedCount,
          message: `${result.deletedCount}건의 CCP 기록지가 삭제되었습니다.`,
        };
      }),

    /** 기록지 제출 (승인 요청) */
    submit: workerProcedure
      .input(z.object({
        formRecordId: z.number(),
        batchNumber: z.string(),
        productName: z.string().optional(),
        ccpType: z.string(),
        // 작업일은 서버가 기록지에서 읽는다 — 화면이 보낸 값(문자열·Date)은 쓰지 않음 (Codex #590 R590-01: Date 를 보내 늘 입력 검증에서 막힘)
        workDate: z.union([z.string(), z.date()]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 제출 = 시트 확인 (2026-10-18): 사람이 누른 제출만 확인 이력. 막을 이유가 있으면 상태를 바꾸기 전에 거부.
        //   배치 생성 때 자동으로 submitted 가 된 기록지는 승인요청을 새로 만들지 않고 확인만 남긴다.
        const { checkSheet, confirmSheet } = await import("../../lib/haccp/ccpSheetConfirm");
        let pre = await checkSheet(input.formRecordId, ctx.tenantId);
        if (pre.problems.length) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `제출할 수 없습니다 — ${pre.problems.slice(0, 5).join(" / ")}${pre.problems.length > 5 ? ` 외 ${pre.problems.length - 5}건` : ""}` });
        }
        // 미래 날짜로 만든 예정 생산 건: 그날 첫 확인에서 실행 (진행 중·원료 출고·승인요청·기록지 제출 — 현장 1, CEO 결정)
        const { ensureActivatedForFormRecord } = await import("../../services/batchOrchestrator");
        try {
          if (await ensureActivatedForFormRecord(input.formRecordId, ctx.tenantId, ctx.user.id)) pre = await checkSheet(input.formRecordId, ctx.tenantId);
        } catch (e: any) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: e?.message ?? "예정 생산 건을 시작하지 못했습니다." });
        }
        // 확인(검사·저장 한 트랜잭션)을 먼저 — 충돌·거부면 상태·결재 요청을 바꾸지 않는다 (#611 추가 검토)
        try {
          await confirmSheet(input.formRecordId, ctx.tenantId, ctx.user.id);
        } catch (e: any) {
          throw new TRPCError({ code: e?.name === "SheetConfirmConflictError" ? "CONFLICT" : "PRECONDITION_FAILED", message: e?.message ?? "제출할 수 없습니다." });
        }
        if (pre.record.status === "submitted") {
          return { success: true, approvalRequestId: null, confirmedOnly: true };
        }
        const { submitCcpFormRecord } = await import("../../db/haccp/ccpFormRecords");
        const approvalId = await submitCcpFormRecord({
          formRecordId: input.formRecordId,
          tenantId: ctx.tenantId,
          siteId: (ctx.user.siteId ?? ctx.tenantId) as number,
          writerId: ctx.user.id,
          batchNumber: input.batchNumber,
          productName: input.productName ?? "",
          ccpType: input.ccpType,
          workDate: pre.record.workDate,
        });
        return { success: true, approvalRequestId: approvalId, confirmedOnly: false };
      }),

    /** 설비 배치 간격 설정 저장 */
    saveEquipSettings: workerProcedure
      .input(z.object({
        processGroupId: z.number(),
        groupMode: z.enum(["concurrent", "sequential", "grouped"]),
        intervalBetweenMin: z.number().optional(),
        /** 묶음 크기(동시 가동 대수) — ccp_process_groups.equip_batch_size */
        maxConcurrent: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { upsertCcpEquipBatchSettings } = await import("../../db/haccp/ccpFormRecords");
        const id = await upsertCcpEquipBatchSettings({
          tenantId: ctx.tenantId,
          processGroupId: input.processGroupId,
          groupMode: input.groupMode,
          intervalBetweenMin: input.intervalBetweenMin,
          maxConcurrent: input.maxConcurrent,
          notes: input.notes,
        });
        return { success: true, id };
      }),

    /** 설비 배치 간격 설정 조회 */
    getEquipSettings: tenantRequiredProcedure
      .input(z.object({ processGroupId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCcpEquipBatchSettings } = await import("../../db/haccp/ccpFormRecords");
        return getCcpEquipBatchSettings(ctx.tenantId, input.processGroupId);
      }),
    /** BOM 배치 목표량 조회 (배치수 자동계산용) */
    getBomBatchKg: tenantRequiredProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getRawConnection } = await import("../../db");
        let conn: any = null;
        try {
          conn = await getRawConnection();
          // h_mf_report_versions -> h_mf_reports -> product_id 조인 (v2 단일 소스)
          // v1 h_recipe_headers 폴백은 제거 — 같은 product_id 가 v1/v2 에서 다른 제품을 가리켜
          // 엉뚱한 배치 목표량이 나올 수 있었음.
          const [rows] = await conn.execute(
            `SELECT rv.batch_target_kg
             FROM h_mf_report_versions rv
             JOIN h_mf_reports mr ON rv.mf_report_id = mr.id
             WHERE mr.product_id = ? AND mr.tenant_id = ?
             ORDER BY rv.id DESC LIMIT 1`,
            [input.productId, ctx.tenantId]
          );
          const bomBatchKg = (rows as any[])[0]?.batch_target_kg;
          return { bomBatchKg: bomBatchKg ? parseFloat(bomBatchKg) : null };
        } catch (e: any) {
          console.error("[getBomBatchKg] error:", e.message);
          return { bomBatchKg: null };
        }
        // ※ getRawConnection()은 Pool 싱글턴 - end() 호출 금지
      }),
    /** 배치에 연결된 설비 목록 조회 (CCP 기록지 설비 자동할당용) */
    getEquipmentForBatch: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getRawConnection } = await import("../../db");
        const conn: any = await getRawConnection();
        // 이 회사의 생산 건인지 먼저 (2026-10-20, #611 추가 검토 6) — 다른 회사 번호는 아무것도 보여 주지 않는다
        const [[own]]: any = await conn.execute(`SELECT id FROM h_batches WHERE id = ? AND tenant_id = ?`, [input.batchId, ctx.tenantId]);
        if (!own) throw new TRPCError({ code: "NOT_FOUND", message: "생산 건을 찾을 수 없습니다." });
        // CCP 인스턴스에서 공정그룹 확인 후 설비 목록 조회 — 인스턴스·공정 모두 회사 조건 (이전: 첫 조회에 회사 조건이 없고 인자 개수가 달라 조회 오류를 [] 로 감췄다)
        const [instRows] = await conn.execute(
          `SELECT DISTINCT ci.process_group_id, pg.name as group_name, ci.ccp_type
           FROM h_ccp_instances ci
           LEFT JOIN ccp_process_groups pg ON pg.id = ci.process_group_id AND pg.tenant_id = ci.tenant_id
           WHERE ci.batch_id = ? AND ci.tenant_id = ?`,
          [input.batchId, ctx.tenantId]
        );
        const result = [];
        for (const inst of instRows as any[]) {
          if (!inst.process_group_id) continue;
          const [equipRows] = await conn.execute(
            `SELECT eq.id as id, eq.name as equipment_name, eq.type as equipment_type,
                    NULL as equipment_code, pge.sort_order,
                    eq.default_temperature, eq.default_pressure,
                    eq.batch_operation_time, eq.default_time
             FROM ccp_process_group_equipments pge
             JOIN equipments eq ON pge.equipment_id = eq.id
             WHERE pge.process_group_id = ? AND pge.tenant_id = ? AND pge.tenant_id = eq.tenant_id
               AND eq.status = 'active'
             ORDER BY pge.sort_order ASC`,
            [inst.process_group_id, ctx.tenantId]
          );
          result.push({
            processGroupId: inst.process_group_id,
            processGroupName: inst.group_name,
            ccpType: inst.ccp_type,
            equipment: equipRows,
          });
        }
        return result;
        // ※ getRawConnection()은 Pool 싱글턴 - end() 호출 금지
      }),

    /** CCP form rows 재동기화 (빈 행이 있는 배치에 대해 sync 재실행) */
    resyncFormRows: workerProcedure
      .input(z.object({ batchId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { syncCcpRowsToFormRows } = await import("../../db/haccp/ccpFormRecords");
        const tenantId = ctx.tenantId;

        if (input.batchId) {
          // 특정 배치만 재동기화
          const result = await syncCcpRowsToFormRows({ batchId: input.batchId, tenantId });
          return { success: true, synced: result.synced, batches: [input.batchId] };
        }

        // 빈 form rows가 있는 모든 배치를 찾아서 재동기화
        const { getRawConnection } = await import("../../db");
        const conn = await getRawConnection();
        const [emptyRecords] = await conn.execute<any[]>(
          `SELECT DISTINCT fr.batch_id
           FROM h_ccp_form_records fr
           LEFT JOIN h_ccp_form_rows cfr ON cfr.form_record_id = fr.id
           WHERE fr.tenant_id = ? AND cfr.id IS NULL
           ORDER BY fr.batch_id`,
          [tenantId]
        );

        let totalSynced = 0;
        const syncedBatches: number[] = [];
        for (const rec of emptyRecords as any[]) {
          try {
            const result = await syncCcpRowsToFormRows({ batchId: rec.batch_id, tenantId });
            totalSynced += result.synced;
            if (result.synced > 0) syncedBatches.push(rec.batch_id);
          } catch (e) {
            console.error(`[resyncFormRows] batch ${rec.batch_id} sync failed:`, e);
          }
        }

        return {
          success: true,
          synced: totalSynced,
          batches: syncedBatches,
          emptyBatchCount: (emptyRecords as any[]).length,
        };
      }),
});

/** 기록지 숫자 판정 기준 칸 — updateRecord 입력 키 → 칸 */
const RECORD_CRITERIA_COLS: Record<string, string> = {
  clHeatTimeMinLo: "cl_heat_time_min_lo", clHeatTimeMinHi: "cl_heat_time_min_hi", clHeatTempLo: "cl_heat_temp_lo", clHeatTempHi: "cl_heat_temp_hi",
  clPressureMpaLo: "cl_pressure_mpa_lo", clPressureMpaHi: "cl_pressure_mpa_hi", clProductTempLo: "cl_product_temp_lo",
};

/**
 * 기존 기록지의 판정 기준 바꾸기 — 한 트랜잭션: 기록지 잠금 → 승인이면 거부 → 바뀐 칸만 저장 + 기록지 버전 올림(제출 확인 무효) → 이력.
 *   바뀐 것이 없으면 아무것도 하지 않는다.
 */
async function saveRecordCriteria(formRecordId: number, tenantId: number, user: any, input: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(RECORD_CRITERIA_COLS).filter((k) => input[k] !== undefined);
  if (!keys.length) return;
  const { getRawConnection } = await import("../../db");
  const { bumpSheetVersion } = await import("../../lib/haccp/ccpSheetConfirm");
  const pool: any = await getRawConnection();
  const c = await pool.getConnection();
  const changed: Record<string, [unknown, unknown]> = {};
  try {
    await c.beginTransaction();
    try {
      const cols = keys.map((k) => RECORD_CRITERIA_COLS[k]);
      const [[rec]]: any = await c.execute(`SELECT status, ${cols.join(", ")} FROM h_ccp_form_records WHERE id = ? AND tenant_id = ? FOR UPDATE`, [formRecordId, tenantId]);
      if (!rec) throw new TRPCError({ code: "NOT_FOUND", message: "기록지를 찾을 수 없습니다." });
      if (rec.status === "approved") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "승인된 기록지의 판정 기준은 바꿀 수 없습니다 — 반려 후 수정하세요." });
      const num = (v: unknown) => (v == null ? null : Number(v));
      for (const k of keys) {
        const before = num(rec[RECORD_CRITERIA_COLS[k]]);
        const after = num(input[k]);
        if (before !== after) changed[RECORD_CRITERIA_COLS[k]] = [before, after];
      }
      const set = Object.keys(changed);
      if (set.length) {
        await c.execute(`UPDATE h_ccp_form_records SET ${set.map((col) => `${col} = ?`).join(", ")}, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
          [...set.map((col) => changed[col][1]), formRecordId, tenantId]);
        await bumpSheetVersion(c, formRecordId, tenantId);
      }
      await c.commit();
    } catch (e) {
      try { await c.rollback(); } catch { /* 원래 오류 */ }
      throw e;
    }
  } finally {
    c.release();
  }
  if (Object.keys(changed).length) {
    try {
      const { createAuditLog } = await import("../../db");
      await createAuditLog({ action: "ccp_form.criteria_change", entityType: "ccp_form_record", entityId: formRecordId, userId: user?.id, userEmail: user?.email ?? "", userRole: user?.role ?? "",
        description: "CCP 기록지 판정 기준 변경 (기존 제출 확인 무효 — 다시 제출해야 승인)", changes: changed } as any, tenantId);
    } catch { /* 감사 기록 실패는 기존 방식대로 무시 */ }
  }
}
