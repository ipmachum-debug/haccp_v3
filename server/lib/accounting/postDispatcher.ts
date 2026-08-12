/**
 * 매입/매출 확정(POST) 디스패처
 *
 * 테넌트의 구독 패키지에 따라 자동으로 적절한 코드 패스를 선택합니다.
 *   - HACCP 활성 → purchasePost / productSalePost (LOT, 재고, 수불부 + 회계)
 *   - HACCP 비활성 → erpPurchasePost / erpSalePost (순수 회계만)
 */
import { isHaccpEnabled } from "./tenantModuleCheck";
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

export async function dispatchPostPurchase(purchaseId: number, userId: number) {
  const tenantId = await getTenantIdFromPurchase(purchaseId);
  const haccp = await isHaccpEnabled(tenantId);

  if (haccp) {
    const { postPurchase } = await import("./purchasePost");
    return postPurchase(purchaseId, userId);
  } else {
    const { erpPostPurchase } = await import("./erpPurchasePost");
    return erpPostPurchase(purchaseId, userId);
  }
}

export async function dispatchPostSale(saleId: number, userId: number) {
  const tenantId = await getTenantIdFromSale(saleId);
  const haccp = await isHaccpEnabled(tenantId);

  if (haccp) {
    const { postProductSale } = await import("./productSalePost");
    return postProductSale(saleId, userId);
  } else {
    const { erpPostSale } = await import("./erpSalePost");
    return erpPostSale(saleId, userId);
  }
}
