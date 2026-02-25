import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

// 연간일지 작성
router.post("/create", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const data = req.body;
    
    // ✨ 테넌트 ID 필수 검증
    if (!data.tenantId) {
      return res.status(403).json({ error: "Tenant ID is required" });
    }
    
    await (db as any).execute(sql`
      INSERT INTO yearly_logs (
        tenant_id, inspection_date, inspector,
        calibration_freezer_panel_thermometer, calibration_refrigerator, calibration_timer,
        calibration_probe_thermometer, calibration_scale, calibration_oven,
        calibration_metal_detector, calibration_hygrothermograph,
        calibration_radiation_thermometer1, calibration_radiation_thermometer2,
        calibration_oven_work_thermometer,
        metal_detector_check_date, metal_detector_next_check,
        periodic_verification_date, periodic_verification_next,
        special_notes, improvement_action, action_taker, confirmation
      ) VALUES (
        ${data.tenantId}, ${data.inspectionDate}, ${data.inspector},
        ${data.calibrationFreezerPanelThermometer || null}, ${data.calibrationRefrigerator || null}, ${data.calibrationTimer || null},
        ${data.calibrationProbeThermometer || null}, ${data.calibrationScale || null}, ${data.calibrationOven || null},
        ${data.calibrationMetalDetector || null}, ${data.calibrationHygrothermograph || null},
        ${data.calibrationRadiationThermometer1 || null}, ${data.calibrationRadiationThermometer2 || null},
        ${data.calibrationOvenWorkThermometer || null},
        ${data.metalDetectorCheckDate || null}, ${data.metalDetectorNextCheck || null},
        ${data.periodicVerificationDate || null}, ${data.periodicVerificationNext || null},
        ${data.specialNotes || null}, ${data.improvementAction || null}, ${data.actionTaker || null}, ${data.confirmation || null}
      )
    `);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("연간일지 작성 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 연간일지 목록 조회
router.get("/get", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { tenantId, startDate, endDate, status } = req.query;
    
    // ✨ 테넌트 ID 필수 검증
    if (!tenantId) {
      return res.status(403).json({ error: "Tenant ID is required" });
    }
    
    let query = `SELECT * FROM yearly_logs WHERE tenant_id = ?`;
    const params: any[] = [tenantId];
    
    if (startDate && endDate) {
      query += ` AND inspection_date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }
    
    if (status && status !== "전체") {
      query += ` AND status = ?`;
      params.push(status);
    }
    
    query += ` ORDER BY inspection_date DESC`;
    
    const result = await (db as any).execute(query, params);
    const logs = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    res.json({ success: true, logs });
  } catch (error: any) {
    console.error("연간일지 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 승인
router.post("/approve/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);
    const { approvedBy } = req.body;
    
    await (db as any).execute(
      `UPDATE yearly_logs SET status = '승인완료', approved_by = ?, approved_at = NOW() WHERE id = ?`,
      [approvedBy || '관리자', id]
    );
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("연간일지 승인 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 승인 요청
router.post("/requestApproval/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);
    
    await (db as any).execute(
      `UPDATE yearly_logs SET status = '승인대기' WHERE id = ?`,
      [id]
    );
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("연간일지 승인요청 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 반려
router.post("/reject/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);
    const { rejectedReason } = req.body;
    
    await (db as any).execute(
      `UPDATE yearly_logs SET status = '작성중', rejected_reason = ? WHERE id = ?`,
      [rejectedReason, id]
    );
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("연간일지 반려 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 삭제
router.delete("/delete/:id", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);
    
    await (db as any).execute(
      `DELETE FROM yearly_logs WHERE id = ?`,
      [id]
    );
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("연간일지 삭제 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
