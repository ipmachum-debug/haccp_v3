import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getRawConnection } from "../db";

export const weeklyLogsRouter = router({
  // ==================== 일반위생관리 주간일지 ====================
  
  // 일반위생관리 주간일지 작성
  createHygiene: protectedProcedure
    .input(
      z.object({
        tenant_id: z.number(),
        check_date: z.string(),
        checker_name: z.string().optional(),
        cold_storage_clean: z.enum(['예', '아니오']).optional(),
        facility_clean: z.enum(['예', '아니오']).optional(),
        uniform_wash: z.enum(['예', '아니오']).optional(),
        special_notes: z.string().optional(),
        improvement_action: z.string().optional(),
        confirmation: z.string().optional()
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const result = await (db as any).execute(
        `INSERT INTO weekly_hygiene_logs 
         (tenant_id, check_date, checker_name, cold_storage_clean, facility_clean, 
          uniform_wash, special_notes, improvement_action, confirmation, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '작성중')`,
        [
          input.tenant_id,
          input.check_date,
          input.checker_name,
          input.cold_storage_clean,
          input.facility_clean,
          input.uniform_wash,
          input.special_notes,
          input.improvement_action,
          input.confirmation
        ]
      );

      return {
        success: true,
        log_id: result.insertId,
        message: '일반위생관리 주간일지가 작성되었습니다.'
      };
    }),

  // 일반위생관리 주간일지 조회
  getHygiene: protectedProcedure
    .input(
      z.object({
        tenant_id: z.number(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        status: z.enum(['작성중', '승인대기', '승인완료']).optional()
      })
    )
    .query(async ({ input }) => {
      const conn = await getRawConnection();
      let query = 'SELECT * FROM weekly_hygiene_logs WHERE tenant_id = ?';
      const params: any[] = [input.tenant_id];

      if (input.start_date && input.end_date) {
        query += ' AND check_date BETWEEN ? AND ?';
        params.push(input.start_date, input.end_date);
      }

      if (input.status) {
        query += ' AND status = ?';
        params.push(input.status);
      }

      query += ' ORDER BY check_date DESC';

      const [logs] = await conn.execute(query, params) as any;
      return { success: true, logs };
    }),

  // 일반위생관리 주간일지 수정
  updateHygiene: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        check_date: z.string().optional(),
        checker_name: z.string().optional(),
        cold_storage_clean: z.enum(['예', '아니오']).optional(),
        facility_clean: z.enum(['예', '아니오']).optional(),
        uniform_wash: z.enum(['예', '아니오']).optional(),
        special_notes: z.string().optional(),
        improvement_action: z.string().optional(),
        confirmation: z.string().optional()
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await (db as any).execute(
        `UPDATE weekly_hygiene_logs 
         SET check_date = ?, checker_name = ?, cold_storage_clean = ?, 
             facility_clean = ?, uniform_wash = ?, special_notes = ?, 
             improvement_action = ?, confirmation = ?
         WHERE id = ?`,
        [
          input.check_date,
          input.checker_name,
          input.cold_storage_clean,
          input.facility_clean,
          input.uniform_wash,
          input.special_notes,
          input.improvement_action,
          input.confirmation,
          input.id
        ]
      );

      return { success: true, message: '일반위생관리 주간일지가 수정되었습니다.' };
    }),

  // 일반위생관리 주간일지 삭제
  deleteHygiene: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const conn = await getRawConnection();
      await conn.execute('DELETE FROM weekly_hygiene_logs WHERE id = ?', [input.id]);
      return { success: true, message: '일반위생관리 주간일지가 삭제되었습니다.' };
    }),

  // 일반위생관리 주간일지 승인
  approveHygiene: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        approved_by: z.string()
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await (db as any).execute(
        `UPDATE weekly_hygiene_logs 
         SET status = '승인완료', approved_by = ?, approved_at = NOW()
         WHERE id = ?`,
        [input.approved_by, input.id]
      );

      return { success: true, message: '일반위생관리 주간일지가 승인되었습니다.' };
    }),

  // 일반위생관리 주간일지 승인 요청
  requestHygieneApproval: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await (db as any).execute(
        `UPDATE weekly_hygiene_logs 
         SET status = '승인대기'
         WHERE id = ?`,
        [input.id]
      );

      return { success: true, message: '승인 요청되었습니다.' };
    }),

  // 일반위생관리 주간일지 반려
  rejectHygiene: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        rejected_by: z.string(),
        reject_reason: z.string().optional()
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await (db as any).execute(
        `UPDATE weekly_hygiene_logs 
         SET status = '작성중'
         WHERE id = ?`,
        [input.id]
      );

      return { success: true, message: '반려되었습니다.' };
    }),

  // ==================== 방충방서 주간일지 ====================

  // 방충방서 주간일지 작성 (설비별 체크 포함)
  createPest: protectedProcedure
    .input(
      z.object({
        tenant_id: z.number(),
        check_date: z.string(),
        checker_name: z.string().optional(),
        management_notes: z.string().optional(),
        deviation_reason: z.string().optional(),
        improvement_action: z.string().optional(),
        equipment_checks: z.array(
          z.object({
            equipment_id: z.number(),
            dust: z.boolean().optional(),
            sticky: z.boolean().optional(),
            fly: z.boolean().optional(),
            fruit_fly: z.boolean().optional(),
            moth_fly: z.boolean().optional(),
            wing: z.boolean().optional(),
            cockroach: z.boolean().optional(),
            ant: z.boolean().optional(),
            spider: z.boolean().optional(),
            mouse: z.boolean().optional(),
            other: z.boolean().optional(),
            escape: z.boolean().optional()
          })
        ).optional()
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();

      // 1. 방충방서 주간일지 메인 레코드 생성
      const result = await (db as any).execute(
        `INSERT INTO weekly_pest_logs 
         (tenant_id, check_date, checker_name, management_notes, 
          deviation_reason, improvement_action, status)
         VALUES (?, ?, ?, ?, ?, ?, '작성중')`,
        [
          input.tenant_id,
          input.check_date,
          input.checker_name,
          input.management_notes,
          input.deviation_reason,
          input.improvement_action
        ]
      );

      const logId = result.insertId;

      // 2. 설비별 체크 데이터 삽입
      if (input.equipment_checks && input.equipment_checks.length > 0) {
        for (const check of input.equipment_checks) {
          await (db as any).execute(
            `INSERT INTO weekly_pest_checks 
             (log_id, equipment_id, dust, sticky, fly, fruit_fly, moth_fly, 
              wing, cockroach, ant, spider, mouse, other, escape)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              logId,
              check.equipment_id,
              check.dust || false,
              check.sticky || false,
              check.fly || false,
              check.fruit_fly || false,
              check.moth_fly || false,
              check.wing || false,
              check.cockroach || false,
              check.ant || false,
              check.spider || false,
              check.mouse || false,
              check.other || false,
              check.escape || false
            ]
          );
        }
      }

      return {
        success: true,
        log_id: logId,
        message: '방충방서 주간일지가 작성되었습니다.'
      };
    }),

  // 방충방서 주간일지 조회 (설비별 체크 포함)
  getPest: protectedProcedure
    .input(
      z.object({
        tenant_id: z.number(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        status: z.enum(['작성중', '승인대기', '승인완료']).optional()
      })
    )
    .query(async ({ input }) => {
      const conn = await getRawConnection();
      let query = 'SELECT * FROM weekly_pest_logs WHERE tenant_id = ?';
      const params: any[] = [input.tenant_id];

      if (input.start_date && input.end_date) {
        query += ' AND check_date BETWEEN ? AND ?';
        params.push(input.start_date, input.end_date);
      }

      if (input.status) {
        query += ' AND status = ?';
        params.push(input.status);
      }

      query += ' ORDER BY check_date DESC';

      const [logs] = await conn.execute(query, params) as any;

      // 각 로그에 대한 설비별 체크 데이터 조회
      for (const log of logs) {
        const checks = await (db as any).execute(
          `SELECT wpc.*, em.name as equipment_name, em.type as equipment_type, 
                  em.location, em.zone
           FROM weekly_pest_checks wpc
           JOIN equipment_master em ON wpc.equipment_id = em.id
           WHERE wpc.log_id = ?
           ORDER BY em.type, em.name`,
          [log.id]
        );
        log.equipment_checks = checks;
      }

      return { success: true, logs };
    }),

  // 방충방서 주간일지 상세 조회
  getPestDetail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const logs = await (db as any).execute(
        'SELECT * FROM weekly_pest_logs WHERE id = ?',
        [input.id]
      );

      if (logs.length === 0) {
        throw new Error('일지를 찾을 수 없습니다.');
      }

      const log = logs[0];

      // 설비별 체크 데이터 조회
      const checks = await (db as any).execute(
        `SELECT wpc.*, em.name as equipment_name, em.type as equipment_type, 
                em.location, em.zone
         FROM weekly_pest_checks wpc
         JOIN equipment_master em ON wpc.equipment_id = em.id
         WHERE wpc.log_id = ?
         ORDER BY em.type, em.name`,
        [input.id]
      );

      log.equipment_checks = checks;

      return { success: true, log };
    }),

  // 방충방서 주간일지 수정
  updatePest: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        check_date: z.string().optional(),
        checker_name: z.string().optional(),
        management_notes: z.string().optional(),
        deviation_reason: z.string().optional(),
        improvement_action: z.string().optional(),
        equipment_checks: z.array(
          z.object({
            equipment_id: z.number(),
            dust: z.boolean().optional(),
            sticky: z.boolean().optional(),
            fly: z.boolean().optional(),
            fruit_fly: z.boolean().optional(),
            moth_fly: z.boolean().optional(),
            wing: z.boolean().optional(),
            cockroach: z.boolean().optional(),
            ant: z.boolean().optional(),
            spider: z.boolean().optional(),
            mouse: z.boolean().optional(),
            other: z.boolean().optional(),
            escape: z.boolean().optional()
          })
        ).optional()
      })
    )
    .mutation(async ({ input }) => {
      const conn = await getRawConnection();

      // 1. 메인 레코드 수정
      await (db as any).execute(
        `UPDATE weekly_pest_logs 
         SET check_date = ?, checker_name = ?, management_notes = ?, 
             deviation_reason = ?, improvement_action = ?
         WHERE id = ?`,
        [
          input.check_date,
          input.checker_name,
          input.management_notes,
          input.deviation_reason,
          input.improvement_action,
          input.id
        ]
      );

      // 2. 기존 설비별 체크 삭제
      await conn.execute('DELETE FROM weekly_pest_checks WHERE log_id = ?', [input.id]);

      // 3. 새로운 설비별 체크 삽입
      if (input.equipment_checks && input.equipment_checks.length > 0) {
        for (const check of input.equipment_checks) {
          await (db as any).execute(
            `INSERT INTO weekly_pest_checks 
             (log_id, equipment_id, dust, sticky, fly, fruit_fly, moth_fly, 
              wing, cockroach, ant, spider, mouse, other, escape)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              input.id,
              check.equipment_id,
              check.dust || false,
              check.sticky || false,
              check.fly || false,
              check.fruit_fly || false,
              check.moth_fly || false,
              check.wing || false,
              check.cockroach || false,
              check.ant || false,
              check.spider || false,
              check.mouse || false,
              check.other || false,
              check.escape || false
            ]
          );
        }
      }

      return { success: true, message: '방충방서 주간일지가 수정되었습니다.' };
    }),

  // 방충방서 주간일지 삭제
  deletePest: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const conn = await getRawConnection();
      // CASCADE로 설정되어 있어 weekly_pest_checks도 자동 삭제됨
      await conn.execute('DELETE FROM weekly_pest_logs WHERE id = ?', [input.id]);
      return { success: true, message: '방충방서 주간일지가 삭제되었습니다.' };
    }),

  // 방충방서 주간일지 승인
  approvePest: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        approved_by: z.string()
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await (db as any).execute(
        `UPDATE weekly_pest_logs 
         SET status = '승인완료', approved_by = ?, approved_at = NOW()
         WHERE id = ?`,
        [input.approved_by, input.id]
      );

      return { success: true, message: '방충방서 주간일지가 승인되었습니다.' };
    }),

  // 방충방서 주간일지 승인 요청
  requestPestApproval: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await (db as any).execute(
        `UPDATE weekly_pest_logs 
         SET status = '승인대기'
         WHERE id = ?`,
        [input.id]
      );

      return { success: true, message: '승인 요청되었습니다.' };
    }),

  // 방충방서 주간일지 반려
  rejectPest: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        rejected_by: z.string(),
        reject_reason: z.string().optional()
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await (db as any).execute(
        `UPDATE weekly_pest_logs 
         SET status = '작성중'
         WHERE id = ?`,
        [input.id]
      );

      return { success: true, message: '반려되었습니다.' };
    })
});
