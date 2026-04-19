import { getDb } from "../connection";
import { onPurchaseCreated } from "../accounting/materialLedger";
import { accountingPurchases, accountingSales } from "../../../drizzle/schema";
import { eq, and} from "drizzle-orm";

import { todayKST } from "../../utils/timezone";

/**
 * 매입 거래 직접 생성 (품목 단위)
 * itemMasterId 기준으로 통합 관리: 원재료면 h_materials 자동 연동
 */
export async function createPurchase(params: {
  transactionDate: string;
  partnerId: number;
  itemName: string;
  materialId?: number; // 원재료 ID (레거시 호환)
  itemMasterId?: number; // item_master ID (통합 기준)
  quantity: number;
  packagingSize?: number; // 포장규격
  unitPrice: number;
  amount: number;
  taxAmount: number;
  memo?: string;
  accountCategoryId?: number;
  expiryDate?: string; // 소비기한
  productionDate?: string; // 생산일자
  unit?: string; // 단위
  createdBy: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // === itemMasterId → materialId 자동 매핑 ===
  let resolvedMaterialId = params.materialId;
  if (params.itemMasterId && !resolvedMaterialId) {
    try {
      const { itemMaster } = await import("../../../drizzle/schema");
      const [masterItem] = await db.select().from(itemMaster).where(eq(itemMaster.id, params.itemMasterId));
      if (masterItem && masterItem.itemType === 'raw_material' && masterItem.legacyMaterialId) {
        resolvedMaterialId = masterItem.legacyMaterialId;
      }
    } catch (e) {
      console.error("[createPurchase] itemMaster 조회 실패:", e);
    }
  }

  // ★ 2026-04-15: material_id / account_category_id 컬럼 부재 시 fallback
  //   startupMigrations.ensureAccountingTransactionColumns 에서 자동 ADD 되지만
  //   ensure 실패/타이밍 문제로 여전히 없을 수 있음 → INSERT 실패 시 재시도
  const baseValues: any = {
    tenantId: tenantId,
    transactionDate: params.transactionDate,
    partnerId: params.partnerId,
    itemName: params.itemName,
    quantity: params.quantity.toString(),
    unit: params.unit || "개",
    unitPrice: params.unitPrice.toString(),
    totalAmount: params.amount.toString(),
    taxAmount: params.taxAmount.toString(),
    taxRate: "10.00",
    sourceType: "manual",
    notes: params.memo ?? null,
    status: "approved",
    createdBy: params.createdBy,
  };
  // 선택 컬럼 (컬럼 부재 시 fallback 가능)
  if (resolvedMaterialId !== undefined && resolvedMaterialId !== null) {
    baseValues.materialId = resolvedMaterialId;
  }
  if (params.accountCategoryId !== undefined && params.accountCategoryId !== null) {
    baseValues.accountCategoryId = params.accountCategoryId;
  }

  let purchase: any;
  try {
    [purchase] = await db.insert(accountingPurchases).values(baseValues);
  } catch (insertErr: any) {
    const msg = insertErr?.message || String(insertErr);
    // Unknown column 에러 시 해당 컬럼 제거 후 재시도
    if (msg.includes("Unknown column") || insertErr?.code === "ER_BAD_FIELD_ERROR") {
      console.warn(`[createPurchase] INSERT 실패, fallback 재시도: ${msg}`);
      // material_id 문제면 제거
      if (msg.includes("material_id") || msg.includes("materialId")) {
        delete baseValues.materialId;
      }
      // account_category_id 문제면 제거
      if (msg.includes("account_category_id") || msg.includes("accountCategoryId")) {
        delete baseValues.accountCategoryId;
      }
      [purchase] = await db.insert(accountingPurchases).values(baseValues);
      console.warn(`[createPurchase] fallback INSERT 성공 — startupMigrations 재실행 권장`);
    } else {
      throw insertErr;
    }
  }

  // 원재료 ID가 있으면 h_inventory_lots 및 h_material_inspections 자동 생성
  // ★ 2026-04-15: HACCP 통합 블록 전체를 try/catch 로 보호
  //   하위 테이블(h_inventory_lots, h_material_inspections, categories, h_stock_alerts)
  //   중 하나라도 없으면 전체 입고가 실패하던 문제.
  //   이제는 메인 매입전표(accounting_purchases) 는 이미 insert 완료된 상태이므로
  //   HACCP 통합이 실패해도 로그만 남기고 계속 진행.
  if (resolvedMaterialId) {
    try {
      const { hInventoryLots, hMaterialInspections, hMaterials } = await import("../../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // 원재료 정보 조회 (unit 필드 필요)
      const [material] = await db.select().from(hMaterials).where(eq(hMaterials.id, resolvedMaterialId));
      if (!material) {
        console.warn(`[createPurchase] Material not found: ${resolvedMaterialId}, skipping HACCP integration`);
        // 원재료를 찾지 못하면 HACCP 연동 건너뛰기 (매입 기록은 이미 생성됨)
      } else {

      // LOT 번호 자동 생성 (형식: MAT-YYYYMMDD-순번)
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
      const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
      const lotNumber = `MAT-${dateStr}-${randomSuffix}`;

      // 포장규격 × 수량 = 총 재고량
      const totalInventoryQuantity = (params.packagingSize || 1) * params.quantity;

      // h_inventory_lots에 LOT 생성
      const [lot] = await db.insert(hInventoryLots).values({
        tenantId: tenantId,
        lotNumber,
        materialId: resolvedMaterialId,
        quantity: totalInventoryQuantity,
        availableQuantity: totalInventoryQuantity, // 초기 입고 시 가용 수량 = 총 수량
        unit: material.unit, // 원재료의 단위 사용
        receiptDate: params.transactionDate,
        expiryDate: params.expiryDate || null,
        productionDate: params.productionDate || null,
        status: "available", // enum: available, reserved, used, expired, disposed
      } as any);

      // h_material_inspections에 육안검사일지 자동 생성
      // 실제 DB 구조에 맞춰 수정: receiving_id, inspection_date, inspector_id, status, result
      try {
        await db.insert(hMaterialInspections).values({
          tenantId: tenantId,
          receivingId: purchase.insertId as number, // accounting_purchases.id
          inspectionDate: params.transactionDate,
          inspectorId: params.createdBy,
          status: "pending", // enum: pending, passed, failed, conditional - 초기 상태는 pending
          result: "pass", // enum: pass, fail, conditional
          notes: params.memo || null
        } as any);
      } catch (inspErr: any) {
        console.warn(`[createPurchase] 육안검사일지 생성 실패 (비치명):`, inspErr?.message || inspErr);
      }

      // 카테고리의 alertDays 조회 및 알람 자동 생성
      try {
        const { categories, hStockAlerts } = await import("../../../drizzle/schema");
        // 원재료의 categoryId 조회 (이미 조회한 material 변수 사용)
        if (material?.categoryId) {
          const [category] = await db.select().from(categories).where(eq(categories.id, material.categoryId));

          // alertDays > 0이면 알람 생성
          if (category && category.alertDays && category.alertDays > 0) {
            const alerts: any[] = [];

            // 소비기한 기반 알람 (expiryDate - alertDays)
            if (params.expiryDate) {
              const expiryDate = new Date(params.expiryDate);
              const alertDate = new Date(expiryDate);
              alertDate.setDate(alertDate.getDate() - category.alertDays);

              alerts.push({
                tenantId: tenantId,
                siteId: 1,
                lotId: lot.insertId as number,
                alertType: "expiring_soon",
                alertDate: alertDate.toISOString().slice(0, 19).replace("T", " "),
                resolved: 0,
                notes: `소비기한 ${category.alertDays}일 전 알람`
              });
            }

            // 생산일자 기반 알람 (productionDate + alertDays)
            if (params.productionDate) {
              const productionDate = new Date(params.productionDate);
              const alertDate = new Date(productionDate);
              alertDate.setDate(alertDate.getDate() + category.alertDays);

              alerts.push({
                tenantId: tenantId,
                siteId: 1,
                lotId: lot.insertId as number,
                alertType: "expiring_soon",
                alertDate: alertDate.toISOString().slice(0, 19).replace("T", " "),
                resolved: 0,
                notes: `생산일자 ${category.alertDays}일 후 알람`
              });
            }

            // 알람 일괄 삽입
            if (alerts.length > 0) {
              await db.insert(hStockAlerts).values(alerts);
            }
          }
        }
      } catch (alertErr: any) {
        console.warn(`[createPurchase] 재고 알람 생성 실패 (비치명):`, alertErr?.message || alertErr);
      }
      } // close else block for material found check
    } catch (haccpErr: any) {
      // HACCP 통합 전체 실패 — 매입전표는 이미 생성됨, 나머지는 best-effort
      console.warn(`[createPurchase] HACCP 통합 실패 (매입전표는 생성됨, materialId=${resolvedMaterialId}):`, haccpErr?.message || haccpErr);
    }
  }

  // === 원료수불부 입고 연동 ===
  if (resolvedMaterialId) {
    try {
      await onPurchaseCreated({
        materialId: resolvedMaterialId,
        quantity: params.quantity,
        packagingSize: params.packagingSize,
        transactionDate: params.transactionDate,
        unitPrice: params.unitPrice,
      }, tenantId as number);
    } catch (e) {
      console.error("[원료수불부] 입고 연동 실패:", e);
    }
  }
  return purchase;
}

/**
 * 매출 거래 직접 생성 (품목 단위)
 */
export async function createSale(params: {
  transactionDate: string;
  partnerId: number;
  itemName: string;
  productId?: number; // ★ 2026-04-14: h_products FK (Module 2)
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
  unit?: string;
  memo?: string;
  accountCategoryId?: number;
  createdBy: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [sale] = await db.insert(accountingSales).values({
    tenantId: tenantId,
    transactionDate: params.transactionDate,
    partnerId: params.partnerId,
    productId: params.productId ?? null, // ★ 2026-04-14: 제품 FK 저장
    itemName: params.itemName,
    quantity: params.quantity.toString(),
    unit: params.unit || "개",
    unitPrice: params.unitPrice.toString(),
    totalAmount: params.amount.toString(),
    taxAmount: params.taxAmount.toString(),
    taxRate: "10.00",
    sourceType: "manual",
    notes: params.memo ?? null,
    status: "approved",
    createdBy: params.createdBy,
  } as any);

  return sale;
}

/**
 * 재고 입고 거래를 매입 거래로 변환
 */
export async function createPurchaseFromReceipt(params: {
  inventoryTransactionId: number;
  partnerId?: number;
  materialId?: number; // ★ 2026-04-13 추가: 명시적 FK
  itemName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRate?: string;
  notes?: string;
  createdBy: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const transactionDate = todayKST(); // YYYY-MM-DD
  const totalAmount = parseFloat(params.quantity) * parseFloat(params.unitPrice);
  const taxAmount = totalAmount * (parseFloat(params.taxRate || "10") / 100);

  // ★ 2026-04-13 추가: 재고거래 → LOT → materialId 역추적
  //    재고 입고 시 생성된 LOT 의 materialId 를 매입 전표에 저장해 양방향 링크 유지
  let resolvedMaterialId = params.materialId ?? null;
  if (!resolvedMaterialId && params.inventoryTransactionId) {
    try {
      const { hInventoryTransactions, hInventoryLots } = await import("../../../drizzle/schema");
      const [txRow] = await db
        .select({ materialId: hInventoryLots.materialId })
        .from(hInventoryTransactions)
        .innerJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
        .where(eq(hInventoryTransactions.id, params.inventoryTransactionId));
      if (txRow?.materialId) {
        resolvedMaterialId = Number(txRow.materialId);
      }
    } catch (e) {
      console.error("[createPurchaseFromReceipt] materialId 역추적 실패:", e);
    }
  }

  const [purchase] = await db.insert(accountingPurchases).values({
    tenantId: tenantId,
    transactionDate,
    partnerId: params.partnerId,
    materialId: resolvedMaterialId, // ★ 역방향 FK 연결
    itemName: params.itemName,
    quantity: params.quantity,
    unit: params.unit,
    unitPrice: params.unitPrice,
    totalAmount: totalAmount.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    taxRate: params.taxRate || "10.00",
    sourceType: "inventory_receipt",
    sourceId: params.inventoryTransactionId,
    notes: params.notes,
    status: "pending",
    createdBy: params.createdBy
  } as any);

  return purchase;
}

/**
 * 재고 출고 거래를 매출 거래로 변환
 */
export async function createSaleFromUsage(params: {
  inventoryTransactionId?: number;
  partnerId?: number;
  itemName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRate?: string;
  notes?: string;
  createdBy: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const transactionDate = todayKST(); // YYYY-MM-DD
  const totalAmount = parseFloat(params.quantity) * parseFloat(params.unitPrice);
  const taxAmount = totalAmount * (parseFloat(params.taxRate || "10") / 100);

  const [sale] = await db.insert(accountingSales).values({
    tenantId: tenantId,
    transactionDate,
    partnerId: params.partnerId,
    itemName: params.itemName,
    quantity: params.quantity,
    unit: params.unit,
    unitPrice: params.unitPrice,
    totalAmount: totalAmount.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    taxRate: params.taxRate || "10.00",
    sourceType: "inventory_usage",
    sourceId: params.inventoryTransactionId,
    notes: params.notes,
    status: "pending",
    createdBy: params.createdBy
  });

  return sale;
}

/**
 * 재고 거래 ID로 연결된 회계 거래 조회
 */
export async function getAccountingByInventoryTransaction(inventoryTransactionId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const purchases = await db
    .select()
    .from(accountingPurchases)
    .where(and(eq(accountingPurchases.sourceId, inventoryTransactionId), eq(accountingPurchases.tenantId, tenantId as number)));

  const sales = await db
    .select()
    .from(accountingSales)
    .where(and(eq(accountingSales.sourceId, inventoryTransactionId), eq(accountingSales.tenantId, tenantId as number)));

  return { purchases, sales };
}

/**
 * 매입 거래 목록 조회
 */
export async function getAllPurchases(filters?: {
  startDate?: string;
  endDate?: string;
  partnerId?: number;
  itemName?: string;
  status?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { partners } = await import("../../../drizzle/schema");
  const { and, gte, lte, eq, like } = await import("drizzle-orm");

  let query = db
    .select({
      id: accountingPurchases.id,
      transactionDate: accountingPurchases.transactionDate,
      partnerId: accountingPurchases.partnerId,
      partnerName: partners.companyName,
      materialId: accountingPurchases.materialId, // ★ 2026-04-13 추가
      itemName: accountingPurchases.itemName,
      quantity: accountingPurchases.quantity,
      unit: accountingPurchases.unit,
      unitPrice: accountingPurchases.unitPrice,
      amount: accountingPurchases.totalAmount,
      taxAmount: accountingPurchases.taxAmount,
      status: accountingPurchases.status,
      memo: accountingPurchases.notes,
      proofType: accountingPurchases.evidenceType,
      createdAt: accountingPurchases.createdAt
    })
    .from(accountingPurchases)
    .leftJoin(
      partners,
      and(
        eq(accountingPurchases.partnerId, partners.id),
        eq(partners.tenantId, accountingPurchases.tenantId),
      ),
    );

  const conditions = [eq(accountingPurchases.tenantId, tenantId as number)];
  if (filters?.startDate) {
    conditions.push(gte(accountingPurchases.transactionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(accountingPurchases.transactionDate, filters.endDate));
  }
  if (filters?.partnerId) {
    conditions.push(eq(accountingPurchases.partnerId, filters.partnerId));
  }
  if (filters?.itemName) {
    conditions.push(like(accountingPurchases.itemName, `%${filters.itemName}%`));
  }
  if (filters?.status) {
    conditions.push(eq(accountingPurchases.status, filters.status as any) );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const { desc } = await import("drizzle-orm");
  query = query.orderBy(desc(accountingPurchases.transactionDate), desc(accountingPurchases.id)) as any;

  return await query;
}

/**
 * 매출 거래 목록 조회
 */
export async function getAllSales(filters?: {
  startDate?: string;
  endDate?: string;
  partnerId?: number;
  itemName?: string;
  status?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { partners } = await import("../../../drizzle/schema");
  const { and, gte, lte, eq, like } = await import("drizzle-orm");

  let query = db
    .select({
      id: accountingSales.id,
      transactionDate: accountingSales.transactionDate,
      partnerId: accountingSales.partnerId,
      partnerName: partners.companyName,
      productId: accountingSales.productId, // ★ 2026-04-14 추가 (Module 2)
      itemName: accountingSales.itemName,
      quantity: accountingSales.quantity,
      unit: accountingSales.unit,
      unitPrice: accountingSales.unitPrice,
      amount: accountingSales.totalAmount,
      taxAmount: accountingSales.taxAmount,
      status: accountingSales.status,
      memo: accountingSales.notes,
      proofType: accountingSales.evidenceType,
      createdAt: accountingSales.createdAt
    })
    .from(accountingSales)
    .leftJoin(
      partners,
      and(
        eq(accountingSales.partnerId, partners.id),
        eq(partners.tenantId, accountingSales.tenantId),
      ),
    );

  const conditions = [eq(accountingSales.tenantId, tenantId as number)];
  if (filters?.startDate) {
    conditions.push(gte(accountingSales.transactionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(accountingSales.transactionDate, filters.endDate));
  }
  if (filters?.partnerId) {
    conditions.push(eq(accountingSales.partnerId, filters.partnerId));
  }
  if (filters?.itemName) {
    conditions.push(like(accountingSales.itemName, `%${filters.itemName}%`));
  }
  if (filters?.status) {
    conditions.push(eq(accountingSales.status, filters.status as any) );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query;
}

/**
 * 매입 거래 상세 조회
 */
export async function getPurchaseById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { partners } = await import("../../../drizzle/schema");

  const purchase = await db
    .select()
    .from(accountingPurchases)
    .leftJoin(
      partners,
      and(
        eq(accountingPurchases.partnerId, partners.id),
        eq(partners.tenantId, accountingPurchases.tenantId),
      ),
    )
    .where(and(eq(accountingPurchases.id, id), eq(accountingPurchases.tenantId, tenantId as number)))
    .limit(1);

  if (purchase.length === 0) {
    throw new Error("매입 거래를 찾을 수 없습니다.");
  }

  return {
    ...purchase[0].accounting_purchases,
    partnerName: purchase[0].partners?.companyName || "알 수 없음"
  };
}

/**
 * 매출 거래 상세 조회
 */
export async function getSaleById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { partners } = await import("../../../drizzle/schema");

  const sale = await db
    .select()
    .from(accountingSales)
    .leftJoin(
      partners,
      and(
        eq(accountingSales.partnerId, partners.id),
        eq(partners.tenantId, accountingSales.tenantId),
      ),
    )
    .where(and(eq(accountingSales.id, id), eq(accountingSales.tenantId, tenantId as number)))
    .limit(1);

  if (sale.length === 0) {
    throw new Error("매출 거래를 찾을 수 없습니다.");
  }

  return {
    ...sale[0].accounting_sales,
    partnerName: sale[0].partners?.companyName || "알 수 없음"
  };
}

/**
 * 매입 거래명세서 PDF 생성 (HTML 형식)
 */
export async function generatePurchasePdf(id: number, tenantId: number): Promise<string> {
  const purchase = await getPurchaseById(id, tenantId);
  const { storagePut } = await import("../../storage");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>매입 거래명세서</title>
  <style>
    body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; }
    h1 { text-align: center; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .text-right { text-align: right; }
    .total-row { font-weight: bold; background-color: #f9f9f9; }
  </style>
</head>
<body>
  <h1>매입 거래명세서</h1>
  <table>
    <tr>
      <th>거래일자</th>
      <td>${purchase.transactionDate}</td>
      <th>공급업체</th>
      <td>${purchase.partnerName}</td>
    </tr>
    <tr>
      <th>품목명</th>
      <td>${purchase.itemName}</td>
      <th>수량</th>
      <td>${purchase.quantity} ${purchase.unit}</td>
    </tr>
    <tr>
      <th>단가</th>
      <td>${parseFloat(purchase.unitPrice).toLocaleString()}원</td>
      <th>금액</th>
      <td>${parseFloat(purchase.totalAmount).toLocaleString()}원</td>
    </tr>
    <tr>
      <th>세액 (${purchase.taxRate}%)</th>
      <td>${parseFloat(purchase.taxAmount || '0').toLocaleString()}원</td>
      <th>총 합계</th>
      <td class="total-row">${(parseFloat(purchase.totalAmount) + parseFloat(purchase.taxAmount || '0')).toLocaleString()}원</td>
    </tr>
  </table>
  ${purchase.notes ? `<p><strong>메모:</strong> ${purchase.notes}</p>` : ""}
</body>
</html>
  `;

  const pdfBuffer = Buffer.from(html, "utf-8");
  const fileName = `purchase_${id}_${Date.now()}.html`;
  const tenantPrefix = `tenant-${tenantId}/`;
  const { url } = await storagePut(`${tenantPrefix}pdfs/${fileName}`, pdfBuffer, "text/html");

  return url;
}

/**
 * 매출 거래명세서 PDF 생성 (HTML 형식)
 */
export async function generateSalePdf(id: number, tenantId: number): Promise<string> {
  const sale = await getSaleById(id, tenantId);
  const { storagePut } = await import("../../storage");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>매출 거래명세서</title>
  <style>
    body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; }
    h1 { text-align: center; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .text-right { text-align: right; }
    .total-row { font-weight: bold; background-color: #f9f9f9; }
  </style>
</head>
<body>
  <h1>매출 거래명세서</h1>
  <table>
    <tr>
      <th>거래일자</th>
      <td>${sale.transactionDate}</td>
      <th>고객사</th>
      <td>${sale.partnerName}</td>
    </tr>
    <tr>
      <th>품목명</th>
      <td>${sale.itemName}</td>
      <th>수량</th>
      <td>${sale.quantity} ${sale.unit}</td>
    </tr>
    <tr>
      <th>단가</th>
      <td>${parseFloat(sale.unitPrice).toLocaleString()}원</td>
      <th>금액</th>
      <td>${parseFloat(sale.totalAmount).toLocaleString()}원</td>
    </tr>
    <tr>
      <th>세액 (${sale.taxRate}%)</th>
      <td>${parseFloat(sale.taxAmount || '0').toLocaleString()}원</td>
      <th>총 합계</th>
      <td class="total-row">${(parseFloat(sale.totalAmount) + parseFloat(sale.taxAmount || '0')).toLocaleString()}원</td>
    </tr>
  </table>
  ${sale.notes ? `<p><strong>메모:</strong> ${sale.notes}</p>` : ""}
</body>
</html>
  `;

  const pdfBuffer = Buffer.from(html, "utf-8");
  const fileName = `sale_${id}_${Date.now()}.html`;
  const tenantPrefix = `tenant-${tenantId}/`;
  const { url } = await storagePut(`${tenantPrefix}pdfs/${fileName}`, pdfBuffer, "text/html");

  return url;
}

/**
 * 매입 거래 수정
 */
export async function updatePurchase(
  id: number,
  data: {
    transactionDate?: string;
    partnerId?: number;
    materialId?: number; // ★ 2026-04-13 추가: h_materials FK
    itemName?: string;
    category?: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    totalAmount?: number;
    taxAmount?: number;
    status?: string;
    notes?: string;
    accountCategoryId?: number;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // category 필드는 accounting_purchases 에 없음 → 제거
  const { category: _category, ...rest } = data;
  const updateData: any = { ...rest, updatedAt: new Date() };
  if (updateData.quantity !== undefined) updateData.quantity = updateData.quantity.toString();
  if (updateData.unitPrice !== undefined) updateData.unitPrice = updateData.unitPrice.toString();
  if (updateData.totalAmount !== undefined) updateData.totalAmount = updateData.totalAmount.toString();
  if (updateData.taxAmount !== undefined) updateData.taxAmount = updateData.taxAmount.toString();

  await db
    .update(accountingPurchases)
    .set(updateData)
    .where(and(eq(accountingPurchases.id, id), eq(accountingPurchases.tenantId, tenantId as number)));

  return { success: true };
}

/**
 * 매입 거래 삭제
 */
export async function deletePurchase(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .delete(accountingPurchases)
    .where(and(eq(accountingPurchases.id, id), eq(accountingPurchases.tenantId, tenantId as number)));

  return { success: true };
}

/**
 * 매출 거래 수정
 */
export async function updateSale(
  id: number,
  data: {
    transactionDate?: string;
    partnerId?: number;
    productId?: number; // ★ 2026-04-14: h_products FK (Module 2)
    itemName?: string;
    category?: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    totalAmount?: number;
    taxAmount?: number;
    status?: string;
    notes?: string;
    accountCategoryId?: number;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // category 는 accounting_sales 에 없는 컬럼 → 제거
  const { category: _category, ...rest } = data;
  const updateData: any = { ...rest, updatedAt: new Date() };
  if (updateData.quantity !== undefined) updateData.quantity = updateData.quantity.toString();
  if (updateData.unitPrice !== undefined) updateData.unitPrice = updateData.unitPrice.toString();
  if (updateData.totalAmount !== undefined) updateData.totalAmount = updateData.totalAmount.toString();
  if (updateData.taxAmount !== undefined) updateData.taxAmount = updateData.taxAmount.toString();

  await db
    .update(accountingSales)
    .set(updateData)
    .where(and(eq(accountingSales.id, id), eq(accountingSales.tenantId, tenantId as number)));

  return { success: true };
}

/**
 * 매출 거래 삭제
 */
export async function deleteSale(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .delete(accountingSales)
    .where(and(eq(accountingSales.id, id), eq(accountingSales.tenantId, tenantId as number)));

  return { success: true };
}
