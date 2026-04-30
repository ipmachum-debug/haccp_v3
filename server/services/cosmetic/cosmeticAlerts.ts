/**
 * 화장품 GMP — 자동 알림 (F-3 cosmetic) Phase 2-7
 *
 * ============================================================================
 * 식품 F-3 폐쇄 루프 (PR #131~#147) 의 cosmetic 버전.
 *
 * 트리거 시나리오:
 *   - IPC 측정값 fail (Phase 2-3) — 즉시 admin/inspector/monitor 알림
 *   - 출고 회수 (Phase 2-6) — 모든 사용자 알림 (urgent)
 *   - 알러지 미표시 (Phase 2-5) — 향후
 *
 * 의존성 (.dependency-cruiser.cjs):
 *   - 본 파일은 server/services/cosmetic/ 에 위치 — Layer 4 industry 의 부속
 *   - food 의 ccp.recipients.ts 와 동일 패턴이지만 cross-import 금지 (ADR-002)
 *     → 본 파일에 admin 조회 inline (코드 중복 < 격리)
 * ============================================================================
 */

import { sql } from "drizzle-orm";
import { getRawConnection } from "../../db";

/**
 * tenant 가 cosmetic 자동 알림 활성화 대상인지.
 *
 * 우선순위:
 *   1. ENABLE_COSMETIC_ALERTS_TENANTS — 명시 tenant 목록
 *   2. ENABLE_COSMETIC_ALERTS — 전체 활성
 */
export function isCosmeticAlertEnabled(tenantId: number): boolean {
  const tenantsRaw = process.env.ENABLE_COSMETIC_ALERTS_TENANTS?.trim();
  if (tenantsRaw) {
    const enabled = tenantsRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    if (enabled.length > 0) {
      return enabled.includes(Number(tenantId));
    }
  }

  const flag = process.env.ENABLE_COSMETIC_ALERTS?.toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "yes";
}

/**
 * tenant 의 알림 수신 admin/inspector/monitor 사용자 ID 목록.
 * 식품 F-3 ccp.recipients.ts 와 동일 패턴 (격리 위해 별도 구현).
 */
async function getAlertRecipients(
  tenantId: number,
  operatorId: number,
): Promise<number[]> {
  try {
    const conn = await getRawConnection();
    const [rows]: any = await conn.execute(
      `SELECT id FROM users
       WHERE tenant_id = ?
         AND role IN ('admin','inspector','monitor')
         AND is_active = 1
         AND approval_status = 'approved'
       LIMIT 20`,
      [tenantId],
    );
    const ids = new Set<number>(
      (rows as any[]).map((r) => Number(r.id)),
    );
    if (Number(operatorId) > 0) ids.add(Number(operatorId));
    return Array.from(ids);
  } catch {
    return Number(operatorId) > 0 ? [Number(operatorId)] : [];
  }
}

/**
 * IPC 측정 fail 시 자동 알림.
 *
 * @param ipcRow IPC 행 (createIpc 직후의 정보)
 * @param tenantId 격리
 *
 * 안전:
 *   - env 미활성 시 0 작업
 *   - 알림 INSERT 실패 시 catch + log (메인 흐름 보호)
 */
export async function dispatchIpcFailAlert(
  ipcRow: {
    id: number;
    bmrId: number;
    measurementType: string;
    measurementLabel?: string | null;
    measuredValue?: number | null;
    expectedMin?: number | null;
    expectedMax?: number | null;
    unit?: string | null;
    measuredBy?: number | null;
  },
  tenantId: number,
): Promise<{ alertsSent: number; reason?: string }> {
  if (!isCosmeticAlertEnabled(tenantId)) {
    return { alertsSent: 0, reason: "ENABLE_COSMETIC_ALERTS 미활성" };
  }

  const operatorId = Number(ipcRow.measuredBy ?? 0);
  const recipients = await getAlertRecipients(tenantId, operatorId);
  if (recipients.length === 0) {
    return { alertsSent: 0, reason: "수신자 0명" };
  }

  const labelStr = ipcRow.measurementLabel ?? ipcRow.measurementType;
  const limitDesc =
    ipcRow.expectedMin !== null && ipcRow.expectedMin !== undefined &&
    ipcRow.expectedMax !== null && ipcRow.expectedMax !== undefined
      ? `${ipcRow.expectedMin} ~ ${ipcRow.expectedMax}${ipcRow.unit ?? ""}`
      : "한계 일부 미설정";

  const title = `[IPC 부적합] ${labelStr} (BMR #${ipcRow.bmrId})`;
  const message =
    `IPC 측정값이 한계를 벗어났습니다.\n` +
    `  • 측정 항목: ${labelStr} (${ipcRow.measurementType})\n` +
    `  • 한계: ${limitDesc}\n` +
    `  • 측정값: ${ipcRow.measuredValue ?? "?"}${ipcRow.unit ?? ""}\n` +
    `  • 출처: cosmetic IPC #${ipcRow.id}\n` +
    `\n조치:\n` +
    `  - BMR #${ipcRow.bmrId} 검토 후 시정 결정\n` +
    `  - 부적합 시 BMR rejected 처리 권장\n` +
    `  - 재측정 또는 폐기 결정`;

  try {
    const conn = await getRawConnection();
    const placeholders = recipients.map(() => "(?,?,?,?,?,?,?,?,?,NOW())").join(",");
    const values: any[] = [];
    for (const uid of recipients) {
      values.push(
        tenantId,
        uid,
        "cosmetic_ipc_fail",
        title,
        message,
        "cosmetic_ipc",
        ipcRow.id,
        "high", // priority
        0, // is_read
      );
    }
    await conn.execute(
      `INSERT INTO h_notifications
        (tenant_id, user_id, notification_type, title, message,
         reference_type, reference_id, priority, is_read, created_at)
       VALUES ${placeholders}`,
      values,
    );
    return { alertsSent: recipients.length };
  } catch (err: any) {
    console.warn(
      `[cosmeticAlerts.ipcFail] 알림 INSERT 실패 — ipc=#${ipcRow.id}: ${err?.message ?? err}`,
    );
    return { alertsSent: 0, reason: `INSERT 실패: ${err?.message ?? err}` };
  }
}

/**
 * 출고 회수 (recall) 시 자동 알림 — 모든 active 사용자 + 책임자.
 *
 * 사용 사례:
 *   - 시장 회수 (소비자 안전 사고 등)
 *   - 모든 사용자가 즉시 인지해야 함 (urgent)
 *
 * 의존성: Phase 2-6 (#155) 의 release entity. main 에 미머지 시 호출 사이트가 없으나
 * 함수 자체는 release 정보를 직접 받으므로 독립 동작.
 */
export async function dispatchRecallAlert(
  release: {
    id: number;
    releaseCode: string;
    bmrId: number;
    productId: number;
    releaseQuantity: number | string;
    releaseUnit: string;
    recallReason?: string | null;
    recalledBy?: number | null;
  },
  tenantId: number,
): Promise<{ alertsSent: number; reason?: string }> {
  if (!isCosmeticAlertEnabled(tenantId)) {
    return { alertsSent: 0, reason: "ENABLE_COSMETIC_ALERTS 미활성" };
  }

  // 회수는 admin + inspector + monitor + accountant + worker 모두 인지해야 함
  let recipients: number[] = [];
  try {
    const conn = await getRawConnection();
    const [rows]: any = await conn.execute(
      `SELECT id FROM users
       WHERE tenant_id = ?
         AND role IN ('admin','inspector','monitor','accountant','worker')
         AND is_active = 1
         AND approval_status = 'approved'
       LIMIT 50`,
      [tenantId],
    );
    recipients = (rows as any[]).map((r) => Number(r.id));
  } catch (err) {
    return { alertsSent: 0, reason: "수신자 조회 실패" };
  }

  if (Number(release.recalledBy ?? 0) > 0) {
    if (!recipients.includes(Number(release.recalledBy))) {
      recipients.push(Number(release.recalledBy));
    }
  }

  if (recipients.length === 0) {
    return { alertsSent: 0, reason: "수신자 0명" };
  }

  const title = `[화장품 출고 회수] ${release.releaseCode}`;
  const message =
    `화장품 출고가 회수 처리되었습니다.\n` +
    `  • 출고 코드: ${release.releaseCode}\n` +
    `  • BMR: #${release.bmrId}\n` +
    `  • 제품: #${release.productId}\n` +
    `  • 출고량: ${release.releaseQuantity} ${release.releaseUnit}\n` +
    (release.recallReason ? `  • 회수 사유: ${release.recallReason}\n` : "") +
    `\n즉시 조치:\n` +
    `  - 시장 유통분 회수 절차 가동\n` +
    `  - 동일 BMR 의 다른 출고 lot 검토\n` +
    `  - QA / 영업 / 물류 부서 즉시 공유`;

  try {
    const conn = await getRawConnection();
    const placeholders = recipients
      .map(() => "(?,?,?,?,?,?,?,?,?,NOW())")
      .join(",");
    const values: any[] = [];
    for (const uid of recipients) {
      values.push(
        tenantId,
        uid,
        "cosmetic_recall",
        title,
        message,
        "cosmetic_release",
        release.id,
        "urgent",
        0,
      );
    }
    await conn.execute(
      `INSERT INTO h_notifications
        (tenant_id, user_id, notification_type, title, message,
         reference_type, reference_id, priority, is_read, created_at)
       VALUES ${placeholders}`,
      values,
    );
    return { alertsSent: recipients.length };
  } catch (err: any) {
    console.warn(
      `[cosmeticAlerts.recall] 알림 INSERT 실패 — release=#${release.id}: ${err?.message ?? err}`,
    );
    return { alertsSent: 0, reason: `INSERT 실패: ${err?.message ?? err}` };
  }
}
