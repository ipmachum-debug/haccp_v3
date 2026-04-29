/**
 * CCP 알림 수신자 해석 — F-3 본격 마무리 (CP-3-g)
 *
 * ============================================================================
 * 이전 (PR #132~#138): 알림이 작업자(operatorId) 1명에게만 전송 → 관리자 인지 지연.
 * 이 파일: tenant 의 admin / monitor / inspector role + operator 까지 fanout.
 *
 * 사용:
 *   const recipients = await getNotificationRecipients(tenantId, operatorId);
 *   await db.insert(hNotifications).values(
 *     recipients.map(uid => ({ ...baseRow, userId: uid }))
 *   );
 *
 * 안전:
 *   - 같은 tenant 의 active 사용자만 (cross-tenant 격리)
 *   - operator 는 항상 포함 (traceability)
 *   - 실패 시 최소 [operatorId] 폴백 (알림 손실 방지)
 *   - LIMIT 20 — 폭주 방지
 * ============================================================================
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../../drizzle/schema/schema_main_core";

/** CCP 이탈 알림을 받아야 할 role 목록 */
const ALERT_ROLES = ["admin", "monitor", "inspector"] as const;

/**
 * tenant 의 알림 수신 대상 사용자 ID 목록 조회.
 *
 * 포함 기준:
 *   - 같은 tenant_id
 *   - role ∈ {admin, monitor, inspector}
 *   - is_active = 1
 *   - + operatorId (작업자 — traceability)
 *
 * 폴백:
 *   - DB 실패 / 0건 → [operatorId] 만 반환 (알림 손실 방지)
 */
export async function getNotificationRecipients(
  tenantId: number,
  operatorId: number,
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [operatorId];

  try {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          inArray(users.role, ALERT_ROLES as unknown as string[]),
          eq(users.isActive, 1),
        ),
      )
      .limit(20);

    const ids = new Set<number>(rows.map((r) => Number(r.id)));
    ids.add(Number(operatorId)); // operator 항상 포함 (중복은 Set 이 처리)
    return Array.from(ids);
  } catch (err: any) {
    console.warn(
      `[ccpRecipients] 사용자 조회 실패 (operator 폴백) — tenant=${tenantId}: ` +
      `${err?.message ?? err}`,
    );
    return [operatorId];
  }
}
