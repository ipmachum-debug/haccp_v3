/**
 * Partner Activity Auto-Tagger — CRM Phase 4
 *
 * 매일 09:00 cron 실행:
 *   - 60일+ 무거래 거래처 → 자동 태그 "장기무거래" 추가
 *   - 다시 거래 발생 시 → 태그 자동 제거
 *   - 신규 거래처 (14일 이내) → "신규" 태그 (있으면 유지, 없으면 추가)
 *
 * 거래 = accounting_purchases / accounting_sales / partner_activities 중 가장 최근
 *
 * 작성: 2026-05-05
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";

const STALE_TAG = "장기무거래";
const STALE_COLOR = "#f59e0b"; // amber
const STALE_DAYS = 60;

const NEW_TAG = "신규";
const NEW_COLOR = "#3b82f6"; // blue
const NEW_DAYS = 14;

export async function autoTagPartnerActivity(): Promise<{
  staleTagged: number;
  staleRemoved: number;
  newTagged: number;
}> {
  const db = await getDb();
  if (!db) {
    console.warn("[partnerActivityTagger] DB 연결 실패 — skip");
    return { staleTagged: 0, staleRemoved: 0, newTagged: 0 };
  }

  let staleTagged = 0;
  let staleRemoved = 0;
  let newTagged = 0;

  const tenantsR: any = await db.execute(sql`SELECT id FROM tenants`);
  const tenants = (((tenantsR as any)?.[0] ?? tenantsR) as any[]) || [];

  for (const t of tenants) {
    const tenantId = Number(t.id);
    if (!tenantId) continue;

    try {
      // 모든 활성 거래처 + 마지막 거래일 계산
      const partnersR: any = await db.execute(sql`
        SELECT
          p.id,
          p.created_at,
          GREATEST(
            COALESCE((SELECT MAX(transaction_date) FROM accounting_purchases
                      WHERE tenant_id = ${tenantId} AND partner_id = p.id), '1900-01-01'),
            COALESCE((SELECT MAX(transaction_date) FROM accounting_sales
                      WHERE tenant_id = ${tenantId} AND partner_id = p.id), '1900-01-01'),
            COALESCE(DATE_FORMAT((SELECT MAX(occurred_at) FROM partner_activities
                      WHERE tenant_id = ${tenantId} AND partner_id = p.id), '%Y-%m-%d'), '1900-01-01')
          ) AS last_transaction_date
        FROM partners p
        WHERE p.tenant_id = ${tenantId} AND p.is_active = 1
      `);
      const partners = ((partnersR as any)?.[0] ?? []) as any[];

      for (const p of partners) {
        const partnerId = Number(p.id);
        if (!partnerId) continue;

        const lastDate = String(p.last_transaction_date || "1900-01-01");
        const lastMs = new Date(lastDate).getTime();
        const todayMs = Date.now();
        const daysSinceTx = Math.floor((todayMs - lastMs) / 86400000);

        const createdAt = p.created_at ? new Date(p.created_at) : null;
        const daysSinceCreated = createdAt
          ? Math.floor((todayMs - createdAt.getTime()) / 86400000)
          : 999;

        // 기존 자동태그 조회
        const tagsR: any = await db.execute(sql`
          SELECT id, tag FROM partner_tags
          WHERE tenant_id = ${tenantId} AND partner_id = ${partnerId}
            AND tag IN (${STALE_TAG}, ${NEW_TAG})
        `);
        const existing = ((tagsR as any)?.[0] ?? []) as any[];
        const hasStale = existing.find((e: any) => e.tag === STALE_TAG);
        const hasNew = existing.find((e: any) => e.tag === NEW_TAG);

        // 1) 장기무거래 처리
        if (daysSinceTx >= STALE_DAYS && lastMs > 0) {
          if (!hasStale) {
            await db.execute(sql`
              INSERT INTO partner_tags (tenant_id, partner_id, tag, color, created_at)
              VALUES (${tenantId}, ${partnerId}, ${STALE_TAG}, ${STALE_COLOR}, NOW())
            `);
            staleTagged++;
          }
        } else {
          // 거래 재개 → 태그 제거
          if (hasStale) {
            await db.execute(sql`
              DELETE FROM partner_tags WHERE id = ${hasStale.id} AND tenant_id = ${tenantId}
            `);
            staleRemoved++;
          }
        }

        // 2) 신규 처리
        if (daysSinceCreated <= NEW_DAYS) {
          if (!hasNew) {
            await db.execute(sql`
              INSERT INTO partner_tags (tenant_id, partner_id, tag, color, created_at)
              VALUES (${tenantId}, ${partnerId}, ${NEW_TAG}, ${NEW_COLOR}, NOW())
            `);
            newTagged++;
          }
        } else {
          // 14일 경과 → 신규 태그 자동 제거
          if (hasNew) {
            await db.execute(sql`
              DELETE FROM partner_tags WHERE id = ${hasNew.id} AND tenant_id = ${tenantId}
            `);
          }
        }
      }
    } catch (err: any) {
      console.error(`[partnerActivityTagger] tenant=${tenantId} 실패:`, err?.message ?? err);
    }
  }

  return { staleTagged, staleRemoved, newTagged };
}
