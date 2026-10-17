/**
 * 매입/매출 확정(POST) 디스패처
 *
 * 테넌트의 구독 패키지에 따라 자동으로 적절한 코드 패스를 선택합니다.
 *   - 재고관리 사용 회사 → purchasePost / productSalePost (LOT, 재고, 수불부 + 회계)
 *   - 회계만 사용하는 회사 → erpPurchasePost / erpSalePost (순수 회계만)
 *   (2026-10-17 CEO 결정 2: 회사 설정 INVENTORY_TRACKING, 없으면 구독 패키지의 HACCP 사용 여부 — 이전 동작)
 */
import { isInventoryTrackingEnabled } from "../inventory/inventoryTrackingPolicy";
import { getDb } from "../../db/connection";
import { sql } from "drizzle-orm";

async function getTenantIdFromPurchase(purchaseId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [rows] = (await db.execute(sql`
    SELECT tenant_id FROM accounting_purchases WHERE id = ${purchaseId} LIMIT 1
  `)) as any;
  return rows?.[0]?.tenant_id;
}

async function getTenantIdFromSale(saleId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [rows] = (await db.execute(sql`
    SELECT tenant_id FROM accounting_sales WHERE id = ${saleId} LIMIT 1
  `)) as any;
  return rows?.[0]?.tenant_id;
}

/**
 * ★ 2026-10-16 (Codex 운영 DB 점검 P1): 호출자 회사와 전표 회사 대조
 *   이전엔 전표 id 로 전표를 읽고 **전표의 tenant_id** 로 처리했다 — 다른 회사 전표 id 를 넣으면 그 회사 전표가 확정됐다.
 *   이제 호출자 tenantId 를 필수로 받아, 전표가 그 회사 것이 아니면 "찾을 수 없음" 으로 거부한다 (존재 여부도 숨김).
 */
function assertSameTenant(kind: "매입" | "매출", id: number, docTenantId: number | undefined, callerTenantId: number) {
  if (!callerTenantId) throw new Error("[보안] tenantId 필수");
  if (!docTenantId || Number(docTenantId) !== Number(callerTenantId)) {
    throw new Error(`${kind} 전표 ID ${id} 를 찾을 수 없습니다.`);
  }
}

export async function dispatchPostPurchase(purchaseId: number, userId: number, callerTenantId: number) {
  const tenantId = await getTenantIdFromPurchase(purchaseId);
  assertSameTenant("매입", purchaseId, tenantId, callerTenantId);
  // 2026-10-17 (CEO 결정 2): 재고관리 사용 여부(회사 설정, 없으면 HACCP 패키지 기준) 로 — HACCP 여부 자체가 아니라
  const haccp = await isInventoryTrackingEnabled(tenantId);

  if (haccp) {
    const { postPurchase } = await import("./purchasePost");
    return postPurchase(purchaseId, userId, callerTenantId);
  } else {
    const { erpPostPurchase } = await import("./erpPurchasePost");
    return erpPostPurchase(purchaseId, userId, callerTenantId);
  }
}

export async function dispatchPostSale(saleId: number, userId: number, callerTenantId: number) {
  const tenantId = await getTenantIdFromSale(saleId);
  assertSameTenant("매출", saleId, tenantId, callerTenantId);
  // 2026-10-17 (CEO 결정 2): 재고관리 사용 여부(회사 설정, 없으면 HACCP 패키지 기준) 로 — HACCP 여부 자체가 아니라
  const haccp = await isInventoryTrackingEnabled(tenantId);

  if (haccp) {
    const { postProductSale } = await import("./productSalePost");
    return postProductSale(saleId, userId, callerTenantId);
  } else {
    const { erpPostSale } = await import("./erpSalePost");
    return erpPostSale(saleId, userId, callerTenantId);
  }
}
