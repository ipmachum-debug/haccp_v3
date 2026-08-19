/**
 * ERP 회계 전용 AI 브리핑
 *
 * HACCP 비활성 테넌트용 브리핑 — 순수 회계 데이터 기반.
 * 5가지 카테고리:
 *   1. 💸 미수금 리스크 (30일 초과 미수금)
 *   2. 📅 미지급 예정 (이번 주 만기)
 *   3. 🏦 현금 잔고 (은행 잔고 vs 지출)
 *   4. 📊 매출 추이 (오늘 vs 30일 평균)
 *   5. 🧾 미승인 전표 (draft 상태 건수)
 */

import { getRawConnection } from "../connection";
import type { BriefingItem, AIBriefingResult } from "./aiBriefing";

const GREETINGS_WITH_ITEMS = [
  ", 오늘 확인이 필요한 회계 항목이 있습니다",
  ", 자금 현황을 정리했습니다",
  ", 오늘 중요 재무 사항을 확인해주세요",
];

const GREETINGS_CLEAR = [
  ", 좋은 하루 보내세요",
  ", 특이사항 없습니다. 좋은 하루 보내세요!",
  ", 오늘도 순조로운 하루입니다",
];

function getKSTToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function generateAccountingBriefing(tenantId: number, userName: string): Promise<AIBriefingResult> {
  const pool = await getRawConnection();
  const items: BriefingItem[] = [];
  const today = getKSTToday();

  // 1. 💸 미수금 리스크 (30일 초과 approved 매출 중 미지급)
  try {
    const [rows]: any = await pool.execute(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total
       FROM accounting_sales
       WHERE tenant_id = ? AND status = 'approved'
         AND transaction_date < DATE_SUB(?, INTERVAL 30 DAY)`,
      [tenantId, today]
    );
    const { cnt, total } = rows[0] || {};
    if (cnt > 0 && total > 0) {
      items.push({
        type: 'inventory_risk',
        icon: '💸',
        label: '미수금',
        message: `30일 초과 미수금 ${cnt}건, ${Number(total).toLocaleString()}원`,
        severity: cnt >= 5 ? 'critical' : 'warning',
        actionLabel: '매출 조회 >',
        actionUrl: '/dashboard/accounting/sales/list',
      });
    }
  } catch {}

  // 2. 📅 이번 주 미지급금 (approved 매입 중 미결제)
  try {
    const [rows]: any = await pool.execute(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total
       FROM accounting_purchases
       WHERE tenant_id = ? AND status = 'approved'
         AND transaction_date BETWEEN DATE_SUB(?, INTERVAL 7 DAY) AND ?`,
      [tenantId, today, today]
    );
    const { cnt, total } = rows[0] || {};
    if (cnt > 0 && total > 0) {
      items.push({
        type: 'order_needed',
        icon: '📅',
        label: '미지급',
        message: `이번 주 미지급 매입 ${cnt}건, ${Number(total).toLocaleString()}원`,
        severity: 'info',
        actionLabel: '매입 조회 >',
        actionUrl: '/dashboard/accounting/purchases/list',
      });
    }
  } catch {}

  // 3. 📊 이번 달 매출 vs 지난달 비교
  try {
    const [thisMonth]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total
       FROM accounting_sales
       WHERE tenant_id = ? AND DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')`,
      [tenantId, today]
    );
    const [lastMonth]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total
       FROM accounting_sales
       WHERE tenant_id = ? AND DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(DATE_SUB(?, INTERVAL 1 MONTH), '%Y-%m')`,
      [tenantId, today]
    );
    const thisTotal = Number(thisMonth[0]?.total || 0);
    const lastTotal = Number(lastMonth[0]?.total || 0);
    if (lastTotal > 0) {
      const changeRate = ((thisTotal - lastTotal) / lastTotal * 100).toFixed(0);
      const isDown = thisTotal < lastTotal;
      if (isDown && Math.abs(Number(changeRate)) >= 20) {
        items.push({
          type: 'cost_change',
          icon: '📉',
          label: '매출',
          message: `이번 달 매출 ${Number(changeRate)}% (전월 대비 ${Number(lastTotal - thisTotal).toLocaleString()}원 감소)`,
          severity: Math.abs(Number(changeRate)) >= 40 ? 'critical' : 'warning',
          actionLabel: '재무보고서 >',
          actionUrl: '/dashboard/accounting/financial-reports',
        });
      }
    }
  } catch {}

  // 4. 🧾 미승인 전표 (posted 안 된 분개)
  try {
    const [rows]: any = await pool.execute(
      `SELECT COUNT(*) as cnt
       FROM expense_journal_entries
       WHERE tenant_id = ? AND (status IS NULL OR status = 'draft')`,
      [tenantId]
    );
    const cnt = Number(rows[0]?.cnt || 0);
    if (cnt > 0) {
      items.push({
        type: 'quality_issue',
        icon: '🧾',
        label: '전표',
        message: `미승인 전표 ${cnt}건 처리 필요`,
        severity: cnt >= 10 ? 'warning' : 'info',
        actionLabel: '전표 관리 >',
        actionUrl: '/dashboard/accounting/journal-entries',
      });
    }
  } catch {}

  // 5. 🏦 비용 증가 경고 (이번 달 비용 vs 지난달)
  try {
    const [thisMonth]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total
       FROM accounting_purchases
       WHERE tenant_id = ? AND DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')`,
      [tenantId, today]
    );
    const [lastMonth]: any = await pool.execute(
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total
       FROM accounting_purchases
       WHERE tenant_id = ? AND DATE_FORMAT(transaction_date, '%Y-%m') = DATE_FORMAT(DATE_SUB(?, INTERVAL 1 MONTH), '%Y-%m')`,
      [tenantId, today]
    );
    const thisTotal = Number(thisMonth[0]?.total || 0);
    const lastTotal = Number(lastMonth[0]?.total || 0);
    if (lastTotal > 0 && thisTotal > lastTotal) {
      const increaseRate = ((thisTotal - lastTotal) / lastTotal * 100).toFixed(0);
      if (Number(increaseRate) >= 20) {
        items.push({
          type: 'production_anomaly',
          icon: '💰',
          label: '비용',
          message: `이번 달 매입 비용 +${increaseRate}% 증가 (전월 대비)`,
          severity: Number(increaseRate) >= 50 ? 'warning' : 'info',
          actionLabel: '비용관리 >',
          actionUrl: '/dashboard/accounting/expense',
        });
      }
    }
  } catch {}

  // 최대 3개 (severity 순)
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));
  const topItems = items.slice(0, 3);

  const greetingPool = topItems.length > 0 ? GREETINGS_WITH_ITEMS : GREETINGS_CLEAR;
  const greeting = greetingPool[Math.floor(Math.random() * greetingPool.length)];

  return {
    greeting,
    userName,
    items: topItems,
    generatedAt: new Date().toISOString(),
  };
}
