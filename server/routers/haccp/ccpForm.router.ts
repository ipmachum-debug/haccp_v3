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
        clMetalSensitivity: z.number().optional(),
        clFeMm: z.number().optional(),
        clSusMm: z.number().optional(),
        batchCount: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateCcpFormRecord } = await import("../../db/haccp/ccpFormRecords");
        const { id, ...rest } = input;
        const updateData: Record<string, unknown> = {};
        if (rest.equipGroupMode !== undefined) updateData.equipGroupMode = rest.equipGroupMode;
        if (rest.equipIntervalMin !== undefined) updateData.equipIntervalMin = rest.equipIntervalMin;
        if (rest.batchCount !== undefined) updateData.batchCount = rest.batchCount;
        if (rest.clHeatTimeMinLo !== undefined) updateData.clHeatTimeMinLo = rest.clHeatTimeMinLo;
        if (rest.clHeatTimeMinHi !== undefined) updateData.clHeatTimeMinHi = rest.clHeatTimeMinHi;
        if (rest.clHeatTempLo !== undefined) updateData.clHeatTempLo = rest.clHeatTempLo.toString();
        if (rest.clPressureMpaLo !== undefined) updateData.clPressureMpaLo = rest.clPressureMpaLo.toString();
        if (rest.clProductTempLo !== undefined) updateData.clProductTempLo = rest.clProductTempLo.toString();
        if (rest.clMetalSensitivity !== undefined) updateData.clMetalSensitivity = rest.clMetalSensitivity;
        if (rest.clFeMm !== undefined) updateData.clFeMm = rest.clFeMm.toString();
        if (rest.clSusMm !== undefined) updateData.clSusMm = rest.clSusMm.toString();
        await updateCcpFormRecord(id, updateData, ctx.tenantId);
        
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
        
        if (input.forceReset) {
          // 강제 리셋: 모든 행 삭제 후 재생성
          for (const fr of frRows as any[]) {
            await pool.execute(
              `DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`,
              [fr.id, tenantId]
            );
          }
        } else {
          // 스마트 리셋: batch_count 초과 빈 행만 삭제
          for (const fr of frRows as any[]) {
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
        const { upsertCcpFormRow } = await import("../../db/haccp/ccpFormRecords");
        const rowId = await upsertCcpFormRow({
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
        });
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
        workDate: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { submitCcpFormRecord } = await import("../../db/haccp/ccpFormRecords");
        const approvalId = await submitCcpFormRecord({
          formRecordId: input.formRecordId,
          tenantId: ctx.tenantId,
          siteId: (ctx.user.siteId ?? ctx.tenantId) as number,
          writerId: ctx.user.id,
          batchNumber: input.batchNumber,
          productName: input.productName ?? "",
          ccpType: input.ccpType,
          workDate: input.workDate,
        });
        return { success: true, approvalRequestId: approvalId };
      }),

    /** 설비 배치 간격 설정 저장 */
    saveEquipSettings: workerProcedure
      .input(z.object({
        processGroupId: z.number(),
        groupMode: z.enum(["concurrent", "sequential"]),
        intervalBetweenMin: z.number().optional(),
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
          // h_mf_report_versions -> h_mf_reports -> product_id 조인
          const [rows] = await conn.execute(
            `SELECT rv.batch_target_kg
             FROM h_mf_report_versions rv
             JOIN h_mf_reports mr ON rv.mf_report_id = mr.id
             WHERE mr.product_id = ?
             ORDER BY rv.id DESC LIMIT 1`,
            [input.productId]
          );
          const bomBatchKg = (rows as any[])[0]?.batch_target_kg;
          // fallback: h_recipe_headers
          if (!bomBatchKg) {
            const [rows2] = await conn.execute(
              `SELECT target_quantity FROM h_recipe_headers WHERE product_id = ? AND unit != '%' ORDER BY id DESC LIMIT 1`,
              [input.productId]
            );
            const fallback = (rows2 as any[])[0]?.target_quantity;
            return { bomBatchKg: fallback ? parseFloat(fallback) : null };
          }
          return { bomBatchKg: parseFloat(bomBatchKg) };
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
        let conn: any = null;
        try {
          conn = await getRawConnection();
          // CCP 인스턴스에서 공정그룹 확인 후 설비 목록 조회
          const [instRows] = await conn.execute(
            `SELECT DISTINCT ci.process_group_id, pg.name as group_name, ci.ccp_type
             FROM h_ccp_instances ci
             LEFT JOIN ccp_process_groups pg ON ci.process_group_id = pg.id
             WHERE ci.batch_id = ?`,
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
        } catch (e: any) {
          console.error("[getEquipmentForBatch] error:", e.message);
          return [];
        }
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
