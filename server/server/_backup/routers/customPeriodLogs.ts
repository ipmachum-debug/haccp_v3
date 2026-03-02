import { Router } from "express";
import { getRawConnection } from "../db";
import { z } from "zod";

const router = Router();

// 테이블 자동 생성
async function ensureCustomPeriodLogsTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS custom_period_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      start_date DATE NOT NULL COMMENT '시작일자',
      end_date DATE NOT NULL COMMENT '종료일자',
      inspector VARCHAR(100) NOT NULL COMMENT '점검자',
      log_type VARCHAR(50) NOT NULL COMMENT '일지 유형',
      content TEXT COMMENT '점검 내용',
      special_notes TEXT COMMENT '특이사항',
      improvement_action TEXT COMMENT '개선조치 및 결과',
      action_taker VARCHAR(100) COMMENT '조치자',
      confirmation VARCHAR(100) COMMENT '확인',
      status ENUM('작성중', '승인대기', '승인완료') DEFAULT '작성중',
      approved_by VARCHAR(100) COMMENT '승인자',
      approved_at DATETIME COMMENT '승인일시',
      rejected_reason TEXT COMMENT '반려 사유',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tenant_date (tenant_id, start_date, end_date),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='특정기간일지'
  `;
  
  try {
    const pool = await getRawConnection();
    await pool.execute(createTableSQL);
    console.log("✅ custom_period_logs 테이블 확인/생성 완료");
  } catch (error) {
    console.error("❌ custom_period_logs 테이블 생성 오류:", error);
  }
}

// 서버 시작 시 테이블 생성
ensureCustomPeriodLogsTable();

// 특정기간일지 작성
router.post("/create", async (req, res) => {
  try {
    const schema = z.object({
      tenantId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
      inspector: z.string(),
      logType: z.string(),
      content: z.string().optional(),
      specialNotes: z.string().optional(),
      improvementAction: z.string().optional(),
      actionTaker: z.string().optional(),
      confirmation: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const pool1 = await getRawConnection();
    const [result] = await pool1.execute(
      `INSERT INTO custom_period_logs (
        tenant_id, start_date, end_date, inspector, log_type,
        content, special_notes, improvement_action, action_taker, confirmation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.tenantId, data.startDate, data.endDate, data.inspector, data.logType,
        data.content || null, data.specialNotes || null, data.improvementAction || null,
        data.actionTaker || null, data.confirmation || null
      ]
    );

    res.json({ success: true, id: (result as any).insertId });
  } catch (error: any) {
    console.error("특정기간일지 작성 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 특정기간일지 조회
router.get("/get", async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const status = req.query.status as string;

    let query = "SELECT * FROM custom_period_logs WHERE tenant_id = ?";
    const params: any[] = [tenantId];

    if (startDate && endDate) {
      query += " AND start_date >= ? AND end_date <= ?";
      params.push(startDate, endDate);
    }

    if (status && status !== "전체") {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY start_date DESC";

    const pool2 = await getRawConnection();
    const [rows] = await pool2.execute(query, params);
    res.json(rows);
  } catch (error: any) {
    console.error("특정기간일지 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 특정기간일지 수정
router.put("/update/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    await (await getRawConnection()).execute(
      `UPDATE custom_period_logs SET
        start_date = ?, end_date = ?, inspector = ?, log_type = ?,
        content = ?, special_notes = ?, improvement_action = ?,
        action_taker = ?, confirmation = ?
      WHERE id = ?`,
      [
        data.startDate, data.endDate, data.inspector, data.logType,
        data.content || null, data.specialNotes || null, data.improvementAction || null,
        data.actionTaker || null, data.confirmation || null, id
      ]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("특정기간일지 수정 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 특정기간일지 삭제
router.delete("/delete/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await (await getRawConnection()).execute("DELETE FROM custom_period_logs WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error("특정기간일지 삭제 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 승인
router.post("/approve/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { approvedBy } = req.body;

    await (await getRawConnection()).execute(
      `UPDATE custom_period_logs SET status = '승인완료', approved_by = ?, approved_at = NOW() WHERE id = ?`,
      [approvedBy, id]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("특정기간일지 승인 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 승인 요청
router.post("/requestApproval/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await (await getRawConnection()).execute(`UPDATE custom_period_logs SET status = '승인대기' WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error("특정기간일지 승인 요청 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 반려
router.post("/reject/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { rejectedReason } = req.body;

    await (await getRawConnection()).execute(
      `UPDATE custom_period_logs SET status = '작성중', rejected_reason = ? WHERE id = ?`,
      [rejectedReason, id]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("특정기간일지 반려 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
