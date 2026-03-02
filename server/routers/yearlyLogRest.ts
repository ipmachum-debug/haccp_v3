/**
 * 연간일지 REST API
 * 
 * ✅ 보안 강화: JWT 기반 인증 미들웨어 사용
 * ✅ tenantId는 req.tenantUser에서만 추출 (req.query/req.body 신뢰 금지)
 * ✅ 모든 쿼리에 tenant_id 조건 강제
 */
import { Router, Request, Response } from "express";
import { getRawConnection } from "../db";
import { requireTenantAuth, TenantAuthRequest } from "../_core/expressAuthMiddleware";

const router = Router();

// ✅ 모든 라우트에 인증 미들웨어 적용
router.use(requireTenantAuth as any);

// 연간일지 작성
router.post("/create", async (req: TenantAuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const conn = await getRawConnection();
    const data = req.body;

    await conn.execute(
      `INSERT INTO yearly_logs (
        tenant_id, inspection_date, inspector,
        calibration_freezer_panel_thermometer, calibration_refrigerator, calibration_timer,
        calibration_probe_thermometer, calibration_scale, calibration_oven,
        calibration_metal_detector, calibration_hygrothermograph,
        calibration_radiation_thermometer1, calibration_radiation_thermometer2,
        calibration_oven_work_thermometer,
        metal_detector_check_date, metal_detector_next_check,
        periodic_verification_date, periodic_verification_next,
        special_notes, improvement_action, action_taker, confirmation
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        tenantId, data.inspectionDate, data.inspector,
        data.calibrationFreezerPanelThermometer || null, data.calibrationRefrigerator || null, data.calibrationTimer || null,
        data.calibrationProbeThermometer || null, data.calibrationScale || null, data.calibrationOven || null,
        data.calibrationMetalDetector || null, data.calibrationHygrothermograph || null,
        data.calibrationRadiationThermometer1 || null, data.calibrationRadiationThermometer2 || null,
        data.calibrationOvenWorkThermometer || null,
        data.metalDetectorCheckDate || null, data.metalDetectorNextCheck || null,
        data.periodicVerificationDate || null, data.periodicVerificationNext || null,
        data.specialNotes || null, data.improvementAction || null, data.actionTaker || null, data.confirmation || null
      ]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("연간일지 작성 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 연간일지 목록 조회
router.get("/get", async (req: TenantAuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const conn = await getRawConnection();
    const { startDate, endDate, status } = req.query;

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

    const [logs] = await conn.execute(query, params) as any;
    res.json({ success: true, logs });
  } catch (error: any) {
    console.error("연간일지 조회 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 승인 (✅ tenant_id 조건 강제)
router.post("/approve/:id", async (req: TenantAuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const conn = await getRawConnection();
    const id = parseInt(req.params.id);
    const approvedBy = req.tenantUser!.name;

    await conn.execute(
      `UPDATE yearly_logs SET status = '승인완료', approved_by = ?, approved_at = NOW() WHERE id = ? AND tenant_id = ?`,
      [approvedBy, id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("연간일지 승인 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 승인 요청 (✅ tenant_id 조건 강제)
router.post("/requestApproval/:id", async (req: TenantAuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const conn = await getRawConnection();
    const id = parseInt(req.params.id);

    await conn.execute(
      `UPDATE yearly_logs SET status = '승인대기' WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("연간일지 승인요청 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 반려 (✅ tenant_id 조건 강제)
router.post("/reject/:id", async (req: TenantAuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const conn = await getRawConnection();
    const id = parseInt(req.params.id);
    const { rejectedReason } = req.body;

    await conn.execute(
      `UPDATE yearly_logs SET status = '작성중', rejected_reason = ? WHERE id = ? AND tenant_id = ?`,
      [rejectedReason, id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("연간일지 반려 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

// 삭제 (✅ tenant_id 조건 강제)
router.delete("/delete/:id", async (req: TenantAuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const conn = await getRawConnection();
    const id = parseInt(req.params.id);

    await conn.execute(
      `DELETE FROM yearly_logs WHERE id = ? AND tenant_id = ?`,
      [id, tenantId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("연간일지 삭제 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
