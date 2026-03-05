import { getDb } from "../_core/db";
import { hBatches, hProductionLogs } from "../../drizzle/schema_main";
import { eq, and, desc, sql, between } from "drizzle-orm";

/**
 * 배치 목록 조회
 */
export async function listBatches(params?: {
  siteId?: number;
  productId?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query = db.select().from(hBatches).where(eq(hBatches.tenantId, tenantId));

  const conditions = [];
  if (tenantId) conditions.push(eq(hProductionLogs.tenantId, tenantId));
  if (params?.siteId) {
    conditions.push(eq(hBatches.siteId, params.siteId));
  }
  if (params?.productId) {
    conditions.push(eq(hBatches.productId, params.productId));
  }
  if (params?.status) {
    conditions.push(eq(hBatches.status, params.status as any));
  }
  if (params?.startDate && params?.endDate) {
    conditions.push(between(hBatches.plannedDate, params.startDate, params.endDate));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  query = query.orderBy(desc(hBatches.createdAt)) as any;

  if (params?.limit) {
    query = query.limit(params.limit) as any;
  }
  if (params?.offset) {
    query = query.offset(params.offset) as any;
  }

  return await query;
}

/**
 * 배치 상세 조회
 */
export async function getBatchById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [batch] = await db
    .select()
    .from(hBatches)
    .where(and(eq(hBatches.tenantId, tenantId), eq(hBatches.id, id)));
  return batch;
}

/**
 * 배치 생성
 */
export async function createBatch(data: {
  siteId: number;
  batchCode: string;
  productId: number;
  recipeId?: number;
  plannedQuantity: string;
  plannedDate: string;
  lotNumber?: string;
  expiryDate?: string;
  notes?: string;
  createdBy: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [batch] = await db.insert(hBatches).values({
      tenantId,
    siteId: data.siteId,
    batchCode: data.batchCode,
    productId: data.productId,
    recipeId: data.recipeId,
    plannedQuantity: data.plannedQuantity,
    plannedDate: data.plannedDate,
    lotNumber: data.lotNumber,
    expiryDate: data.expiryDate,
    notes: data.notes,
    status: "planned",
    createdBy: data.createdBy
  });

  return batch;
}

/**
 * 배치 수정
 */
export async function updateBatch(
  id: number,
  data: {
    batchCode?: string;
    productId?: number;
    recipeId?: number;
    plannedQuantity?: string;
    actualQuantity?: string;
    plannedDate?: string;
    lotNumber?: string;
    expiryDate?: string;
    notes?: string;
    status?: string;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(hBatches)
    .set({
      ...data
    })
    .where(and(eq(hBatches.tenantId, tenantId), eq(hBatches.id, id)));
  return await getBatchById(id);
}

/**
 * 배치 삭제
 */
export async function deleteBatch(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(hBatches).where(and(eq(hBatches.tenantId, tenantId), eq(hBatches.id, id)));}

/**
 * 생산 시작
 */
export async function startBatch(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(hBatches)
    .set({
      status: "in_progress",
      startTime: new Date()
    })
    .where(and(eq(hBatches.tenantId, tenantId), eq(hBatches.id, id)));
  // 생산 로그 기록
  await db.insert(hProductionLogs).values({
      tenantId,
    batchId: id,
    logTime: new Date(),
    eventType: "batch_started",
    description: "생산 시작"
  });

  return await getBatchById(id);
}

/**
 * 생산 완료
 */
export async function completeBatch(
  id: number,
  data: {
    actualQuantity: string;
    lotNumber?: string;
    expiryDate?: string;
    notes?: string;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(hBatches)
    .set({
      status: "completed",
      endTime: new Date(),
      completedAt: new Date(),
      actualQuantity: data.actualQuantity,
      lotNumber: data.lotNumber,
      expiryDate: data.expiryDate,
      notes: data.notes
    })
    .where(and(eq(hBatches.tenantId, tenantId), eq(hBatches.id, id)));
  // 생산 로그 기록
  await db.insert(hProductionLogs).values({
      tenantId,
    batchId: id,
    logTime: new Date(),
    eventType: "batch_completed",
    description: `생산 완료 (실제 수량: ${data.actualQuantity})`
  });

  // ★ 배치 완료 시 제품 재고 LOT 자동 생성 (h_inventory_lots.productId)
  try {
    const batch = await getBatchById(id);
    if (batch && tenantId) {
      const { createProductLotFromBatch } = await import("./productOutboundManagement");
      await createProductLotFromBatch({
        batchId: id,
        batchCode: (batch as any).batchCode || (batch as any).batch_code || `B${id}`,
        productId: (batch as any).productId || (batch as any).product_id || 0,
        productName: (batch as any).productName || (batch as any).product_name || "제품",
        quantity: parseFloat(data.actualQuantity || "0"),
        unit: (batch as any).unit || "EA",
        lotNumber: data.lotNumber || `PROD-${(batch as any).batchCode || (batch as any).batch_code || id}`,
        expiryDate: data.expiryDate,
        userId: 0, // system
      }, tenantId);
      console.log(`[completeBatch] 제품 LOT 자동 생성 완료 (배치: ${id})`);
    }
  } catch (err) {
    console.error(`[completeBatch] 제품 LOT 생성 실패 (배치: ${id}):`, err);
    // LOT 생성 실패해도 배치 완료는 성공
  }

  return await getBatchById(id);
}

/**
 * 로트 번호 자동 생성
 */
export async function generateLotNumber(productId: number, tenantId?: number): Promise<string> {
  const db = await getDb();
  if (!db) {
    // 데이터베이스 연결 실패 시 기본값 반환
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    return `LOT-${productId}-${dateStr}-001`;
  }

  try {
    // 오늘 날짜 기준으로 최근 로트 번호 조회
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `LOT-${productId}-${dateStr}-`;

    const [result] = await db
      .select({ maxLotNumber: sql<string>`MAX(${hBatches.lotNumber})` })
      .from(hBatches)
      .where(sql`${hBatches.lotNumber} LIKE ${prefix + "%"}`);

    if (result?.maxLotNumber) {
      // 기존 로트 번호에서 순번 추출 및 증가
      const lastNumber = parseInt(result.maxLotNumber.split("-").pop() || "0");
      const nextNumber = (lastNumber + 1).toString().padStart(3, "0");
      return `${prefix}${nextNumber}`;
    } else {
      // 첫 번째 로트 번호
      return `${prefix}001`;
    }
  } catch (error) {
    console.error("로트 번호 생성 오류:", error);
    // 오류 발생 시 기본값 반환
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    return `LOT-${productId}-${dateStr}-001`;
  }
}

/**
 * 배치 코드 자동 생성
 */
export async function generateBatchCode(tenantId?: number): Promise<string> {
  const db = await getDb();
  if (!db) {
    // 데이터베이스 연결 실패 시 기본값 반환
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    return `BATCH-${dateStr}-001`;
  }

  try {
    // 오늘 날짜 기준으로 최근 배치 코드 조회
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `BATCH-${dateStr}-`;

    const [result] = await db
      .select({ maxBatchCode: sql<string>`MAX(${hBatches.batchCode})` })
      .from(hBatches)
      .where(sql`${hBatches.batchCode} LIKE ${prefix + "%"}`);

    if (result?.maxBatchCode) {
      // 기존 배치 코드에서 순번 추출 및 증가
      const lastNumber = parseInt(result.maxBatchCode.split("-").pop() || "0");
      const nextNumber = (lastNumber + 1).toString().padStart(3, "0");
      return `${prefix}${nextNumber}`;
    } else {
      // 첫 번째 배치 코드
      return `${prefix}001`;
    }
  } catch (error) {
    console.error("배치 코드 생성 오류:", error);
    // 오류 발생 시 기본값 반환
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    return `BATCH-${dateStr}-001`;
  }
}

/**
 * 생산 통계 조회
 */
export async function getBatchStatistics(params: {
  siteId?: number;
  startDate: string;
  endDate: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [];
  if (tenantId) conditions.push(eq(hProductionLogs.tenantId, tenantId));
  if (params.siteId) {
    conditions.push(eq(hBatches.siteId, params.siteId));
  }
  conditions.push(between(hBatches.plannedDate, params.startDate, params.endDate));

  const [stats] = await db
    .select({
      totalBatches: sql<number>`COUNT(*)`,
      completedBatches: sql<number>`SUM(CASE WHEN ${hBatches.status} = 'completed' THEN 1 ELSE 0 END)`,
      inProgressBatches: sql<number>`SUM(CASE WHEN ${hBatches.status} = 'in_progress' THEN 1 ELSE 0 END)`,
      plannedBatches: sql<number>`SUM(CASE WHEN ${hBatches.status} = 'planned' THEN 1 ELSE 0 END)`,
      totalPlannedQuantity: sql<string>`COALESCE(SUM(${hBatches.plannedQuantity}), 0)`,
      totalActualQuantity: sql<string>`COALESCE(SUM(${hBatches.actualQuantity}), 0)`
    })
    .from(hBatches)
    .where(and(eq(hBatches.tenantId, tenantId), ...conditions));

  return stats;
}
