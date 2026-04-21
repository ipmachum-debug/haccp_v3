/**
 * Capability 평가
 *
 * 배경: docs/architecture/04-policy-registry.md
 *
 * 판정 순서:
 *   1. user_capability_grants 에 직접 부여된 게 있으면 true (만료 체크)
 *   2. 유저의 h_user_roles → role_capabilities 에 매핑이 있으면 true
 *   3. 없으면 false
 *
 * 성능: 04-policy-registry.md 의 JWT claims 캐싱 전략 참고.
 * 이 함수는 DB 직접 조회 버전 (캐싱은 호출자 쪽에서).
 */

import { getRawConnection } from "../../db/connection";
import type { StandardAction } from "../../../drizzle/schema/capabilities";

export type CapabilityCheckResult =
  | { allowed: true; source: "direct-grant" | "role" }
  | { allowed: false; reason: "no-capability" | "unknown-code" };

export function buildCapabilityCode(
  featureCode: string,
  action: StandardAction | string,
): string {
  return `${featureCode}:${action}`;
}

export async function hasCapability(
  userId: number,
  featureCode: string,
  action: StandardAction | string,
): Promise<boolean> {
  const result = await checkCapability(userId, featureCode, action);
  return result.allowed;
}

export async function checkCapability(
  userId: number,
  featureCode: string,
  action: StandardAction | string,
): Promise<CapabilityCheckResult> {
  const conn = await getRawConnection();
  const code = buildCapabilityCode(featureCode, action);

  const [capRows] = await conn.execute(
    `SELECT id FROM capabilities WHERE code = ? LIMIT 1`,
    [code],
  );
  const cap = (capRows as Array<{ id: number }>)[0];
  if (!cap) return { allowed: false, reason: "unknown-code" };

  const [grantRows] = await conn.execute(
    `SELECT 1
       FROM user_capability_grants
      WHERE user_id = ?
        AND capability_id = ?
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [userId, cap.id],
  );
  if ((grantRows as unknown[]).length > 0) {
    return { allowed: true, source: "direct-grant" };
  }

  const [roleRows] = await conn.execute(
    `SELECT 1
       FROM h_user_roles ur
       JOIN role_capabilities rc
         ON rc.role_id = ur.role_id
        AND rc.tenant_id = ur.tenant_id
      WHERE ur.user_id = ?
        AND rc.capability_id = ?
      LIMIT 1`,
    [userId, cap.id],
  );
  if ((roleRows as unknown[]).length > 0) {
    return { allowed: true, source: "role" };
  }

  return { allowed: false, reason: "no-capability" };
}

export async function listUserCapabilityCodes(
  userId: number,
): Promise<string[]> {
  const conn = await getRawConnection();

  const [rows] = await conn.execute(
    `SELECT DISTINCT c.code
       FROM capabilities c
       LEFT JOIN user_capability_grants g
         ON g.capability_id = c.id
        AND g.user_id = ?
        AND (g.expires_at IS NULL OR g.expires_at > NOW())
       LEFT JOIN h_user_roles ur
         ON ur.user_id = ?
       LEFT JOIN role_capabilities rc
         ON rc.role_id = ur.role_id
        AND rc.tenant_id = ur.tenant_id
        AND rc.capability_id = c.id
      WHERE g.id IS NOT NULL
         OR rc.id IS NOT NULL`,
    [userId, userId],
  );

  return (rows as Array<{ code: string }>).map((r) => r.code);
}
