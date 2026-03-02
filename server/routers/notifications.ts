/**
 * 알림 REST API
 * 
 * ⚠️ 현재 미사용 (server/_core/index.ts에 마운트되지 않음)
 * ✅ 보안 강화: JWT 기반 인증 미들웨어 적용
 * ✅ tenantId는 req.tenantUser에서만 추출
 * ✅ 런타임 CREATE TABLE 제거 (마이그레이션으로 이관)
 * ✅ db import 제거 (getRawConnection 사용)
 */
import { Router } from "express";
import { getRawConnection } from "../db";
import { z } from "zod";
import { requireTenantAuth, TenantAuthRequest } from "../_core/expressAuthMiddleware";

const router = Router();

// ✅ 모든 라우트에 인증 미들웨어 적용
router.use(requireTenantAuth as any);

// 알림 생성
router.post("/create", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;

    const schema = z.object({
      userId: z.number().optional(),
      title: z.string(),
      message: z.string(),
      type: z.enum(["일지작성", "승인요청", "승인완료", "반려", "기타"]),
      logType: z.string().optional(),
      logId: z.number().optional(),
    });

    const data = schema.parse(req.body);
    const pool = await getRawConnection();

    const [result] = await pool.execute(
      `INSERT INTO notifications (
        tenant_id, user_id, title, message, type, log_type, log_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        data.userId || null,
        data.title,
        data.message,
        data.type,
        data.logType || null,
        data.logId || null,
      ]
    );

    res.json({ success: true, id: (result as any).insertId });
  } catch (error: any) {
    console.error("알림 생성 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 알림 조회
router.get("/get", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const userId = req.query.userId ? parseInt(req.query.userId as string) : null;
    const isRead = req.query.isRead as string;

    let query = "SELECT * FROM notifications WHERE tenant_id = ?";
    const params: any[] = [tenantId];

    if (userId) {
      query += " AND (user_id = ? OR user_id IS NULL)";
      params.push(userId);
    }

    if (isRead === "true") {
      query += " AND is_read = TRUE";
    } else if (isRead === "false") {
      query += " AND is_read = FALSE";
    }

    query += " ORDER BY created_at DESC LIMIT 100";

    const pool = await getRawConnection();
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error: any) {
    console.error("알림 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 알림 읽음 처리 (✅ tenant_id 강제)
router.put("/markAsRead/:id", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const id = parseInt(req.params.id);

    const pool = await getRawConnection();
    await pool.execute(
      "UPDATE notifications SET is_read = TRUE WHERE id = ? AND tenant_id = ?",
      [id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("알림 읽음 처리 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 모든 알림 읽음 처리
router.put("/markAllAsRead", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const userId = req.tenantUser!.id;

    let query = "UPDATE notifications SET is_read = TRUE WHERE tenant_id = ?";
    const params: any[] = [tenantId];

    if (userId) {
      query += " AND (user_id = ? OR user_id IS NULL)";
      params.push(userId);
    }

    const pool = await getRawConnection();
    await pool.execute(query, params);
    res.json({ success: true });
  } catch (error: any) {
    console.error("모든 알림 읽음 처리 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 알림 삭제 (✅ tenant_id 강제)
router.delete("/delete/:id", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const id = parseInt(req.params.id);

    const pool = await getRawConnection();
    await pool.execute(
      "DELETE FROM notifications WHERE id = ? AND tenant_id = ?",
      [id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("알림 삭제 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 읽지 않은 알림 개수 조회
router.get("/unreadCount", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const userId = req.tenantUser!.id;

    let query = "SELECT COUNT(*) as count FROM notifications WHERE tenant_id = ? AND is_read = FALSE";
    const params: any[] = [tenantId];

    if (userId) {
      query += " AND (user_id = ? OR user_id IS NULL)";
      params.push(userId);
    }

    const pool = await getRawConnection();
    const [rows] = await pool.execute(query, params) as any;
    res.json({ count: rows[0].count });
  } catch (error: any) {
    console.error("읽지 않은 알림 개수 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
