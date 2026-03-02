import { Router } from "express";
import { db } from "../db";
import { z } from "zod";

const router = Router();

// 테이블 자동 생성
async function ensureNotificationsTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      user_id INT COMMENT '수신자 ID',
      title VARCHAR(255) NOT NULL COMMENT '알림 제목',
      message TEXT NOT NULL COMMENT '알림 내용',
      type ENUM('일지작성', '승인요청', '승인완료', '반려', '기타') DEFAULT '기타',
      log_type VARCHAR(50) COMMENT '일지 유형 (daily, weekly, monthly, yearly, custom)',
      log_id INT COMMENT '일지 ID',
      is_read BOOLEAN DEFAULT FALSE COMMENT '읽음 여부',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tenant_user (tenant_id, user_id),
      INDEX idx_read (is_read),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='알림'
  `;
  
  try {
    await db.execute(createTableSQL);
    console.log("✅ notifications 테이블 확인/생성 완료");
  } catch (error) {
    console.error("❌ notifications 테이블 생성 오류:", error);
  }
}

// 서버 시작 시 테이블 생성
ensureNotificationsTable();

// 알림 생성
router.post("/create", async (req, res) => {
  try {
    const schema = z.object({
      tenantId: z.number(),
      userId: z.number().optional(),
      title: z.string(),
      message: z.string(),
      type: z.enum(["일지작성", "승인요청", "승인완료", "반려", "기타"]),
      logType: z.string().optional(),
      logId: z.number().optional(),
    });

    const data = schema.parse(req.body);

    const [result] = await db.execute(
      `INSERT INTO notifications (
        tenant_id, user_id, title, message, type, log_type, log_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.tenantId,
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
router.get("/get", async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
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

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (error: any) {
    console.error("알림 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 알림 읽음 처리
router.put("/markAsRead/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.execute("UPDATE notifications SET is_read = TRUE WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error("알림 읽음 처리 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 모든 알림 읽음 처리
router.put("/markAllAsRead", async (req, res) => {
  try {
    const tenantId = parseInt(req.body.tenantId);
    const userId = req.body.userId ? parseInt(req.body.userId) : null;

    let query = "UPDATE notifications SET is_read = TRUE WHERE tenant_id = ?";
    const params: any[] = [tenantId];

    if (userId) {
      query += " AND (user_id = ? OR user_id IS NULL)";
      params.push(userId);
    }

    await db.execute(query, params);
    res.json({ success: true });
  } catch (error: any) {
    console.error("모든 알림 읽음 처리 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 알림 삭제
router.delete("/delete/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.execute("DELETE FROM notifications WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error("알림 삭제 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 읽지 않은 알림 개수 조회
router.get("/unreadCount", async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    const userId = req.query.userId ? parseInt(req.query.userId as string) : null;

    let query = "SELECT COUNT(*) as count FROM notifications WHERE tenant_id = ? AND is_read = FALSE";
    const params: any[] = [tenantId];

    if (userId) {
      query += " AND (user_id = ? OR user_id IS NULL)";
      params.push(userId);
    }

    const [rows] = await db.execute(query, params) as any;
    res.json({ count: rows[0].count });
  } catch (error: any) {
    console.error("읽지 않은 알림 개수 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
