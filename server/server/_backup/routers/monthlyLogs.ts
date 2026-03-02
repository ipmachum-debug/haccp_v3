import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getRawConnection } from "../db";

export const monthlyLogsRouter = router({
  // ============================================
  // 일반위생관리 및 공정점검표 (월간)
  // ============================================
  
  // 일반위생관리 월간일지 작성
  createHygiene: protectedProcedure
    .input(z.object({
      tenant_id: z.number(),
      check_date: z.string(),
      checker_name: z.string().optional(),
      confirmer_name: z.string().optional(),
      confirm_date: z.string().optional(),
      cleaning_status: z.string().optional(),
      education_status: z.string().optional(),
      ccp_verification: z.string().optional(),
      special_notes: z.string().optional(),
      improvement_action: z.string().optional(),
      confirmation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      const result = await (db as any).execute(
        `INSERT INTO monthly_hygiene_logs 
        (tenant_id, check_date, checker_name, confirmer_name, confirm_date,
         cleaning_status, education_status, ccp_verification,
         special_notes, improvement_action, confirmation, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '작성중')`,
        [
          input.tenant_id,
          input.check_date,
          input.checker_name,
          input.confirmer_name,
          input.confirm_date,
          input.cleaning_status,
          input.education_status,
          input.ccp_verification,
          input.special_notes,
          input.improvement_action,
          input.confirmation,
        ]
      );

      return { success: true, id: result.insertId };
    }),

  // 일반위생관리 월간일지 조회
  getHygiene: protectedProcedure
    .input(z.object({
      tenant_id: z.number(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conn = await getRawConnection();
      
      let query = 'SELECT * FROM monthly_hygiene_logs WHERE tenant_id = ?';
      const params: any[] = [input.tenant_id];

      if (input.start_date) {
        query += ' AND check_date >= ?';
        params.push(input.start_date);
      }

      if (input.end_date) {
        query += ' AND check_date <= ?';
        params.push(input.end_date);
      }

      if (input.status) {
        query += ' AND status = ?';
        params.push(input.status);
      }

      query += ' ORDER BY check_date DESC';

      const [logs] = await conn.execute(query, params) as any;

      return { logs };
    }),

  // 일반위생관리 월간일지 수정
  updateHygiene: protectedProcedure
    .input(z.object({
      id: z.number(),
      check_date: z.string().optional(),
      checker_name: z.string().optional(),
      confirmer_name: z.string().optional(),
      confirm_date: z.string().optional(),
      cleaning_status: z.string().optional(),
      education_status: z.string().optional(),
      ccp_verification: z.string().optional(),
      special_notes: z.string().optional(),
      improvement_action: z.string().optional(),
      confirmation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      const updates: string[] = [];
      const params: any[] = [];

      if (input.check_date !== undefined) {
        updates.push('check_date = ?');
        params.push(input.check_date);
      }
      if (input.checker_name !== undefined) {
        updates.push('checker_name = ?');
        params.push(input.checker_name);
      }
      if (input.confirmer_name !== undefined) {
        updates.push('confirmer_name = ?');
        params.push(input.confirmer_name);
      }
      if (input.confirm_date !== undefined) {
        updates.push('confirm_date = ?');
        params.push(input.confirm_date);
      }
      if (input.cleaning_status !== undefined) {
        updates.push('cleaning_status = ?');
        params.push(input.cleaning_status);
      }
      if (input.education_status !== undefined) {
        updates.push('education_status = ?');
        params.push(input.education_status);
      }
      if (input.ccp_verification !== undefined) {
        updates.push('ccp_verification = ?');
        params.push(input.ccp_verification);
      }
      if (input.special_notes !== undefined) {
        updates.push('special_notes = ?');
        params.push(input.special_notes);
      }
      if (input.improvement_action !== undefined) {
        updates.push('improvement_action = ?');
        params.push(input.improvement_action);
      }
      if (input.confirmation !== undefined) {
        updates.push('confirmation = ?');
        params.push(input.confirmation);
      }

      if (updates.length === 0) {
        throw new Error('수정할 항목이 없습니다.');
      }

      params.push(input.id);

      await (db as any).execute(
        `UPDATE monthly_hygiene_logs SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      return { success: true };
    }),

  // 일반위생관리 월간일지 삭제
  deleteHygiene: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        'DELETE FROM monthly_hygiene_logs WHERE id = ?',
        [input.id]
      );

      return { success: true };
    }),

  // 일반위생관리 월간일지 승인
  approveHygiene: protectedProcedure
    .input(z.object({
      id: z.number(),
      approved_by: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `UPDATE monthly_hygiene_logs 
         SET status = '승인완료', approved_by = ?, approved_at = NOW() 
         WHERE id = ?`,
        [input.approved_by, input.id]
      );

      return { success: true };
    }),

  // 일반위생관리 월간일지 승인 요청
  requestHygieneApproval: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `UPDATE monthly_hygiene_logs SET status = '승인대기' WHERE id = ?`,
        [input.id]
      );

      return { success: true };
    }),

  // 일반위생관리 월간일지 반려
  rejectHygiene: protectedProcedure
    .input(z.object({
      id: z.number(),
      rejected_by: z.string(),
      reject_reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `UPDATE monthly_hygiene_logs SET status = '작성중' WHERE id = ?`,
        [input.id]
      );

      return { success: true };
    }),

  // ============================================
  // 중요관리점(CCP) 검증점검표 (매월)
  // ============================================
  
  // CCP 월간일지 작성
  createCCP: protectedProcedure
    .input(z.object({
      tenant_id: z.number(),
      check_date: z.string(),
      checker_name: z.string().optional(),
      confirmer_name: z.string().optional(),
      confirm_date: z.string().optional(),
      
      // 가열 공정
      heating_temp_time_check: z.string().optional(),
      heating_equipment_calibration: z.string().optional(),
      heating_temp_method: z.string().optional(),
      heating_time_method: z.string().optional(),
      heating_core_temp_method: z.string().optional(),
      heating_monitoring_observation_date: z.string().optional(),
      heating_corrective_action_knowledge: z.string().optional(),
      heating_monitoring_interview_date: z.string().optional(),
      
      // 금속검출 공정
      metal_detector_test: z.string().optional(),
      metal_detector_calibration: z.string().optional(),
      metal_detector_method: z.string().optional(),
      metal_monitoring_observation_date: z.string().optional(),
      metal_corrective_action_knowledge: z.string().optional(),
      metal_monitoring_interview_date: z.string().optional(),
      
      // 한계기준 이탈내용, 개선조치, 조치자, 확인
      deviation_details: z.string().optional(),
      improvement_action: z.string().optional(),
      action_taker: z.string().optional(),
      confirmation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      const result = await (db as any).execute(
        `INSERT INTO monthly_ccp_logs 
        (tenant_id, check_date, checker_name, confirmer_name, confirm_date,
         heating_temp_time_check, heating_equipment_calibration, heating_temp_method,
         heating_time_method, heating_core_temp_method, heating_monitoring_observation_date,
         heating_corrective_action_knowledge, heating_monitoring_interview_date,
         metal_detector_test, metal_detector_calibration, metal_detector_method,
         metal_monitoring_observation_date, metal_corrective_action_knowledge,
         metal_monitoring_interview_date, deviation_details, improvement_action,
         action_taker, confirmation, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '작성중')`,
        [
          input.tenant_id,
          input.check_date,
          input.checker_name,
          input.confirmer_name,
          input.confirm_date,
          input.heating_temp_time_check,
          input.heating_equipment_calibration,
          input.heating_temp_method,
          input.heating_time_method,
          input.heating_core_temp_method,
          input.heating_monitoring_observation_date,
          input.heating_corrective_action_knowledge,
          input.heating_monitoring_interview_date,
          input.metal_detector_test,
          input.metal_detector_calibration,
          input.metal_detector_method,
          input.metal_monitoring_observation_date,
          input.metal_corrective_action_knowledge,
          input.metal_monitoring_interview_date,
          input.deviation_details,
          input.improvement_action,
          input.action_taker,
          input.confirmation,
        ]
      );

      return { success: true, id: result.insertId };
    }),

  // CCP 월간일지 조회
  getCCP: protectedProcedure
    .input(z.object({
      tenant_id: z.number(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conn = await getRawConnection();
      
      let query = 'SELECT * FROM monthly_ccp_logs WHERE tenant_id = ?';
      const params: any[] = [input.tenant_id];

      if (input.start_date) {
        query += ' AND check_date >= ?';
        params.push(input.start_date);
      }

      if (input.end_date) {
        query += ' AND check_date <= ?';
        params.push(input.end_date);
      }

      if (input.status) {
        query += ' AND status = ?';
        params.push(input.status);
      }

      query += ' ORDER BY check_date DESC';

      const [logs] = await conn.execute(query, params) as any;

      return { logs };
    }),

  // CCP 월간일지 수정
  updateCCP: protectedProcedure
    .input(z.object({
      id: z.number(),
      check_date: z.string().optional(),
      checker_name: z.string().optional(),
      confirmer_name: z.string().optional(),
      confirm_date: z.string().optional(),
      
      heating_temp_time_check: z.string().optional(),
      heating_equipment_calibration: z.string().optional(),
      heating_temp_method: z.string().optional(),
      heating_time_method: z.string().optional(),
      heating_core_temp_method: z.string().optional(),
      heating_monitoring_observation_date: z.string().optional(),
      heating_corrective_action_knowledge: z.string().optional(),
      heating_monitoring_interview_date: z.string().optional(),
      
      metal_detector_test: z.string().optional(),
      metal_detector_calibration: z.string().optional(),
      metal_detector_method: z.string().optional(),
      metal_monitoring_observation_date: z.string().optional(),
      metal_corrective_action_knowledge: z.string().optional(),
      metal_monitoring_interview_date: z.string().optional(),
      
      deviation_details: z.string().optional(),
      improvement_action: z.string().optional(),
      action_taker: z.string().optional(),
      confirmation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      const updates: string[] = [];
      const params: any[] = [];

      // 모든 필드에 대한 업데이트 처리
      Object.entries(input).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          updates.push(`${key} = ?`);
          params.push(value);
        }
      });

      if (updates.length === 0) {
        throw new Error('수정할 항목이 없습니다.');
      }

      params.push(input.id);

      await (db as any).execute(
        `UPDATE monthly_ccp_logs SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      return { success: true };
    }),

  // CCP 월간일지 삭제
  deleteCCP: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        'DELETE FROM monthly_ccp_logs WHERE id = ?',
        [input.id]
      );

      return { success: true };
    }),

  // CCP 월간일지 승인
  approveCCP: protectedProcedure
    .input(z.object({
      id: z.number(),
      approved_by: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `UPDATE monthly_ccp_logs 
         SET status = '승인완료', approved_by = ?, approved_at = NOW() 
         WHERE id = ?`,
        [input.approved_by, input.id]
      );

      return { success: true };
    }),

  // CCP 월간일지 승인 요청
  requestCCPApproval: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `UPDATE monthly_ccp_logs SET status = '승인대기' WHERE id = ?`,
        [input.id]
      );

      return { success: true };
    }),

  // CCP 월간일지 반려
  rejectCCP: protectedProcedure
    .input(z.object({
      id: z.number(),
      rejected_by: z.string(),
      reject_reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      
      await (db as any).execute(
        `UPDATE monthly_ccp_logs SET status = '작성중' WHERE id = ?`,
        [input.id]
      );

      return { success: true };
    }),
});
