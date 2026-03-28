/**
 * AI 브리핑 서비스 - 로그인 시 플로팅 메시지 생성
 *
 * 핵심 원칙: 위험(Risk) + 돈(Money) + 행동(Action) 만 담는다
 * 3개 이하 핵심 알림만. 보고용이 아닌 "결정 유도용"
 *
 * 5가지 카테고리:
 * 1. 🚨 재고 위험 (생산 멈추는 리스크)
 * 2. 💰 원가 변화 (돈)
 * 3. ⚠️ 품질/HACCP 이상
 * 4. 📉 생산 이상
 * 5. 📦 발주 필요
 */

import { getRawConnection } from "./connection";
import { todayKST } from "../utils/timezone";

export interface BriefingItem {
  type: 'inventory_risk' | 'cost_change' | 'quality_issue' | 'production_anomaly' | 'order_needed';
  icon: string;    // emoji
  label: string;   // 카테고리 (재고, 원가, 품질 등)
  message: string; // 핵심 한 줄
  severity: 'critical' | 'warning' | 'info';
  actionLabel?: string; // 버튼 텍스트
  actionUrl?: string;   // 클릭 시 이동할 경로
}

export interface AIBriefingResult {
  greeting: string;
  userName: string;
  items: BriefingItem[];
  generatedAt: string;
}

const GREETINGS_WITH_ITEMS = [
  ", 오늘 확인이 필요한 항목이 있습니다",
  ", 지금 처리하시면 생산 차질을 줄일 수 있습니다",
  ", 오늘 중요 사항을 정리했습니다",
  ", 확인이 필요한 사항이 있습니다",
  ", 빠른 확인이 도움이 됩니다",
];

const GREETINGS_CLEAR = [
  ", 오늘도 좋은 하루 되세요",
  ", 오늘도 화이팅이에요",
  ", 좋은 하루 보내세요",
  ", 순조로운 하루입니다",
];

/** KST 오늘 날짜 문자열 반환 */
function getKSTToday(): string {
  return todayKST();
}

export async function generateAIBriefing(tenantId: number, userName: string): Promise<AIBriefingResult> {
  const pool = await getRawConnection();
  const items: BriefingItem[] = [];
  const today = getKSTToday();

  try {
    // ══════════════════════════════════════════════
    // 1. 🚨 재고 위험 - 안전재고 미달 + 생산 영향 분석
    // ══════════════════════════════════════════════
    try {
      const [lowStockRows]: any = await pool.execute(
        `SELECT m.material_name, m.safety_stock_level,
                COALESCE(inv.available_quantity, 0) AS current_stock,
                m.unit,
                ROUND(COALESCE(avg_usage.daily_avg, 0), 1) AS daily_avg
         FROM h_materials m
         LEFT JOIN h_inventory inv ON inv.material_id = m.id AND inv.tenant_id = m.tenant_id
         LEFT JOIN (
           SELECT bi.material_id,
                  SUM(COALESCE(bi.actual_quantity, bi.planned_quantity))
                    / GREATEST(DATEDIFF(NOW(), MIN(b.start_time)), 1) AS daily_avg
           FROM h_batch_inputs bi
           JOIN h_batches b ON bi.batch_id = b.id AND b.tenant_id = bi.tenant_id
           WHERE bi.tenant_id = ? AND b.status IN ('in_progress','completed')
             AND b.start_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           GROUP BY bi.material_id
         ) avg_usage ON avg_usage.material_id = m.id
         WHERE m.tenant_id = ? AND m.is_active = 1
           AND m.safety_stock_level > 0
           AND COALESCE(inv.available_quantity, 0) < m.safety_stock_level
         ORDER BY COALESCE(inv.available_quantity, 0) / GREATEST(m.safety_stock_level, 1) ASC
         LIMIT 5`,
        [tenantId, tenantId]
      );

      const rows = lowStockRows as any[];
      if (rows.length > 0) {
        // 가장 심각한 원재료 표시 (최대 2개 이름 + 나머지 n건)
        const topNames = rows.slice(0, 2).map((r: any) => r.material_name);
        const extra = rows.length > 2 ? ` 외 ${rows.length - 2}건` : '';

        // 소진 예상일 계산 (가장 급한 것 기준)
        const firstRow = rows[0];
        const stock = parseFloat(firstRow.current_stock || "0");
        const dailyAvg = parseFloat(firstRow.daily_avg || "0");
        const daysLeft = dailyAvg > 0 ? Math.floor(stock / dailyAvg) : null;
        const daysText = daysLeft !== null ? ` (${daysLeft}일 내 소진)` : '';

        items.push({
          type: 'inventory_risk',
          icon: '🚨',
          label: '재고 위험',
          message: `${topNames.join(', ')}${extra} 안전재고 미달${daysText}`,
          severity: (daysLeft !== null && daysLeft <= 2) || stock <= 0 ? 'critical' : 'warning',
          actionLabel: '재고 확인 >',
          actionUrl: '/inventory-management',
        });
      }
    } catch (e) { console.error('[briefing] 재고 위험 조회 실패:', e); }

    // ══════════════════════════════════════════════
    // 2. 💰 원가 변화 - 최근 단가 상승/하락
    // ══════════════════════════════════════════════
    try {
      const [costRows]: any = await pool.execute(
        `SELECT m.material_name,
                prev_price.avg_price AS prev_avg,
                curr_price.avg_price AS curr_avg,
                ROUND((curr_price.avg_price - prev_price.avg_price)
                  / GREATEST(prev_price.avg_price, 1) * 100, 0) AS change_pct
         FROM h_materials m
         JOIN (
           SELECT material_id, AVG(unit_price) AS avg_price
           FROM h_batch_inputs bi
           JOIN h_batches b ON bi.batch_id = b.id AND b.tenant_id = bi.tenant_id
           WHERE bi.tenant_id = ? AND b.status IN ('in_progress','completed')
             AND b.start_time >= DATE_SUB(NOW(), INTERVAL 14 DAY)
             AND bi.unit_price > 0
           GROUP BY material_id
         ) curr_price ON m.id = curr_price.material_id
         JOIN (
           SELECT material_id, AVG(unit_price) AS avg_price
           FROM h_batch_inputs bi
           JOIN h_batches b ON bi.batch_id = b.id AND b.tenant_id = bi.tenant_id
           WHERE bi.tenant_id = ? AND b.status IN ('in_progress','completed')
             AND b.start_time >= DATE_SUB(NOW(), INTERVAL 60 DAY)
             AND b.start_time < DATE_SUB(NOW(), INTERVAL 14 DAY)
             AND bi.unit_price > 0
           GROUP BY material_id
         ) prev_price ON m.id = prev_price.material_id
         WHERE m.tenant_id = ?
           AND ABS(curr_price.avg_price - prev_price.avg_price)
               / GREATEST(prev_price.avg_price, 1) > 0.05
         ORDER BY ABS(curr_price.avg_price - prev_price.avg_price)
               / GREATEST(prev_price.avg_price, 1) DESC
         LIMIT 3`,
        [tenantId, tenantId, tenantId]
      );

      if ((costRows as any[]).length > 0) {
        const names = (costRows as any[]).slice(0, 2).map((r: any) => r.material_name).join(', ');
        const maxPct = Math.max(...(costRows as any[]).map((r: any) => Math.abs(Number(r.change_pct))));
        const direction = Number((costRows as any[])[0].change_pct) > 0 ? '상승' : '하락';

        items.push({
          type: 'cost_change',
          icon: '💰',
          label: '원가 변화',
          message: `${names} 단가 ${direction} 중 (최대 ${direction === '상승' ? '+' : '-'}${maxPct}%)`,
          severity: maxPct >= 10 ? 'critical' : 'warning',
          actionLabel: '원가 확인 >',
          actionUrl: '/dashboard/accounting/material-ledger',
        });
      }
    } catch (e) { console.error('[briefing] 원가 변화 조회 실패:', e); }

    // ══════════════════════════════════════════════
    // 3. ⚠️ 품질/HACCP 이상 - CCP 이탈, 미승인 CCP 기록
    //    (h_ccp_form_records + h_ccp_form_rows 기반)
    // ══════════════════════════════════════════════
    try {
      // CCP 이탈(부적합) 건수 + 미승인 기록 건수
      const [ccpRows]: any = await pool.execute(
        `SELECT
           COALESCE(dev.deviation_count, 0) AS deviations,
           COALESCE(draft.draft_count, 0) AS drafts
         FROM (SELECT 1 AS d) dummy
         LEFT JOIN (
           SELECT COUNT(*) AS deviation_count
           FROM h_ccp_form_rows fr
           JOIN h_ccp_form_records rec ON fr.form_record_id = rec.id AND rec.tenant_id = fr.tenant_id
           WHERE fr.tenant_id = ? AND fr.is_deviation = 1
             AND rec.work_date >= DATE_SUB(?, INTERVAL 3 DAY)
         ) dev ON 1=1
         LEFT JOIN (
           SELECT COUNT(*) AS draft_count
           FROM h_ccp_form_records
           WHERE tenant_id = ? AND status = 'draft'
             AND work_date >= DATE_SUB(?, INTERVAL 7 DAY)
         ) draft ON 1=1`,
        [tenantId, today, tenantId, today]
      );

      const deviations = Number((ccpRows as any[])?.[0]?.deviations || 0);
      const drafts = Number((ccpRows as any[])?.[0]?.drafts || 0);

      if (deviations > 0) {
        items.push({
          type: 'quality_issue',
          icon: '⚠️',
          label: '품질/HACCP',
          message: `CCP 기준 이탈 ${deviations}건 (최근 3일)`,
          severity: 'critical',
          actionLabel: 'CCP 확인 >',
          actionUrl: '/dashboard/ccp',
        });
      } else if (drafts > 0) {
        items.push({
          type: 'quality_issue',
          icon: '⚠️',
          label: '품질/HACCP',
          message: `CCP 기록 미승인 ${drafts}건 (최근 7일)`,
          severity: 'warning',
          actionLabel: 'CCP 확인 >',
          actionUrl: '/dashboard/ccp',
        });
      }

      // 오늘 일일일지 미작성 체크 (추가 품질 항목)
      if (deviations === 0 && drafts === 0) {
        const [logRows]: any = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM h_generic_checklist_records
           WHERE tenant_id = ? AND form_type = 'daily_log' AND form_date = ?`,
          [tenantId, today]
        );
        const logCount = Number((logRows as any[])?.[0]?.cnt || 0);
        if (logCount === 0) {
          // 오늘이 영업일인지 확인 (최근 배치 존재 여부)
          const [batchCheck]: any = await pool.execute(
            `SELECT COUNT(*) AS cnt FROM h_batches
             WHERE tenant_id = ? AND DATE(COALESCE(planned_date, start_time, created_at)) = ?`,
            [tenantId, today]
          );
          if (Number((batchCheck as any[])?.[0]?.cnt || 0) > 0) {
            items.push({
              type: 'quality_issue',
              icon: '📋',
              label: '품질/HACCP',
              message: `오늘 일일일지 미작성`,
              severity: 'info',
              actionLabel: '일지 작성 >',
              actionUrl: '/dashboard/daily-logs',
            });
          }
        }
      }
    } catch (e) { console.error('[briefing] 품질/HACCP 조회 실패:', e); }

    // ══════════════════════════════════════════════
    // 4. 📉 생산 이상 - 오늘 생산량 vs 30일 평균
    // ══════════════════════════════════════════════
    try {
      const [prodRows]: any = await pool.execute(
        `SELECT
           COALESCE(today_prod.cnt, 0) AS today_batches,
           COALESCE(today_prod.total_qty, 0) AS today_qty,
           COALESCE(avg_prod.avg_daily_batches, 0) AS avg_batches,
           COALESCE(avg_prod.avg_daily_qty, 0) AS avg_qty
         FROM (SELECT 1 AS dummy) d
         LEFT JOIN (
           SELECT COUNT(*) AS cnt, SUM(COALESCE(actual_quantity, planned_quantity)) AS total_qty
           FROM h_batches WHERE tenant_id = ?
             AND DATE(COALESCE(planned_date, start_time, created_at)) = ?
         ) today_prod ON 1=1
         LEFT JOIN (
           SELECT COUNT(*) / GREATEST(COUNT(DISTINCT DATE(COALESCE(planned_date, start_time, created_at))), 1) AS avg_daily_batches,
                  SUM(COALESCE(actual_quantity, planned_quantity))
                    / GREATEST(COUNT(DISTINCT DATE(COALESCE(planned_date, start_time, created_at))), 1) AS avg_daily_qty
           FROM h_batches WHERE tenant_id = ?
             AND status = 'completed'
             AND COALESCE(planned_date, start_time, created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             AND DATE(COALESCE(planned_date, start_time, created_at)) < ?
         ) avg_prod ON 1=1`,
        [tenantId, today, tenantId, today]
      );

      const todayBatches = Number((prodRows as any[])?.[0]?.today_batches || 0);
      const todayQty = parseFloat((prodRows as any[])?.[0]?.today_qty || "0");
      const avgQty = parseFloat((prodRows as any[])?.[0]?.avg_qty || "0");

      // 오늘 생산이 시작됐는데 평균보다 30% 이상 적은 경우
      if (todayBatches > 0 && avgQty > 0 && todayQty < avgQty * 0.7) {
        const dropPct = Math.round((1 - todayQty / avgQty) * 100);
        items.push({
          type: 'production_anomaly',
          icon: '📉',
          label: '생산 이상',
          message: `오늘 생산량 평균 대비 ${dropPct}% 감소`,
          severity: dropPct >= 50 ? 'critical' : 'warning',
          actionLabel: '생산 현황 >',
          actionUrl: '/dashboard/production-management',
        });
      }
    } catch (e) { console.error('[briefing] 생산 이상 조회 실패:', e); }

    // ══════════════════════════════════════════════
    // 5. 📦 발주 필요 - 3일 내 소진 예상 원재료
    // ══════════════════════════════════════════════
    try {
      // 재고 위험에서 이미 잡힌 것과 다른 관점: 재고는 있지만 곧 소진 예상
      if (!items.some(i => i.type === 'inventory_risk')) {
        const [orderRows]: any = await pool.execute(
          `SELECT m.material_name,
                  ROUND(COALESCE(inv.available_quantity, 0), 1) AS stock,
                  ROUND(COALESCE(avg_u.daily_avg, 0), 1) AS daily_avg,
                  m.unit
           FROM h_materials m
           LEFT JOIN h_inventory inv ON inv.material_id = m.id AND inv.tenant_id = m.tenant_id
           LEFT JOIN (
             SELECT bi.material_id,
                    SUM(COALESCE(bi.actual_quantity, bi.planned_quantity))
                      / GREATEST(DATEDIFF(NOW(), MIN(b.start_time)), 1) AS daily_avg
             FROM h_batch_inputs bi
             JOIN h_batches b ON bi.batch_id = b.id AND b.tenant_id = bi.tenant_id
             WHERE bi.tenant_id = ? AND b.status IN ('in_progress','completed')
               AND b.start_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY bi.material_id
           ) avg_u ON avg_u.material_id = m.id
           WHERE m.tenant_id = ? AND m.is_active = 1
             AND COALESCE(avg_u.daily_avg, 0) > 0
             AND COALESCE(inv.available_quantity, 0) / avg_u.daily_avg <= 3
             AND COALESCE(inv.available_quantity, 0) > 0
           ORDER BY COALESCE(inv.available_quantity, 0) / avg_u.daily_avg ASC
           LIMIT 3`,
          [tenantId, tenantId]
        );

        if ((orderRows as any[]).length > 0) {
          const topNames = (orderRows as any[]).slice(0, 2).map((r: any) => r.material_name);
          const extra = (orderRows as any[]).length > 2 ? ` 외 ${(orderRows as any[]).length - 2}건` : '';
          items.push({
            type: 'order_needed',
            icon: '📦',
            label: '발주 필요',
            message: `${topNames.join(', ')}${extra} 3일 내 소진 예상`,
            severity: 'warning',
            actionLabel: '발주 확인 >',
            actionUrl: '/inventory-management',
          });
        }
      }
    } catch (e) { console.error('[briefing] 발주 필요 조회 실패:', e); }

  } catch (error) {
    console.error('[briefing] 전체 오류:', error);
  }

  // 최대 3개만 (severity 순: critical > warning > info)
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
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
