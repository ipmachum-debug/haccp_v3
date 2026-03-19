import { getDb } from "../db";
import { onPurchaseCreated } from "./materialLedger";
import { accountingPurchases, accountingSales } from "../../drizzle/schema";
import { eq, and} from "drizzle-orm";

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
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  // === itemMasterId → materialId 자동 매핑 ===
  let resolvedMaterialId = params.materialId;
  if (params.itemMasterId && !resolvedMaterialId) {
    try {
      const { itemMaster } = await import("../../drizzle/schema");
      const [masterItem] = await db.select().from(itemMaster).where(eq(itemMaster.id, params.itemMasterId));
      if (masterItem && masterItem.itemType === 'raw_material' && masterItem.legacyMaterialId) {
        resolvedMaterialId = masterItem.legacyMaterialId;
      }
    } catch (e) {
      console.error("[createPurchase] itemMaster 조회 실패:", e);
    }
  }

  const [purchase] = await db.insert(accountingPurchases).values({
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
    accountCategoryId: params.accountCategoryId ?? null,
    createdBy: params.createdBy
  });

  // 원재료 ID가 있으면 h_inventory + h_inventory_lots + h_inventory_transactions + h_material_inspections 자동 생성
  if (resolvedMaterialId) {
    const { hInventoryLots, hInventoryTransactions, hInventory, hMaterialInspections, hMaterials, partners } = await import("../../drizzle/schema");
    const { eq, and: drizzleAnd, sql } = await import("drizzle-orm");
    
    // 원재료 정보 조회 (unit 필드 필요)
    const [material] = await db.select().from(hMaterials).where(eq(hMaterials.id, resolvedMaterialId));
    if (!material) {
      console.warn(`[createPurchase] Material not found: ${resolvedMaterialId}, skipping HACCP integration`);
      // 원재료를 찾지 못하면 HACCP 연동 건너뛰기 (매입 기록은 이미 생성됨)
    } else {
    
    // 거래처명 조회
    let supplierName = "";
    if (params.partnerId) {
      try {
        const [partner] = await db.select().from(partners).where(
          drizzleAnd(eq(partners.id, params.partnerId), eq(partners.tenantId, tenantId))
        );
        supplierName = partner?.companyName || "";
      } catch (e) {
        console.warn(`[createPurchase] Partner lookup failed:`, e);
      }
    }

    // LOT 번호 자동 생성 (형식: LOT-YYYYMMDD-순번)
    const txDateStr = params.transactionDate.replace(/-/g, "");
    const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    const lotNumber = `LOT-${txDateStr}-${randomSuffix}`;
    
    // 포장규격 × 수량 = 총 재고량
    const totalInventoryQuantity = (params.packagingSize || 1) * params.quantity;
    const materialUnit = material.unit || params.unit || "kg";
    
    // ━━━ h_inventory 마스터 생성/업데이트 ━━━
    const [existingInventory] = await db.select().from(hInventory).where(
      drizzleAnd(
        eq(hInventory.tenantId, tenantId),
        eq(hInventory.materialId, resolvedMaterialId)
      )
    );

    let inventoryId: number;
    if (existingInventory) {
      // 기존 재고가 있으면 수량 증가
      inventoryId = existingInventory.id;
      await db.update(hInventory)
        .set({
          totalQuantity: sql`${hInventory.totalQuantity} + ${totalInventoryQuantity.toFixed(3)}`,
          availableQuantity: sql`${hInventory.availableQuantity} + ${totalInventoryQuantity.toFixed(3)}`,
        })
        .where(eq(hInventory.id, inventoryId));
    } else {
      // 새 재고 마스터 생성
      const [newInv] = await db.insert(hInventory).values({
        tenantId,
        siteId: 1,
        materialId: resolvedMaterialId,
        itemName: params.itemName,
        totalQuantity: totalInventoryQuantity.toFixed(3),
        availableQuantity: totalInventoryQuantity.toFixed(3),
        reservedQuantity: "0.000",
        unit: materialUnit,
        location: "원재료 창고",
      } as any);
      inventoryId = newInv.insertId as number;
    }

    // ━━━ h_inventory_lots에 LOT 생성 ━━━
    const [lot] = await db.insert(hInventoryLots).values({
      tenantId,
      inventoryId,
      lotNumber,
      materialId: resolvedMaterialId,
      quantity: totalInventoryQuantity.toFixed(3),
      availableQuantity: totalInventoryQuantity.toFixed(3),
      unit: materialUnit,
      unitPrice: params.unitPrice.toFixed(2),
      receiptDate: params.transactionDate,
      expiryDate: params.expiryDate || null,
      productionDate: params.productionDate || null,
      supplierName: supplierName || null,
      location: "원재료 창고",
      status: "available",
    } as any);

    const lotId = lot.insertId as number;

    // ━━━ h_inventory_transactions에 입고 트랜잭션 생성 ━━━
    await db.insert(hInventoryTransactions).values({
      tenantId,
      lotId,
      inventoryId,
      transactionType: "receipt",
      quantity: totalInventoryQuantity.toFixed(3),
      unit: materialUnit,
      unitCost: params.unitPrice.toFixed(2),
      amount: (totalInventoryQuantity * params.unitPrice).toFixed(2),
      transactionDate: params.transactionDate,
      referenceType: "purchase",
      referenceId: purchase.insertId as number,
      sourceType: "accounting_purchases",
      actionType: "inbound",
      purpose: "매입 입고",
      performedBy: params.createdBy,
      createdBy: params.createdBy,
      notes: `${supplierName ? supplierName + " - " : ""}${params.itemName} ${totalInventoryQuantity}${materialUnit} 입고`,
    } as any);
    
    // h_material_inspections에 육안검사일지 자동 생성
    await db.insert(hMaterialInspections).values({
      tenantId: tenantId,
      receivingId: purchase.insertId as number,
      inspectionDate: params.transactionDate,
      inspectorId: params.createdBy,
      status: "pending",
      result: "pass",
      notes: params.memo || null
    } as any);
    
    // 카테고리의 alertDays 조회 및 알람 자동 생성
    const { categories, hStockAlerts } = await import("../../drizzle/schema");
    
    if (material?.categoryId) {
      const [category] = await db.select().from(categories).where(eq(categories.id, material.categoryId));
      
      if (category && category.alertDays && category.alertDays > 0) {
        const alerts: any[] = [];
        
        if (params.expiryDate) {
          const expiryDate = new Date(params.expiryDate);
          const alertDate = new Date(expiryDate);
          alertDate.setDate(alertDate.getDate() - category.alertDays);
          
          alerts.push({
            tenantId: tenantId,
            siteId: 1,
            lotId,
            alertType: "expiring_soon",
            alertDate: alertDate.toISOString().slice(0, 19).replace("T", " "),
            resolved: 0,
            notes: `소비기한 ${category.alertDays}일 전 알람`
          });
        }
        
        if (params.productionDate) {
          const productionDate = new Date(params.productionDate);
          const alertDate = new Date(productionDate);
          alertDate.setDate(alertDate.getDate() + category.alertDays);
          
          alerts.push({
            tenantId: tenantId,
            siteId: 1,
            lotId,
            alertType: "expiring_soon",
            alertDate: alertDate.toISOString().slice(0, 19).replace("T", " "),
            resolved: 0,
            notes: `생산일자 ${category.alertDays}일 후 알람`
          });
        }
        
        if (alerts.length > 0) {
          await db.insert(hStockAlerts).values(alerts);
        }
      }
    }
    } // close else block for material found check
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
      }, tenantId);
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
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
  unit?: string;
  memo?: string;
  accountCategoryId?: number;
  createdBy: number;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const [sale] = await db.insert(accountingSales).values({
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
    createdBy: params.createdBy
  });

  return sale;
}

/**
 * 재고 입고 거래를 매입 거래로 변환
 */
export async function createPurchaseFromReceipt(params: {
  inventoryTransactionId: number;
  partnerId?: number;
  itemName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRate?: string;
  notes?: string;
  createdBy: number;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const transactionDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const totalAmount = parseFloat(params.quantity) * parseFloat(params.unitPrice);
  const taxAmount = totalAmount * (parseFloat(params.taxRate || "10") / 100);

  const [purchase] = await db.insert(accountingPurchases).values({
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
    sourceType: "inventory_receipt",
    sourceId: params.inventoryTransactionId,
    notes: params.notes,
    status: "pending",
    createdBy: params.createdBy
  });

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
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const transactionDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
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
  if (!db) throw new Error("Database connection not available");

  const purchases = await db
    .select()
    .from(accountingPurchases)
    .where(and(eq(accountingPurchases.sourceId, inventoryTransactionId), eq(accountingPurchases.tenantId, tenantId)));

  const sales = await db
    .select()
    .from(accountingSales)
    .where(and(eq(accountingSales.sourceId, inventoryTransactionId), eq(accountingSales.tenantId, tenantId)));

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
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  const { partners } = await import("../../drizzle/schema");
  const { and, gte, lte, eq, like } = await import("drizzle-orm");

  let query = db
    .select({
      id: accountingPurchases.id,
      transactionDate: accountingPurchases.transactionDate,
      partnerId: accountingPurchases.partnerId,
      partnerName: partners.companyName,
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
    .leftJoin(partners, eq(accountingPurchases.partnerId, partners.id));

  const conditions = [eq(accountingPurchases.tenantId, tenantId)];
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
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  const { partners } = await import("../../drizzle/schema");
  const { and, gte, lte, eq, like } = await import("drizzle-orm");

  let query = db
    .select({
      id: accountingSales.id,
      transactionDate: accountingSales.transactionDate,
      partnerId: accountingSales.partnerId,
      partnerName: partners.companyName,
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
    .leftJoin(partners, eq(accountingSales.partnerId, partners.id));

  const conditions = [eq(accountingSales.tenantId, tenantId)];
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
export async function getPurchaseById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const { partners } = await import("../../drizzle/schema");

  const purchase = await db
    .select()
    .from(accountingPurchases)
    .leftJoin(partners, eq(accountingPurchases.partnerId, partners.id))
    .where(and(eq(accountingPurchases.id, id), eq(accountingPurchases.tenantId, tenantId)))
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
export async function getSaleById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const { partners } = await import("../../drizzle/schema");

  const sale = await db
    .select()
    .from(accountingSales)
    .leftJoin(partners, eq(accountingSales.partnerId, partners.id))
    .where(and(eq(accountingSales.id, id), eq(accountingSales.tenantId, tenantId)))
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
  const { storagePut } = await import("../storage");

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
  const { storagePut } = await import("../storage");

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
  }, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const updateData: any = { ...data, updatedAt: new Date() };
  if (updateData.quantity !== undefined) updateData.quantity = updateData.quantity.toString();
  if (updateData.unitPrice !== undefined) updateData.unitPrice = updateData.unitPrice.toString();
  if (updateData.totalAmount !== undefined) updateData.totalAmount = updateData.totalAmount.toString();
  if (updateData.taxAmount !== undefined) updateData.taxAmount = updateData.taxAmount.toString();

  await db
    .update(accountingPurchases)
    .set(updateData)
    .where(and(eq(accountingPurchases.id, id), eq(accountingPurchases.tenantId, tenantId)));

  return { success: true };
}

/**
 * 매입 거래 삭제
 */
export async function deletePurchase(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  await db
    .delete(accountingPurchases)
    .where(and(eq(accountingPurchases.id, id), eq(accountingPurchases.tenantId, tenantId)));

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
  }, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const updateData: any = { ...data, updatedAt: new Date() };
  if (updateData.quantity !== undefined) updateData.quantity = updateData.quantity.toString();
  if (updateData.unitPrice !== undefined) updateData.unitPrice = updateData.unitPrice.toString();
  if (updateData.totalAmount !== undefined) updateData.totalAmount = updateData.totalAmount.toString();
  if (updateData.taxAmount !== undefined) updateData.taxAmount = updateData.taxAmount.toString();

  await db
    .update(accountingSales)
    .set(updateData)
    .where(and(eq(accountingSales.id, id), eq(accountingSales.tenantId, tenantId)));

  return { success: true };
}

/**
 * 매출 거래 삭제
 */
export async function deleteSale(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  await db
    .delete(accountingSales)
    .where(and(eq(accountingSales.id, id), eq(accountingSales.tenantId, tenantId)));

  return { success: true };
}
