/**
 * Partner Credit Score Calculator — CRM Phase 4
 *
 * 거래처별 신용/활성도 점수 (0-100) 일일 산정.
 *
 * 산정 알고리즘 (4 factors):
 *   1. 결제 적시성 (paymentTimelinessScore, 0-30)
 *      - AP 만기일 대비 실제 결제일의 평균 지연일 (최근 90일)
 *      - 0일 지연 = 30점, 30일 지연 = 0점 (선형)
 *      - 결제 데이터 없으면 25점 (중립)
 *
 *   2. 신용 활용도 (creditUtilizationScore, 0-25)
 *      - AP balance / credit_limit 비율
 *      - 0% = 25점, 100% = 0점, 100%+ = -5점 (한도 초과 페널티)
 *      - credit_limit 없으면 20점 (중립)
 *
 *   3. 활동 빈도 (activityFrequencyScore, 0-20)
 *      - 최근 90일 partner_activities 카운트
 *      - 0건 = 0점, 30건+ = 20점 (선형)
 *
 *   4. 거래량 안정성 (transactionStabilityScore, 0-25)
 *      - 최근 6개월 월별 거래액의 변동계수 (CV)
 *      - CV ≤ 30% = 25점, CV ≥ 100% = 0점 (선형)
 *      - 거래 데이터 < 3개월 = 15점 (중립)
 *
 * 자동 등급:
 *   - 90+ : A (VIP)
 *   - 70-89: B (Standard)
 *   - 50-69: C (Watch)
 *   - <50: D (Risk)
 *
 * 작성: 2026-05-05
 */

import { sql } from "drizzle-orm";

interface ScoreBreakdown {
  paymentTimelinessScore: number;
  creditUtilizationScore: number;
  activityFrequencyScore: number;
  transactionStabilityScore: number;
  totalScore: number;
  grade: "A" | "B" | "C" | "D";
  reasoning: {
    avgPaymentDelayDays: number | null;
    apBalance: number;
    creditLimit: number | null;
    utilizationPct: number | null;
    activityCount90d: number;
    monthlyTransactionCV: number | null;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function scoreToGrade(score: number): "A" | "B" | "C" | "D" {
  if (score >= 90) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

/**
 * 단일 거래처 점수 산정
 */
export async function calculatePartnerScore(
  db: any,
  tenantId: number,
  partnerId: number,
): Promise<ScoreBreakdown> {
  // 1. 결제 적시성 (AP 결제 vs 만기)
  let paymentTimelinessScore = 25; // default 중립
  let avgDelayDays: number | null = null;
  try {
    const r: any = await db.execute(sql`
      SELECT AVG(DATEDIFF(occurred_at, due_date)) AS avg_delay
      FROM ap_ledger
      WHERE tenant_id = ${tenantId}
        AND supplier_partner_id = ${partnerId}
        AND ap_entry_type = 'payment'
        AND due_date IS NOT NULL
        AND occurred_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
    `);
    const row = ((r as any)?.[0] ?? [])[0];
    const avgDelay = row?.avg_delay;
    if (avgDelay !== null && avgDelay !== undefined) {
      avgDelayDays = Number(avgDelay);
      // 0일 = 30점, 30일+ = 0점, 음수 (조기결제) = 30점
      paymentTimelinessScore = clamp(30 - Math.max(0, avgDelayDays), 0, 30);
    }
  } catch (_e) {
    /* ignore */
  }

  // 2. 신용 활용도 (AP balance vs credit_limit)
  let creditUtilizationScore = 20;
  let apBalance = 0;
  let creditLimit: number | null = null;
  let utilizationPct: number | null = null;
  try {
    const partnerR: any = await db.execute(sql`
      SELECT credit_limit FROM partners WHERE id = ${partnerId} AND tenant_id = ${tenantId}
    `);
    const partnerRow = ((partnerR as any)?.[0] ?? [])[0];
    creditLimit = partnerRow?.credit_limit ? Number(partnerRow.credit_limit) : null;

    const apR: any = await db.execute(sql`
      SELECT COALESCE(SUM(
        CASE WHEN ap_entry_type = 'bill' THEN amount
             WHEN ap_entry_type = 'payment' THEN -amount
             WHEN ap_entry_type = 'credit' THEN -amount
             WHEN ap_entry_type = 'adjust' THEN amount
             ELSE 0 END
      ), 0) AS balance
      FROM ap_ledger
      WHERE tenant_id = ${tenantId} AND supplier_partner_id = ${partnerId}
    `);
    apBalance = Number(((apR as any)?.[0] ?? [])[0]?.balance || 0);

    if (creditLimit && creditLimit > 0) {
      utilizationPct = (apBalance / creditLimit) * 100;
      // 0% = 25점, 100% = 0점, >100% = -5점
      creditUtilizationScore = clamp(25 - utilizationPct * 0.25, -5, 25);
      if (utilizationPct > 100) creditUtilizationScore = clamp(creditUtilizationScore, -5, 25);
    }
  } catch (_e) {
    /* ignore */
  }

  // 3. 활동 빈도 (90일 partner_activities)
  let activityFrequencyScore = 0;
  let activityCount = 0;
  try {
    const r: any = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM partner_activities
      WHERE tenant_id = ${tenantId} AND partner_id = ${partnerId}
        AND occurred_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
    `);
    activityCount = Number(((r as any)?.[0] ?? [])[0]?.cnt || 0);
    // 0건 = 0점, 30건+ = 20점
    activityFrequencyScore = clamp((activityCount / 30) * 20, 0, 20);
  } catch (_e) {
    /* ignore */
  }

  // 4. 거래량 안정성 (월별 CV)
  let transactionStabilityScore = 15; // 중립 default
  let cv: number | null = null;
  try {
    const r: any = await db.execute(sql`
      SELECT
        DATE_FORMAT(transaction_date, '%Y-%m') AS ym,
        SUM(total_amount) AS total
      FROM (
        SELECT transaction_date, total_amount FROM accounting_purchases
        WHERE tenant_id = ${tenantId} AND partner_id = ${partnerId}
          AND transaction_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 6 MONTH), '%Y-%m-01')
        UNION ALL
        SELECT transaction_date, total_amount FROM accounting_sales
        WHERE tenant_id = ${tenantId} AND partner_id = ${partnerId}
          AND transaction_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 6 MONTH), '%Y-%m-01')
      ) AS t
      GROUP BY ym
      ORDER BY ym ASC
    `);
    const rows = ((r as any)?.[0] ?? []) as any[];
    if (rows.length >= 3) {
      const values = rows.map((row: any) => Number(row.total || 0));
      const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      if (mean > 0) {
        const variance =
          values.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / values.length;
        const stdev = Math.sqrt(variance);
        cv = (stdev / mean) * 100;
        // CV ≤ 30% = 25점, CV ≥ 100% = 0점
        transactionStabilityScore = clamp(25 - Math.max(0, cv - 30) * 0.357, 0, 25);
      }
    }
  } catch (_e) {
    /* ignore */
  }

  const totalScore = Math.round(
    paymentTimelinessScore +
      creditUtilizationScore +
      activityFrequencyScore +
      transactionStabilityScore,
  );

  return {
    paymentTimelinessScore: Math.round(paymentTimelinessScore),
    creditUtilizationScore: Math.round(creditUtilizationScore),
    activityFrequencyScore: Math.round(activityFrequencyScore),
    transactionStabilityScore: Math.round(transactionStabilityScore),
    totalScore: clamp(totalScore, 0, 100),
    grade: scoreToGrade(totalScore),
    reasoning: {
      avgPaymentDelayDays: avgDelayDays,
      apBalance,
      creditLimit,
      utilizationPct,
      activityCount90d: activityCount,
      monthlyTransactionCV: cv,
    },
  };
}

/**
 * 모든 활성 거래처에 대해 점수 산정 + partner_scores INSERT (UPSERT)
 *
 * 매일 cron 으로 실행. 한 거래처 × 한 날 = 1 row (UNIQUE KEY).
 */
export async function recalculateAllPartnerScores(): Promise<{
  tenantCount: number;
  partnerCount: number;
  errors: number;
}> {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) {
    console.warn("[creditScoreCalculator] DB 연결 실패 — skip");
    return { tenantCount: 0, partnerCount: 0, errors: 0 };
  }

  const tenantsR: any = await db.execute(sql`SELECT id FROM tenants`);
  const tenants = (((tenantsR as any)?.[0] ?? tenantsR) as any[]) || [];

  const today = new Date().toISOString().slice(0, 10);
  let totalPartners = 0;
  let errors = 0;

  for (const t of tenants) {
    const tenantId = Number(t.id);
    if (!tenantId) continue;

    try {
      const partnersR: any = await db.execute(sql`
        SELECT id FROM partners WHERE tenant_id = ${tenantId} AND is_active = 1
      `);
      const partners = ((partnersR as any)?.[0] ?? []) as any[];

      for (const p of partners) {
        const partnerId = Number(p.id);
        if (!partnerId) continue;

        try {
          const score = await calculatePartnerScore(db, tenantId, partnerId);
          // UPSERT (UNIQUE KEY uniq_ps_partner_date)
          await db.execute(sql`
            INSERT INTO partner_scores
              (tenant_id, partner_id, snapshot_date,
               payment_timeliness_score, credit_utilization_score,
               activity_frequency_score, transaction_stability_score,
               total_score, grade, breakdown, created_at)
            VALUES
              (${tenantId}, ${partnerId}, ${today},
               ${score.paymentTimelinessScore}, ${score.creditUtilizationScore},
               ${score.activityFrequencyScore}, ${score.transactionStabilityScore},
               ${score.totalScore}, ${score.grade},
               ${JSON.stringify(score.reasoning)}, NOW())
            ON DUPLICATE KEY UPDATE
              payment_timeliness_score = VALUES(payment_timeliness_score),
              credit_utilization_score = VALUES(credit_utilization_score),
              activity_frequency_score = VALUES(activity_frequency_score),
              transaction_stability_score = VALUES(transaction_stability_score),
              total_score = VALUES(total_score),
              grade = VALUES(grade),
              breakdown = VALUES(breakdown)
          `);
          totalPartners++;
        } catch (err: any) {
          errors++;
          console.warn(
            `[creditScoreCalculator] tenant=${tenantId} partner=${partnerId} 실패:`,
            err?.message ?? err,
          );
        }
      }
    } catch (err: any) {
      console.error(`[creditScoreCalculator] tenant=${tenantId} 전체 실패:`, err?.message ?? err);
      errors++;
    }
  }

  return { tenantCount: tenants.length, partnerCount: totalPartners, errors };
}
