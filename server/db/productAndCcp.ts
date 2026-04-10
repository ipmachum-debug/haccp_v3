import { eq, and, or, lte, gte, gt, isNull, desc, asc, sql, lt, inArray, type SQL } from "drizzle-orm";
import { getDb, getRawConnection } from "./connection";
import { hCcpDeviations, hCcpInstances, hCcpRows, hProductsV2, hMaterials, hBatchInputs } from "../../drizzle/schema";

import { toKSTDate } from "../utils/timezone";

// ==================== 제품 관리 ====================
export async function getAllProducts(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];

  const { hProductsV2 } = await import("../../drizzle/schema_main.js");
  const { eq, and, desc } = await import("drizzle-orm");
  // h_products_v2 ��일 소스 + 소프트삭제 + 테넌트 격리
  const conditions: SQL[] = [eq(hProductsV2.isActive, 1)];
  if (tenantId) conditions.push(eq(hProductsV2.tenantId, tenantId));
  return await db.select().from(hProductsV2).where(and(...conditions)).orderBy(desc(hProductsV2.id));
}

export async function getProductById(productId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { eq, and } = await import("drizzle-orm");
  // v1 퇴출 완료: h_products_v2 단일 소스 사용
  try {
    const { hProductsV2 } = await import("../../drizzle/schema_main.js");
    const conditions: SQL[] = [eq((hProductsV2 as any).id, productId)];
    if (tenantId) conditions.push(eq((hProductsV2 as any).tenantId, tenantId));
    const result = await db.select().from(hProductsV2 as any).where(and(...conditions)).limit(1);
    if (result.length > 0) return result[0] as any;
  } catch (_e) { /* fallback */ }
  return undefined;
}

// ==================== CCP 템플릿 관리 ====================
export async function getAllCcpTemplates(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];

  const { hCcpTemplates } = await import("../../drizzle/schema.js");
  const { desc, eq } = await import("drizzle-orm");

  if (tenantId) {
    return await db
      .select()
      .from(hCcpTemplates)
      .where(eq(hCcpTemplates.tenantId, tenantId))
      .orderBy(desc(hCcpTemplates.priority), desc(hCcpTemplates.createdAt));
  }
  return await db
    .select()
    .from(hCcpTemplates)
    .orderBy(desc(hCcpTemplates.priority), desc(hCcpTemplates.createdAt));
}

export async function getCcpTemplateById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return null;

  const { hCcpTemplates } = await import("../../drizzle/schema.js");
  const { eq, and } = await import("drizzle-orm");

  const conditions: SQL[] = [eq(hCcpTemplates.id, id)];
  if (tenantId) conditions.push(eq(hCcpTemplates.tenantId, tenantId));

  const results = await db
    .select()
    .from(hCcpTemplates)
    .where(and(...conditions));

  return results[0] || null;
}

export async function createCcpTemplate(data: {
  templateName: string;
  productNamePattern: string;
  ccpType: string;
  description?: string;
  priority?: number;
  isActive?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpTemplates } = await import("../../drizzle/schema.js");

  await db.insert(hCcpTemplates).values({
    templateName: data.templateName,
    productNamePattern: data.productNamePattern,
    ccpType: data.ccpType,
    description: data.description,
    priority: data.priority || 0,
    isActive: data.isActive !== undefined ? data.isActive : 1,
    tenantId: data.tenantId,
  });

  return { success: true };
}

export async function updateCcpTemplate(
  id: number,
  data: {
    templateName?: string;
    productNamePattern?: string;
    ccpType?: string;
    description?: string;
    priority?: number;
    isActive?: number;
  },
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpTemplates } = await import("../../drizzle/schema.js");
  const { eq, and } = await import("drizzle-orm");

  const conditions: SQL[] = [eq(hCcpTemplates.id, id)];
  if (tenantId) conditions.push(eq(hCcpTemplates.tenantId, tenantId));

  await db
    .update(hCcpTemplates)
    .set(data)
    .where(and(...conditions));

  return { success: true };
}

export async function deleteCcpTemplate(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpTemplates } = await import("../../drizzle/schema.js");
  const { eq, and } = await import("drizzle-orm");

  const conditions: SQL[] = [eq(hCcpTemplates.id, id)];
  if (tenantId) conditions.push(eq(hCcpTemplates.tenantId, tenantId));

  await db.delete(hCcpTemplates).where(and(...conditions));

  return { success: true };
}

/**
 * 제품명으로 매칭되는 CCP 템플릿 조회 (우선순위 높은 순)
 */
export async function findMatchingCcpTemplates(productName: string, tenantId?: number) {
  const db = await getDb();
  if (!db) return [];

  const { hCcpTemplates } = await import("../../drizzle/schema.js");
  const { eq, desc, and } = await import("drizzle-orm");

  // 활성화된 템플릿만 조회 (tenantId 격리)
  const conditions: SQL[] = [eq(hCcpTemplates.isActive, 1)];
  if (tenantId) conditions.push(eq(hCcpTemplates.tenantId, tenantId));

  const templates = await db
    .select()
    .from(hCcpTemplates)
    .where(and(...conditions))
    .orderBy(desc(hCcpTemplates.priority));

  // 제품명 패턴 매칭 (간단한 부분 문자열 매칭)
  const matched = templates.filter((template) => {
    if (!template.productNamePattern) return false;
    const pattern = template.productNamePattern.toLowerCase();
    const name = productName.toLowerCase();
    return name.includes(pattern);
  });

  return matched;
}

export async function getRecipeCcpsByRecipeId(recipeId: number) {
  const db = await getDb();
  if (!db) return [];

  const { hRecipeCcp } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  return await db.select().from(hRecipeCcp).where(eq(hRecipeCcp.recipeId, recipeId));
}

// ==================== 레시피 관리 ====================
export async function getRecipeByProductId(productId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const { hRecipeHeaders } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  const result = await db.select().from(hRecipeHeaders).where(eq(hRecipeHeaders.productId, productId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==================== CCP 자동 생성 ====================
export async function generateCcpForBatch(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 배치 정보 조회
  const { getBatchById } = await import("../db.js");
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error("Batch not found");

  // 2. 제품의 레시피 조회
  const recipe = await getRecipeByProductId(batch.productId);
  if (!recipe) {
    throw new Error("No recipe found for this product");
  }

  // 3. 레시피의 CCP 정보 조회
  const recipeCcps = await getRecipeCcpsByRecipeId(recipe.id);
  if (recipeCcps.length === 0) {
    throw new Error("No CCP information found in recipe");
  }

  // 4. 각 CCP 정보에 대해 CCP 인스턴스 생성
  const { hCcpInstances } = await import("../../drizzle/schema.js");
  const createdCcps = [];

  for (const recipeCcp of recipeCcps) {
    // CCP 인스턴스 생성 — workDate는 배치의 planned_date 사용
    const batchPlannedDate = batch.plannedDate
      ? new Date(batch.plannedDate)
      : new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const instanceResult = await db.insert(hCcpInstances).values({
      siteId: batch.siteId,
      workDate: batchPlannedDate,
      batchId,
      productId: batch.productId,
      ccpType: recipeCcp.ccpType,
      status: "draft",
      createdBy: batch.createdBy
    } as any);

    const instanceId = Number(instanceResult[0].insertId);

    createdCcps.push({
      instanceId,
      ccpType: recipeCcp.ccpType,
      // criticalLimitMin, criticalLimitMax, unit 필드는 CCP 템플릿에서 관리
    });
  }

  return createdCcps;
}

// ==================== 제품 생성 (테스트용) ====================
export async function createProduct(data: {
  productCode: string;
  productName: string;
  category?: string;
  unit?: string;
  unitPrice?: string;
  shelfLifeDays?: number;
  description?: string;
  isActive?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hProductsV2 } = await import("../../drizzle/schema_main.js");
  const values: Record<string, unknown> = {
    productCode: data.productCode,
    productName: data.productName,
    category: data.category,
    unit: data.unit || "EA",
    unitPrice: data.unitPrice,
    shelfLifeDays: data.shelfLifeDays,
    description: data.description,
    isActive: data.isActive !== undefined ? data.isActive : 1
  };
  if (data.tenantId) values.tenantId = data.tenantId;
  const result = await db.insert(hProductsV2).values(values);
  return { id: Number(result[0].insertId) };
}

// ==================== 레시피 생성 (테스트용) ====================
export async function createRecipe(data: {
  productId: number;
  recipeCode: string;
  recipeName: string;
  version?: number;
  isActive: number;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hRecipeHeaders } = await import("../../drizzle/schema.js");
  const result = await db.insert(hRecipeHeaders).values({
    ...data,
    version: data.version || 1
  } as any);
  return Number(result[0].insertId);
}

// ==================== 레시피 CCP 추가 (테스트용) ====================
export async function addRecipeCcp(data: {
  recipeId: number;
  ccpType: string;
  stepNumber: number | null;
  criticalLimitMin: string | null;
  criticalLimitMax: string | null;
  unit: string | null;
  monitoringFrequency: string | null;
  correctiveAction: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hRecipeCcp } = await import("../../drizzle/schema.js");
  const result = await db.insert(hRecipeCcp).values(data as any);
  return Number(result[0].insertId);
}

// ==================== CCP 인스턴스 조회 ====================
export async function getCcpInstanceById(instanceId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return null;

  const { hCcpInstances } = await import("../../drizzle/schema.js");
  const { eq, and } = await import("drizzle-orm");

  const conditions = tenantId
    ? and(eq(hCcpInstances.id, instanceId), eq(hCcpInstances.tenantId, tenantId))
    : eq(hCcpInstances.id, instanceId);
  const result = await db.select().from(hCcpInstances).where(conditions);
  return result[0] || null;
}

export async function getCcpInstancesByBatchId(batchId: number, tenantId?: number) {
  const pool = await getRawConnection();

  // 1. 인스턴스 + 공정그룹 정보 조회 (tenant_id 격리)
  // ★ CCP-4P(금속검출)는 하루에 1개의 인스턴스가 첫 번째 배치에만 연결되므로,
  //    같은 날짜의 다른 배치에서도 해당 CCP-4P 인스턴스를 표시해야 함.
  //    → 배치의 planned_date와 같은 work_date의 CCP-4P 인스턴스도 포함
  // CCP-4P는 하루에 1건만 표시 (MIN(id)로 첫 번째 인스턴스만 선택)
  const whereClause = tenantId
    ? `WHERE i.tenant_id = ? AND (
         (i.batch_id = ? AND i.ccp_type != 'CCP-4P')
         OR (i.ccp_type = 'CCP-4P' AND i.work_date = (
           SELECT b.planned_date FROM h_batches b WHERE b.id = ? AND b.tenant_id = ? LIMIT 1
         ) AND i.id = (
           SELECT MIN(i2.id) FROM h_ccp_instances i2
           WHERE i2.ccp_type = 'CCP-4P' AND i2.tenant_id = ?
             AND i2.work_date = (SELECT b2.planned_date FROM h_batches b2 WHERE b2.id = ? AND b2.tenant_id = ? LIMIT 1)
         ))
       )`
    : `WHERE (
         (i.batch_id = ? AND i.ccp_type != 'CCP-4P')
         OR (i.ccp_type = 'CCP-4P' AND i.work_date = (
           SELECT b.planned_date FROM h_batches b WHERE b.id = ? LIMIT 1
         ) AND i.id = (
           SELECT MIN(i2.id) FROM h_ccp_instances i2
           WHERE i2.ccp_type = 'CCP-4P'
             AND i2.work_date = (SELECT b2.planned_date FROM h_batches b2 WHERE b2.id = ? LIMIT 1)
         ))
       )`;
  const params = tenantId
    ? [tenantId, batchId, batchId, tenantId, tenantId, batchId, tenantId]
    : [batchId, batchId, batchId];

  const [instances] = await pool.execute<Record<string, unknown>[]>(
    `SELECT
       i.id, i.site_id AS siteId, i.work_date AS workDate,
       i.ccp_type AS ccpType, i.product_name AS productName,
       i.product_id AS productId, i.batch_id AS batchId,
       i.status, i.created_at AS createdAt, i.created_by AS createdBy,
       i.process_group_id AS processGroupId,
       pg.name AS processGroupName,
       pg.temperature_min AS tempMin, pg.temperature_max AS tempMax,
       pg.time_min AS timeMin, pg.time_max AS timeMax,
       pg.pressure_min AS pressureMin, pg.pressure_max AS pressureMax
     FROM h_ccp_instances i
     LEFT JOIN ccp_process_groups pg ON pg.id = i.process_group_id
     ${whereClause}
     ORDER BY i.id`,
    params
  );

  // 2. 각 인스턴스의 행(row) + 설비 정보 조회
  const instanceIds = (instances as Record<string, unknown>[]).map((r) => r.id as number);
  let rowsMap: Record<number, Record<string, unknown>[]> = {};

  if (instanceIds.length > 0) {
    const placeholders = instanceIds.map(() => "?").join(",");
    const rowParams = tenantId ? [...instanceIds, tenantId] : instanceIds;
    const [rows] = await pool.execute<Record<string, unknown>[]>(
      `SELECT
         r.id, r.instance_id AS instanceId, r.sort_order AS sortOrder,
         r.row_type AS rowType, r.measured_at AS measuredAt,
         r.temp_c AS tempC, r.duration_min AS durationMin,
         r.heating_min AS heatingMin, r.cycle_total_min AS cycleTotalMin,
         r.pressure_bar AS pressureBar, r.result, r.note,
         r.auto_generated AS autoGenerated,
         r.equipment_id AS equipmentId, r.equipment_name AS equipmentName,
         r.batch_no AS batchNo,
         r.tenant_id AS tenantId, r.created_at AS createdAt
       FROM h_ccp_rows r
       WHERE r.instance_id IN (${placeholders})${tenantId ? ' AND r.tenant_id = ?' : ''}
       ORDER BY r.instance_id, r.sort_order`,
      rowParams
    );
    for (const row of (rows as Record<string, unknown>[])) {
      const iid = row.instanceId as number;
      if (!rowsMap[iid]) rowsMap[iid] = [];
      rowsMap[iid].push(row);
    }
  }

  return (instances as Record<string, unknown>[]).map((inst) => ({
    ...inst,
    rows: rowsMap[inst.id as number] ?? [],
  }));
}

/**
 * CCP 점검 행 생성
 */
export async function createCcpRow(data: {
  instanceId: number;
  sortOrder?: number;
  rowType?: "measurement" | "corrective_action" | "verification";
  measuredAt?: Date;
  tempC?: string;
  durationMin?: number;
  pressureBar?: string;
  result?: "PASS" | "FAIL" | "N/A";
  note?: string;
  autoGenerated?: number;
  equipmentId?: number;
  equipmentName?: string;
  heatingMin?: number;
  cycleTotalMin?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpRows } = await import("../../drizzle/schema.js");
  const result = await db.insert(hCcpRows).values(data as any);
  return result;
}

/**
 * CCP 점검 행 업데이트 (인라인 편집용)
 */
export async function updateCcpRow(rowId: number, data: {
  tempC?: string;
  durationMin?: number;
  pressureBar?: string;
  result?: "PASS" | "FAIL" | "N/A";
  note?: string;
  measuredAt?: Date;
  heatingMin?: number;
  cycleTotalMin?: number;
}) {
  const conn = await getRawConnection();
  const sets: string[] = [];
  const vals: (string | number | Date | undefined)[] = [];
  if (data.tempC !== undefined)        { sets.push("temp_c = ?");          vals.push(data.tempC); }
  if (data.durationMin !== undefined)  { sets.push("duration_min = ?");    vals.push(data.durationMin); }
  if (data.pressureBar !== undefined)  { sets.push("pressure_bar = ?");    vals.push(data.pressureBar); }
  if (data.result !== undefined)       { sets.push("result = ?");          vals.push(data.result); }
  if (data.note !== undefined)         { sets.push("note = ?");            vals.push(data.note); }
  if (data.measuredAt !== undefined)   { sets.push("measured_at = ?");     vals.push(data.measuredAt); }
  if (data.heatingMin !== undefined)   { sets.push("heating_min = ?");     vals.push(data.heatingMin); }
  if (data.cycleTotalMin !== undefined){ sets.push("cycle_total_min = ?"); vals.push(data.cycleTotalMin); }
  if (sets.length === 0) return { success: true };
  vals.push(rowId);
  await conn.execute(`UPDATE h_ccp_rows SET ${sets.join(", ")} WHERE id = ?`, vals);
  return { success: true };
}

/**
 * CCP 인스턴스의 점검 행 조회
 */
export async function getCcpRowsByInstanceId(instanceId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpRows } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  return await db.select().from(hCcpRows).where(eq(hCcpRows.instanceId, instanceId)).orderBy(hCcpRows.sortOrder);
}

/**
 * CCP 인스턴스 상태 업데이트
 */
export async function updateCcpInstanceStatus(instanceId: number, status: "draft" | "submitted" | "approved" | "rejected", userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpInstances } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  const updateData: Record<string, unknown> = { status };

  if (status === "submitted") {
    updateData.submittedAt = new Date();
    if (userId) updateData.submittedBy = userId;
  } else if (status === "approved") {
    updateData.approvedAt = new Date();
    if (userId) updateData.approvedBy = userId;
  }

  await db.update(hCcpInstances).set(updateData).where(eq(hCcpInstances.id, instanceId));
}

export async function getAllCcpRecords(filters?: {
  ccpType?: string;
  status?: "draft" | "submitted" | "approved" | "rejected";
  startDate?: Date;
  endDate?: Date;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpInstances, hBatches, hProductsV2 } = await import("../../drizzle/schema_main");
  const { eq, and, gte, lte, sql } = await import("drizzle-orm");

  let conditions = [];

  // ★ 테넌트 격리: tenantId 필터 필수 적용
  if (filters?.tenantId) {
    conditions.push(eq(hCcpInstances.tenantId, filters.tenantId));
  }

  if (filters?.ccpType) {
    conditions.push(eq(hCcpInstances.ccpType, filters.ccpType));
  }

  if (filters?.status) {
    conditions.push(sql`${hCcpInstances.status} = ${filters.status}`);
  }

  if (filters?.startDate) {
    conditions.push(gte(hCcpInstances.createdAt, filters.startDate));
  }

  if (filters?.endDate) {
    conditions.push(lte(hCcpInstances.createdAt, filters.endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const records = await db
    .select({
      id: hCcpInstances.id,
      batchId: hCcpInstances.batchId,
      ccpType: hCcpInstances.ccpType,
      productName: hCcpInstances.productName,
      status: hCcpInstances.status,
      workDate: hCcpInstances.workDate,
      createdAt: hCcpInstances.createdAt,
      batchCode: hBatches.batchCode
    })
    .from(hCcpInstances)
    .leftJoin(hBatches, eq(hCcpInstances.batchId, hBatches.id))
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(whereClause)
    .orderBy(sql`${hCcpInstances.workDate} DESC, ${hCcpInstances.id} DESC`);

  return records;
}

// CCP 일괄 삭제
export async function deleteCcpInstances(instanceIds: number[], tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpInstances, hCcpRows } = await import("../../drizzle/schema");
  const { inArray, and, eq } = await import("drizzle-orm");

  // 테넌트 격리 조건 추가
  const instanceCondition = tenantId
    ? and(inArray(hCcpInstances.id, instanceIds), eq(hCcpInstances.tenantId, tenantId))
    : inArray(hCcpInstances.id, instanceIds);

  const rowCondition = tenantId
    ? and(inArray(hCcpRows.instanceId, instanceIds), eq(hCcpRows.tenantId, tenantId))
    : inArray(hCcpRows.instanceId, instanceIds);

  // 1. CCP 점검 행 삭제
  await db.delete(hCcpRows).where(rowCondition);

  // 2. CCP 인스턴스 삭제
  await db.delete(hCcpInstances).where(instanceCondition);

  return {
    deletedCount: instanceIds.length
  };
}

// CCP 이탈 건수 조회
export async function getCcpDeviationCount(instanceId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpRows } = await import("../../drizzle/schema");
  const { eq, and, sql } = await import("drizzle-orm");

  const result = await db
    .select({
      count: sql<number>`COUNT(*)`
    })
    .from(hCcpRows)
    .where(
      and(
        eq(hCcpRows.instanceId, instanceId),
        eq(hCcpRows.result, "FAIL") // 이탈 (FAIL)
      )
    );

  return result[0]?.count || 0;
}

// ============================================================================
// CCP 인스턴스 생성 (배치 자동 생성용)
// ============================================================================

/**
 * CCP 인스턴스 생성
 */
export async function createCcpInstance(data: {
  siteId: number;
  workDate: string | Date;
  ccpType: string;
  productName?: string;
  productId?: number;
  batchId?: number;
  status?: "draft" | "submitted" | "approved" | "rejected";
  createdBy?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpInstances } = await import("../../drizzle/schema.js");
  const values: Record<string, unknown> = { ...data };
  if (data.tenantId) values.tenantId = data.tenantId;
  const result = await db.insert(hCcpInstances).values(values);
  return Number(result[0].insertId);
}

// ============================================================================
// CCP 템플릿 관리


// 제품 업데이트
export async function updateProduct(
  id: number,
  data: {
    productName?: string;
    productCode?: string;
    category?: string;
    unit?: string;
    shelfLifeDays?: number;
    description?: string;
    isActive?: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hProductsV2 } = await import("../../drizzle/schema_main.js");

  await db
    .update(hProductsV2)
    .set(data)
    .where(eq(hProductsV2.id, id));

  return { success: true };
}

// 제품 삭제 (소프트 삭제)
export async function deleteProduct(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hProductsV2 } = await import("../../drizzle/schema_main.js");
  const { and } = await import("drizzle-orm");

  const conditions: SQL[] = [eq(hProductsV2.id, id)];
  if (tenantId) conditions.push(eq(hProductsV2.tenantId, tenantId));
  await db
    .update(hProductsV2)
    .set({ isActive: 0 })
    .where(and(...conditions));

  return { success: true };
}


// 원재료 업데이트
export async function updateMaterial(
  id: number,
  data: {
    materialName?: string;
    materialCode?: string;
    category?: string;
    categoryId?: number; // 카테고리 ID
    unit?: string;
    safetyStock?: number;
    isActive?: number;
    tenantId?: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hMaterials } = await import("../../drizzle/schema.js");

  const updateData: Record<string, unknown> = {};
  if (data.materialName) updateData.materialName = data.materialName;
  if (data.materialCode) updateData.materialCode = data.materialCode;
  if (data.category) updateData.category = data.category;
  if (data.categoryId !== undefined) updateData.categoryId = data.categoryId; // 카테고리 ID
  if (data.unit) updateData.unit = data.unit;
  if (data.safetyStock !== undefined) updateData.safetyStockLevel = data.safetyStock.toString();
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  await db
    .update(hMaterials)
    .set(updateData)
    .where(eq(hMaterials.id, id));

  return { success: true };
}

// 원재료 삭제 (소프트 삭제)
export async function deleteMaterial(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hMaterials } = await import("../../drizzle/schema.js");
  const { and } = await import("drizzle-orm");

  const conditions: SQL[] = [eq(hMaterials.id, id)];
  if (tenantId) conditions.push(eq(hMaterials.tenantId, tenantId));
  await db
    .update(hMaterials)
    .set({ isActive: 0 })
    .where(and(...conditions));

  return { success: true };
}

// ============================================================================
// CCP 이탈 관리
// ============================================================================

export async function createCcpDeviation(data: {
  ccpInstanceId: number;
  ccpRowId?: number;
  batchId: number;
  deviationType: string;
  criticalLimit: string;
  actualValue: string;
  deviationDate: Date;
  severity: "low" | "medium" | "high" | "critical";
  createdBy: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db.insert(hCcpDeviations).values({
    ccpInstanceId: data.ccpInstanceId,
    ccpRowId: data.ccpRowId,
    batchId: data.batchId,
    deviationType: data.deviationType,
    criticalLimit: data.criticalLimit,
    actualValue: data.actualValue,
    deviationDate: data.deviationDate,
    severity: data.severity,
    createdBy: data.createdBy,
    notes: data.notes
  } as any);
  return result;
}

export async function getCcpDeviationTrend(days: number = 7) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const deviations = await db
    .select({
      date: sql<string>`DATE(${hCcpDeviations.deviationDate})`.as('date'),
      count: sql<number>`COUNT(*)`.as('count')
    })
    .from(hCcpDeviations)
    .where(gte(hCcpDeviations.deviationDate, startDate))
    .groupBy(sql`DATE(${hCcpDeviations.deviationDate})`)
    .orderBy(sql`DATE(${hCcpDeviations.deviationDate})`);

  return deviations.map((d) => ({
    date: toKSTDate(new Date(d.date)),
    count: Number(d.count)
  }));
}

export async function getUnresolvedCcpDeviations() {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(hCcpDeviations)
    .where(isNull(hCcpDeviations.resolvedAt))
    .orderBy(desc(hCcpDeviations.deviationDate))
    .limit(10);
}

export async function getMonthlyCcpDeviationRate(days: number = 30) {
  const db = await getDb();
  if (!db) return { total: 0, deviations: 0, rate: 0 };

  const { hCcpDeviations } = await import("../../drizzle/schema.js");
  const { gte, sql } = await import("drizzle-orm");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const deviations = await db
    .select({
      count: sql<number>`COUNT(*)`
    })
    .from(hCcpDeviations)
    .where(gte(hCcpDeviations.createdAt, startDate));

  const deviationCount = Number(deviations[0]?.count || 0);

  // CCP 점검 총 횟수는 임시로 100으로 가정 (실제로는 hCcpInstances 또는 hCcpRecords에서 조회)
  const totalInspections = 100;
  const rate = totalInspections > 0 ? (deviationCount / totalInspections) * 100 : 0;

  return {
    total: totalInspections,
    deviations: deviationCount,
    rate: parseFloat(rate.toFixed(2))
  };
}

// ============================================================================
// CCP 이탈 통계 조회 함수
// ============================================================================

/**
 * 월별 CCP 이탈 통계 조회
 */
export async function getCcpDeviationStatsByMonth(filters?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpDeviations } = await import("../../drizzle/schema.js");
  const { and, gte, lte, sql } = await import("drizzle-orm");

  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(hCcpDeviations.deviationDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hCcpDeviations.deviationDate, filters.endDate));
  }

  const stats = await db
    .select({
      month: sql<string>`DATE_FORMAT(${hCcpDeviations.deviationDate}, '%Y-%m')`,
      totalCount: sql<number>`COUNT(*)`,
      highSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'high' THEN 1 ELSE 0 END)`,
      mediumSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'medium' THEN 1 ELSE 0 END)`,
      lowSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'low' THEN 1 ELSE 0 END)`
    })
    .from(hCcpDeviations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(sql`DATE_FORMAT(${hCcpDeviations.deviationDate}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${hCcpDeviations.deviationDate}, '%Y-%m')`);

  return stats;
}

/**
 * 제품별 CCP 이탈 통계 조회
 */
export async function getCcpDeviationStatsByProduct(filters?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpDeviations, hCcpInstances, hProductsV2 } = await import("../../drizzle/schema.js");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");

  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(hCcpDeviations.deviationDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hCcpDeviations.deviationDate, filters.endDate));
  }

  const stats = await db
    .select({
      productId: hCcpInstances.productId,
      productName: hCcpInstances.productName,
      totalCount: sql<number>`COUNT(*)`,
      highSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'high' THEN 1 ELSE 0 END)`,
      mediumSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'medium' THEN 1 ELSE 0 END)`,
      lowSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'low' THEN 1 ELSE 0 END)`
    })
    .from(hCcpDeviations)
    .leftJoin(hCcpInstances, eq(hCcpDeviations.ccpInstanceId, hCcpInstances.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(hCcpInstances.productId, hCcpInstances.productName)
    .orderBy(sql`COUNT(*) DESC`);

  return stats;
}

/**
 * CCP 유형별 이탈 통계 조회
 */
export async function getCcpDeviationStatsByCcpType(filters?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpDeviations, hCcpInstances } = await import("../../drizzle/schema.js");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");

  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(hCcpDeviations.deviationDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hCcpDeviations.deviationDate, filters.endDate));
  }

  const stats = await db
    .select({
      ccpType: hCcpInstances.ccpType,
      totalCount: sql<number>`COUNT(*)`,
      highSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'high' THEN 1 ELSE 0 END)`,
      mediumSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'medium' THEN 1 ELSE 0 END)`,
      lowSeverityCount: sql<number>`SUM(CASE WHEN ${hCcpDeviations.severity} = 'low' THEN 1 ELSE 0 END)`
    })
    .from(hCcpDeviations)
    .leftJoin(hCcpInstances, eq(hCcpDeviations.ccpInstanceId, hCcpInstances.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(hCcpInstances.ccpType)
    .orderBy(sql`COUNT(*) DESC`);

  return stats;
}
