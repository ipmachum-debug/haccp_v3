/**
 * 특정기간일지 REST API
 * 
 * ✅ 보안 강화: JWT 기반 인증 미들웨어 사용
 * ✅ tenantId는 req.tenantUser에서만 추출 (req.query/req.body 신뢰 금지)
 * ✅ 모든 쿼리에 tenant_id 조건 강제
 * ✅ 런타임 CREATE TABLE 제거 (마이그레이션으로 이관)
 */
import { Router } from "express";
import { getRawConnection } from "../../db";
import { z } from "zod";
import { requireTenantAuth, TenantAuthRequest } from "../../_core/expressAuthMiddleware";

const router = Router();

// ✅ 모든 라우트에 인증 미들웨어 적용
router.use(requireTenantAuth as any);

// 특정기간일지 작성
router.post("/create", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;

    const schema = z.object({
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

    const pool = await getRawConnection();
    const [result] = await pool.execute(
      `INSERT INTO custom_period_logs (
        tenant_id, start_date, end_date, inspector, log_type,
        content, special_notes, improvement_action, action_taker, confirmation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId, data.startDate, data.endDate, data.inspector, data.logType,
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
router.get("/get", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
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

    const pool = await getRawConnection();
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error: any) {
    console.error("특정기간일지 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 특정기간일지 수정 (✅ tenant_id 조건 추가)
router.put("/update/:id", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const id = parseInt(req.params.id);
    const data = req.body;

    await (await getRawConnection()).execute(
      `UPDATE custom_period_logs SET
        start_date = ?, end_date = ?, inspector = ?, log_type = ?,
        content = ?, special_notes = ?, improvement_action = ?,
        action_taker = ?, confirmation = ?
      WHERE id = ? AND tenant_id = ?`,
      [
        data.startDate, data.endDate, data.inspector, data.logType,
        data.content || null, data.specialNotes || null, data.improvementAction || null,
        data.actionTaker || null, data.confirmation || null, id, tenantId
      ]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("특정기간일지 수정 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 특정기간일지 삭제 (✅ tenant_id 조건 강제)
router.delete("/delete/:id", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const id = parseInt(req.params.id);

    await (await getRawConnection()).execute(
      "DELETE FROM custom_period_logs WHERE id = ? AND tenant_id = ?",
      [id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("특정기간일지 삭제 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 승인 (✅ tenant_id 조건 강제)
router.post("/approve/:id", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const id = parseInt(req.params.id);
    const approvedBy = req.tenantUser!.name;

    await (await getRawConnection()).execute(
      `UPDATE custom_period_logs SET status = '승인완료', approved_by = ?, approved_at = NOW() WHERE id = ? AND tenant_id = ?`,
      [approvedBy, id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("특정기간일지 승인 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 승인 요청 (✅ tenant_id 조건 강제)
router.post("/requestApproval/:id", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const id = parseInt(req.params.id);

    await (await getRawConnection()).execute(
      `UPDATE custom_period_logs SET status = '승인대기' WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("특정기간일지 승인 요청 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 반려 (✅ tenant_id 조건 강제)
router.post("/reject/:id", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const id = parseInt(req.params.id);
    const { rejectedReason } = req.body;

    await (await getRawConnection()).execute(
      `UPDATE custom_period_logs SET status = '작성중', rejected_reason = ? WHERE id = ? AND tenant_id = ?`,
      [rejectedReason, id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("특정기간일지 반려 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
