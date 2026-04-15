/**
 * 통합 검색 REST API
 * 
 * ⚠️ 현재 미사용 (server/_core/index.ts에 마운트되지 않음)
 * ✅ 보안 강화: JWT 기반 인증 미들웨어 적용
 * ✅ tenantId는 req.tenantUser에서만 추출
 * ✅ db import 제거 (getRawConnection 사용)
 */
import { Router } from "express";
import { getRawConnection } from "../../db";
import { requireTenantAuth, TenantAuthRequest } from "../../_core/expressAuthMiddleware";

const router = Router();

// ✅ 모든 라우트에 인증 미들웨어 적용
router.use(requireTenantAuth as any);

// 통합 검색
router.get("/all", async (req: TenantAuthRequest, res) => {
  try {
    const tenantId = req.tenantUser!.tenantId;
    const keyword = req.query.keyword as string;
    const logType = req.query.logType as string; // daily, weekly, monthly, yearly, custom, all
    
    if (!keyword) {
      return res.json([]);
    }
    
    const pool = await getRawConnection();
    const results: any[] = [];
    const kw = `%${keyword}%`;
    
    // 일일일지 검색
    if (!logType || logType === "all" || logType === "daily") {
      const [dailyLogs] = await pool.execute(
        `SELECT 
          'daily' as log_type, id, date as log_date, inspector, status, notes, created_at
        FROM daily_logs
        WHERE tenant_id = ? AND (inspector LIKE ? OR notes LIKE ? OR status LIKE ?)
        ORDER BY date DESC LIMIT 50`,
        [tenantId, kw, kw, kw]
      );
      results.push(...(dailyLogs as any[]));
    }
    
    // 주간일지 (일반위생관리) 검색
    if (!logType || logType === "all" || logType === "weekly_hygiene") {
      const [weeklyHygiene] = await pool.execute(
        `SELECT 
          'weekly_hygiene' as log_type, id, inspection_date as log_date, inspector, status, special_notes as notes, created_at
        FROM weekly_hygiene_logs
        WHERE tenant_id = ? AND (inspector LIKE ? OR special_notes LIKE ? OR improvement LIKE ?)
        ORDER BY inspection_date DESC LIMIT 50`,
        [tenantId, kw, kw, kw]
      );
      results.push(...(weeklyHygiene as any[]));
    }
    
    // 주간일지 (방충방서) 검색
    if (!logType || logType === "all" || logType === "weekly_pest") {
      const [weeklyPest] = await pool.execute(
        `SELECT 
          'weekly_pest' as log_type, id, inspection_date as log_date, inspector, status, management_notes as notes, created_at
        FROM weekly_pest_logs
        WHERE tenant_id = ? AND (inspector LIKE ? OR management_notes LIKE ? OR deviation_cause LIKE ?)
        ORDER BY inspection_date DESC LIMIT 50`,
        [tenantId, kw, kw, kw]
      );
      results.push(...(weeklyPest as any[]));
    }
    
    // 월간일지 (일반위생관리) 검색
    if (!logType || logType === "all" || logType === "monthly_hygiene") {
      const [monthlyHygiene] = await pool.execute(
        `SELECT 
          'monthly_hygiene' as log_type, id, inspection_date as log_date, inspector, status, special_notes as notes, created_at
        FROM monthly_hygiene_logs
        WHERE tenant_id = ? AND (inspector LIKE ? OR special_notes LIKE ? OR improvement LIKE ?)
        ORDER BY inspection_date DESC LIMIT 50`,
        [tenantId, kw, kw, kw]
      );
      results.push(...(monthlyHygiene as any[]));
    }
    
    // 월간일지 (CCP 검증) 검색
    if (!logType || logType === "all" || logType === "monthly_ccp") {
      const [monthlyCCP] = await pool.execute(
        `SELECT 
          'monthly_ccp' as log_type, id, inspection_date as log_date, inspector, status, deviation_content as notes, created_at
        FROM monthly_ccp_logs
        WHERE tenant_id = ? AND (inspector LIKE ? OR deviation_content LIKE ? OR corrective_action LIKE ?)
        ORDER BY inspection_date DESC LIMIT 50`,
        [tenantId, kw, kw, kw]
      );
      results.push(...(monthlyCCP as any[]));
    }
    
    // 연간일지 검색
    if (!logType || logType === "all" || logType === "yearly") {
      const [yearlyLogs] = await pool.execute(
        `SELECT 
          'yearly' as log_type, id, inspection_date as log_date, inspector, status, special_notes as notes, created_at
        FROM yearly_logs
        WHERE tenant_id = ? AND (inspector LIKE ? OR special_notes LIKE ? OR improvement LIKE ?)
        ORDER BY inspection_date DESC LIMIT 50`,
        [tenantId, kw, kw, kw]
      );
      results.push(...(yearlyLogs as any[]));
    }
    
    // 특정기간일지 검색
    if (!logType || logType === "all" || logType === "custom") {
      const [customLogs] = await pool.execute(
        `SELECT 
          'custom' as log_type, id, start_date as log_date, inspector, status, special_notes as notes, created_at
        FROM custom_period_logs
        WHERE tenant_id = ? AND (inspector LIKE ? OR content LIKE ? OR special_notes LIKE ?)
        ORDER BY start_date DESC LIMIT 50`,
        [tenantId, kw, kw, kw]
      );
      results.push(...(customLogs as any[]));
    }
    
    // 생성일시 기준 정렬
    results.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });
    
    res.json(results.slice(0, 100)); // 최대 100개
  } catch (error: any) {
    console.error("통합 검색 오류:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
