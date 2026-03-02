import { Router } from "express";
import { db } from "../db";
import { z } from "zod";

const router = Router();

// 통합 검색
router.get("/all", async (req, res) => {
  try {
    const tenantId = parseInt(req.query.tenantId as string);
    const keyword = req.query.keyword as string;
    const logType = req.query.logType as string; // daily, weekly, monthly, yearly, custom, all
    
    if (!keyword) {
      return res.json([]);
    }
    
    const results: any[] = [];
    
    // 일일일지 검색
    if (!logType || logType === "all" || logType === "daily") {
      const [dailyLogs] = await db.execute(
        `SELECT 
          'daily' as log_type,
          id,
          date as log_date,
          inspector,
          status,
          notes,
          created_at
        FROM daily_logs
        WHERE tenant_id = ? AND (
          inspector LIKE ? OR
          notes LIKE ? OR
          status LIKE ?
        )
        ORDER BY date DESC
        LIMIT 50`,
        [tenantId, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
      );
      results.push(...(dailyLogs as any[]));
    }
    
    // 주간일지 (일반위생관리) 검색
    if (!logType || logType === "all" || logType === "weekly_hygiene") {
      const [weeklyHygiene] = await db.execute(
        `SELECT 
          'weekly_hygiene' as log_type,
          id,
          inspection_date as log_date,
          inspector,
          status,
          special_notes as notes,
          created_at
        FROM weekly_hygiene_logs
        WHERE tenant_id = ? AND (
          inspector LIKE ? OR
          special_notes LIKE ? OR
          improvement LIKE ?
        )
        ORDER BY inspection_date DESC
        LIMIT 50`,
        [tenantId, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
      );
      results.push(...(weeklyHygiene as any[]));
    }
    
    // 주간일지 (방충방서) 검색
    if (!logType || logType === "all" || logType === "weekly_pest") {
      const [weeklyPest] = await db.execute(
        `SELECT 
          'weekly_pest' as log_type,
          id,
          inspection_date as log_date,
          inspector,
          status,
          management_notes as notes,
          created_at
        FROM weekly_pest_logs
        WHERE tenant_id = ? AND (
          inspector LIKE ? OR
          management_notes LIKE ? OR
          deviation_cause LIKE ?
        )
        ORDER BY inspection_date DESC
        LIMIT 50`,
        [tenantId, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
      );
      results.push(...(weeklyPest as any[]));
    }
    
    // 월간일지 (일반위생관리) 검색
    if (!logType || logType === "all" || logType === "monthly_hygiene") {
      const [monthlyHygiene] = await db.execute(
        `SELECT 
          'monthly_hygiene' as log_type,
          id,
          inspection_date as log_date,
          inspector,
          status,
          special_notes as notes,
          created_at
        FROM monthly_hygiene_logs
        WHERE tenant_id = ? AND (
          inspector LIKE ? OR
          special_notes LIKE ? OR
          improvement LIKE ?
        )
        ORDER BY inspection_date DESC
        LIMIT 50`,
        [tenantId, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
      );
      results.push(...(monthlyHygiene as any[]));
    }
    
    // 월간일지 (CCP 검증) 검색
    if (!logType || logType === "all" || logType === "monthly_ccp") {
      const [monthlyCCP] = await db.execute(
        `SELECT 
          'monthly_ccp' as log_type,
          id,
          inspection_date as log_date,
          inspector,
          status,
          deviation_content as notes,
          created_at
        FROM monthly_ccp_logs
        WHERE tenant_id = ? AND (
          inspector LIKE ? OR
          deviation_content LIKE ? OR
          corrective_action LIKE ?
        )
        ORDER BY inspection_date DESC
        LIMIT 50`,
        [tenantId, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
      );
      results.push(...(monthlyCCP as any[]));
    }
    
    // 연간일지 검색
    if (!logType || logType === "all" || logType === "yearly") {
      const [yearlyLogs] = await db.execute(
        `SELECT 
          'yearly' as log_type,
          id,
          inspection_date as log_date,
          inspector,
          status,
          special_notes as notes,
          created_at
        FROM yearly_logs
        WHERE tenant_id = ? AND (
          inspector LIKE ? OR
          special_notes LIKE ? OR
          improvement LIKE ?
        )
        ORDER BY inspection_date DESC
        LIMIT 50`,
        [tenantId, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
      );
      results.push(...(yearlyLogs as any[]));
    }
    
    // 특정기간일지 검색
    if (!logType || logType === "all" || logType === "custom") {
      const [customLogs] = await db.execute(
        `SELECT 
          'custom' as log_type,
          id,
          start_date as log_date,
          inspector,
          status,
          special_notes as notes,
          created_at
        FROM custom_period_logs
        WHERE tenant_id = ? AND (
          inspector LIKE ? OR
          title LIKE ? OR
          content LIKE ? OR
          special_notes LIKE ?
        )
        ORDER BY start_date DESC
        LIMIT 50`,
        [tenantId, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
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
