/**
 * 공지보드 & 커뮤니케이션 로그 확장 라우터
 * 
 * 역할별 UX 분리:
 * - 일반직원: /board -> 공지보드 (확인 버튼만)
 * - 작업자/관리자: 커뮤니케이션 로그 (댓글/상태변경)
 * - 관리자: 공지 작성 (type 지정)
 */

import { tenantRequiredProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb, getRawConnection } from "../db";
import { sql, eq, and } from "drizzle-orm";
import {
  communicationLogNotifications,
} from "../../drizzle/schema/index";

export const boardRouter = router({
  // ══════════════════════════════════════
  // 공지 작성 (관리자용) - type 포함 (parameterized)
  // ══════════════════════════════════════
  createNotice: tenantRequiredProcedure
    .input(
      z.object({
        type: z.enum(["notice", "work", "handover"]).default("notice"),
        content: z.string().min(1, "내용은 필수입니다"),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();

      const logType = String(input.type || "notice");
      // 사내공지보드 글은 반드시 partner_id = 0, log_type은 notice/work/handover만
      const safeLogType = ['notice', 'work', 'handover'].includes(logType) ? logType : 'notice';
      console.log("[createNotice] input.type =", input.type, "-> safeLogType =", safeLogType);

      try {
        const [result]: any = await pool.execute(
          `INSERT INTO communication_logs (tenant_id, partner_id, content, status, author_id, mentions, log_type, title)
           VALUES (?, 0, ?, 'received', ?, NULL, ?, ?)`,
          [
            Number(ctx.tenantId ?? undefined),
            input.content,
            Number(ctx.user.id),
            safeLogType,
            input.title || null,
          ]
        );

        const insertId = result?.insertId || 0;
        console.log("[createNotice] inserted id =", insertId, "with log_type =", safeLogType);

        // 같은 테넌트의 모든 사용자에게 알림 생성
        try {
          const [usersRows]: any = await pool.execute(
            `SELECT id FROM users WHERE tenant_id = ? AND id != ? AND approval_status = 'approved'`,
            [Number(ctx.tenantId ?? undefined), Number(ctx.user.id)]
          );
          
          const typeLabel = safeLogType === 'notice' ? '공지' : safeLogType === 'work' ? '작업지시' : '전달사항';
          
          for (const u of (usersRows || [])) {
            try {
              await pool.execute(
                `INSERT INTO communication_log_notifications (tenant_id, log_id, user_id, type, message, is_read)
                 VALUES (?, ?, ?, 'notice', ?, false)`,
                [Number(ctx.tenantId ?? undefined), insertId, Number(u.id), `새로운 ${typeLabel}가 등록되었습니다`]
              );
            } catch (ne: any) {
              console.error("[createNotice] single notification error:", ne.message);
            }
          }
        } catch (e: any) {
          console.error("[createNotice] notification error:", e.message);
        }

        return { id: insertId, success: true };
      } catch (error: any) {
        console.error("[createNotice] primary insert error:", error.message);
        // log_type 컬럼이 없는 경우 기본 삽입
        if (error.message?.includes("log_type") || error.message?.includes("title") || error.message?.includes("Unknown column")) {
          const [result]: any = await pool.execute(
            `INSERT INTO communication_logs (tenant_id, partner_id, content, status, author_id, mentions)
             VALUES (?, 0, ?, 'received', ?, NULL)`,
            [
              Number(ctx.tenantId ?? undefined),
              input.content,
              Number(ctx.user.id),
            ]
          );
          return { id: result?.insertId || 0, success: true };
        }
        throw error;
      }
    }),

  // ══════════════════════════════════════
  // 공지보드 조회 - type별 그룹핑
  // ══════════════════════════════════════
  getBoardItems: tenantRequiredProcedure
    .input(
      z.object({
        type: z.enum(["notice", "work", "handover", "all"]).optional().default("all"),
      }).optional()
    )
    .query(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();
      const tenantId = Number(ctx.tenantId ?? undefined);
      const userId = Number(ctx.user.id);

      // 사내공지보드: partner 타입 제외 + partner_id=0인 글만 (거래처 메모는 별도 탭)
      // params 순서: totalUsers(tenantId), myAck(userId), WHERE(tenantId), [optional type]
      let typeCondition = "AND cl.log_type IN ('notice', 'work', 'handover') AND (cl.partner_id = 0 OR cl.partner_id IS NULL)";
      const params: any[] = [tenantId, userId, tenantId];

      if (input?.type && input.type !== "all") {
        typeCondition = "AND cl.log_type = ? AND (cl.partner_id = 0 OR cl.partner_id IS NULL)";
        params.push(input.type);
      }

      try {
        console.log("[getBoardItems] tenantId =", tenantId, "userId =", userId, "type =", input?.type, "typeCondition =", typeCondition, "params =", params);
        const queryStr = `
          SELECT 
            cl.id, cl.tenant_id as tenantId, cl.partner_id as partnerId,
            cl.content, cl.status, cl.author_id as authorId,
            cl.created_at as createdAt, cl.updated_at as updatedAt,
            COALESCE(cl.log_type, 'notice') as logType,
            cl.title,
            u.name as authorName,
            p.company_name as partnerName,
            (SELECT COUNT(*) FROM communication_log_acks WHERE log_id = cl.id) as ackCount,
            (SELECT COUNT(*) FROM users WHERE tenant_id = ? AND approval_status = 'approved') as totalUsers,
            (SELECT COUNT(*) FROM communication_log_acks WHERE log_id = cl.id AND user_id = ?) as myAck
          FROM communication_logs cl
          LEFT JOIN users u ON cl.author_id = u.id
          LEFT JOIN partners p ON cl.partner_id = p.id
          WHERE cl.tenant_id = ? ${typeCondition}
          ORDER BY cl.created_at DESC
          LIMIT 100
        `;

        const [rows]: any = await pool.execute(queryStr, params);
        console.log("[getBoardItems] primary query returned", (rows || []).length, "rows");
        return (rows || []) as any[];
      } catch (error: any) {
        console.error("[getBoardItems] primary error:", error.message);
        // log_type 또는 acks 테이블이 없는 경우 fallback
        try {
          const [rows]: any = await pool.execute(
            `SELECT 
              cl.id, cl.tenant_id as tenantId, cl.partner_id as partnerId,
              cl.content, cl.status, cl.author_id as authorId,
              cl.created_at as createdAt, cl.updated_at as updatedAt,
              'notice' as logType,
              NULL as title,
              u.name as authorName,
              p.company_name as partnerName,
              0 as ackCount,
              (SELECT COUNT(*) FROM users WHERE tenant_id = ? AND approval_status = 'approved') as totalUsers,
              0 as myAck
            FROM communication_logs cl
            LEFT JOIN users u ON cl.author_id = u.id
            LEFT JOIN partners p ON cl.partner_id = p.id
            WHERE cl.tenant_id = ? AND (cl.partner_id = 0 OR cl.partner_id IS NULL)
            ORDER BY cl.created_at DESC
            LIMIT 100`,
            [tenantId, tenantId]
          );
          return (rows || []) as any[];
        } catch (innerErr: any) {
          console.error("[getBoardItems] fallback error:", innerErr.message);
          return [];
        }
      }
    }),

  // ══════════════════════════════════════
  // 확인(ACK) 처리
  // ══════════════════════════════════════
  ackLog: tenantRequiredProcedure
    .input(z.object({ logId: z.number() }))
    .mutation(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();
      const tenantId = Number(ctx.tenantId ?? undefined);
      const userId = Number(ctx.user.id);
      const logId = Number(input.logId);

      const ensureAcksTable = async () => {
        await pool.execute(`
          CREATE TABLE IF NOT EXISTS communication_log_acks (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            log_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_cla_log_id (log_id),
            INDEX idx_cla_user_id (user_id),
            UNIQUE INDEX idx_cla_unique_ack (log_id, user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      };

      try {
        const [existing]: any = await pool.execute(
          `SELECT id FROM communication_log_acks WHERE log_id = ? AND user_id = ? LIMIT 1`,
          [logId, userId]
        );

        if ((existing || []).length > 0) {
          return { success: true, alreadyAcked: true };
        }

        await pool.execute(
          `INSERT INTO communication_log_acks (tenant_id, log_id, user_id, checked_at) VALUES (?, ?, ?, NOW())`,
          [tenantId, logId, userId]
        );

        return { success: true, alreadyAcked: false };
      } catch (error: any) {
        if (error.code === 'ER_NO_SUCH_TABLE' || error.message?.includes("doesn't exist")) {
          await ensureAcksTable();
          await pool.execute(
            `INSERT INTO communication_log_acks (tenant_id, log_id, user_id, checked_at) VALUES (?, ?, ?, NOW())`,
            [tenantId, logId, userId]
          );
          return { success: true, alreadyAcked: false };
        }
        console.error("[ackLog] Error:", error);
        throw error;
      }
    }),

  // ══════════════════════════════════════
  // 알림 목록
  // ══════════════════════════════════════
  getAlarms: tenantRequiredProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().optional().default(false),
      }).optional()
    )
    .query(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();
      const tenantId = Number(ctx.tenantId ?? undefined);
      const userId = Number(ctx.user.id);
      const unreadFilter = input?.unreadOnly ? "AND n.is_read = false" : "";

      try {
        const [rows]: any = await pool.execute(
          `SELECT 
            n.id, n.log_id as logId, n.type, n.message, n.is_read as isRead,
            n.created_at as createdAt,
            cl.content as logContent, cl.status as logStatus,
            COALESCE(cl.log_type, 'notice') as logType,
            cl.title as logTitle,
            u.name as authorName
          FROM communication_log_notifications n
          LEFT JOIN communication_logs cl ON n.log_id = cl.id
          LEFT JOIN users u ON cl.author_id = u.id
          WHERE n.tenant_id = ? AND n.user_id = ? ${unreadFilter}
          ORDER BY n.created_at DESC
          LIMIT 50`,
          [tenantId, userId]
        );
        return (rows || []) as any[];
      } catch (error: any) {
        try {
          const [rows]: any = await pool.execute(
            `SELECT 
              n.id, n.log_id as logId, n.type, n.message, n.is_read as isRead,
              n.created_at as createdAt,
              cl.content as logContent, cl.status as logStatus,
              'notice' as logType,
              NULL as logTitle,
              u.name as authorName
            FROM communication_log_notifications n
            LEFT JOIN communication_logs cl ON n.log_id = cl.id
            LEFT JOIN users u ON cl.author_id = u.id
            WHERE n.tenant_id = ? AND n.user_id = ? ${unreadFilter}
            ORDER BY n.created_at DESC
            LIMIT 50`,
            [tenantId, userId]
          );
          return (rows || []) as any[];
        } catch (innerErr: any) {
          console.error("[getAlarms] fallback error:", innerErr.message);
          return [];
        }
      }
    }),

  // ══════════════════════════════════════
  // 알림 읽음 처리
  // ══════════════════════════════════════
  markAlarmRead: tenantRequiredProcedure
    .input(z.object({ alarmId: z.number() }))
    .mutation(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();
      await pool.execute(
        `UPDATE communication_log_notifications SET is_read = true WHERE id = ? AND tenant_id = ?`,
        [Number(input.alarmId), Number(ctx.tenantId ?? undefined)]
      );
      return { success: true };
    }),

  // ══════════════════════════════════════
  // 모든 알림 읽음 처리
  // ══════════════════════════════════════
  markAllAlarmsRead: tenantRequiredProcedure
    .mutation(async ({ ctx }: any) => {
      const pool = await getRawConnection();
      await pool.execute(
        `UPDATE communication_log_notifications SET is_read = true WHERE user_id = ? AND tenant_id = ? AND is_read = false`,
        [Number(ctx.user.id), Number(ctx.tenantId ?? undefined)]
      );
      return { success: true };
    }),

  // ══════════════════════════════════════
  // 읽지 않은 알림 수 (알림 + 미확인 게시글)
  // ══════════════════════════════════════
  getUnreadCount: tenantRequiredProcedure
    .query(async ({ ctx }: any) => {
      const pool = await getRawConnection();
      const tenantId = Number(ctx.tenantId ?? undefined);
      const userId = Number(ctx.user.id);
      try {
        // 1) communication_log_notifications 에서 미읽 알림
        let notifCount = 0;
        try {
          const [nRows]: any = await pool.execute(
            `SELECT COUNT(*) as cnt FROM communication_log_notifications WHERE tenant_id = ? AND user_id = ? AND is_read = false`,
            [tenantId, userId]
          );
          notifCount = Number((nRows || [])[0]?.cnt) || 0;
        } catch {}

        // 2) 내가 아직 확인(ACK) 안 한 사내 공지 게시글 수
        let unackedCount = 0;
        try {
          const [aRows]: any = await pool.execute(
            `SELECT COUNT(*) as cnt FROM communication_logs cl
             WHERE cl.tenant_id = ? 
               AND cl.log_type IN ('notice','work','handover') 
               AND (cl.partner_id = 0 OR cl.partner_id IS NULL)
               AND cl.id NOT IN (
                 SELECT log_id FROM communication_log_acks WHERE user_id = ?
               )`,
            [tenantId, userId]
          );
          unackedCount = Number((aRows || [])[0]?.cnt) || 0;
        } catch {}

        return { count: notifCount + unackedCount };
      } catch {
        return { count: 0 };
      }
    }),

  // ══════════════════════════════════════
  // 공지 수정 (관리자용)
  // ══════════════════════════════════════
  updateNotice: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        type: z.enum(["notice", "work", "handover"]).optional(),
        content: z.string().optional(),
        title: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();
      const tenantId = Number(ctx.tenantId ?? undefined);

      const setClauses: string[] = [];
      const setParams: any[] = [];

      if (input.type) { setClauses.push("log_type = ?"); setParams.push(input.type); }
      if (input.content) { setClauses.push("content = ?"); setParams.push(input.content); }
      if (input.title !== undefined) { setClauses.push("title = ?"); setParams.push(input.title || null); }
      
      if (setClauses.length === 0) return { success: false, message: "변경사항 없음" };

      setParams.push(Number(input.id), tenantId);

      await pool.execute(
        `UPDATE communication_logs SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`,
        setParams
      );

      return { success: true };
    }),

  // ══════════════════════════════════════
  // 공지 삭제 (관리자용)
  // ══════════════════════════════════════
  deleteNotice: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();
      const logId = Number(input.id);
      const tenantId = Number(ctx.tenantId ?? undefined);

      // 관련 ack, 알림, 댓글 삭제
      try { await pool.execute(`DELETE FROM communication_log_acks WHERE log_id = ?`, [logId]); } catch {}
      try { await pool.execute(`DELETE FROM communication_log_notifications WHERE log_id = ? AND tenant_id = ?`, [logId, tenantId]); } catch {}
      try { await pool.execute(`DELETE FROM communication_log_comments WHERE log_id = ? AND tenant_id = ?`, [logId, tenantId]); } catch {}
      
      await pool.execute(
        `DELETE FROM communication_logs WHERE id = ? AND tenant_id = ?`,
        [logId, tenantId]
      );

      return { success: true };
    }),

  // ══════════════════════════════════════
  // 공지보드 댓글 조회 (작업자/관리자용)
  // ══════════════════════════════════════
  getBoardComments: tenantRequiredProcedure
    .input(z.object({ logId: z.number() }))
    .query(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();
      const tenantId = Number(ctx.tenantId ?? undefined);
      const logId = Number(input.logId);

      try {
        const [rows]: any = await pool.execute(
          `SELECT 
            c.id, c.tenant_id as tenantId, c.log_id as logId,
            c.content, c.author_id as authorId,
            c.created_at as createdAt,
            u.name as authorName
          FROM communication_log_comments c
          LEFT JOIN users u ON c.author_id = u.id
          WHERE c.log_id = ? AND c.tenant_id = ?
          ORDER BY c.created_at ASC`,
          [logId, tenantId]
        );
        return (rows || []) as any[];
      } catch (error: any) {
        console.error("[getBoardComments] Error:", error.message);
        return [];
      }
    }),

  // ══════════════════════════════════════
  // 공지보드 댓글 작성 (작업자/관리자용)
  // ══════════════════════════════════════
  createBoardComment: tenantRequiredProcedure
    .input(z.object({
      logId: z.number(),
      content: z.string().min(1, "댓글 내용은 필수입니다"),
    }))
    .mutation(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();
      const tenantId = Number(ctx.tenantId ?? undefined);
      const userId = Number(ctx.user.id);
      const logId = Number(input.logId);

      // 역할 체크: worker 또는 admin만 댓글 작성 가능
      const userRole = ctx.user?.role || 'employee';
      if (userRole !== 'worker' && userRole !== 'admin' && userRole !== 'monitor') {
        throw new Error("댓글 작성 권한이 없습니다. 작업자 등급 이상만 가능합니다.");
      }

      const ensureCommentsTable = async () => {
        await pool.execute(`
          CREATE TABLE IF NOT EXISTS communication_log_comments (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            log_id BIGINT NOT NULL,
            content TEXT NOT NULL,
            author_id BIGINT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_clc_log_id (log_id),
            INDEX idx_clc_author_id (author_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      };

      try {
        const [result]: any = await pool.execute(
          `INSERT INTO communication_log_comments (tenant_id, log_id, content, author_id)
           VALUES (?, ?, ?, ?)`,
          [tenantId, logId, input.content, userId]
        );

        // 공지 작성자에게 알림
        try {
          const [logRows]: any = await pool.execute(
            `SELECT author_id FROM communication_logs WHERE id = ? AND tenant_id = ?`,
            [logId, tenantId]
          );
          const logAuthor = (logRows || [])[0];
          if (logAuthor && Number(logAuthor.author_id) !== userId) {
            await pool.execute(
              `INSERT INTO communication_log_notifications (tenant_id, log_id, user_id, type, message, is_read)
               VALUES (?, ?, ?, 'comment', '새로운 댓글이 추가되었습니다', false)`,
              [tenantId, logId, Number(logAuthor.author_id)]
            );
          }
        } catch (e: any) {
          console.error("[createBoardComment] notification error:", e.message);
        }

        return { id: result?.insertId || 0, success: true };
      } catch (error: any) {
        if (error.code === 'ER_NO_SUCH_TABLE' || error.message?.includes("doesn't exist")) {
          await ensureCommentsTable();
          const [result]: any = await pool.execute(
            `INSERT INTO communication_log_comments (tenant_id, log_id, content, author_id)
             VALUES (?, ?, ?, ?)`,
            [tenantId, logId, input.content, userId]
          );
          return { id: result?.insertId || 0, success: true };
        }
        throw error;
      }
    }),

  // ══════════════════════════════════════
  // 공지보드 댓글 삭제
  // ══════════════════════════════════════
  deleteBoardComment: tenantRequiredProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();
      const tenantId = Number(ctx.tenantId ?? undefined);
      const userId = Number(ctx.user.id);

      await pool.execute(
        `DELETE FROM communication_log_comments WHERE id = ? AND tenant_id = ? AND author_id = ?`,
        [Number(input.commentId), tenantId, userId]
      );

      return { success: true };
    }),

  // ══════════════════════════════════════
  // 공지보드 댓글 수 조회
  // ══════════════════════════════════════
  getBoardCommentCount: tenantRequiredProcedure
    .input(z.object({ logId: z.number() }))
    .query(async ({ input, ctx }: any) => {
      const pool = await getRawConnection();
      try {
        const [rows]: any = await pool.execute(
          `SELECT COUNT(*) as cnt FROM communication_log_comments WHERE log_id = ? AND tenant_id = ?`,
          [Number(input.logId), Number(ctx.tenantId ?? undefined)]
        );
        return { count: (rows || [])[0]?.cnt || 0 };
      } catch {
        return { count: 0 };
      }
    }),

  // ══════════════════════════════════════
  // 사내공지보드 전용 통계
  // ══════════════════════════════════════
  getBoardStats: tenantRequiredProcedure
    .query(async ({ ctx }: any) => {
      const pool = await getRawConnection();
      const tenantId = Number(ctx.tenantId ?? undefined);

      try {
        const [rows]: any = await pool.execute(
          `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN log_type = 'notice' THEN 1 ELSE 0 END) as noticeCount,
            SUM(CASE WHEN log_type = 'work' THEN 1 ELSE 0 END) as workCount,
            SUM(CASE WHEN log_type = 'handover' THEN 1 ELSE 0 END) as handoverCount,
            SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as receivedCount,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgressCount,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedCount
          FROM communication_logs 
          WHERE tenant_id = ? AND log_type IN ('notice', 'work', 'handover') AND (partner_id = 0 OR partner_id IS NULL)`,
          [tenantId]
        );
        const r = (rows || [])[0] || {};
        return {
          total: Number(r.total) || 0,
          notice: Number(r.noticeCount) || 0,
          work: Number(r.workCount) || 0,
          handover: Number(r.handoverCount) || 0,
          received: Number(r.receivedCount) || 0,
          inProgress: Number(r.inProgressCount) || 0,
          completed: Number(r.completedCount) || 0,
        };
      } catch {
        return { total: 0, notice: 0, work: 0, handover: 0, received: 0, inProgress: 0, completed: 0 };
      }
    }),

  // ══════════════════════════════════════
  // DB 마이그레이션: log_type, title 컬럼 + acks 테이블 생성
  // ══════════════════════════════════════
  migrateBoard: tenantRequiredProcedure
    .mutation(async ({ ctx }: any) => {
      const db = await getDb();
      if (!db) throw new Error("Database not initialized");

      const results: string[] = [];

      // 1. log_type 컬럼 추가
      try {
        await db.execute(sql.raw(`
          ALTER TABLE communication_logs 
          ADD COLUMN log_type VARCHAR(20) NOT NULL DEFAULT 'notice' 
          AFTER mentions
        `));
        results.push("log_type 컬럼 추가 완료");
      } catch (e: any) {
        if (e.message?.includes("Duplicate column")) {
          results.push("log_type 컬럼 이미 존재");
        } else {
          results.push("log_type: " + e.message);
        }
      }

      // 2. title 컬럼 추가
      try {
        await db.execute(sql.raw(`
          ALTER TABLE communication_logs 
          ADD COLUMN title VARCHAR(200) NULL 
          AFTER log_type
        `));
        results.push("title 컬럼 추가 완료");
      } catch (e: any) {
        if (e.message?.includes("Duplicate column")) {
          results.push("title 컬럼 이미 존재");
        } else {
          results.push("title: " + e.message);
        }
      }

      // 3. communication_log_acks 테이블 생성
      try {
        await db.execute(sql.raw(`
          CREATE TABLE IF NOT EXISTS communication_log_acks (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            log_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_cla_log_id (log_id),
            INDEX idx_cla_user_id (user_id),
            UNIQUE INDEX idx_cla_unique_ack (log_id, user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `));
        results.push("communication_log_acks 테이블 생성 완료");
      } catch (e: any) {
        if (e.message?.includes("already exists")) {
          results.push("communication_log_acks 테이블 이미 존재");
        } else {
          results.push("acks: " + e.message);
        }
      }

      // 4. log_type 인덱스 추가
      try {
        await db.execute(sql.raw(`
          ALTER TABLE communication_logs ADD INDEX idx_cl_log_type (log_type)
        `));
        results.push("log_type 인덱스 추가 완료");
      } catch (e: any) {
        if (e.message?.includes("Duplicate key")) {
          results.push("log_type 인덱스 이미 존재");
        } else {
          results.push("인덱스: " + e.message);
        }
      }

      // 5. 기존 데이터 마이그레이션: partner_id > 0인데 log_type이 사내공지인 데이터를 'partner'로 변경
      try {
        const migResult = await db.execute(sql.raw(`
          UPDATE communication_logs SET log_type = 'partner' WHERE partner_id > 0 AND log_type != 'partner'
        `));
        results.push("partner_id>0 데이터 log_type 마이그레이션 완료");
      } catch (e: any) {
        results.push("partner 마이그레이션: " + e.message);
      }

      // 6. communication_log_comments 테이블 생성
      try {
        await db.execute(sql.raw(`
          CREATE TABLE IF NOT EXISTS communication_log_comments (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            tenant_id INT NOT NULL,
            log_id BIGINT NOT NULL,
            content TEXT NOT NULL,
            author_id BIGINT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_clc_log_id (log_id),
            INDEX idx_clc_author_id (author_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `));
        results.push("communication_log_comments 테이블 생성 완료");
      } catch (e: any) {
        if (e.message?.includes("already exists")) {
          results.push("communication_log_comments 테이블 이미 존재");
        } else {
          results.push("comments: " + e.message);
        }
      }

      return { success: true, results };
    }),
});
