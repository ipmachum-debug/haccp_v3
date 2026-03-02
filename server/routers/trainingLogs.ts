/**
 * 교육훈련일지 REST API
 * 
 * ⚠️ 현재 미사용 (server/_core/index.ts에 마운트되지 않음)
 * ✅ 보안 강화: JWT 기반 인증 미들웨어 적용
 * ✅ tenantId는 req.tenantUser에서만 추출
 * ✅ SQLite 코드 제거 → MySQL (getRawConnection) 사용
 * ✅ 런타임 CREATE TABLE 제거 (마이그레이션으로 이관)
 * ✅ 모든 쿼리에 tenant_id 조건 강제
 */
import { Router } from "express";
import { getRawConnection } from "../db";
import { requireTenantAuth, TenantAuthRequest } from "../_core/expressAuthMiddleware";

const router = Router();

// ✅ 모든 라우트에 인증 미들웨어 적용
router.use(requireTenantAuth as any);

// 교육훈련일지 작성
router.post("/create", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const {
      educator, location, trainingDate, startTime, endTime,
      targetAudience, category, material,
      topic1, topic2, topic3, topic4,
      contentSummary, contentResult,
      evidencePhotos, attendees,
      concentration, understanding, application,
      improvementAction, creator,
    } = req.body;

    const pool = await getRawConnection();
    const [result] = await pool.execute(
      `INSERT INTO training_logs (
        tenant_id, educator, location, training_date, start_time, end_time,
        target_audience, category, material, topic_1, topic_2, topic_3, topic_4,
        content_summary, content_result, evidence_photos, attendees,
        concentration, understanding, application, improvement_action, creator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        educator, location, trainingDate, startTime, endTime,
        targetAudience, category, material,
        topic1 || null, topic2 || null, topic3 || null, topic4 || null,
        contentSummary || null, contentResult || null,
        JSON.stringify(evidencePhotos || []),
        JSON.stringify(attendees || []),
        concentration || null, understanding || null, application || null,
        improvementAction || null, creator || null
      ]
    );

    res.json({ success: true, id: (result as any).insertId });
  } catch (error: any) {
    console.error("교육훈련일지 작성 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 조회
router.get("/get", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const { startDate, endDate, status } = req.query;

    let query = "SELECT * FROM training_logs WHERE tenant_id = ?";
    const params: any[] = [tenantId];

    if (startDate) {
      query += " AND training_date >= ?";
      params.push(startDate);
    }

    if (endDate) {
      query += " AND training_date <= ?";
      params.push(endDate);
    }

    if (status && status !== "all") {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY training_date DESC, created_at DESC";

    const pool = await getRawConnection();
    const [logs] = await pool.execute(query, params);

    // JSON 파싱
    const parsedLogs = (logs as any[]).map((log: any) => ({
      ...log,
      evidencePhotos: JSON.parse(log.evidence_photos || "[]"),
      attendees: JSON.parse(log.attendees || "[]"),
    }));

    res.json(parsedLogs);
  } catch (error: any) {
    console.error("교육훈련일지 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 수정 (✅ tenant_id 조건 강제)
router.put("/update", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const {
      id, educator, location, trainingDate, startTime, endTime,
      targetAudience, category, material,
      topic1, topic2, topic3, topic4,
      contentSummary, contentResult,
      evidencePhotos, attendees,
      concentration, understanding, application,
      improvementAction,
    } = req.body;

    const pool = await getRawConnection();
    await pool.execute(
      `UPDATE training_logs SET
        educator = ?, location = ?, training_date = ?, start_time = ?, end_time = ?,
        target_audience = ?, category = ?, material = ?, topic_1 = ?, topic_2 = ?,
        topic_3 = ?, topic_4 = ?, content_summary = ?, content_result = ?,
        evidence_photos = ?, attendees = ?, concentration = ?, understanding = ?,
        application = ?, improvement_action = ?, updated_at = NOW()
      WHERE id = ? AND tenant_id = ?`,
      [
        educator, location, trainingDate, startTime, endTime,
        targetAudience, category, material,
        topic1 || null, topic2 || null, topic3 || null, topic4 || null,
        contentSummary || null, contentResult || null,
        JSON.stringify(evidencePhotos || []),
        JSON.stringify(attendees || []),
        concentration || null, understanding || null, application || null,
        improvementAction || null,
        id, tenantId
      ]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("교육훈련일지 수정 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 삭제 (✅ tenant_id 조건 강제)
router.delete("/delete", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const { id } = req.query;

    const pool = await getRawConnection();
    await pool.execute(
      "DELETE FROM training_logs WHERE id = ? AND tenant_id = ?",
      [id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("교육훈련일지 삭제 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 승인 (✅ tenant_id 조건 강제)
router.post("/approve", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const { id } = req.body;
    const approver = req.tenantUser!.name;

    const pool = await getRawConnection();
    await pool.execute(
      `UPDATE training_logs SET
        status = '승인완료', approver = ?, approved_at = NOW(), updated_at = NOW()
      WHERE id = ? AND tenant_id = ?`,
      [approver, id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("교육훈련일지 승인 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 승인 요청 (✅ tenant_id 조건 강제)
router.post("/requestApproval", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const { id } = req.body;

    const pool = await getRawConnection();
    await pool.execute(
      `UPDATE training_logs SET status = '승인대기', updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("교육훈련일지 승인 요청 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 반려 (✅ tenant_id 조건 강제)
router.post("/reject", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const { id } = req.body;

    const pool = await getRawConnection();
    await pool.execute(
      `UPDATE training_logs SET status = '작성중', updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("교육훈련일지 반려 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
