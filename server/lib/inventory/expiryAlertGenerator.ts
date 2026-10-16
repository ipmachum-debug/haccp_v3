import { getDb } from "../../db";
import { hStockAlerts, hInventoryLots } from "../../../drizzle/schema/part2";
import { eq, and, lt, gt, isNull, isNotNull, sql } from "drizzle-orm";

import { formatLocalDate, todayKST } from "../../utils/timezone";

/**
 * 소비기한 기반 알람 자동 생성
 * 
 * LOT 생성 시 소비기한이 있으면 자동으로 알람을 생성합니다.
 * - 만료 30일 전: "expiring_soon" 알람
 * - 만료일 당일: "expired" 알람 (스케줄러가 자동 생성)
 * 
 * @param lotId LOT ID
 * @param inventoryId 재고 ID
 * @param expiryDate 소비기한 (YYYY-MM-DD)
 * @param userId 생성자 ID
 * @param tenantId 테넌트 ID (테넌트 격리)
 */
export async function generateExpiryAlerts(
  lotId: number,
  inventoryId: number,
  expiryDate: string,
  userId: number,
  tenantId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const expiryDateObj = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 만료 30일 전 날짜 계산
  const thirtyDaysBeforeExpiry = new Date(expiryDateObj);
  thirtyDaysBeforeExpiry.setDate(thirtyDaysBeforeExpiry.getDate() - 30);

  // 1. 만료 임박 알람 생성 (만료 30일 전)
  if (expiryDateObj > today) {
    await db.insert(hStockAlerts).values({
      tenantId,
      inventoryId,
      lotId,
      alertType: "expiring_soon",
      severity: "warning",
      message: `소비기한이 30일 이내로 임박했습니다. (만료일: ${expiryDate})`,
      threshold: null,
      currentValue: null,
      scheduledDate: formatLocalDate(thirtyDaysBeforeExpiry),
      resolvedAt: null,
      resolvedBy: null,
      createdBy: userId
    } as any);

    console.log(`[ALERT] 소비기한 임박 알람 생성 (LOT: ${lotId}, 만료일: ${expiryDate})`);
  }

  // 2. 만료 알람은 스케줄러가 자동 생성 (만료일 당일)
  // 여기서는 생성하지 않고, 스케줄러가 매일 체크하여 생성
}

/**
 * 만료된 LOT 알람 자동 생성 (스케줄러용)
 *
 * 매일 실행되는 스케줄러에서 호출하여 소비기한이 지났는데 재고가 남은 LOT 에 알람을 만든다.
 *
 * 2026-10-16 (Codex DB 감사): 이전 조건은 `status='active'`(LOT 상태값에 없음) + `expiry_date <= 오늘 AND expiry_date IS NULL`
 *   (동시에 참일 수 없음) 이라 한 번도 알람이 생기지 않았다. 스케줄러는 tenantId 없이 부르므로 `tenant_id = NULL` 조건도
 *   전부 거짓이었다. → 전 회사(또는 지정 회사) 대상, 소비기한 < 오늘(KST), 남은 재고 > 0, 폐기 아닌 LOT.
 *   FEFO 는 같은 기준(소비기한 당일까지 사용 가능)으로 이 LOT 들을 출고에서 뺀다.
 * @param tenantId 테넌트 ID (없으면 전 회사)
 * @returns 새로 만든 알람 수
 */
export async function generateExpiredAlerts(tenantId?: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const todayStr = todayKST();

  const expiredLots = await db
    .select({
      id: hInventoryLots.id,
      tenantId: hInventoryLots.tenantId,
      inventoryId: hInventoryLots.inventoryId,
      lotNumber: hInventoryLots.lotNumber,
      expiryDate: hInventoryLots.expiryDate,
      availableQuantity: hInventoryLots.availableQuantity,
      unit: hInventoryLots.unit,
    })
    .from(hInventoryLots)
    .where(
      and(
        tenantId != null ? eq(hInventoryLots.tenantId, tenantId) : undefined,
        isNotNull(hInventoryLots.expiryDate),
        lt(hInventoryLots.expiryDate, todayStr as any),
        gt(hInventoryLots.availableQuantity, 0.001 as any),
        sql`COALESCE(${hInventoryLots.status}, 'available') <> 'disposed'`,
      )
    );

  let created = 0;
  for (const lot of expiredLots) {
    // 이미 열린 만료 알람이 있으면 건너뜀 (테넌트 격리)
    const existingAlert = await db
      .select({ id: hStockAlerts.id })
      .from(hStockAlerts)
      .where(
        and(
          eq(hStockAlerts.tenantId, lot.tenantId),
          eq(hStockAlerts.lotId, lot.id),
          eq(hStockAlerts.alertType, "expired"),
          isNull(hStockAlerts.resolvedAt)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (existingAlert) continue;

    await db.insert(hStockAlerts).values({
      tenantId: lot.tenantId,
      siteId: 0, // NOT NULL·기본값 없음 (LOT 에 site_id 컬럼 없음, h_inventory.site_id 도 운영에서 전부 NULL)
      inventoryId: lot.inventoryId,
      lotId: lot.id,
      alertType: "expired",
      severity: "critical",
      message: `소비기한이 지났습니다. LOT ${lot.lotNumber ?? lot.id} (만료일: ${lot.expiryDate}, 남은 재고 ${Number(lot.availableQuantity)}${lot.unit ?? ""}) — 생산·출고에서 자동 제외됩니다. 폐기 처리하세요.`,
    });
    created++;
  }
  if (created > 0) console.log(`[ALERT] 소비기한 만료 알람 ${created}건 생성 (기준일 ${todayStr})`);
  return created;
}
