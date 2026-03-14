/**
 * Metal Detection Record Frame API Router
 * Batch → SKU → Time/Qty Allocation → Sensitivity Checks → Deviation Actions
 */
import { router, tenantRequiredProcedure, workerProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

function getEffectiveTenantId(ctx: any): number {
  const tenantId = ctx.tenantId ?? ctx.user?.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 정보가 필요합니다." });
  }
  return tenantId;
}

export const metalDetectionRouter = router({
  /** Generate metal detection record frame for a batch */
  generateFrame: workerProcedure
    .input(z.object({
      batchId: z.number(),
      workDate: z.string(),
      processGroupId: z.number().optional(),
      equipmentId: z.number().optional(),
      mode: z.enum(["SEQUENTIAL", "PARALLEL"]).optional(),
      channels: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { generateMetalRecordFrame } = await import("../services/metalPassAllocator");
      const { getRawConnection } = await import("../db");
      const conn = await getRawConnection();
      const tenantId = getEffectiveTenantId(ctx);

      // Fetch batches for the day with SKU data
      const [batchRows] = await conn.execute<any[]>(
        `SELECT b.id as batch_id, b.product_id, b.planned_quantity,
                p.product_name,
                pso.sku_id, ps.sku_name, COALESCE(pso.quantity, 0) as sku_quantity,
                COALESCE(pso.total_kg, b.planned_quantity) as sku_kg
         FROM h_batches b
         LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
         LEFT JOIN production_sku_output pso ON pso.batch_id = b.id AND pso.tenant_id = b.tenant_id
         LEFT JOIN product_skus ps ON ps.id = pso.sku_id AND ps.tenant_id = b.tenant_id
         WHERE b.tenant_id = ? AND b.planned_date = ?
         ORDER BY b.product_id, ps.sku_code, b.id`,
        [tenantId, input.workDate],
      );

      // Group by batch
      const batchMap = new Map<number, {
        batchId: number; productId: number; productName: string;
        skuOutputs: Array<{ skuId: number; skuName?: string; plannedQty: number }>;
      }>();
      for (const r of batchRows as any[]) {
        if (!batchMap.has(r.batch_id)) {
          batchMap.set(r.batch_id, {
            batchId: r.batch_id,
            productId: r.product_id,
            productName: r.product_name || "",
            skuOutputs: [],
          });
        }
        if (r.sku_id) {
          batchMap.get(r.batch_id)!.skuOutputs.push({
            skuId: r.sku_id,
            skuName: r.sku_name || "",
            plannedQty: parseFloat(r.sku_kg) || parseFloat(r.planned_quantity) || 0,
          });
        } else if (batchMap.get(r.batch_id)!.skuOutputs.length === 0) {
          batchMap.get(r.batch_id)!.skuOutputs.push({
            skuId: 0,
            skuName: r.product_name || "",
            plannedQty: parseFloat(r.planned_quantity) || 0,
          });
        }
      }

      const result = await generateMetalRecordFrame({
        tenantId,
        siteId: (ctx.user.siteId ?? ctx.tenantId) as number,
        batchId: input.batchId,
        workDate: input.workDate,
        processGroupId: input.processGroupId,
        equipmentId: input.equipmentId,
        mode: input.mode,
        channels: input.channels,
        batches: Array.from(batchMap.values()),
        policy: { metalAllocation: "PROPORTIONAL", passOrder: "INPUT_ORDER" },
      });

      return result;
    }),

  /** Get batch process run with SKU slots and sensitivity checks */
  getBatchProcessRun: tenantRequiredProcedure
    .input(z.object({
      batchId: z.number().optional(),
      workDate: z.string().optional(),
      runId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../db");
      const conn = await getRawConnection();
      const tenantId = getEffectiveTenantId(ctx);

      let runWhere = "r.tenant_id = ?";
      const params: any[] = [tenantId];

      if (input.runId) {
        runWhere += " AND r.id = ?";
        params.push(input.runId);
      } else {
        if (input.batchId) {
          runWhere += " AND r.batch_id = ?";
          params.push(input.batchId);
        }
        if (input.workDate) {
          runWhere += " AND r.work_date = ?";
          params.push(input.workDate);
        }
      }

      const [runs] = await conn.execute<any[]>(
        `SELECT r.* FROM h_ccp_batch_process_runs r WHERE ${runWhere} ORDER BY r.id DESC LIMIT 10`,
        params,
      );

      const result = [];
      for (const run of runs as any[]) {
        const [slots] = await conn.execute<any[]>(
          `SELECT * FROM h_ccp_metal_sku_slots WHERE batch_process_run_id = ? AND tenant_id = ? ORDER BY sequence_no`,
          [run.id, tenantId],
        );
        const [checks] = await conn.execute<any[]>(
          `SELECT * FROM h_ccp_metal_sensitivity_checks WHERE batch_process_run_id = ? AND tenant_id = ? ORDER BY check_seq`,
          [run.id, tenantId],
        );
        const [deviations] = await conn.execute<any[]>(
          `SELECT * FROM h_ccp_deviation_actions WHERE batch_process_run_id = ? AND tenant_id = ? ORDER BY id`,
          [run.id, tenantId],
        );
        result.push({
          ...run,
          skuSlots: slots,
          sensitivityChecks: checks,
          deviationActions: deviations,
        });
      }

      return result;
    }),

  /** Update sensitivity check result */
  updateSensitivityCheck: workerProcedure
    .input(z.object({
      checkId: z.number(),
      feResult: z.string().optional(),
      susResult: z.string().optional(),
      productOnlyResult: z.string().optional(),
      feProductResult: z.string().optional(),
      susProductResult: z.string().optional(),
      result: z.enum(["PASS", "FAIL"]),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../db");
      const { handleSensitivityFail } = await import("../services/metalPassAllocator");
      const conn = await getRawConnection();
      const tenantId = getEffectiveTenantId(ctx);

      await conn.execute(
        `UPDATE h_ccp_metal_sensitivity_checks SET
           fe_result = ?, sus_result = ?, product_only_result = ?,
           fe_product_result = ?, sus_product_result = ?,
           result = ?, note = ?, checked_at = NOW(), checked_by = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          input.feResult || null, input.susResult || null, input.productOnlyResult || null,
          input.feProductResult || null, input.susProductResult || null,
          input.result, input.note || null, ctx.user.id,
          input.checkId, tenantId,
        ],
      );

      // If FAIL, handle deviation automatically
      if (input.result === "FAIL") {
        const [checkRows] = await conn.execute<any[]>(
          `SELECT batch_process_run_id, sku_slot_id FROM h_ccp_metal_sensitivity_checks WHERE id = ? AND tenant_id = ?`,
          [input.checkId, tenantId],
        );
        if ((checkRows as any[]).length > 0) {
          const check = (checkRows as any[])[0];
          const devResult = await handleSensitivityFail({
            tenantId,
            sensitivityCheckId: input.checkId,
            batchProcessRunId: check.batch_process_run_id,
            skuSlotId: check.sku_slot_id || undefined,
            description: input.note || "감도 점검 실패 - 자동 이탈 처리",
            userId: ctx.user.id,
          });
          return {
            success: true,
            deviation: true,
            deviationActionId: devResult.deviationActionId,
            actionChecklist: devResult.actionChecklist,
          };
        }
      }

      return { success: true, deviation: false };
    }),

  /** Update SKU slot actual values */
  updateSkuSlot: workerProcedure
    .input(z.object({
      slotId: z.number(),
      actualFirstPassAt: z.string().optional(),
      actualLastPassAt: z.string().optional(),
      actualPassQty: z.number().optional(),
      detectQty: z.number().optional(),
      note: z.string().optional(),
      status: z.enum(["PLANNED", "RUNNING", "DONE", "FAIL"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../db");
      const conn = await getRawConnection();
      const tenantId = getEffectiveTenantId(ctx);

      const setClauses: string[] = [];
      const values: any[] = [];

      if (input.actualFirstPassAt !== undefined) { setClauses.push("actual_first_pass_at = ?"); values.push(input.actualFirstPassAt); }
      if (input.actualLastPassAt !== undefined) { setClauses.push("actual_last_pass_at = ?"); values.push(input.actualLastPassAt); }
      if (input.actualPassQty !== undefined) { setClauses.push("actual_pass_qty = ?"); values.push(input.actualPassQty); }
      if (input.detectQty !== undefined) { setClauses.push("detect_qty = ?"); values.push(input.detectQty); }
      if (input.note !== undefined) { setClauses.push("note = ?"); values.push(input.note); }
      if (input.status !== undefined) { setClauses.push("status = ?"); values.push(input.status); }

      if (setClauses.length > 0) {
        values.push(input.slotId, tenantId);
        await conn.execute(
          `UPDATE h_ccp_metal_sku_slots SET ${setClauses.join(", ")} WHERE id = ? AND tenant_id = ?`,
          values,
        );
      }

      // If detect_qty > 0, automatically create deviation action and HOLD run
      if (input.detectQty && input.detectQty > 0) {
        const [slotRows] = await conn.execute<any[]>(
          `SELECT batch_process_run_id, product_name, sku_name FROM h_ccp_metal_sku_slots WHERE id = ? AND tenant_id = ?`,
          [input.slotId, tenantId],
        );
        if ((slotRows as any[]).length > 0) {
          const sl = (slotRows as any[])[0];
          await conn.execute(
            `UPDATE h_ccp_batch_process_runs SET status = 'HOLD' WHERE id = ? AND tenant_id = ?`,
            [sl.batch_process_run_id, tenantId],
          );
          await conn.execute(
            `INSERT INTO h_ccp_deviation_actions
               (tenant_id, batch_process_run_id, sku_slot_id,
                deviation_type, deviation_description,
                hold_start_at, status, created_by)
             VALUES (?, ?, ?,
                'METAL_DETECT', ?,
                NOW(), 'OPEN', ?)`,
            [
              tenantId, sl.batch_process_run_id, input.slotId,
              `금속 검출: ${sl.product_name || sl.sku_name} - ${input.detectQty}개 검출`,
              ctx.user.id,
            ],
          );
        }
      }

      return { success: true };
    }),

  /** Resolve deviation action with approver signature */
  resolveDeviation: workerProcedure
    .input(z.object({
      deviationActionId: z.number(),
      actionTaken: z.string(),
      disposedQty: z.number().optional(),
      recheckResult: z.enum(["PASS", "FAIL"]).optional(),
      resolutionNote: z.string().optional(),
      approverSignature: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { resolveDeviation } = await import("../services/metalPassAllocator");
      return resolveDeviation({
        tenantId: getEffectiveTenantId(ctx),
        deviationActionId: input.deviationActionId,
        approverId: ctx.user.id,
        actionTaken: input.actionTaken,
        disposedQty: input.disposedQty,
        recheckResult: input.recheckResult,
        resolutionNote: input.resolutionNote,
        approverSignature: input.approverSignature,
      });
    }),

  /** Get deviation actions for a batch run */
  getDeviationActions: tenantRequiredProcedure
    .input(z.object({
      batchProcessRunId: z.number().optional(),
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../db");
      const conn = await getRawConnection();
      const tenantId = getEffectiveTenantId(ctx);

      let where = "da.tenant_id = ?";
      const params: any[] = [tenantId];

      if (input.batchProcessRunId) {
        where += " AND da.batch_process_run_id = ?";
        params.push(input.batchProcessRunId);
      }
      if (input.status) {
        where += " AND da.status = ?";
        params.push(input.status);
      }

      params.push(input.limit);

      const [rows] = await conn.execute<any[]>(
        `SELECT da.*, r.batch_id, r.work_date, r.equipment_id,
                s.product_name, s.sku_name
         FROM h_ccp_deviation_actions da
         LEFT JOIN h_ccp_batch_process_runs r ON da.batch_process_run_id = r.id
         LEFT JOIN h_ccp_metal_sku_slots s ON da.sku_slot_id = s.id
         WHERE ${where}
         ORDER BY da.created_at DESC
         LIMIT ?`,
        params,
      );

      return rows;
    }),

  /** Get metal detection summary for a date range */
  getSummary: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const { getRawConnection } = await import("../db");
      const conn = await getRawConnection();
      const tenantId = getEffectiveTenantId(ctx);

      const [runs] = await conn.execute<any[]>(
        `SELECT r.id, r.batch_id, r.work_date, r.mode, r.status,
                r.planned_total_qty, r.random_offset_min,
                r.planned_start_at, r.planned_end_at,
                b.batch_code, p.product_name,
                (SELECT COUNT(*) FROM h_ccp_metal_sku_slots s WHERE s.batch_process_run_id = r.id) as slot_count,
                (SELECT COUNT(*) FROM h_ccp_metal_sensitivity_checks c WHERE c.batch_process_run_id = r.id) as check_count,
                (SELECT COUNT(*) FROM h_ccp_metal_sensitivity_checks c WHERE c.batch_process_run_id = r.id AND c.result = 'FAIL') as fail_count,
                (SELECT COUNT(*) FROM h_ccp_deviation_actions d WHERE d.batch_process_run_id = r.id AND d.status = 'OPEN') as open_deviations
         FROM h_ccp_batch_process_runs r
         LEFT JOIN h_batches b ON r.batch_id = b.id AND r.tenant_id = b.tenant_id
         LEFT JOIN h_products_v2 p ON b.product_id = p.id AND b.tenant_id = p.tenant_id
         WHERE r.tenant_id = ? AND r.work_date BETWEEN ? AND ?
         ORDER BY r.work_date DESC, r.id DESC`,
        [tenantId, input.startDate, input.endDate],
      );

      return runs;
    }),
});
