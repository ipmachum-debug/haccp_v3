/**
 * 재고관리 사용 여부 — 회사가 선택 (2026-10-17, CEO 결정 2)
 *
 * - 재고관리 사용 회사: HACCP 사용 여부와 무관하게 입고·매입 확정·매출 확정이 내부 LOT·재고·원장을 만든다.
 * - 회계만 사용하는 회사: LOT·재고를 만들지 않고 전표(분개)만. 입고 문서는 수량 기록(발주 입고량)만.
 * - ERP 회사에 CCP·생산일지를 강제하지 않는다 (이 설정은 재고만 가른다).
 * 설정: tenant_feature_settings 의 INVENTORY_TRACKING. 행이 없으면 기존 규칙 그대로 — 구독 패키지의 HACCP 사용 여부
 *   (이전 동작: HACCP 회사 = 재고, ERP 전용 = 회계만). 조회 실패는 throw (판정 불가를 '꺼짐' 으로 보지 않는다).
 */
import { getRawConnection } from "../../db/connection";
import { isHaccpEnabled } from "../accounting/tenantModuleCheck";

export const INVENTORY_TRACKING_FEATURE = "INVENTORY_TRACKING";

export async function getInventoryTrackingSetting(tenantId: number, conn?: any): Promise<{ enabled: boolean; source: "setting" | "package" }> {
  const c = conn ?? (await getRawConnection());
  let rows: any;
  try {
    [rows] = await c.execute(
      `SELECT enabled FROM tenant_feature_settings WHERE tenant_id = ? AND feature_code = ? LIMIT 1`, [tenantId, INVENTORY_TRACKING_FEATURE],
    );
  } catch (err: any) {
    throw new Error(`[회사 기능 설정] 재고관리 사용 여부를 확인할 수 없습니다 (tenant=${tenantId}): ${err?.code ?? ""} ${err?.message ?? err}`);
  }
  const row = (rows as any[])[0];
  if (row) return { enabled: Number(row.enabled) === 1, source: "setting" };
  return { enabled: await isHaccpEnabled(tenantId), source: "package" };
}

export async function isInventoryTrackingEnabled(tenantId: number, conn?: any): Promise<boolean> {
  return (await getInventoryTrackingSetting(tenantId, conn)).enabled;
}
