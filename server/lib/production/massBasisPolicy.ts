/**
 * 원물·공정·완제품 기준(수율 보정) 사용 여부 — 회사(테넌트)가 선택 (2026-10-16, CEO 지시)
 *
 * "공통 모듈에서 이 수율 방식을 표준화하면 안 된다. 필요한 테넌트가 선택해서 쓰게 해야 한다."
 * → 기능 코드 PRODUCTION_MASS_BASIS 를 회사별로 켜고 끈다 (tenant_feature_settings, 기본 꺼짐).
 *   꺼진 회사는 레시피에 기준값이 있어도 배치 투입 계획·CCP 는 기존 계산 (배합비 × 생산량).
 *   이미 스냅샷이 고정된 배치는 그 값을 유지한다 (배치 생성 시점 기준 고정).
 * 코드에 업종·회사 분기를 두지 않고 데이터로 관리한다 (docs/architecture/04-policy-registry.md).
 */
export const MASS_BASIS_FEATURE = "PRODUCTION_MASS_BASIS";

export async function isTenantFeatureEnabled(conn: any, tenantId: number, featureCode: string): Promise<boolean> {
  try {
    const [rows]: any = await conn.execute(
      `SELECT enabled FROM tenant_feature_settings WHERE tenant_id = ? AND feature_code = ? LIMIT 1`,
      [tenantId, featureCode],
    );
    return Number(rows?.[0]?.enabled ?? 0) === 1;
  } catch (err: any) {
    // 표가 없으면(마이그레이션 전) 꺼짐으로 — 기존 계산 그대로
    if (err?.code !== "ER_NO_SUCH_TABLE") console.warn(`[tenantFeature] ${featureCode} tenant=${tenantId} 조회 실패 (꺼짐 처리):`, err?.message);
    return false;
  }
}

export async function setTenantFeature(conn: any, tenantId: number, featureCode: string, enabled: boolean, userId: number | null): Promise<void> {
  await conn.execute(
    `INSERT INTO tenant_feature_settings (tenant_id, feature_code, enabled, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_by = VALUES(updated_by)`,
    [tenantId, featureCode, enabled ? 1 : 0, userId],
  );
}
