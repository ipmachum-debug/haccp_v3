import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";

export const yearlyLogsRouter = router({
  // 연간일지 작성
  create: protectedProcedure
    .input(z.object({
      tenant_id: z.number(),
      inspection_date: z.string(),
      inspector: z.string(),
      calibration_freezer_panel_thermometer: z.string().optional(),
      calibration_refrigerator: z.string().optional(),
      calibration_timer: z.string().optional(),
      calibration_probe_thermometer: z.string().optional(),
      calibration_scale: z.string().optional(),
      calibration_oven: z.string().optional(),
      calibration_metal_detector: z.string().optional(),
      calibration_hygrothermograph: z.string().optional(),
      calibration_radiation_thermometer1: z.string().optional(),
      calibration_radiation_thermometer2: z.string().optional(),
      calibration_oven_work_thermometer: z.string().optional(),
      metal_detector_check_date: z.string().optional(),
      metal_detector_next_check: z.string().optional(),
      periodic_verification_date: z.string().optional(),
      periodic_verification_next: z.string().optional(),
      special_notes: z.string().optional(),
      improvement_action: z.string().optional(),
      action_taker: z.string().optional(),
      confirmation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      const result = await (db as any).execute(
        `INSERT INTO yearly_logs 
        (tenant_id, inspection_date, inspector, 
         calibration_freezer_panel_thermometer, calibration_refrigerator, calibration_timer,
         calibration_probe_thermometer, calibration_scale, calibration_oven,
         calibration_metal_detector, calibration_hygrothermograph, calibration_radiation_thermometer1,
         calibration_radiation_thermometer2, calibration_oven_work_thermometer,
         metal_detector_check_date, metal_detector_next_check,
         periodic_verification_date, periodic_verification_next,
         special_notes, improvement_action, action_taker, confirmation, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '작성중')`,
        [
          input.tenant_id, input.inspection_date, input.inspector,
          input.calibration_freezer_panel_thermometer || null, input.calibration_refrigerator || null, input.calibration_timer || null,
          input.calibration_probe_thermometer || null, input.calibration_scale || null, input.calibration_oven || null,
          input.calibration_metal_detector || null, input.calibration_hygrothermograph || null, input.calibration_radiation_thermometer1 || null,
          input.calibration_radiation_thermometer2 || null, input.calibration_oven_work_thermometer || null,
          input.metal_detector_check_date || null, input.metal_detector_next_check || null,
          input.periodic_verification_date || null, input.periodic_verification_next || null,
          input.special_notes || null, input.improvement_action || null, input.action_taker || null, input.confirmation || null
        ]
      );
      
      return { success: true, id: result.insertId };
    }),

  // 연간일지 조회
  get: protectedProcedure
    .input(z.object({
      tenant_id: z.number(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      
      let query = "SELECT * FROM yearly_logs WHERE tenant_id = ?";
      const params: any[] = [input.tenant_id];
      
      if (input.start_date && input.end_date) {
        query += " AND inspection_date BETWEEN ? AND ?";
        params.push(input.start_date, input.end_date);
      }
      
      if (input.status && input.status !== "전체") {
        query += " AND status = ?";
        params.push(input.status);
      }
      
      query += " ORDER BY inspection_date DESC";
      
      const logs = await (db as any).execute(query, params);
      return { success: true, logs };
    }),

  // 연간일지 수정
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      inspection_date: z.string().optional(),
      inspector: z.string().optional(),
      calibration_freezer_panel_thermometer: z.string().optional(),
      calibration_refrigerator: z.string().optional(),
      calibration_timer: z.string().optional(),
      calibration_probe_thermometer: z.string().optional(),
      calibration_scale: z.string().optional(),
      calibration_oven: z.string().optional(),
      calibration_metal_detector: z.string().optional(),
      calibration_hygrothermograph: z.string().optional(),
      calibration_radiation_thermometer1: z.string().optional(),
      calibration_radiation_thermometer2: z.string().optional(),
      calibration_oven_work_thermometer: z.string().optional(),
      metal_detector_check_date: z.string().optional(),
      metal_detector_next_check: z.string().optional(),
      periodic_verification_date: z.string().optional(),
      periodic_verification_next: z.string().optional(),
      special_notes: z.string().optional(),
      improvement_action: z.string().optional(),
      action_taker: z.string().optional(),
      confirmation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `UPDATE yearly_logs SET
          inspection_date = COALESCE(?, inspection_date),
          inspector = COALESCE(?, inspector),
          calibration_freezer_panel_thermometer = ?,
          calibration_refrigerator = ?,
          calibration_timer = ?,
          calibration_probe_thermometer = ?,
          calibration_scale = ?,
          calibration_oven = ?,
          calibration_metal_detector = ?,
          calibration_hygrothermograph = ?,
          calibration_radiation_thermometer1 = ?,
          calibration_radiation_thermometer2 = ?,
          calibration_oven_work_thermometer = ?,
          metal_detector_check_date = ?,
          metal_detector_next_check = ?,
          periodic_verification_date = ?,
          periodic_verification_next = ?,
          special_notes = ?,
          improvement_action = ?,
          action_taker = ?,
          confirmation = ?
        WHERE id = ?`,
        [
          input.inspection_date, input.inspector,
          input.calibration_freezer_panel_thermometer, input.calibration_refrigerator, input.calibration_timer,
          input.calibration_probe_thermometer, input.calibration_scale, input.calibration_oven,
          input.calibration_metal_detector, input.calibration_hygrothermograph, input.calibration_radiation_thermometer1,
          input.calibration_radiation_thermometer2, input.calibration_oven_work_thermometer,
          input.metal_detector_check_date, input.metal_detector_next_check,
          input.periodic_verification_date, input.periodic_verification_next,
          input.special_notes, input.improvement_action, input.action_taker, input.confirmation,
          input.id
        ]
      );
      
      return { success: true };
    }),

  // 승인
  approve: protectedProcedure
    .input(z.object({
      id: z.number(),
      approved_by: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `UPDATE yearly_logs SET status = '승인완료', approved_by = ?, approved_at = NOW() WHERE id = ?`,
        [input.approved_by, input.id]
      );
      
      return { success: true };
    }),

  // 승인 요청
  requestApproval: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `UPDATE yearly_logs SET status = '승인대기' WHERE id = ?`,
        [input.id]
      );
      
      return { success: true };
    }),

  // 반려
  reject: protectedProcedure
    .input(z.object({
      id: z.number(),
      rejected_reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `UPDATE yearly_logs SET status = '작성중', rejected_reason = ? WHERE id = ?`,
        [input.rejected_reason, input.id]
      );
      
      return { success: true };
    }),

  // 삭제
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `DELETE FROM yearly_logs WHERE id = ?`,
        [input.id]
      );
      
      return { success: true };
    }),
});
