/**
 * Price Anomaly Detector — CRM Phase 3
 *
 * 목적: 매입 등록 시 동일 거래처·품목의 최근 90일 평균 단가와 비교 →
 *       ±20% 이상 변동이면 partner_activity 자동 기록 (note + outcome=blocked) +
 *       admin 사용자에게 h_notifications 알림 생성.
 *
 * 안전 원칙: 호출자 (createPurchase) 를 깨뜨리지 않음.
 *
 * 작성: 2026-05-05
 */

import { sql } from "drizzle-orm";

const ANOMALY_THRESHOLD_PCT = 20; // ±20%
const HISTORY_DAYS = 90;
const MIN_SAMPLES = 3; // 최소 3건 비교 후 판정

export async function detectPriceAnomaly(
  db: any,
  args: {
    tenantId: number;
    partnerId: number;
    itemName: string;
    currentPrice: number;
    userId: number;
  },
): Promise<void> {
  if (!db || !args.tenantId || !args.partnerId || !args.itemName || !args.currentPrice) return;
  try {
    // 최근 90일 동일 거래처·품목 평균 단가
    const result: any = await db.execute(sql`
      SELECT AVG(unit_price) AS avg_price, COUNT(*) AS cnt
      FROM accounting_purchases
      WHERE tenant_id = ${args.tenantId}
        AND partner_id = ${args.partnerId}
        AND item_name = ${args.itemName}
        AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL ${HISTORY_DAYS} DAY)
    `);
    const row = ((result as any)?.[0] ?? [])[0];
    const avgPrice = Number(row?.avg_price || 0);
    const count = Number(row?.cnt || 0);

    if (count < MIN_SAMPLES || avgPrice <= 0) return; // 비교 불가

    const diffPct = ((args.currentPrice - avgPrice) / avgPrice) * 100;
    if (Math.abs(diffPct) < ANOMALY_THRESHOLD_PCT) return; // 정상 범위

    const direction = diffPct > 0 ? "상승" : "하락";
    const krw = (n: number) => new Intl.NumberFormat("ko-KR").format(Math.round(n));
    const title = `단가 이상 — ${args.itemName} ${direction} ${diffPct.toFixed(1)}%`;
    const body =
      `평균 ${krw(avgPrice)}원 (${count}건 / 최근 ${HISTORY_DAYS}일) → ` +
      `현재 ${krw(args.currentPrice)}원`;

    // 1) partner_activities 에 자동 기록
    await db.execute(sql`
      INSERT INTO partner_activities
        (tenant_id, partner_id, activity_type, title, body, outcome,
         occurred_at, ref_type, ref_id, created_by, created_at)
      VALUES
        (${args.tenantId}, ${args.partnerId}, 'note',
         ${title}, ${body},
         ${diffPct > 0 ? "blocked" : "info"},
         NOW(), 'price_anomaly', NULL, ${args.userId}, NOW())
    `);

    // 2) admin 사용자에게 알림 (h_notifications)
    //    같은 테넌트 + role=admin 인 사용자만
    const usersResult: any = await db.execute(sql`
      SELECT id FROM users WHERE tenant_id = ${args.tenantId} AND role IN ('admin', 'super_admin')
    `);
    const userRows = ((usersResult as any)?.[0] ?? []) as any[];

    const priority = Math.abs(diffPct) >= 50 ? "high" : "medium";

    for (const u of userRows) {
      await db.execute(sql`
        INSERT INTO h_notifications
          (tenant_id, user_id, notification_type, title, message, priority,
           action_url, metadata, created_at)
        VALUES
          (${args.tenantId}, ${u.id}, 'price_anomaly',
           ${title}, ${body}, ${priority},
           ${`/dashboard/partners/${args.partnerId}`},
           ${JSON.stringify({
             partnerId: args.partnerId,
             itemName: args.itemName,
             avgPrice,
             currentPrice: args.currentPrice,
             diffPct,
           })},
           NOW())
      `);
    }
  } catch (err: any) {
    console.warn("[priceAnomalyDetector] 실패:", err?.message ?? err);
  }
}
