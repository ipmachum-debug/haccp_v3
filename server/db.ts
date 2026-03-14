import { eq, and, or, lte, gte, gt, isNull, desc, asc, sql, lt, inArray, aliasedTable } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, users, hInventoryLots, hInventory, hInventoryTransactions, hMaterials, hNotifications, materialInspectionRecords, materialInspectionItems, shippingInspectionRecords, shippingInspectionItems, hygieneInspectionRecords, hygieneInspectionItems, hSuppliers, hApprovalRequests, hApprovalHistory, hSupplierEvaluations, hNotificationSettings, hCcpDeviations, hCcpInstances, hCcpRows, hBatchInputs, hBatches, hCcpRecords, hProducts, hProductsV2, hGenericChecklistRecords } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _rawConnection: mysql.Pool | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb(): Promise<ReturnType<typeof drizzle>> {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const dbUrl = process.env.DATABASE_URL;
      console.log('[Database] Connecting to:', dbUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // 비밀번호 숨김
      
      const url = new URL(process.env.DATABASE_URL);
      const connection = mysql.createPool({
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: url.username,
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1),
        charset: 'utf8mb4',
        connectionLimit: 10,
        connectTimeout: 30000,
        // acquireTimeout removed (mysql2 deprecation)
        waitForConnections: true,
        queueLimit: 0
      });
      
      // 각 연결마다 character set 강제 설정
      connection.on('connection', (conn: any) => {
        conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci', (err: any) => {
          if (err) console.error('[Database] Failed to set charset:', err);
        });
      });
      
      _db = drizzle(connection) as any;
      console.log('[Database] Connection established successfully');
    } catch (error) {
      console.error("[Database] Failed to connect:", error);
      throw new Error("Database connection failed");
    }
  }
  if (!_db) {
    throw new Error("Database not initialized");
  }
  return _db;
}

// Get raw MySQL2 connection for parameterized queries
export async function getRawConnection(): Promise<mysql.Pool> {
  if (!_rawConnection && process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      _rawConnection = mysql.createPool({
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: url.username,
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1),
        charset: 'utf8mb4'
      });
      
      // 각 연결마다 character set 강제 설정
      _rawConnection.on('connection', (conn: any) => {
        conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci', (err: any) => {
          if (err) console.error('[Database] Failed to set charset on raw connection:', err);
        });
      });
      
      console.log('[Database] Raw connection pool created');
    } catch (error) {
      console.error("[Database] Failed to create raw connection:", error);
      throw new Error("Raw connection creation failed");
    }
  }
  if (!_rawConnection) {
    throw new Error("Raw connection not initialized");
  }
  return _rawConnection;
}

// ============================================================================
// 사용자 관리 (User Management)
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.email) {
    throw new Error("User email is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: any = {
      email: user.email,
      passwordHash: user.passwordHash || "",
      name: user.name || null
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastLoginAt !== undefined) {
      values.lastLoginAt = user.lastLoginAt;
      updateSet.lastLoginAt = user.lastLoginAt;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }
    if (user.siteId !== undefined) {
      values.siteId = user.siteId;
      updateSet.siteId = user.siteId;
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastLoginAt = new Date();
    }

    await db.insert(users).values(values as any).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUsersByRole(role: "admin" | "worker" | "inspector" | "user" | "audit") {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get users: database not available");
    return [];
  }

  const result = await db.select().from(users).where(eq(users.role, role as any));

  return result;
}

// ============================================================================
// 배치 관리 (Batch Management)
// ============================================================================

// 배치 관련 함수는 필요할 때 추가

// ============================================================================
// CCP 관리 (Critical Control Point)
// ============================================================================

// CCP 관련 함수는 필요할 때 추가

// ============================================================================
// 원재료 투입 (Material Input)
// ============================================================================

// 원재료 투입 관련 함수는 필요할 때 추가

// ============================================================================
// 승인 워크플로우 (Approval Workflow)
// ============================================================================

// 승인 관련 함수는 필요할 때 추가

export async function createUser(user: {
  email: string;
  passwordHash: string;
  name?: string;
  role?: "user" | "admin" | "super_admin";
  siteId?: number;
  isActive?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(users).values(user as any);
}

export async function updateUserLastLogin(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId));
}

// ============================================================================
// 배치 관리 (Batch Management)
// ============================================================================

export async function createBatch(batch: {
  siteId: number;
  productId: number;
  batchCode: string;
  dayBatchGroup?: string;
  batchOrder?: number;
  plannedQuantity: string;
  plannedDate: Date;
  status?: string;
  mode?: string;
  batchStartTime?: string; // "HH:mm" format
  createdBy: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hBatches, hBatchInputs } = await import("../drizzle/schema");
  const { hMfReports, hMfReportVersions, hMfIngredients } = await import("../drizzle/schema_recipe_new");
  
  const [result] = await db.insert(hBatches).values({
    tenantId: batch.tenantId,
    siteId: batch.siteId,
    productId: batch.productId,
    batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
    plannedQuantity: batch.plannedQuantity,
    plannedDate: batch.plannedDate,
    startTime: batch.batchStartTime ? new Date(`${batch.plannedDate.toISOString().split("T")[0]}T${batch.batchStartTime}:00`) : null,
    status: batch.status || "planned",
    mode: (batch.mode || "auto") as any,
    createdBy: batch.createdBy
  } as any);
  
  const batchId = Number(result.insertId);
  const tenantId = batch.tenantId;
  const plannedQty = parseFloat(batch.plannedQuantity);
  
  // === 원재료 투입 자동생성 (품목제조보고 배합비 기반) ===
  try {
    // 1. 제품의 품목제조보고 조회
    const mfReport = await db
      .select({ id: hMfReports.id })
      .from(hMfReports)
      .where(and(
        eq(hMfReports.productId, batch.productId),
        eq(hMfReports.tenantId, tenantId)
      ))
      .limit(1);
    
    if (mfReport.length > 0) {
      // 2. 최신 승인된 버전 조회 (APPROVED 우선, 없으면 최신 DRAFT fallback)
      let latestVersion = await db
        .select({ id: hMfReportVersions.id })
        .from(hMfReportVersions)
        .where(and(
          eq(hMfReportVersions.mfReportId, mfReport[0].id),
          eq(hMfReportVersions.approvalStatus, "APPROVED")
        ))
        .orderBy(desc(hMfReportVersions.versionNo))
        .limit(1);
      
      // APPROVED 없으면 최신 버전 fallback
      if (latestVersion.length === 0) {
        latestVersion = await db
          .select({ id: hMfReportVersions.id })
          .from(hMfReportVersions)
          .where(eq(hMfReportVersions.mfReportId, mfReport[0].id))
          .orderBy(desc(hMfReportVersions.versionNo))
          .limit(1);
        if (latestVersion.length > 0) {
          console.log("[createBatch] APPROVED 버전 없음, 최신 버전 fallback 사용");
        }
      }
      
      if (latestVersion.length > 0) {
        // 3. 배합비(원재료 함량) 조회
        // item_master.base_unit으로 실제 단위(kg/g) 조회
        // h_mf_ingredients.material_id → item_master.id (직접 참조)
        const { itemMaster } = await import("../drizzle/schema/schema_dual_unit");
        const ingredientsRaw = await db
          .select({
            materialId: hMfIngredients.materialId,
            quantity: hMfIngredients.quantity,
            correctedQuantity: hMfIngredients.correctedQuantity,
            isDeductible: hMfIngredients.isDeductible,
            unit: hMfIngredients.unit,         // BOM 단위 (%)
            processGroupId: hMfIngredients.processGroupId,
            materialUnit: itemMaster.baseUnit,  // item_master.base_unit (kg 등)
          })
          .from(hMfIngredients)
          .leftJoin(itemMaster, eq(hMfIngredients.materialId, itemMaster.id))
          .where(eq(hMfIngredients.mfReportVersionId, latestVersion[0].id))
          .orderBy(hMfIngredients.lineNo);
        const ingredients = ingredientsRaw;
        
        // 4. 배합비 x 생산량으로 원재료 투입 계획 생성 (보정 배합비 기준, 정제수 제외)
        if (ingredients.length > 0) {
          const batchInputs = ingredients
            .filter((ing: any) => ing.materialId !== null && ing.materialId !== 191 && ing.isDeductible !== 0)
            .map((ing: any) => {
              // 보정 배합비 사용 (없으면 법적 배합비 fallback)
              const ratio = ing.correctedQuantity 
                ? parseFloat(ing.correctedQuantity) 
                : parseFloat(ing.quantity);
              return {
                batchId,
                materialId: ing.materialId!,
                plannedQuantity: ((ratio / 100) * plannedQty).toFixed(3),
                unit: ing.materialUnit || "kg",  // 원재료 실제 단위 사용 (% 아닌 kg/g)
                processGroupId: ing.processGroupId ?? null,
                tenantId
              };
            });
          
          if (batchInputs.length > 0) {
            await db.insert(hBatchInputs).values(batchInputs as any);
            console.log("[createBatch] 원재료 투입 자동생성:", batchInputs.length, "건");
          }
        }
      }
    }
  } catch (error) {
    console.error("[createBatch] 원재료 투입 자동생성 실패 (배치 생성은 유지):", error);
  }
  
  return batchId;
}

export async function getBatchById(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hBatches, hProductsV2 } = await import("../drizzle/schema");
  
  const result = await db
    .select({
      id: hBatches.id,
      tenantId: hBatches.tenantId,
      siteId: hBatches.siteId,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      recipeId: hBatches.recipeId,
      plannedQuantity: hBatches.plannedQuantity,
      actualQuantity: hBatches.actualQuantity,
      plannedDate: hBatches.plannedDate,
      startTime: hBatches.startTime,
      endTime: hBatches.endTime,
      status: hBatches.status,
      mode: hBatches.mode,
      manualStartTime: hBatches.manualStartTime,
      manualEndTime: hBatches.manualEndTime,
      lotNumber: hBatches.lotNumber,
      expiryDate: hBatches.expiryDate,
      revenue: hBatches.revenue,
      plannedCost: hBatches.plannedCost,
      actualCost: hBatches.actualCost,
      costFinalizedAt: hBatches.costFinalizedAt,
      notes: hBatches.notes,
      completionIdempotencyKey: hBatches.completionIdempotencyKey,
      completedAt: hBatches.completedAt,
      completionReportUrl: hBatches.completionReportUrl,
      createdBy: hBatches.createdBy,
      createdAt: hBatches.createdAt,
      updatedAt: hBatches.updatedAt,
      productName: hProductsV2.productName,
      productCode: hProductsV2.productCode,
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(eq(hBatches.id, batchId))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllBatches(filters?: {
  siteId?: number;
  status?: string;
  productId?: number;
  tenantId: number;
  page?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, limit: 50 };

  const { hBatches } = await import("../drizzle/schema");
  const { count } = await import("drizzle-orm");
  
  // 페이지네이션 기본값
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const offset = (page - 1) * limit;

  // 필터 조건 생성
  const conditions = [];
  if (filters?.tenantId) {
    conditions.push(eq(hBatches.tenantId, filters.tenantId));
  }
  if (filters?.siteId) {
    conditions.push(eq(hBatches.siteId, filters.siteId));
  }
  if (filters?.status) {
    conditions.push(sql`${hBatches.status} = ${filters.status}`);
  }
  if (filters?.productId) {
    conditions.push(eq(hBatches.productId, filters.productId));
  }

  // 전체 개수 조회
  const totalQuery = conditions.length > 0
    ? db.select({ count: count() }).from(hBatches).where(and(...conditions))
    : db.select({ count: count() }).from(hBatches);
  const totalResult = await totalQuery;
  const total = totalResult[0]?.count || 0;

  // 데이터 조회 (최신순 정렬)
  let query = db.select().from(hBatches);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  query = query.orderBy(desc(hBatches.createdAt)) as any;
  query = query.limit(limit).offset(offset) as any;

  const results = await query;
  
  return {
    items: results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

export async function updateBatch(
  batchId: number,
  data: {
    batchNumber?: string;
    plannedQuantity?: number;
    plannedStartDate?: Date;
    plannedEndDate?: Date;
    status?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hBatches } = await import("../drizzle/schema");
  
  const updateData: any = {};
  if (data.batchNumber !== undefined) updateData.batchNumber = data.batchNumber;
  if (data.plannedQuantity !== undefined) updateData.plannedQuantity = data.plannedQuantity;
  if (data.plannedStartDate !== undefined) updateData.plannedStartDate = data.plannedStartDate;
  if (data.plannedEndDate !== undefined) updateData.plannedEndDate = data.plannedEndDate;
  if (data.status !== undefined) updateData.status = data.status;
  
  await db
    .update(hBatches)
    .set(updateData)
    .where(eq(hBatches.id, batchId));
}

export async function updateBatchSchedule(
  batchId: number,
  data: {
    plannedDate?: Date;
    startTime?: Date;
    endTime?: Date;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hBatches } = await import("../drizzle/schema");
  
  const updateData: any = {};
  if (data.plannedDate !== undefined) updateData.plannedDate = data.plannedDate;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  
  await db
    .update(hBatches)
    .set(updateData)
    .where(eq(hBatches.id, batchId));
}

export async function updateBatchStatus(batchId: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hBatches } = await import("../drizzle/schema");
  
  await db
    .update(hBatches)
    .set({ status } as any)
    .where(eq(hBatches.id, batchId));
}

export async function deleteBatch(batchId: number, tenantId?: number) {
  const pool = await getRawConnection();
  
  // 관련 데이터 cascade 삭제 (CCP 행 → CCP 인스턴스 → 배치)
  // P0: tenant_id 필터 추가 - 테넌트 격리
  if (tenantId) {
    await pool.execute(`DELETE r FROM h_ccp_rows r
      INNER JOIN h_ccp_instances i ON r.instance_id = i.id
      WHERE i.batch_id = ? AND i.tenant_id = ?`, [batchId, tenantId]);
    await pool.execute(`DELETE FROM h_ccp_instances WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
    await pool.execute(`DELETE FROM h_batch_inputs WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
    await pool.execute(`DELETE FROM h_batch_schedules WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
  } else {
    await pool.execute(`DELETE r FROM h_ccp_rows r
      INNER JOIN h_ccp_instances i ON r.instance_id = i.id
      WHERE i.batch_id = ?`, [batchId]);
    await pool.execute(`DELETE FROM h_ccp_instances WHERE batch_id = ?`, [batchId]);
    await pool.execute(`DELETE FROM h_batch_inputs WHERE batch_id = ?`, [batchId]);
    await pool.execute(`DELETE FROM h_batch_schedules WHERE batch_id = ?`, [batchId]);
  }
  
  // 배치 자체 삭제 (테넌트 격리 적용) - h_batches AND batches (dual table sync)
  if (tenantId) {
    await pool.execute(`DELETE FROM h_batches WHERE id = ? AND tenant_id = ?`, [batchId, tenantId]);
    await pool.execute(`DELETE FROM batches WHERE id = ? AND tenant_id = ?`, [batchId, tenantId]);
  } else {
    await pool.execute(`DELETE FROM h_batches WHERE id = ?`, [batchId]);
    await pool.execute(`DELETE FROM batches WHERE id = ?`, [batchId]);
  }
  // CCP 모니터링 기록지 삭제
  try {
    if (tenantId) {
      await pool.execute(`DELETE rows FROM h_ccp_form_rows rows JOIN h_ccp_form_records rec ON rows.form_record_id = rec.id WHERE rec.batch_id = ? AND rec.tenant_id = ?`, [batchId, tenantId]);
      await pool.execute(`DELETE FROM h_ccp_form_records WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
    } else {
      await pool.execute(`DELETE rows FROM h_ccp_form_rows rows JOIN h_ccp_form_records rec ON rows.form_record_id = rec.id WHERE rec.batch_id = ?`, [batchId]);
      await pool.execute(`DELETE FROM h_ccp_form_records WHERE batch_id = ?`, [batchId]);
    }
  } catch (_e) { /* ignore if table not exists */ }
  // 승인 요청 삭제
  if (tenantId) {
    await pool.execute(`DELETE FROM h_approval_requests WHERE reference_type = 'batch' AND reference_id = ? AND tenant_id = ?`, [batchId, tenantId]);
  } else {
    await pool.execute(`DELETE FROM h_approval_requests WHERE reference_type = 'batch' AND reference_id = ?`, [batchId]);
  }
}

// ==================== 제품 관리 ====================
export async function getAllProducts(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { hProducts } = await import("../drizzle/schema.js");
  const { eq, and, desc } = await import("drizzle-orm");
  // ✅ P0 FIX: 소프트삭제 + 테넌트 격리
  const conditions: any[] = [eq(hProducts.isActive, 1)];
  if (tenantId) conditions.push(eq(hProducts.tenantId, tenantId));
  return await db.select().from(hProducts).where(and(...conditions)).orderBy(desc(hProducts.id));
}

export async function getProductById(productId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { eq } = await import("drizzle-orm");
  // Try h_products_v2 first (actual production data)
  try {
    const { hProductsV2 } = await import("../drizzle/schema_main.js");
    const v2result = await db.select().from(hProductsV2 as any).where(eq((hProductsV2 as any).id, productId)).limit(1);
    if (v2result.length > 0) return v2result[0] as any;
  } catch (_e) { /* fallback */ }
  // Fallback to h_products
  const { hProducts } = await import("../drizzle/schema.js");
  const result = await db.select().from(hProducts).where(eq(hProducts.id, productId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==================== CCP 템플릿 관리 ====================
export async function getAllCcpTemplates(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { hCcpTemplates } = await import("../drizzle/schema.js");
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

export async function getCcpTemplateById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const { hCcpTemplates } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  const results = await db
    .select()
    .from(hCcpTemplates)
    .where(eq(hCcpTemplates.id, id));

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
  if (!db) throw new Error("Database not available");

  const { hCcpTemplates } = await import("../drizzle/schema.js");

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
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hCcpTemplates } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  await db
    .update(hCcpTemplates)
    .set(data)
    .where(eq(hCcpTemplates.id, id));

  return { success: true };
}

export async function deleteCcpTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hCcpTemplates } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  await db.delete(hCcpTemplates).where(eq(hCcpTemplates.id, id));

  return { success: true };
}

/**
 * 제품명으로 매칭되는 CCP 템플릿 조회 (우선순위 높은 순)
 */
export async function findMatchingCcpTemplates(productName: string) {
  const db = await getDb();
  if (!db) return [];

  const { hCcpTemplates } = await import("../drizzle/schema.js");
  const { eq, desc } = await import("drizzle-orm");

  // 활성화된 템플릿만 조회
  const templates = await db
    .select()
    .from(hCcpTemplates)
    .where(eq(hCcpTemplates.isActive, 1))
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
  
  const { hRecipeCcp } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  return await db.select().from(hRecipeCcp).where(eq(hRecipeCcp.recipeId, recipeId));
}

// ==================== 레시피 관리 ====================
export async function getRecipeByProductId(productId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const { hRecipeHeaders } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const result = await db.select().from(hRecipeHeaders).where(eq(hRecipeHeaders.productId, productId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==================== CCP 자동 생성 ====================
export async function generateCcpForBatch(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 배치 정보 조회
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
  const { hCcpInstances } = await import("../drizzle/schema.js");
  const createdCcps = [];
  
  for (const recipeCcp of recipeCcps) {
    // CCP 인스턴스 생성
    const instanceResult = await db.insert(hCcpInstances).values({
      siteId: batch.siteId,
      workDate: new Date(),
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
  if (!db) throw new Error("Database not available");
  
  const { hProducts } = await import("../drizzle/schema.js");
  const values: any = {
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
  const result = await db.insert(hProducts).values(values);
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
  if (!db) throw new Error("Database not available");
  
  const { hRecipeHeaders } = await import("../drizzle/schema.js");
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
  if (!db) throw new Error("Database not available");
  
  const { hRecipeCcp } = await import("../drizzle/schema.js");
  const result = await db.insert(hRecipeCcp).values(data as any);
  return Number(result[0].insertId);
}

// ==================== CCP 인스턴스 조회 ====================
export async function getCcpInstanceById(instanceId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { hCcpInstances } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const result = await db.select().from(hCcpInstances).where(eq(hCcpInstances.id, instanceId));
  return result[0] || null;
}

export async function getCcpInstancesByBatchId(batchId: number) {
  const pool = await getRawConnection();
  
  // 1. 인스턴스 + 공정그룹 정보 조회
  const [instances] = await pool.execute<any[]>(
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
     WHERE i.batch_id = ?
     ORDER BY i.id`,
    [batchId]
  );

  // 2. 각 인스턴스의 행(row) + 설비 정보 조회
  const instanceIds = (instances as any[]).map((r: any) => r.id);
  let rowsMap: Record<number, any[]> = {};
  
  if (instanceIds.length > 0) {
    const placeholders = instanceIds.map(() => "?").join(",");
    const [rows] = await pool.execute<any[]>(
      `SELECT 
         r.id, r.instance_id AS instanceId, r.sort_order AS sortOrder,
         r.row_type AS rowType, r.measured_at AS measuredAt,
         r.temp_c AS tempC, r.duration_min AS durationMin,
         r.heating_min AS heatingMin, r.cycle_total_min AS cycleTotalMin,
         r.pressure_bar AS pressureBar, r.result, r.note,
         r.auto_generated AS autoGenerated,
         r.equipment_id AS equipmentId, r.equipment_name AS equipmentName,
         r.tenant_id AS tenantId, r.created_at AS createdAt
       FROM h_ccp_rows r
       WHERE r.instance_id IN (${placeholders})
       ORDER BY r.instance_id, r.sort_order`,
      instanceIds
    );
    for (const row of (rows as any[])) {
      const iid = row.instanceId;
      if (!rowsMap[iid]) rowsMap[iid] = [];
      rowsMap[iid].push(row);
    }
  }

  return (instances as any[]).map((inst: any) => ({
    ...inst,
    rows: rowsMap[inst.id] ?? [],
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
  if (!db) throw new Error("Database not available");
  const { hCcpRows } = await import("../drizzle/schema.js");
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
  const vals: any[] = [];
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
  if (!db) throw new Error("Database not available");
  const { hCcpRows } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  return await db.select().from(hCcpRows).where(eq(hCcpRows.instanceId, instanceId)).orderBy(hCcpRows.sortOrder);
}

/**
 * CCP 인스턴스 상태 업데이트
 */
export async function updateCcpInstanceStatus(instanceId: number, status: "draft" | "submitted" | "approved" | "rejected", userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hCcpInstances } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const updateData: any = { status };
  
  if (status === "submitted") {
    updateData.submittedAt = new Date();
    if (userId) updateData.submittedBy = userId;
  } else if (status === "approved") {
    updateData.approvedAt = new Date();
    if (userId) updateData.approvedBy = userId;
  }
  
  await db.update(hCcpInstances).set(updateData).where(eq(hCcpInstances.id, instanceId));
}

/**
 * LOT 목록 조회 (소비기한/생산일자 포함)
 */
export async function getAllInventoryLotsWithDetails(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hInventoryLots, hMaterials } = await import("../drizzle/schema.js");
  const { desc, eq } = await import("drizzle-orm");
  
  // 원재료 정보 조회 (tenantId 필터)
  const materials = tenantId
    ? await db.select().from(hMaterials).where(eq(hMaterials.tenantId, tenantId))
    : await db.select().from(hMaterials);
  const materialMap = new Map(materials.map(m => [m.id, m]));
  const materialIds = new Set(materials.map(m => m.id));
  
  // LOT 목록 조회
  const lots = await db.select().from(hInventoryLots).orderBy(desc(hInventoryLots.createdAt));
  
  // tenantId가 있으면 해당 테넌트 원재료의 LOT만 필터
  const filteredLots = tenantId
    ? lots.filter(lot => lot.materialId && materialIds.has(lot.materialId))
    : lots;
  
  return filteredLots.map(lot => ({
    ...lot,
    materialName: lot.materialId ? (materialMap.get(lot.materialId)?.materialName || "Unknown") : "Unknown",
    materialCode: lot.materialId ? (materialMap.get(lot.materialId)?.materialCode || "") : ""
  }));
}

/**
 * 모든 재고 LOT 조회
 */
export async function getAllInventoryLots(filters?: {
  startDate?: string;
  endDate?: string;
  materialId?: number;
  supplierId?: number;
  search?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hInventoryLots, hMaterials } = await import("../drizzle/schema.js");
  const { eq, desc, and, gte, lte, like, or } = await import("drizzle-orm");
  
  // 필터 조건 구성
  const conditions = [];
  // NOTE: hInventoryLots에 tenant_id 컬럼 없음 → hMaterials.tenantId 기반 필터링은 후처리
  if (filters?.startDate) {
    conditions.push(gte(hInventoryLots.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    conditions.push(lte(hInventoryLots.createdAt, new Date(filters.endDate)));
  }
  if (filters?.materialId) {
    conditions.push(eq(hInventoryLots.materialId, filters.materialId));
  }
   // supplierId 필터는 supplierName으로 대체 (클라이언트 측에서 처리) }
  
  // 기본 조회
  let query = db.select().from(hInventoryLots);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  const lots = await query.orderBy(desc(hInventoryLots.createdAt));
  
  // 원재료 정보 병합 (tenantId 필터 포함)
  const materials = filters?.tenantId
    ? await db.select().from(hMaterials).where(eq(hMaterials.tenantId, filters.tenantId))
    : await db.select().from(hMaterials);
  const materialMap = new Map(materials.map(m => [m.id, m]));
  const materialIds = new Set(materials.map(m => m.id));
  
  // tenantId 기반 LOT 필터링 (hInventoryLots에 tenant_id 없으므로 materialId 기준)
  let filteredLots = filters?.tenantId
    ? lots.filter(lot => lot.materialId && materialIds.has(lot.materialId))
    : lots;
  
  let results = filteredLots.map(lot => ({
    ...lot,
    materialName: lot.materialId ? (materialMap.get(lot.materialId)?.materialName || "Unknown") : "Unknown",
    materialCode: lot.materialId ? (materialMap.get(lot.materialId)?.materialCode || "") : ""
  }));
  
  // 검색어 필터 (클라이언트 측에서 처리)
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    results = results.filter(lot => 
      lot.lotNumber?.toLowerCase().includes(searchLower) ||
      lot.materialName?.toLowerCase().includes(searchLower) ||
      lot.materialCode?.toLowerCase().includes(searchLower)
    );
  }
  
  return results;
}

/**
 * 재고 입고 (LOT 생성)
 */
export async function createInventoryLot(data: {
  materialId: number;
  lotNumber: string;
  quantity: string;
  unit: string;
  expiryDate?: Date;
  supplierId?: number;
  receiptDate?: Date;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hInventoryLots, hInventoryTransactions } = await import("../drizzle/schema.js");
  
  // 1. 재고 LOT 생성
  const [result] = await db.insert(hInventoryLots).values({
    materialId: data.materialId,
    lotNumber: data.lotNumber,
    quantity: data.quantity,
    availableQuantity: data.quantity,
    unit: data.unit,
    expiryDate: data.expiryDate || null,
    receiptDate: data.receiptDate || new Date(),
    supplierName: data.supplierId ? `Supplier ${data.supplierId}` : null,
    status: "available"
  });
  
  const lotId = result.insertId;
  
  // 2. 재고 거래 내역 생성 (receipt)
  await db.insert(hInventoryTransactions).values({
    lotId: Number(lotId),
    transactionType: "receipt",
    quantity: data.quantity,
    unit: data.unit,
    referenceType: "supplier",
    referenceId: data.supplierId || null,
    notes: `재고 입고 - LOT ${data.lotNumber}`,
    createdBy: data.userId
  });
  
  return {
    success: true,
    message: "재고가 입고되었습니다",
    lotId
  };
}

/**
 * 재고 LOT 조회 (FEFO 원칙 적용 - 유통기한 가까운 순)
 */
export async function getInventoryLotsByMaterialId(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hInventoryLots } = await import("../drizzle/schema.js");
  const { eq, and, asc } = await import("drizzle-orm");
  
  return await db
    .select()
    .from(hInventoryLots)
    .where(
      and(
        eq(hInventoryLots.materialId, materialId),
        eq(hInventoryLots.status, "available")
      )
    )
    .orderBy(asc(hInventoryLots.expiryDate)); // FEFO: 유통기한 가까운 순
}

/**
 * 원재료 투입 (재고 차감 및 거래 내역 생성)
 */
export async function addMaterialInputToBatch(data: {
  batchId: number;
  materialId: number;
  lotId: number;
  quantity: string;
  unit: string;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hInventoryLots, hInventoryTransactions, hBatchInputs } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  // 1. 재고 LOT 조회
  const [lot] = await db.select().from(hInventoryLots).where(eq(hInventoryLots.id, data.lotId));
  if (!lot) throw new Error("재고 LOT를 찾을 수 없습니다");
  
  // 2. 가용 수량 확인
  const requestedQty = parseFloat(data.quantity);
  const availableQty = parseFloat(lot.availableQuantity);
  if (requestedQty > availableQty) {
    throw new Error(`재고 부족: 요청 ${requestedQty}${data.unit}, 가용 ${availableQty}${data.unit}`);
  }
  
  // 3. 재고 차감
  const newAvailableQty = (availableQty - requestedQty).toFixed(3);
  await db.update(hInventoryLots)
    .set({ availableQuantity: newAvailableQty })
    .where(eq(hInventoryLots.id, data.lotId));
  
  // 4. 재고 거래 내역 생성
  await db.insert(hInventoryTransactions).values({
    lotId: data.lotId,
    transactionType: "usage",
    quantity: data.quantity,
    unit: data.unit,
    referenceType: "batch",
    referenceId: data.batchId,
    notes: `배치 ${data.batchId}에 원재료 투입`,
    createdBy: data.userId
  });
  
  // 5. 배치 원재료 투입 기록 생성
  await db.insert(hBatchInputs).values({
    batchId: data.batchId,
    materialId: data.materialId,
    lotId: data.lotId,
    plannedQuantity: data.quantity,
    actualQuantity: data.quantity,
    unit: data.unit,
    inputTime: new Date(),
    inputBy: data.userId
  });
  
  return {
    success: true,
    message: "원재료가 투입되었습니다",
    remainingQuantity: newAvailableQty
  };
}

/**
 * 배치별 원재료 투입 내역 조회
 */
export async function updateMaterialInput(
  inputId: number,
  data: {
    quantity?: string;
    lotId?: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hBatchInputs } = await import("../drizzle/schema");
  
  const updateData: any = {};
  if (data.quantity !== undefined) updateData.quantity = data.quantity;
  if (data.lotId !== undefined) updateData.lotId = data.lotId;
  
  await db
    .update(hBatchInputs)
    .set(updateData)
    .where(eq(hBatchInputs.id, inputId));
}

export async function deleteMaterialInput(inputId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hBatchInputs, hInventoryLots } = await import("../drizzle/schema");
  const { eq: eqOp } = await import("drizzle-orm");
  
  // 1. 투입 내역 조회
  const input = await db
    .select()
    .from(hBatchInputs)
    .where(eqOp(hBatchInputs.id, inputId))
    .limit(1);
  
  if (input.length === 0) {
    throw new Error("투입 내역을 찾을 수 없습니다");
  }
  
  const inputData = input[0];
  
  // 2. 재고 복구 (투입한 수량을 다시 돌려줌)
  const [lot] = await db.select().from(hInventoryLots).where(eqOp(hInventoryLots.id, Number(inputData.lotId)));
  if (lot) {
    const currentQty = parseFloat(lot.availableQuantity);
    const returnQty = parseFloat(inputData.actualQuantity || inputData.plannedQuantity);
    const newQty = (currentQty + returnQty).toFixed(3);
    await db.update(hInventoryLots)
      .set({ availableQuantity: newQty })
      .where(eqOp(hInventoryLots.id, Number(inputData.lotId)));
  }
  
  // 3. 재고 거래 내역 삭제 (해당 투입과 관련된 거래만 삭제)
  // 주의: 정확한 매칭을 위해서는 hInventoryTransactions에 inputId 참조가 필요하지만
  // 현재 스키마에는 없으므로 재고 복구만 수행
  
  // 4. 투입 내역 삭제
  await db
    .delete(hBatchInputs)
    .where(eqOp(hBatchInputs.id, inputId));
}

export async function getBatchMaterialInputs(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hBatchInputs, itemMaster } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  return await db.select({
    id: hBatchInputs.id,
    batchId: hBatchInputs.batchId,
    materialId: hBatchInputs.materialId,
    materialName: itemMaster.itemName,
    materialCode: itemMaster.itemCode,
    lotId: hBatchInputs.lotId,
    plannedQuantity: hBatchInputs.plannedQuantity,
    actualQuantity: hBatchInputs.actualQuantity,
    unit: hBatchInputs.unit,
    inputTime: hBatchInputs.inputTime,
    inputBy: hBatchInputs.inputBy,
    createdAt: hBatchInputs.createdAt
  })
  .from(hBatchInputs)
  .leftJoin(itemMaster, eq(hBatchInputs.materialId, itemMaster.id))
  .where(eq(hBatchInputs.batchId, batchId));
}

/**
 * 모든 원재료 조회
 */
export async function getAllMaterials(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { itemMaster } = await import("../drizzle/schema.js");
  const { eq, and, desc } = await import("drizzle-orm");
  // ✅ FIX: hMaterials(빈 테이블) 대신 itemMaster에서 raw_material 타입 조회
  const conditions: any[] = [eq(itemMaster.itemType, "raw_material")];
  if (tenantId) conditions.push(eq(itemMaster.tenantId, tenantId));
  return await db.select({
    id: itemMaster.id,
    materialName: itemMaster.itemName,
    materialCode: itemMaster.itemCode,
    unit: itemMaster.baseUnit,
    tenantId: itemMaster.tenantId,
    isActive: itemMaster.isActive
  }).from(itemMaster).where(and(...conditions)).orderBy(desc(itemMaster.id));
}

/**
 * 원재료 ID로 조회
 */
export async function getMaterialById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hMaterials } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const [material] = await db.select().from(hMaterials).where(eq(hMaterials.id, id));
  return material || null;
}

/**
 * 배치 번호 자동 생성 (개선판: 동시성 처리 및 날짜별 순번 조회)
 * 형식: 제품코드-YYYYMMDD-순번 (예: PROD001-20240124-001)
 */
export async function generateBatchCode(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hBatches } = await import("../drizzle/schema.js");
  const { hProductsV2 } = await import("../drizzle/schema_main.js");
  const { eq, desc, and, like } = await import("drizzle-orm");
  
  // 1. 제품 정보 조회 (hProductsV2 사용)
  const [product] = await db.select().from(hProductsV2).where(eq(hProductsV2.id, productId));
  if (!product) throw new Error("제품을 찾을 수 없습니다");
  
  // 2. 오늘 날짜 문자열 생성 (YYYYMMDD)
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  
  // 3. 오늘 날짜의 해당 제품 배치 모두 조회 (날짜별 순번 확인)
  const todayBatches = await db
    .select()
    .from(hBatches)
    .where(
      and(
        eq(hBatches.productId, productId),
        like(hBatches.batchCode, `${product.productCode}-${dateStr}-%`)
      )
    )
    .orderBy(desc(hBatches.createdAt));
  
  // 4. 순번 계산 (오늘 날짜의 최대 순번 + 1)
  let sequence = 1;
  if (todayBatches.length > 0) {
    const maxSequence = Math.max(
      ...todayBatches.map((batch) => {
        const parts = batch.batchCode.split("-");
        if (parts.length === 3) {
          return parseInt(parts[2]) || 0;
        }
        return 0;
      })
    );
    sequence = maxSequence + 1;
  }
  
  // 5. 배치 번호 생성 (순번은 3자리로 패딩)
  const batchCode = `${product.productCode}-${dateStr}-${sequence.toString().padStart(3, "0")}`;
  return batchCode;
}

/**
 * 레시피 기반 원재료 목록 조회
 */
export async function getMaterialsByRecipeId(recipeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hRecipeLines, hMaterials } = await import("../drizzle/schema.js");
  const { eq, isNotNull } = await import("drizzle-orm");
  
  // 레시피 라인 정보 조회 (원재료만)
  const recipeDetails = await db
    .select()
    .from(hRecipeLines)
    .where(
      eq(hRecipeLines.recipeId, recipeId)
    );
  
  // 원재료 정보와 함께 반환
  const materialsWithQuantity = [];
  for (const detail of recipeDetails) {
    // materialId가 null이 아닌 경우만 조회
    if (detail.materialId) {
      const [material] = await db
        .select()
        .from(hMaterials)
        .where(eq(hMaterials.id, detail.materialId));
      
      if (material) {
        materialsWithQuantity.push({
          ...material,
          requiredQuantity: detail.quantity,
          requiredUnit: detail.unit
        });
      }
    }
  }
  
  return materialsWithQuantity;
}

/**
 * 재고 부족 원재료 조회
 */
export async function getLowStockMaterials(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hMaterials, hInventoryLots } = await import("../drizzle/schema.js");
  const { eq, and, sum, sql } = await import("drizzle-orm");
  
  // 테넌트 필터 적용
  const materialWhere = tenantId
    ? and(eq(hMaterials.isActive, 1), eq(hMaterials.tenantId, tenantId))
    : eq(hMaterials.isActive, 1);
  const materials = await db.select().from(hMaterials).where(materialWhere);
  
  const lowStockMaterials = [];
  
  for (const material of materials) {
    // 해당 원재료의 총 가용 재고 계산 (테넌트 격리)
    const lotWhere = tenantId
      ? and(eq(hInventoryLots.materialId, material.id), eq(hInventoryLots.tenantId, tenantId))
      : eq(hInventoryLots.materialId, material.id);
    const stockResult = await db
      .select({
        totalStock: sum(hInventoryLots.availableQuantity)
      })
      .from(hInventoryLots)
      .where(lotWhere);
    
    const totalStock = parseFloat(stockResult[0]?.totalStock || "0");
    const safetyLevel = parseFloat(material.safetyStockLevel || "0");
    
    // 안전 재고 수준 이하인 경우
    if (totalStock < safetyLevel) {
      lowStockMaterials.push({
        ...material,
        currentStock: totalStock,
        shortage: safetyLevel - totalStock
      });
    }
  }
  
  return lowStockMaterials;
}

/**
 * 재고 부족 알림 발송
 */
export async function notifyLowStock(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hMaterials, hInventoryLots } = await import("../drizzle/schema.js");
  const { eq, sum } = await import("drizzle-orm");
  
  // 원재료 정보 조회
  const [material] = await db.select().from(hMaterials).where(eq(hMaterials.id, materialId));
  if (!material) throw new Error("원재료를 찾을 수 없습니다");
  
  // 현재 재고 조회
  const stockResult = await db
    .select({
      totalStock: sum(hInventoryLots.availableQuantity)
    })
    .from(hInventoryLots)
    .where(eq(hInventoryLots.materialId, materialId));
  
  const totalStock = parseFloat(stockResult[0]?.totalStock || "0");
  const safetyLevel = parseFloat(material.safetyStockLevel || "0");
  
  if (totalStock < safetyLevel) {
    // 알림 발송 (notifyOwner 사용)
    const { notifyOwner } = await import("./_core/notification.js");
    await notifyOwner({
      title: "재고 부족 알림",
      content: `원재료 "${material.materialName}"의 재고가 부족합니다.\n현재 재고: ${totalStock} ${material.unit}\n안전 재고: ${safetyLevel} ${material.unit}\n부족량: ${safetyLevel - totalStock} ${material.unit}`
    });
    
    return true;
  }
  
  return false;
}

/**
 * 대시보드 통계 조회
 */
export async function getDashboardStats(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hBatches, hCcpInstances } = await import("../drizzle/schema.js");
  const { eq, count, and, gte, lte } = await import("drizzle-orm");
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  
  // 진행 중인 배치 수 (테넌트 격리)
  const batchTenantCond = tenantId ? eq(hBatches.tenantId, tenantId) : undefined;
  const [inProgressResult] = await db
    .select({ count: count() })
    .from(hBatches)
    .where(batchTenantCond ? and(eq(hBatches.status, "in_progress"), batchTenantCond) : eq(hBatches.status, "in_progress"));
  
  // 오늘 완료된 배치 수 (테넌트 격리)
  const todayConditions = [eq(hBatches.status, "completed"), gte(hBatches.endTime, today), lte(hBatches.endTime, tomorrow)];
  if (batchTenantCond) todayConditions.push(batchTenantCond);
  const [completedTodayResult] = await db
    .select({ count: count() })
    .from(hBatches)
    .where(and(...todayConditions));
  
  // 이번 주 완료된 배치 수 (테넌트 격리)
  const weekConditions = [eq(hBatches.status, "completed"), gte(hBatches.endTime, weekStart)];
  if (batchTenantCond) weekConditions.push(batchTenantCond);
  const [completedWeekResult] = await db
    .select({ count: count() })
    .from(hBatches)
    .where(and(...weekConditions));
  
  // 이번 달 완료된 배치 수 (테넌트 격리)
  const monthConditions = [eq(hBatches.status, "completed"), gte(hBatches.endTime, monthStart)];
  if (batchTenantCond) monthConditions.push(batchTenantCond);
  const [completedMonthResult] = await db
    .select({ count: count() })
    .from(hBatches)
    .where(and(...monthConditions));
  
  // CCP 점검 현황
  const [ccpTotalResult] = await db
    .select({ count: count() })
    .from(hCcpInstances);
  
  const [ccpCompletedResult] = await db
    .select({ count: count() })
    .from(hCcpInstances)
    .where(eq(hCcpInstances.status, "submitted"));
  
  // 재고 부족 원재료 수
  const lowStockMaterials = await getLowStockMaterials(tenantId);
  
  return {
    inProgressBatches: inProgressResult.count,
    completedToday: completedTodayResult.count,
    completedWeek: completedWeekResult.count,
    completedMonth: completedMonthResult.count,
    ccpTotal: ccpTotalResult.count,
    ccpCompleted: ccpCompletedResult.count,
    ccpPending: ccpTotalResult.count - ccpCompletedResult.count,
    lowStockCount: lowStockMaterials.length
  };
}

// CCP 기록 조회 (모든 배치의 CCP 인스턴스)
export async function getAllCcpRecords(filters?: {
  ccpType?: string;
  status?: "draft" | "submitted" | "approved" | "rejected";
  startDate?: Date;
  endDate?: Date;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  const { hCcpInstances, hBatches, hProductsV2 } = await import("../drizzle/schema_main");
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
    .orderBy(sql`${hCcpInstances.createdAt} DESC`);
  
  return records;
}

// CCP 일괄 삭제
export async function deleteCcpInstances(instanceIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hCcpInstances, hCcpRows } = await import("../drizzle/schema");
  const { inArray } = await import("drizzle-orm");
  
  // 1. CCP 점검 행 삭제
  await db
    .delete(hCcpRows)
    .where(inArray(hCcpRows.instanceId, instanceIds));
  
  // 2. CCP 인스턴스 삭제
  const result = await db
    .delete(hCcpInstances)
    .where(inArray(hCcpInstances.id, instanceIds));
  
  return {
    deletedCount: instanceIds.length
  };
}

// CCP 이탈 건수 조회
export async function getCcpDeviationCount(instanceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  const { hCcpRows } = await import("../drizzle/schema");
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
// CCP 점검 일정 관리 (CCP Schedule Management)
// ============================================================================

/**
 * CCP 생성 시 자동으로 점검 일정 생성
 * @param ccpInstanceId CCP 인스턴스 ID
 * @param frequency 점검 주기 (daily, weekly, monthly)
 * @param startDate 시작일
 * @param count 생성할 일정 개수
 */
export async function createCcpSchedules(
  ccpInstanceId: number,
  frequency: "daily" | "weekly" | "monthly",
  startDate: Date,
  count: number = 30
) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  const { hCcpSchedules } = await import("../drizzle/schema_main");
  
  const schedules = [];
  let currentDate = new Date(startDate);
  
  for (let i = 0; i < count; i++) {
    schedules.push({
      ccpInstanceId,
      scheduledDate: new Date(currentDate),
      frequency,
      status: "pending" as const
    });
    
    // 다음 일정 날짜 계산
    if (frequency === "daily") {
      currentDate.setDate(currentDate.getDate() + 1);
    } else if (frequency === "weekly") {
      currentDate.setDate(currentDate.getDate() + 7);
    } else if (frequency === "monthly") {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }
  
  await db.insert(hCcpSchedules).values(schedules);
  return schedules.length;
}

/**
 * CCP 점검 일정 조회
 * @param filters 필터 조건
 */
export async function getCcpSchedules(filters?: {
  ccpInstanceId?: number;
  status?: "pending" | "completed" | "skipped";
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  const { hCcpSchedules, hCcpInstances } = await import("../drizzle/schema_main");
  const { eq, and, gte, lte, sql } = await import("drizzle-orm");
  
  const conditions = [];
  
  if (filters?.ccpInstanceId) {
    conditions.push(eq(hCcpSchedules.ccpInstanceId, filters.ccpInstanceId));
  }
  
  if (filters?.status) {
    conditions.push(eq(hCcpSchedules.status, filters.status));
  }
  
  if (filters?.startDate) {
    conditions.push(gte(hCcpSchedules.scheduledDate, filters.startDate));
  }
  
  if (filters?.endDate) {
    conditions.push(lte(hCcpSchedules.scheduledDate, filters.endDate));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const schedules = await db
    .select({
      id: hCcpSchedules.id,
      ccpInstanceId: hCcpSchedules.ccpInstanceId,
      scheduledDate: hCcpSchedules.scheduledDate,
      frequency: hCcpSchedules.frequency,
      status: hCcpSchedules.status,
      completedAt: hCcpSchedules.completedAt,
      completedBy: hCcpSchedules.completedBy,
      note: hCcpSchedules.note,
      ccpType: hCcpInstances.ccpType,
      productName: hCcpInstances.productName
    })
    .from(hCcpSchedules)
    .leftJoin(hCcpInstances, eq(hCcpSchedules.ccpInstanceId, hCcpInstances.id))
    .where(whereClause)
    .orderBy(sql`${hCcpSchedules.scheduledDate} ASC`);
  
  return schedules;
}

/**
 * CCP 점검 완료 처리
 * @param scheduleId 일정 ID
 * @param completedBy 완료자 ID
 * @param note 비고
 */
export async function completeCcpSchedule(
  scheduleId: number,
  completedBy: number,
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  const { hCcpSchedules } = await import("../drizzle/schema_main");
  const { eq } = await import("drizzle-orm");
  
  await db
    .update(hCcpSchedules)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedBy,
      note
    })
    .where(eq(hCcpSchedules.id, scheduleId));
}

/**
 * 오늘 점검 예정인 CCP 일정 조회
 */
export async function getTodayCcpSchedules() {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  const { hCcpSchedules, hCcpInstances } = await import("../drizzle/schema_main");
  const { eq, and, sql } = await import("drizzle-orm");
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const schedules = await db
    .select({
      id: hCcpSchedules.id,
      ccpInstanceId: hCcpSchedules.ccpInstanceId,
      scheduledDate: hCcpSchedules.scheduledDate,
      frequency: hCcpSchedules.frequency,
      status: hCcpSchedules.status,
      ccpType: hCcpInstances.ccpType,
      productName: hCcpInstances.productName
    })
    .from(hCcpSchedules)
    .leftJoin(hCcpInstances, eq(hCcpSchedules.ccpInstanceId, hCcpInstances.id))
    .where(
      and(
        eq(hCcpSchedules.status, "pending"),
        sql`DATE(${hCcpSchedules.scheduledDate}) = DATE(${today})`
      )
    )
    .orderBy(sql`${hCcpSchedules.scheduledDate} ASC`);
  
  return schedules;
}

// ==================== PDF 보고서 생성 ====================
export async function generateBatchReport(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hBatches, hProductsV2, hCcpInstances, hCcpRecords, hBatchInputs, hMaterials } = await import("../drizzle/schema");
  
  // 배치 정보 조회
  const batch = await db
    .select()
    .from(hBatches)
    .where(eq(hBatches.id, batchId))
    .limit(1)
    .then((rows) => rows[0]);
    
  if (!batch) {
    throw new Error("배치를 찾을 수 없습니다.");
  }

  // 제품 정보 조회
  const product = await db
    .select()
    .from(hProductsV2)
    .where(eq(hProductsV2.id, batch.productId))
    .limit(1)
    .then((rows) => rows[0]);

  // CCP 인스턴스 조회
  const ccpInstances = await db
    .select()
    .from(hCcpInstances)
    .where(eq(hCcpInstances.batchId, batchId));

  // CCP 점검 기록 조회
  const ccpRecordsData: any[] = [];
  for (const instance of ccpInstances) {
    const records = await db
      .select()
      .from(hCcpRecords)
      .where(eq(hCcpRecords.instanceId, instance.id));
    ccpRecordsData.push(...records);
  }

  // 원재료 투입 내역 조회
  const materialInputs = await db
    .select({
      input: hBatchInputs,
      material: hMaterials
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(eq(hBatchInputs.batchId, batchId));

  return {
    batch,
    product,
    ccpInstances,
    ccpRecords: ccpRecordsData,
    materialInputs
  };
}

// CCP 점검 일정 날짜 변경
export async function updateCcpScheduleDate(scheduleId: number, newDate: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hCcpSchedules } = await import("../drizzle/schema");
  
  await db
    .update(hCcpSchedules)
    .set({ scheduledDate: newDate })
    .where(eq(hCcpSchedules.id, scheduleId));
}

// ============================================================================
// 알림 관리
// ============================================================================

export async function createNotification(data: {
  tenantId: number;
  userId?: number;
  notificationType: string;
  title: string;
  message: string;
  referenceId?: number;
  referenceType?: string;
  actionUrl?: string;
  priority?: string;
  metadata?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [notification] = await db.insert(hNotifications).values({
    ...data,
    tenantId: data.tenantId,
    userId: data.userId || 1, // 기본값: 1 (시스템 알림)
    priority: data.priority as "low" | "medium" | "high" | "urgent" | undefined
  });
  return notification;
}

export async function getNotifications(userId?: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [];
  if (userId) conditions.push(eq(hNotifications.userId, userId));
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  if (conditions.length > 0) {
    return await db
      .select()
      .from(hNotifications)
      .where(and(...conditions))
      .orderBy(desc(hNotifications.createdAt));
  }
  return await db
    .select()
    .from(hNotifications)
    .orderBy(desc(hNotifications.createdAt));
}

export async function markNotificationAsRead(notificationId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(hNotifications.id, notificationId)];
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  await db
    .update(hNotifications)
    .set({ isRead: 1, readAt: new Date() })
    .where(and(...conditions));
}

export async function deleteNotification(notificationId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(hNotifications.id, notificationId)];
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  await db
    .delete(hNotifications)
    .where(and(...conditions));
}

export async function checkAndCreateExpiryNotifications() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const expiringLots = await db
    .select({
      lot: hInventoryLots,
      material: hMaterials
    })
    .from(hInventoryLots)
    .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(
      and(
        lte(hInventoryLots.expiryDate, sevenDaysFromNow),
        eq(hInventoryLots.status, "available")
      )
    );

  for (const { lot, material } of expiringLots) {
    if (!lot || !material || !lot.expiryDate) continue;

    const daysUntilExpiry = Math.ceil(
      (new Date(lot.expiryDate).getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24)
    );

    await createNotification({
      notificationType: "inventory_expiry",
      title: `재고 유통기한 임박`,
      message: `${material.materialName} (LOT: ${lot.lotNumber}) 유통기한이 ${daysUntilExpiry}일 남았습니다.`,
      referenceId: lot.id,
      referenceType: "inventory_lot",
      actionUrl: `/inventory?lotId=${lot.id}`
    });
  }

  return expiringLots.length;
}

// ============================================================================
// 사용자 관리 함수
// ============================================================================

export async function getAllUsers(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  let query = db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    approvalStatus: users.approvalStatus,
    isActive: users.isActive,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
    tenantId: users.tenantId
  }).from(users);
  
  // tenant_id 필터링 (제공된 경우)
  if (tenantId !== undefined) {
    query = query.where(eq(users.tenantId, tenantId)) as any;
  }
  
  return await query.orderBy(users.createdAt);
}

export async function updateUserRole(userId: number, role: "admin" | "worker" | "monitor") {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({ role: role })
    .where(eq(users.id, userId));
}

export async function approveUser(userId: number, role: "admin" | "worker" | "monitor") {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({ 
      approvalStatus: "approved",
      isActive: 1,
      role: role
    })
    .where(eq(users.id, userId));
}

export async function toggleUserActive(userId: number, isActive: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({ isActive: isActive ? 1 : 0 })
    .where(eq(users.id, userId));
}

export async function batchApproveUsers(userIds: number[], role: "admin" | "worker" | "monitor") {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({ 
      approvalStatus: "approved",
      isActive: 1,
      role: role
    })
    .where(inArray(users.id, userIds));
}

export async function rejectUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({ 
      approvalStatus: "rejected",
      isActive: 0
    })
    .where(eq(users.id, userId));
}

export async function batchRejectUsers(userIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({ 
      approvalStatus: "rejected",
      isActive: 0
    })
    .where(inArray(users.id, userIds));
}

export async function inviteUser(email: string, name: string, role: "admin" | "worker" | "monitor", invitedBy: number, userMemo?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 기본 비밀번호 생성 (임시 비밀번호)
  const bcrypt = await import("bcrypt");
  const tempPassword = Math.random().toString(36).slice(-8);
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  
  const [newUser] = await db.insert(users).values({
    email,
    passwordHash,
    name,
    role,
    approvalStatus: "approved",
    isActive: 1,
    invitedBy,
    invitedAt: new Date(),
    userMemo
  });
  
  return { userId: Number(newUser.insertId), tempPassword };
}

// ============================================================================
// 감사 로그 함수
// ============================================================================

import { auditLogs, type NewAuditLog } from "../drizzle/schema";

export interface CreateAuditLogInput {
  action: string; // 예: "batch.create", "ccp.approve", "user.updateRole"
  entityType: string; // 예: "batch", "ccp", "user"
  entityId?: number;
  userId: number;
  userEmail?: string;
  userRole?: string;
  changes?: Record<string, any>; // 변경 전후 데이터
  description?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(input: CreateAuditLogInput) {
  // Temporarily disabled due to schema mismatch
  return;
}

export async function getAuditLogs(limit: number = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function getAuditLogsByEntity(entityType: string, entityId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityType, entityType),
        eq(auditLogs.entityId, entityId)
      )
    )
    .orderBy(desc(auditLogs.createdAt));
}

export async function getAuditLogsByUser(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

// ============================================================================
// 체크리스트 템플릿 관리
// ============================================================================

import {
  checklistTemplates,
  checklistTemplateItems,
  checklistInstances,
  checklistInstanceItems
} from "../drizzle/schema/checklist";

/**
 * 체크리스트 템플릿 목록 조회
 */
export async function getChecklistTemplates(filters: {
  category?: string;
  ccpType?: string;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const conditions = [];
  if (filters.category) {
    conditions.push(eq(checklistTemplates.category, filters.category as any));
  }
  if (filters.ccpType) {
    conditions.push(eq(checklistTemplates.ccpType, filters.ccpType));
  }
  if (filters.isActive !== undefined) {
    conditions.push(eq(checklistTemplates.isActive, filters.isActive ? 1 : 0));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return await db
    .select()
    .from(checklistTemplates)
    .where(whereClause)
    .orderBy(desc(checklistTemplates.priority), desc(checklistTemplates.createdAt));
}

/**
 * 체크리스트 템플릿 상세 조회 (항목 포함)
 */
export async function getChecklistTemplateById(templateId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [template] = await db
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.id, templateId))
    .limit(1);

  if (!template) return null;

  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.templateId, templateId))
    .orderBy(checklistTemplateItems.sortOrder);

  return {
    ...template,
    items
  };
}

/**
 * 체크리스트 템플릿 생성
 */
export async function createChecklistTemplate(data: {
  name: string;
  description?: string;
  category: "CCP" | "SANITATION" | "QUALITY" | "SAFETY" | "TRAINING" | "MAINTENANCE";
  ccpType?: string;
  priority?: number;
  autoTriggerRules?: any;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [result] = await db.insert(checklistTemplates).values({
    name: data.name,
    description: data.description,
    category: data.category,
    ccpType: data.ccpType,
    priority: data.priority || 0,
    autoTriggerRules: data.autoTriggerRules,
    createdBy: data.createdBy,
    isActive: 1
  });

  return Number(result.insertId);
}

/**
 * 체크리스트 템플릿 항목 생성
 */
export async function createChecklistTemplateItem(data: {
  templateId: number;
  sortOrder: number;
  itemName: string;
  itemType: "checkbox" | "number" | "text" | "select" | "time" | "date" | "temperature" | "pressure" | "textarea";
  required: boolean;
  validationRules?: any;
  defaultValue?: string;
  helpText?: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [result] = await db.insert(checklistTemplateItems).values({
    ...data,
    required: data.required ? 1 : 0
  });

  return Number(result.insertId);
}

/**
 * 체크리스트 템플릿 + 항목 일괄 생성
 */
export async function createChecklistTemplateWithItems(data: {
  name: string;
  description?: string;
  category: "CCP" | "SANITATION" | "QUALITY" | "SAFETY" | "TRAINING" | "MAINTENANCE";
  ccpType?: string;
  priority?: number;
  autoTriggerRules?: any;
  createdBy?: number;
  items: Array<{
    sortOrder: number;
    itemName: string;
    itemType: "checkbox" | "number" | "text" | "select" | "textarea" | "time" | "date" | "temperature" | "pressure";
    required: boolean;
    description?: string;
    validationRules?: any;
    defaultValue?: string;
    helpText?: string;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 템플릿 생성
  const templateId = await createChecklistTemplate({
    name: data.name,
    description: data.description,
    category: data.category,
    ccpType: data.ccpType,
    priority: data.priority,
    autoTriggerRules: data.autoTriggerRules,
    createdBy: data.createdBy
  });

  // 항목 생성
  for (const item of data.items) {
    await createChecklistTemplateItem({
      templateId,
      ...item
    });
  }

  return await getChecklistTemplateById(templateId);
}

/**
 * 체크리스트 템플릿 수정
 */
export async function updateChecklistTemplate(
  templateId: number,
  data: {
    name?: string;
    description?: string;
    category?: "CCP" | "SANITATION" | "QUALITY" | "SAFETY" | "TRAINING" | "MAINTENANCE";
    ccpType?: string;
    priority?: number;
    autoTriggerRules?: any;
    isActive?: boolean;
  },
  items?: Array<{
    id?: number;
    sortOrder: number;
    itemName: string;
    itemType: "checkbox" | "number" | "text" | "select" | "time" | "date" | "temperature" | "pressure" | "textarea";
    required: boolean;
    validationRules?: any;
    description?: string;
    defaultValue?: string;
    helpText?: string;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 템플릿 업데이트
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.ccpType !== undefined) updateData.ccpType = data.ccpType;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.autoTriggerRules !== undefined) updateData.autoTriggerRules = data.autoTriggerRules;
  if (data.isActive !== undefined) updateData.isActive = data.isActive ? 1 : 0;

  if (Object.keys(updateData).length > 0) {
    await db
      .update(checklistTemplates)
      .set(updateData)
      .where(eq(checklistTemplates.id, templateId));
  }

  // 항목 업데이트 (제공된 경우)
  if (items) {
    // 기존 항목 삭제
    await db
      .delete(checklistTemplateItems)
      .where(eq(checklistTemplateItems.templateId, templateId));

    // 새 항목 추가
    for (const item of items) {
      await createChecklistTemplateItem({
        templateId,
        sortOrder: item.sortOrder,
        itemName: item.itemName,
        itemType: item.itemType,
        required: item.required,
        validationRules: item.validationRules,
        defaultValue: item.defaultValue,
        helpText: item.helpText
      });
    }
  }

  return await getChecklistTemplateById(templateId);
}

/**
 * 체크리스트 템플릿 삭제 (비활성화)
 */
export async function deleteChecklistTemplate(templateId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db
    .update(checklistTemplates)
    .set({ isActive: 0 })
    .where(eq(checklistTemplates.id, templateId));

  return { success: true };
}

/**
 * 체크리스트 인스턴스 생성 (템플릿 기반)
 */
export async function createChecklistInstanceFromTemplate(data: {
  templateId: number;
  batchId?: number;
  ccpRecordId?: number;
  scheduledDate?: string;
  dueDate?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 템플릿 조회
  const template = await getChecklistTemplateById(data.templateId);
  if (!template) throw new Error("Template not found");

  // 인스턴스 생성
  const [instanceResult] = await db.insert(checklistInstances).values({
    templateId: data.templateId,
    batchId: data.batchId,
    ccpRecordId: data.ccpRecordId,
    status: "pending",
    scheduledDate: data.scheduledDate,
    dueDate: data.dueDate,
    createdBy: data.createdBy
  });

  const instanceId = Number(instanceResult.insertId);

  // 인스턴스 항목 생성 (템플릿 항목 복사)
  for (const item of template.items) {
    await db.insert(checklistInstanceItems).values({
      instanceId,
      templateItemId: item.id,
      sortOrder: item.sortOrder,
      itemName: item.itemName,
      itemType: item.itemType,
      value: item.defaultValue || null,
      isCompleted: 0
    });
  }

  return instanceId;
}

/**
 * 체크리스트 인스턴스 조회 (항목 포함)
 */
export async function getChecklistInstanceById(instanceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [instance] = await db
    .select()
    .from(checklistInstances)
    .where(eq(checklistInstances.id, instanceId))
    .limit(1);

  if (!instance) return null;

  // 템플릿 정보 조회
  const [template] = await db
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.id, instance.templateId))
    .limit(1);

  const items = await db
    .select()
    .from(checklistInstanceItems)
    .where(eq(checklistInstanceItems.instanceId, instanceId))
    .orderBy(checklistInstanceItems.sortOrder);

  return {
    ...instance,
    template,
    items
  };
}

/**
 * 체크리스트 인스턴스 항목 업데이트
 */
export async function updateChecklistInstanceItem(
  itemId: number,
  data: {
    value?: string;
    isCompleted?: boolean;
    completedBy?: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const updateData: any = {};
  if (data.value !== undefined) updateData.value = data.value;
  if (data.isCompleted !== undefined) {
    updateData.isCompleted = data.isCompleted ? 1 : 0;
    if (data.isCompleted) {
      updateData.completedAt = new Date().toISOString().replace('T', ' ').substring(0, 23);
      if (data.completedBy) updateData.completedBy = data.completedBy;
    }
  }

  await db
    .update(checklistInstanceItems)
    .set(updateData)
    .where(eq(checklistInstanceItems.id, itemId));

  return { success: true };
}

/**
 * 체크리스트 인스턴스 완료 처리
 */
export async function completeChecklistInstance(
  instanceId: number,
  completedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const now = new Date().toISOString().replace('T', ' ').substring(0, 23);

  await db
    .update(checklistInstances)
    .set({
      status: "completed",
      completedAt: now,
      completedBy
    })
    .where(eq(checklistInstances.id, instanceId));

  return { success: true };
}

/**
 * 배치별 체크리스트 인스턴스 목록 조회
 */
export async function getChecklistInstancesByBatch(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  return await db
    .select()
    .from(checklistInstances)
    .where(eq(checklistInstances.batchId, batchId))
    .orderBy(checklistInstances.createdAt);
}

// ============================================================================
// 검사 시스템 (Inspection System)
// ============================================================================

/**
 * 원재료 검사 기록 생성
 */
export async function createMaterialInspectionRecord(data: {
  materialId: number;
  materialCode: string;
  materialName: string;
  lotNumber: string;
  inspectionDate: string;
  inspectorId: number;
  inspectorName: string;
  supplierName?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db.insert(materialInspectionRecords).values(data).$returningId();
  return record.id;
}

/**
 * 원재료 검사 항목 추가
 */
export async function addMaterialInspectionItem(data: {
  recordId: number;
  itemName: string;
  standard?: string;
  result?: string;
  passed: "pass" | "fail" | "na";
  sortOrder: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.insert(materialInspectionItems).values(data);
  return { success: true };
}

/**
 * 원재료 검사 기록 목록 조회
 */
export async function getMaterialInspectionRecords(filters?: {
  startDate?: string;
  endDate?: string;
  status?: string;
  inspectionResult?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select().from(materialInspectionRecords);

  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(materialInspectionRecords.inspectionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(materialInspectionRecords.inspectionDate, filters.endDate));
  }
  if (filters?.status) {
    conditions.push(eq(materialInspectionRecords.status, filters.status as any));
  }
  if (filters?.inspectionResult) {
    conditions.push(eq(materialInspectionRecords.inspectionResult, filters.inspectionResult as any));
  }
  if (filters?.tenantId) {
    conditions.push(eq(materialInspectionRecords.tenantId, filters.tenantId));
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(materialInspectionRecords.inspectionDate));
}

/**
 * 원재료 검사 기록 상세 조회
 */
export async function getMaterialInspectionRecordById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db
    .select()
    .from(materialInspectionRecords)
    .where(eq(materialInspectionRecords.id, id));

  if (!record) return null;

  const items = await db
    .select()
    .from(materialInspectionItems)
    .where(eq(materialInspectionItems.recordId, id))
    .orderBy(materialInspectionItems.sortOrder);

  return { ...record, items };
}

/**
 * 원재료 검사 기록 상태 변경
 */
export async function updateMaterialInspectionStatus(
  id: number,
  status: "pending" | "completed" | "rejected",
  inspectionResult?: "pass" | "fail" | "conditional"
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const updateData: any = { status };
  if (inspectionResult) {
    updateData.inspectionResult = inspectionResult;
  }

  await db
    .update(materialInspectionRecords)
    .set(updateData)
    .where(eq(materialInspectionRecords.id, id));

  return { success: true };
}

/**
 * 출하 검사 기록 생성
 */
export async function createShippingInspectionRecord(data: {
  batchId: number;
  batchCode: string;
  productCode: string;
  productName: string;
  inspectionDate: string;
  inspectorId: number;
  inspectorName: string;
  quantity?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db.insert(shippingInspectionRecords).values(data).$returningId();
  return record.id;
}

/**
 * 출하 검사 항목 추가
 */
export async function addShippingInspectionItem(data: {
  recordId: number;
  itemName: string;
  standard?: string;
  result?: string;
  passed: "pass" | "fail" | "na";
  sortOrder: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.insert(shippingInspectionItems).values(data);
  return { success: true };
}

/**
 * 출하 검사 기록 목록 조회
 */
export async function getShippingInspectionRecords(filters?: {
  startDate?: string;
  endDate?: string;
  status?: string;
  inspectionResult?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select().from(shippingInspectionRecords);

  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(shippingInspectionRecords.inspectionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(shippingInspectionRecords.inspectionDate, filters.endDate));
  }
  if (filters?.status) {
    conditions.push(eq(shippingInspectionRecords.status, filters.status as any));
  }
  if (filters?.inspectionResult) {
    conditions.push(eq(shippingInspectionRecords.inspectionResult, filters.inspectionResult as any));
  }
  if (filters?.tenantId) {
    conditions.push(eq(shippingInspectionRecords.tenantId, filters.tenantId));
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(shippingInspectionRecords.inspectionDate));
}

/**
 * 출하 검사 기록 상세 조회
 */
export async function getShippingInspectionRecordById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db
    .select()
    .from(shippingInspectionRecords)
    .where(eq(shippingInspectionRecords.id, id));

  if (!record) return null;

  const items = await db
    .select()
    .from(shippingInspectionItems)
    .where(eq(shippingInspectionItems.recordId, id))
    .orderBy(shippingInspectionItems.sortOrder);

  return { ...record, items };
}

/**
 * 출하 검사 기록 상태 변경
 */
export async function updateShippingInspectionStatus(
  id: number,
  status: "pending" | "completed" | "rejected",
  inspectionResult?: "pass" | "fail" | "hold"
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const updateData: any = { status };
  if (inspectionResult) {
    updateData.inspectionResult = inspectionResult;
  }

  await db
    .update(shippingInspectionRecords)
    .set(updateData)
    .where(eq(shippingInspectionRecords.id, id));

  return { success: true };
}

/**
 * 위생 검사 기록 생성
 */
export async function createHygieneInspectionRecord(data: {
  inspectionDate: string;
  inspectionArea: string;
  inspectorId: number;
  inspectorName: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db.insert(hygieneInspectionRecords).values(data).$returningId();
  return record.id;
}

/**
 * 위생 검사 항목 추가
 */
export async function addHygieneInspectionItem(data: {
  recordId: number;
  itemName: string;
  standard?: string;
  result?: string;
  passed: "pass" | "fail" | "na";
  sortOrder: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.insert(hygieneInspectionItems).values(data);
  return { success: true };
}

/**
 * 위생 검사 기록 목록 조회
 */
export async function getHygieneInspectionRecords(filters?: {
  startDate?: string;
  endDate?: string;
  status?: string;
  result?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select().from(hygieneInspectionRecords);

  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(hygieneInspectionRecords.inspectionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hygieneInspectionRecords.inspectionDate, filters.endDate));
  }
  if (filters?.status) {
    conditions.push(eq(hygieneInspectionRecords.status, filters.status as any));
  }
  if (filters?.result) {
    conditions.push(eq(hygieneInspectionRecords.result, filters.result as any));
  }
  if (filters?.tenantId) {
    conditions.push(eq(hygieneInspectionRecords.tenantId, filters.tenantId));
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(hygieneInspectionRecords.inspectionDate));
}

/**
 * 위생 검사 기록 상세 조회
 */
export async function getHygieneInspectionRecordById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db
    .select()
    .from(hygieneInspectionRecords)
    .where(eq(hygieneInspectionRecords.id, id));

  if (!record) return null;

  const items = await db
    .select()
    .from(hygieneInspectionItems)
    .where(eq(hygieneInspectionItems.recordId, id))
    .orderBy(hygieneInspectionItems.sortOrder);

  return { ...record, items };
}

/**
 * 위생 검사 기록 상태 변경
 */
export async function updateHygieneInspectionStatus(
  id: number,
  status: "pending" | "completed" | "action_required",
  result?: "good" | "fair" | "poor"
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const updateData: any = { status };
  if (result) {
    updateData.result = result;
  }

  await db
    .update(hygieneInspectionRecords)
    .set(updateData)
    .where(eq(hygieneInspectionRecords.id, id));

  return { success: true };
}

// ============================================================================
// 대시보드 통계
// ============================================================================

/**
 * 검사 통계 조회
 */
export async function getInspectionStatistics(filters?: {
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 원재료 검사 통계
  const materialInspections = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      rejected: sql<number>`SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)`,
      pass: sql<number>`SUM(CASE WHEN inspection_result = 'pass' THEN 1 ELSE 0 END)`,
      fail: sql<number>`SUM(CASE WHEN inspection_result = 'fail' THEN 1 ELSE 0 END)`
    })
    .from(materialInspectionRecords);
  
  // 출하 검사 통계
  const shippingInspections = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      rejected: sql<number>`SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)`,
      pass: sql<number>`SUM(CASE WHEN inspection_result = 'pass' THEN 1 ELSE 0 END)`,
      fail: sql<number>`SUM(CASE WHEN inspection_result = 'fail' THEN 1 ELSE 0 END)`
    })
    .from(shippingInspectionRecords);
  
  // 위생 검사 통계
  const hygieneInspections = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      action_required: sql<number>`SUM(CASE WHEN status = 'action_required' THEN 1 ELSE 0 END)`,
      good: sql<number>`SUM(CASE WHEN result = 'good' THEN 1 ELSE 0 END)`,
      fair: sql<number>`SUM(CASE WHEN result = 'fair' THEN 1 ELSE 0 END)`,
      poor: sql<number>`SUM(CASE WHEN result = 'poor' THEN 1 ELSE 0 END)`
    })
    .from(hygieneInspectionRecords);
  
  return {
    material: materialInspections[0],
    shipping: shippingInspections[0],
    hygiene: hygieneInspections[0]
  };
}

/**
 * 배치 진행 현황 조회
 */
export async function getBatchProgress() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const { hBatches } = await import("../drizzle/schema");
  
  const batches = await db
    .select({
      total: sql<number>`COUNT(*)`,
      planned: sql<number>`SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END)`,
      running: sql<number>`SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)`,
      finished: sql<number>`SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END)`,
      shipped: sql<number>`SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END)`
    })
    .from(hBatches);
  
  return batches[0];
}

/**
 * CCP 이탈 알림 조회 (CCP 테이블이 없으므로 빈 배열 반환)
 */
export async function getCcpDeviations(filters?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  // CCP 테이블이 아직 구현되지 않음
  return [];
}

/**
 * 최근 활동 조회
 */
export async function getRecentActivities(limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const activities = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      userId: auditLogs.userId,
      userEmail: auditLogs.userEmail,
      description: auditLogs.description,
      createdAt: auditLogs.createdAt
    })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  
  return activities;
}

// 원재료 검사 수정
export async function updateMaterialInspectionRecord(
  id: number,
  data: {
    materialName?: string;
    lotNumber?: string;
    inspectionDate?: Date;
    inspector?: string;
    supplier?: string;
    appearance?: string; // 외관
    odor?: string; // 냄새
    color?: string; // 색상
    temperature?: number; // 온도
    result?: "pass" | "fail" | "conditional"; // 검사 결과
    inspectionResult?: "pass" | "fail";
    status?: "pending" | "completed" | "rejected";
    items?: Array<{
      id?: number;
      itemName: string;
      standard: string;
      result: string;
      passed: boolean;
      sortOrder: number;
    }>;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.transaction(async (tx) => {
    // 검사 기록 업데이트
    const updateData: any = {};
    if (data.materialName !== undefined) updateData.materialName = data.materialName;
    if (data.lotNumber !== undefined) updateData.lotNumber = data.lotNumber;
    if (data.inspectionDate !== undefined) updateData.inspectionDate = data.inspectionDate;
    if (data.inspector !== undefined) updateData.inspector = data.inspector;
    if (data.supplier !== undefined) updateData.supplier = data.supplier;
    if (data.appearance !== undefined) updateData.appearance = data.appearance;
    if (data.odor !== undefined) updateData.odor = data.odor;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.temperature !== undefined) updateData.temperature = data.temperature;
    if (data.result !== undefined) updateData.result = data.result;
    if (data.inspectionResult !== undefined) updateData.inspectionResult = data.inspectionResult;
    if (data.status !== undefined) updateData.status = data.status;
    updateData.updatedAt = new Date();

    await tx.update(materialInspectionRecords).set(updateData).where(eq(materialInspectionRecords.id, id));

    // 검사 항목 업데이트
    if (data.items) {
      // 기존 항목 삭제
      await tx.delete(materialInspectionItems).where(eq(materialInspectionItems.recordId, id));
      
      // 새 항목 추가
      if (data.items.length > 0) {
        await tx.insert(materialInspectionItems).values(
          data.items.map((item) => ({
            recordId: id,
            itemName: item.itemName,
            standard: item.standard,
            result: item.result,
            passed: (item.passed ? 'pass' : 'fail') as 'pass' | 'fail' | 'na',
            sortOrder: item.sortOrder
          }))
        );
      }
    }
  });
}

// 출하 검사 수정
export async function updateShippingInspectionRecord(
  id: number,
  data: {
    productName?: string;
    batchCode?: string;
    quantity?: number;
    inspectionDate?: Date;
    inspector?: string;
    inspectionResult?: "pass" | "fail";
    status?: "pending" | "completed" | "rejected";
    items?: Array<{
      id?: number;
      itemName: string;
      standard: string;
      result: string;
      passed: boolean;
      sortOrder: number;
    }>;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.transaction(async (tx) => {
    // 검사 기록 업데이트
    const updateData: any = {};
    if (data.productName !== undefined) updateData.productName = data.productName;
    if (data.batchCode !== undefined) updateData.batchCode = data.batchCode;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.inspectionDate !== undefined) updateData.inspectionDate = data.inspectionDate;
    if (data.inspector !== undefined) updateData.inspector = data.inspector;
    if (data.inspectionResult !== undefined) updateData.inspectionResult = data.inspectionResult;
    if (data.status !== undefined) updateData.status = data.status;
    updateData.updatedAt = new Date();

    await tx.update(shippingInspectionRecords).set(updateData).where(eq(shippingInspectionRecords.id, id));

    // 검사 항목 업데이트
    if (data.items) {
      // 기존 항목 삭제
      await tx.delete(shippingInspectionItems).where(eq(shippingInspectionItems.recordId, id));
      
      // 새 항목 추가
      if (data.items.length > 0) {
        await tx.insert(shippingInspectionItems).values(
          data.items.map((item) => ({
            recordId: id,
            itemName: item.itemName,
            standard: item.standard,
            result: item.result,
            passed: (item.passed ? 'pass' : 'fail') as 'pass' | 'fail' | 'na',
            sortOrder: item.sortOrder
          }))
        );
      }
    }
  });
}

// 위생 검사 수정
export async function updateHygieneInspectionRecord(
  id: number,
  data: {
    inspectionArea?: string;
    inspectionDate?: Date;
    inspector?: string;
    result?: "pass" | "fail";
    status?: "pending" | "completed" | "action_required";
    items?: Array<{
      id?: number;
      itemName: string;
      standard: string;
      result: string;
      passed: boolean;
      sortOrder: number;
    }>;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.transaction(async (tx) => {
    // 검사 기록 업데이트
    const updateData: any = {};
    if (data.inspectionArea !== undefined) updateData.inspectionArea = data.inspectionArea;
    if (data.inspectionDate !== undefined) updateData.inspectionDate = data.inspectionDate;
    if (data.inspector !== undefined) updateData.inspector = data.inspector;
    if (data.result !== undefined) updateData.result = data.result;
    if (data.status !== undefined) updateData.status = data.status;
    updateData.updatedAt = new Date();

    await tx.update(hygieneInspectionRecords).set(updateData).where(eq(hygieneInspectionRecords.id, id));

    // 검사 항목 업데이트
    if (data.items) {
      // 기존 항목 삭제
      await tx.delete(hygieneInspectionItems).where(eq(hygieneInspectionItems.recordId, id));
      
      // 새 항목 추가
      if (data.items.length > 0) {
        await tx.insert(hygieneInspectionItems).values(
          data.items.map((item) => ({
            recordId: id,
            itemName: item.itemName,
            standard: item.standard,
            result: item.result,
            passed: (item.passed ? 'pass' : 'fail') as 'pass' | 'fail' | 'na',
            sortOrder: item.sortOrder
          }))
        );
      }
    }
  });
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
  if (!db) throw new Error("Database not available");
  const { hCcpInstances } = await import("../drizzle/schema.js");
  const values: any = { ...data };
  if (data.tenantId) values.tenantId = data.tenantId;
  const result = await db.insert(hCcpInstances).values(values);
  return Number(result[0].insertId);
}

// ============================================================================
// 테스트용 헬퍼 함수
// ============================================================================

/**
 * 원재료 생성 (테스트용)
 */
export async function createMaterial(data: {
  materialCode: string;
  materialName: string;
  category?: string;
  categoryId?: number; // 카테고리 ID
  unit?: string;
  safetyStock?: number;
  expiryWarningDays?: number;
  isActive?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hMaterials } = await import("../drizzle/schema.js");
  const values: any = {
    materialCode: data.materialCode,
    materialName: data.materialName,
    category: data.category,
    categoryId: data.categoryId, // 카테고리 ID
    unit: data.unit || "KG",
    safetyStockLevel: data.safetyStock?.toString(),
    expiryWarningDays: data.expiryWarningDays,
    isActive: data.isActive !== undefined ? data.isActive : 1
  };
  if (data.tenantId) values.tenantId = data.tenantId;
  const result = await db.insert(hMaterials).values(values);
  return { id: Number(result[0].insertId) };
}

/**
 * 재고 LOT 조회 (ID로)
 */
export async function getInventoryLotById(lotId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hInventoryLots } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const [lot] = await db.select().from(hInventoryLots).where(eq(hInventoryLots.id, lotId));
  return lot;
}

/**
 * 배치별 원재료 투입 내역 조회
 */
export async function getBatchInputsByBatchId(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hBatchInputs, hMaterials, hInventoryLots } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const inputs = await db
    .select({
      input: hBatchInputs,
      material: hMaterials,
      lot: hInventoryLots
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .leftJoin(hInventoryLots, eq(hBatchInputs.lotId, hInventoryLots.id))
    .where(eq(hBatchInputs.batchId, batchId));
  
  return inputs;
}

/**
 * CCP 인스턴스 일괄 삭제
 */
export async function bulkDeleteCcpInstances(instanceIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hCcpInstances, hCcpRows } = await import("../drizzle/schema.js");
  const { inArray } = await import("drizzle-orm");
  
  // 1. CCP 행 삭제
  await db.delete(hCcpRows).where(inArray(hCcpRows.instanceId, instanceIds));
  
  // 2. CCP 인스턴스 삭제
  const result = await db.delete(hCcpInstances).where(inArray(hCcpInstances.id, instanceIds));
  
  return {
    deletedCount: instanceIds.length
  };
}

/**
 * 제품 CCP 매핑 업데이트
 */
export async function updateProductCcpMapping(productId: number, ccpTypes: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hProducts } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  await db.update(hProducts)
    .set({ defaultCcpTypes: ccpTypes as any })
    .where(eq(hProducts.id, productId));
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
  if (!db) throw new Error("Database not available");

  const { hProducts } = await import("../drizzle/schema.js");

  await db
    .update(hProducts)
    .set(data)
    .where(eq(hProducts.id, id));

  return { success: true };
}

// 제품 삭제 (소프트 삭제)
export async function deleteProduct(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hProducts } = await import("../drizzle/schema.js");
  const { and } = await import("drizzle-orm");

  const conditions: any[] = [eq(hProducts.id, id)];
  if (tenantId) conditions.push(eq(hProducts.tenantId, tenantId));
  await db
    .update(hProducts)
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
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hMaterials } = await import("../drizzle/schema.js");

  const updateData: any = {};
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
  if (!db) throw new Error("Database not available");

  const { hMaterials } = await import("../drizzle/schema.js");
  const { and } = await import("drizzle-orm");

  const conditions: any[] = [eq(hMaterials.id, id)];
  if (tenantId) conditions.push(eq(hMaterials.tenantId, tenantId));
  await db
    .update(hMaterials)
    .set({ isActive: 0 })
    .where(and(...conditions));

  return { success: true };
}


// ============================================================================
// 거래처 CRUD 함수
// ============================================================================

export async function getAllSuppliers(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  const { and } = await import("drizzle-orm");
  const conditions: any[] = [eq(hSuppliers.isActive, 1)];
  if (tenantId) conditions.push(eq(hSuppliers.tenantId, tenantId));
  return await db.select().from(hSuppliers).where(and(...conditions));
}

export async function getSupplierById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [supplier] = await db.select().from(hSuppliers).where(eq(hSuppliers.id, id));
  return supplier;
}

export async function createSupplier(data: {
  supplierName: string;
  supplierCode?: string;
  businessNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  supplierType?: string;
  certifications?: string;
  rating?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(hSuppliers).values(data as any);
  return result.insertId;
}

export async function updateSupplier(id: number, data: {
  supplierName?: string;
  supplierCode?: string;
  businessNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  supplierType?: string;
  certifications?: string;
  rating?: string;
  isActive?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(hSuppliers).set(data).where(eq(hSuppliers.id, id));
}

export async function deleteSupplier(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and } = await import("drizzle-orm");
  const conditions: any[] = [eq(hSuppliers.id, id)];
  if (tenantId) conditions.push(eq(hSuppliers.tenantId, tenantId));
  await db.update(hSuppliers).set({ isActive: 0 }).where(and(...conditions));
}

// ============================================================================
// 승인 워크플로우 관리 (Approval Workflow Management)
// ============================================================================

/**
 * 승인 요청 생성
 */
export async function createApprovalRequest(data: {
  tenantId: number;
  siteId: number;
  requestType: string;
  referenceType?: string;
  referenceId?: number;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  requestedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(hApprovalRequests).values({
    tenantId: data.tenantId,
    siteId: data.siteId,
    requestType: data.requestType,
    referenceType: data.referenceType,
    referenceId: data.referenceId,
    title: data.title,
    description: data.description,
    status: "pending_review",
    priority: data.priority || "medium",
    requestedBy: data.requestedBy,
    requestedAt: new Date()
  });

  return result.insertId;
}

/**
 * 승인 요청 목록 조회
 */
export async function getApprovalRequests(filters?: {
  tenantId: number;
  status?: string;
  requestType?: string;
  requestedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions: any[] = [];
  if (filters?.tenantId) {
    conditions.push(eq(hApprovalRequests.tenantId, filters.tenantId));
  }
  if (filters?.status) {
    conditions.push(eq(hApprovalRequests.status, filters.status as any));
  }
  if (filters?.requestType) {
    conditions.push(eq(hApprovalRequests.requestType, filters.requestType));
  }
  if (filters?.requestedBy) {
    conditions.push(eq(hApprovalRequests.requestedBy, filters.requestedBy));
  }
  
  // users 테이블 alias로 requester/reviewer/approver 이름 조인
  const requesterUser = aliasedTable(users, "requester_u");
  const reviewerUser = aliasedTable(users, "reviewer_u");
  const approverUser = aliasedTable(users, "approver_u");
  
  const baseQuery = db.select({
    id: hApprovalRequests.id,
    tenantId: hApprovalRequests.tenantId,
    siteId: hApprovalRequests.siteId,
    requestType: hApprovalRequests.requestType,
    referenceType: hApprovalRequests.referenceType,
    referenceId: hApprovalRequests.referenceId,
    title: hApprovalRequests.title,
    description: hApprovalRequests.description,
    status: hApprovalRequests.status,
    priority: hApprovalRequests.priority,
    requestedBy: hApprovalRequests.requestedBy,
    requestedAt: hApprovalRequests.requestedAt,
    reviewedBy: hApprovalRequests.reviewedBy,
    reviewedAt: hApprovalRequests.reviewedAt,
    reviewComments: hApprovalRequests.reviewComments,
    approvedBy: hApprovalRequests.approvedBy,
    approvedAt: hApprovalRequests.approvedAt,
    rejectedBy: hApprovalRequests.rejectedBy,
    rejectedAt: hApprovalRequests.rejectedAt,
    rejectionReason: hApprovalRequests.rejectionReason,
    notes: hApprovalRequests.notes,
    createdAt: hApprovalRequests.createdAt,
    requester: {
      id: requesterUser.id,
      name: requesterUser.name,
      email: requesterUser.email,
    },
    reviewer: {
      id: reviewerUser.id,
      name: reviewerUser.name,
      email: reviewerUser.email,
    },
    approver: {
      id: approverUser.id,
      name: approverUser.name,
      email: approverUser.email,
    },
    checklistFormData: hGenericChecklistRecords.formData,
  })
    .from(hApprovalRequests)
    .leftJoin(requesterUser, eq(hApprovalRequests.requestedBy, requesterUser.id))
    .leftJoin(reviewerUser, eq(hApprovalRequests.reviewedBy, reviewerUser.id))
    .leftJoin(approverUser, eq(hApprovalRequests.approvedBy, approverUser.id))
    .leftJoin(hGenericChecklistRecords, and(
      eq(hApprovalRequests.referenceId, hGenericChecklistRecords.id),
      or(eq(hApprovalRequests.referenceType, 'generic_checklist'), eq(hApprovalRequests.referenceType, 'checklist'))
    ));
  
  if (conditions.length > 0) {
    return await baseQuery
      .where(and(...conditions))
      .orderBy(desc(hApprovalRequests.requestedAt));
  }
  return await baseQuery
    .orderBy(desc(hApprovalRequests.requestedAt));
}
/**
 * 승인 요청 상세 조회
 */
export async function getApprovalRequestById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const requesterUser = aliasedTable(users, "req_detail");
  const reviewerUser = aliasedTable(users, "rev_detail");
  const approverUser = aliasedTable(users, "app_detail");
  
  const result = await db.select({
    id: hApprovalRequests.id,
    tenantId: hApprovalRequests.tenantId,
    siteId: hApprovalRequests.siteId,
    requestType: hApprovalRequests.requestType,
    referenceType: hApprovalRequests.referenceType,
    referenceId: hApprovalRequests.referenceId,
    title: hApprovalRequests.title,
    description: hApprovalRequests.description,
    status: hApprovalRequests.status,
    priority: hApprovalRequests.priority,
    requestedBy: hApprovalRequests.requestedBy,
    requestedAt: hApprovalRequests.requestedAt,
    reviewedBy: hApprovalRequests.reviewedBy,
    reviewedAt: hApprovalRequests.reviewedAt,
    reviewComments: hApprovalRequests.reviewComments,
    approvedBy: hApprovalRequests.approvedBy,
    approvedAt: hApprovalRequests.approvedAt,
    rejectedBy: hApprovalRequests.rejectedBy,
    rejectedAt: hApprovalRequests.rejectedAt,
    rejectionReason: hApprovalRequests.rejectionReason,
    notes: hApprovalRequests.notes,
    createdAt: hApprovalRequests.createdAt,
    requester: {
      id: requesterUser.id,
      name: requesterUser.name,
      email: requesterUser.email,
    },
    reviewer: {
      id: reviewerUser.id,
      name: reviewerUser.name,
      email: reviewerUser.email,
    },
    approver: {
      id: approverUser.id,
      name: approverUser.name,
      email: approverUser.email,
    },
  })
    .from(hApprovalRequests)
    .leftJoin(requesterUser, eq(hApprovalRequests.requestedBy, requesterUser.id))
    .leftJoin(reviewerUser, eq(hApprovalRequests.reviewedBy, reviewerUser.id))
    .leftJoin(approverUser, eq(hApprovalRequests.approvedBy, approverUser.id))
    .where(eq(hApprovalRequests.id, id))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}
/**
 * 승인 처리
 */
export async function approveRequest(requestId: number, approvedBy: number, notes?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 승인 요청 정보 먼저 조회 (배치ID, 문서ID 확인)
  const requestInfo = await db.select().from(hApprovalRequests).where(eq(hApprovalRequests.id, requestId)).limit(1);
  const request = requestInfo[0];
  
  // 2. 승인 상태 업데이트
  await db.update(hApprovalRequests)
    .set({
      status: "approved",
      approvedBy,
      approvedAt: new Date(),
      notes
    })
    .where(eq(hApprovalRequests.id, requestId));
  
  // 3. 승인 이력 기록
  await db.insert(hApprovalHistory).values({
    requestId,
    action: "approved",
    actionBy: approvedBy,
    actionAt: new Date(),
    comments: notes
  });
  
  // 4. [후처리] 관련 document_instances 상태 자동 업데이트
  if (request) {
    try {
      const rawConn = await getRawConnection();
      if (rawConn) {
        // 승인 요청에 연결된 document_instance가 있으면 상태 업데이트
        if ((request as any).documentInstanceId) {
          await rawConn.execute(
            "UPDATE document_instances SET status = 'approved', approver_id = ?, approved_at = NOW() WHERE id = ?",
            [approvedBy, (request as any).documentInstanceId]
          );
          console.log(`[approveRequest] document_instance ${(request as any).documentInstanceId} 상태를 approved로 업데이트`);
        }
        
        // 배치 관련 승인이면 - 해당 배치의 모든 승인 요청이 완료되었는지 확인
        if ((request as any).batchId) {
          const batchId = (request as any).batchId;
          
          // 해당 배치의 미승인 요청 수 확인
          const [pendingResult] = await rawConn.execute(
            "SELECT COUNT(*) as pending_count FROM h_approval_requests WHERE batch_id = ? AND status = 'pending'",
            [batchId]
          );
          const pendingCount = (pendingResult as any[])[0]?.pending_count || 0;
          
          if (pendingCount === 0) {
            // 모든 승인 완료 -> 해당 배치의 모든 document_instances도 approved로 업데이트
            await rawConn.execute(
              "UPDATE document_instances SET status = 'approved', approver_id = ?, approved_at = NOW() WHERE batch_id = ? AND status != 'approved'",
              [approvedBy, batchId]
            );
            console.log(`[approveRequest] 배치 ${batchId}의 모든 문서를 approved로 업데이트`);
          }
        }
      }
    } catch (postProcessError) {
      // 후처리 실패해도 승인 자체는 성공으로 처리
      console.error("[approveRequest] 후처리 오류 (승인은 정상 처리됨):", postProcessError);
    }
  }
  
  return { success: true };
}

/**
 * 거부 처리
 */
export async function rejectRequest(requestId: number, rejectedBy: number, rejectionReason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(hApprovalRequests)
    .set({
      status: "rejected",
      rejectedBy,
      rejectedAt: new Date(),
      rejectionReason
    })
    .where(eq(hApprovalRequests.id, requestId));

  // 승인 이력 기록
  await db.insert(hApprovalHistory).values({
    requestId,
    action: "rejected",
    actionBy: rejectedBy,
    actionAt: new Date(),
    comments: rejectionReason
  });

  return { success: true };
}

/**
 * 승인 이력 조회
 */
export async function getApprovalHistory(requestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select()
    .from(hApprovalHistory)
    .where(eq(hApprovalHistory.requestId, requestId))
    .orderBy(desc(hApprovalHistory.actionAt));
}

/**
 * 대기 중인 승인 요청 개수 조회
 */
export async function getPendingApprovalCount(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [eq(hApprovalRequests.status, "pending")];
  if (tenantId) {
    conditions.push(eq(hApprovalRequests.tenantId, tenantId));
  }

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(hApprovalRequests)
    .where(and(...conditions));

  return result[0]?.count || 0;
}

/**
 * 승인 요청 취소
 */
export async function cancelApprovalRequest(requestId: number, cancelledBy: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 요청 상태 확인
  const request = await getApprovalRequestById(requestId);
  if (!request) {
    throw new Error("Approval request not found");
  }
  if (!["pending", "pending_review", "pending_approval"].includes(request.status)) {
    throw new Error("승인완료/거부/취소된 요청은 취소할 수 없습니다");
  }

  // 취소 처리
  await db.update(hApprovalRequests)
    .set({
      status: "cancelled",
      notes: reason
    })
    .where(eq(hApprovalRequests.id, requestId));

  // 승인 이력 기록
  await db.insert(hApprovalHistory).values({
    requestId,
    action: "cancelled",
    actionBy: cancelledBy,
    actionAt: new Date(),
    comments: reason
  });

  return { success: true };
}

// ============================================================================
// 거래처 평가 관리 (Supplier Evaluation Management)
// ============================================================================

/**
 * 거래처 평가 생성
 */
export async function createSupplierEvaluation(data: {
  supplierId: number;
  evaluationDate: Date;
  evaluatedBy: number;
  qualityScore: number;
  deliveryScore: number;
  priceScore: number;
  serviceScore: number;
  responseScore: number;
  comments?: string;
  strengths?: string;
  weaknesses?: string;
  recommendations?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 전체 평균 점수 계산
  const overallScore = (
    data.qualityScore +
    data.deliveryScore +
    data.priceScore +
    data.serviceScore +
    data.responseScore
  ) / 5;

  const [result] = await db.insert(hSupplierEvaluations).values({
    ...data,
    overallScore: overallScore.toFixed(2)
  });

  // 거래처 등급 자동 업데이트
  await updateSupplierRating(data.supplierId);

  return result.insertId;
}

/**
 * 거래처 평가 목록 조회
 */
export async function getSupplierEvaluations(supplierId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query = db.select().from(hSupplierEvaluations);

  if (supplierId) {
    query = query.where(eq(hSupplierEvaluations.supplierId, supplierId)) as any;
  }

  return await query.orderBy(desc(hSupplierEvaluations.evaluationDate));
}

/**
 * 거래처 평가 통계 조회
 */
export async function getSupplierEvaluationStats(supplierId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const evaluations = await db
    .select()
    .from(hSupplierEvaluations)
    .where(eq(hSupplierEvaluations.supplierId, supplierId));

  if (evaluations.length === 0) {
    return null;
  }

  const avgQuality = evaluations.reduce((sum, e) => sum + e.qualityScore, 0) / evaluations.length;
  const avgDelivery = evaluations.reduce((sum, e) => sum + e.deliveryScore, 0) / evaluations.length;
  const avgPrice = evaluations.reduce((sum, e) => sum + e.priceScore, 0) / evaluations.length;
  const avgService = evaluations.reduce((sum, e) => sum + e.serviceScore, 0) / evaluations.length;
  const avgResponse = evaluations.reduce((sum, e) => sum + e.responseScore, 0) / evaluations.length;
  const avgOverall = evaluations.reduce((sum, e) => sum + Number(e.overallScore), 0) / evaluations.length;

  return {
    totalEvaluations: evaluations.length,
    avgQuality: avgQuality.toFixed(2),
    avgDelivery: avgDelivery.toFixed(2),
    avgPrice: avgPrice.toFixed(2),
    avgService: avgService.toFixed(2),
    avgResponse: avgResponse.toFixed(2),
    avgOverall: avgOverall.toFixed(2),
    latestEvaluation: evaluations[0]
  };
}

/**
 * 거래처 등급 자동 업데이트
 */
async function updateSupplierRating(supplierId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const stats = await getSupplierEvaluationStats(supplierId);

  if (!stats) return;

  const avgScore = Number(stats.avgOverall);
  let rating = "C";

  if (avgScore >= 4.5) {
    rating = "A+";
  } else if (avgScore >= 4.0) {
    rating = "A";
  } else if (avgScore >= 3.5) {
    rating = "B+";
  } else if (avgScore >= 3.0) {
    rating = "B";
  } else if (avgScore >= 2.5) {
    rating = "C+";
  }

  await db
    .update(hSuppliers)
    .set({ rating })
    .where(eq(hSuppliers.id, supplierId));
}


// ============================================================
// 알림 설정 (Notification Settings)
// ============================================================

export async function getNotificationSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [settings] = await db
    .select()
    .from(hNotificationSettings)
    .where(eq(hNotificationSettings.userId, userId))
    .limit(1);
  return settings;
}

export async function saveNotificationSettings(data: {
  userId: number;
  ccpDeviationEnabled?: number;
  stockLowEnabled?: number;
  expiryWarningEnabled?: number;
  batchCompletedEnabled?: number;
  approvalRequestEnabled?: number;
  inspectionCompletedEnabled?: number;
  systemNotificationEnabled?: number;
  emailEnabled?: number;
  smsEnabled?: number;
  businessHoursOnly?: number;
  businessHoursStart?: string;
  businessHoursEnd?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getNotificationSettings(data.userId);
  
  if (existing) {
    // 업데이트
    await db
      .update(hNotificationSettings)
      .set({
        ...data
      })
      .where(eq(hNotificationSettings.userId, data.userId));
  } else {
    // 생성
    await db.insert(hNotificationSettings).values(data);
  }
  
  return getNotificationSettings(data.userId);
}


// ============================================
// 대시보드 위젯 데이터 조회
// ============================================



/**
/**
 * 재고 부족 경고 조회
 */
export async function getLowStockWarnings() {
  const db = await getDb();
  if (!db) return [];
  
  const lowStockItems = await db
    .select({
      id: hInventory.id,
      materialId: hInventory.materialId,
      currentStock: hInventory.availableQuantity,
      minStock: hInventory.minStockLevel,
      unit: hInventory.unit
    })
    .from(hInventory)
    .where(
      and(
        sql`${hInventory.minStockLevel} IS NOT NULL`,
        sql`${hInventory.availableQuantity} < ${hInventory.minStockLevel}`
      )
    )
    .limit(10);
  
  return lowStockItems.map((item) => ({
    id: Number(item.id),
    materialName: `재료 ID: ${item.materialId}`,
    currentStock: Number(item.currentStock),
    minStock: Number(item.minStock),
    unit: item.unit
  }));
}

/**
 * 유통기한 임박 원재료 조회 (7일 이내)
 */
export async function getExpiringMaterials(tenantId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  const today = new Date();
  const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const expiringLots = await db
    .select({
      id: hInventoryLots.id,
      lotNumber: hInventoryLots.lotNumber,
      materialId: hInventoryLots.materialId,
      quantity: hInventoryLots.availableQuantity,
      unit: hInventoryLots.unit,
      expiryDate: hInventoryLots.expiryDate,
      materialName: hMaterials.materialName
    })
    .from(hInventoryLots)
    .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(
      and(
        sql`${hInventoryLots.expiryDate} IS NOT NULL`,
        lte(hInventoryLots.expiryDate, sevenDaysLater),
        gte(hInventoryLots.expiryDate, today),
        tenantId ? eq(hMaterials.tenantId, tenantId) : undefined
      )
    )
    .orderBy(hInventoryLots.expiryDate)
    .limit(10);
  
  return expiringLots.map((lot) => ({
    materialName: lot.materialName || `재료 ID: ${lot.materialId}`,
    lotNumber: lot.lotNumber,
    expiryDate: lot.expiryDate ? new Date(lot.expiryDate).toISOString().split('T')[0] : '',
    quantity: Number(lot.quantity),
    unit: lot.unit
  }));
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
  if (!db) throw new Error("Database not available");
  
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
  });
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
    .orderBy(sql`DATE(${hCcpDeviations.deviationDate})`) as any;

  return deviations.map((d: any) => ({
    date: new Date(d.date).toISOString().split("T")[0],
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


// 배치 원재료 관리 함수는 기존 addMaterialInputToBatch, getBatchInputsWithDetails 등으로 제공됨


// ============ 대시보드 위젯 데이터 조회 ============
export async function getProductionTrend(days: number = 7) {
  const db = await getDb();
  if (!db) return { trend: [], total: 0 };
  
  const { hBatches } = await import("../drizzle/schema.js");
  const { gte, sql } = await import("drizzle-orm");
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const batches = await db
    .select({
      date: sql<string>`DATE(${hBatches.createdAt})`.as('date'),
      count: sql<number>`COUNT(*)`.as('count')
    })
    .from(hBatches)
    .where(gte(hBatches.createdAt, startDate))
    .groupBy(sql`DATE(${hBatches.createdAt})`)
    .orderBy(sql`DATE(${hBatches.createdAt})`) as any;
  
  const total = batches.reduce((sum: number, b: any) => sum + Number(b.count), 0);
  
  return {
    trend: batches.map((b: any) => ({
      date: b.date,
      count: Number(b.count)
    })),
    total
  };
}

export async function getMaterialConsumption() {
  const db = await getDb();
  if (!db) return [];
  
  const { hBatchInputs } = await import("../drizzle/schema.js");
  const { sql } = await import("drizzle-orm");
  
  const consumption = await db
    .select({
      materialId: hBatchInputs.materialId,
      totalQuantity: sql<string>`SUM(${hBatchInputs.actualQuantity})`,
      unit: hBatchInputs.unit
    })
    .from(hBatchInputs)
    .groupBy(hBatchInputs.materialId, hBatchInputs.unit)
    .orderBy(sql`SUM(${hBatchInputs.actualQuantity}) DESC`)
    .limit(10);
  
  return consumption.map((c) => ({
    materialId: Number(c.materialId),
    materialName: `원재료 ID: ${c.materialId}`,
    totalQuantity: parseFloat(c.totalQuantity || "0"),
    unit: c.unit
  }));
}

export async function getMonthlyCcpDeviationRate(days: number = 30) {
  const db = await getDb();
  if (!db) return { total: 0, deviations: 0, rate: 0 };
  
  const { hCcpDeviations } = await import("../drizzle/schema.js");
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
// 배치 비용 계산
// ============================================================================

/**
 * 배치별 원재료 투입 비용 계산
 */
export async function getBatchCost(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatchInputs, hMaterials } = await import("../drizzle/schema.js");
  const { eq, sql } = await import("drizzle-orm");
  
  // 배치 원재료 투입 내역 조회 (원재료 정보 포함)
  const inputs = await db
    .select({
      input: hBatchInputs,
      material: hMaterials
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(eq(hBatchInputs.batchId, batchId));
  
  // 각 원재료별 비용 계산
  const materialCosts = inputs.map((item) => {
    const quantity = parseFloat(String(item.input.actualQuantity || item.input.plannedQuantity));
    const unitPrice = item.material?.unitPrice ? parseFloat(String(item.material.unitPrice)) : 0;
    const cost = quantity * unitPrice;
    
    return {
      materialId: item.input.materialId,
      materialName: item.material?.materialName || "Unknown",
      quantity,
      unit: item.input.unit,
      unitPrice,
      totalCost: cost
    };
  });
  
  // 총 비용 계산
  const totalCost = materialCosts.reduce((sum, item) => sum + item.totalCost, 0);
  
  return {
    batchId,
    materialCosts,
    totalCost
  };
}

/**
 * 여러 배치의 비용 조회 (배치 목록 페이지용)
 */
export async function getBatchCostSummary(batchIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatchInputs, hMaterials } = await import("../drizzle/schema.js");
  const { inArray, eq, sql } = await import("drizzle-orm");
  
  if (batchIds.length === 0) return [];
  
  // 각 배치별 총 비용 계산
  const result = await db
    .select({
      batchId: hBatchInputs.batchId,
      totalCost: sql<string>`SUM(${hBatchInputs.actualQuantity} * ${hMaterials.unitPrice})`
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(inArray(hBatchInputs.batchId, batchIds))
    .groupBy(hBatchInputs.batchId);
  
  return result.map((r) => ({
    batchId: Number(r.batchId),
    totalCost: parseFloat(r.totalCost || "0")
  }));
}

// ============================================================================
// 데이터 export용 조회 함수
// ============================================================================

/**
 * CCP 점검 이력 조회 (export용)
 */
export async function getCcpInspectionHistory(filters?: {
  startDate?: Date;
  endDate?: Date;
  siteId?: number;
  ccpType?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hCcpInstances, hCcpRows, hBatches } = await import("../drizzle/schema.js");
  const { and, gte, lte, eq, desc } = await import("drizzle-orm");
  
  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(hCcpRows.createdAt, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hCcpRows.createdAt, filters.endDate));
  }
  if (filters?.siteId) {
    conditions.push(eq(hCcpInstances.siteId, filters.siteId));
  }
  if (filters?.ccpType) {
    conditions.push(eq(hCcpInstances.ccpType, filters.ccpType));
  }
  
  const rows = await db
    .select({
      rowId: hCcpRows.id,
      instanceId: hCcpInstances.id,
      batchCode: hBatches.batchCode,
      ccpType: hCcpInstances.ccpType,
      productName: hCcpInstances.productName,
      workDate: hCcpInstances.workDate,
      tempC: hCcpRows.tempC,
      durationMin: hCcpRows.durationMin,
      pressureBar: hCcpRows.pressureBar,
      result: hCcpRows.result,
      note: hCcpRows.note,
      measuredAt: hCcpRows.measuredAt,
      checkedAt: hCcpRows.createdAt
    })
    .from(hCcpRows)
    .leftJoin(hCcpInstances, eq(hCcpRows.instanceId, hCcpInstances.id))
    .leftJoin(hBatches, eq(hCcpInstances.batchId, hBatches.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(hCcpRows.createdAt));
  
  return rows;
}

// TODO: 거래처 평가 테이블 구현 후 추가 예정

// TODO: 승인 워크플로우 테이블 구현 후 추가 예정

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
  if (!db) throw new Error("Database not available");
  
  const { hCcpDeviations } = await import("../drizzle/schema.js");
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
  if (!db) throw new Error("Database not available");
  
  const { hCcpDeviations, hCcpInstances, hProductsV2 } = await import("../drizzle/schema.js");
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
  if (!db) throw new Error("Database not available");
  
  const { hCcpDeviations, hCcpInstances } = await import("../drizzle/schema.js");
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

// ============================================================================
// 배치 수익성 분석 함수
// ============================================================================

/**
 * 배치 수익성 조회 (원가, 매출, 수익률)
 */
export async function getBatchProfitability(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatches } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  // 배치 정보 조회
  const batch = await db.select().from(hBatches).where(eq(hBatches.id, batchId)).limit(1);
  if (batch.length === 0) {
    return null;
  }
  
  // 배치 비용 조회
  const costResult = await getBatchCost(batchId);
  if (!costResult) {
    return null;
  }
  
  const revenue = batch[0].revenue ? parseFloat(batch[0].revenue) : 0;
  const cost = costResult.totalCost;
  const profit = revenue - cost;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  
  return {
    batchId,
    batchCode: batch[0].batchCode,
    productId: batch[0].productId,
    revenue,
    cost,
    profit,
    profitMargin,
    materialCosts: costResult.materialCosts
  };
}

/**
 * 제품별 수익성 통계 조회
 */
export async function getProfitabilityByProduct(filters?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatches, hProductsV2 } = await import("../drizzle/schema.js");
  const { and, gte, lte, eq, sql, isNotNull } = await import("drizzle-orm");
  
  const conditions = [isNotNull(hBatches.revenue)];
  if (filters?.startDate) {
    conditions.push(gte(hBatches.plannedDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hBatches.plannedDate, filters.endDate));
  }
  
  const stats = await db
    .select({
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      batchCount: sql<number>`COUNT(*)`,
      totalRevenue: sql<number>`SUM(${hBatches.revenue})`,
      avgRevenue: sql<number>`AVG(${hBatches.revenue})`
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .groupBy(hBatches.productId, hProductsV2.productName)
    .orderBy(sql`SUM(${hBatches.revenue}) DESC`);
  
  // 각 제품의 평균 비용 계산
  const result = [];
  for (const stat of stats) {
    // 해당 제품의 모든 배치 비용 조회
    const batches = await db
      .select({ id: hBatches.id })
      .from(hBatches)
      .where(
        and(
          eq(hBatches.productId, stat.productId),
          isNotNull(hBatches.revenue),
          filters?.startDate ? gte(hBatches.plannedDate, filters.startDate) : undefined,
          filters?.endDate ? lte(hBatches.plannedDate, filters.endDate) : undefined
        )
      );
    
    let totalCost = 0;
    for (const batch of batches) {
      const costResult = await getBatchCost(batch.id);
      if (costResult) {
        totalCost += costResult.totalCost;
      }
    }
    
    const avgCost = batches.length > 0 ? totalCost / batches.length : 0;
    const totalProfit = stat.totalRevenue - totalCost;
    const avgProfit = stat.avgRevenue - avgCost;
    const profitMargin = stat.avgRevenue > 0 ? (avgProfit / stat.avgRevenue) * 100 : 0;
    
    result.push({
      productId: stat.productId,
      productName: stat.productName,
      batchCount: stat.batchCount,
      totalRevenue: stat.totalRevenue,
      avgRevenue: stat.avgRevenue,
      avgCost,
      avgProfit,
      profitMargin,
      totalProfit
    });
  }
  
  return result;
}

/**
 * 배치 매출액 업데이트
 */
export async function updateBatchRevenue(batchId: number, revenue: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatches } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  await db
    .update(hBatches)
    .set({ revenue: revenue.toString() })
    .where(eq(hBatches.id, batchId));
  
  return true;
}

// ============================================================================
// 시스템 설정 함수
// ============================================================================

/**
 * 모든 시스템 설정 조회
 */
export async function getSystemSettings() {
  const db = await getDb();
  if (!db) return [];
  const { hSystemSettings } = await import("../drizzle/schema.js");
  return await db.select().from(hSystemSettings);
}

/**
 * 특정 설정 값 조회
 */
export async function getSystemSetting(key: string) {
  const db = await getDb();
  if (!db) return null;
  const { hSystemSettings } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  const results = await db
    .select()
    .from(hSystemSettings)
    .where(eq(hSystemSettings.settingKey, key))
    .limit(1);
  return results[0] || null;
}

/**
 * 시스템 설정 업데이트 또는 생성
 */
export async function upsertSystemSetting(
  key: string,
  value: string,
  description: string,
  userId: number
) {
  const db = await getDb();
  if (!db) return false;
  const { hSystemSettings } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const existing = await getSystemSetting(key);
  
  if (existing) {
    await db
      .update(hSystemSettings)
      .set({
        settingValue: value,
        description,
        updatedBy: userId
      })
      .where(eq(hSystemSettings.settingKey, key));
  } else {
    await db.insert(hSystemSettings).values({
      settingKey: key,
      settingValue: value,
      description,
      updatedBy: userId
    });
  }
  
  return true;
}

// ============================================================================
// 재고 소비 패턴 분석 함수 (ERP 모듈 구현 후 재추가)
// ============================================================================

// ============================================================================
// 재고 회전율 분석 함수
// ============================================================================

/**
 * 원재료별 입출고 이력 조회
 */
export async function getMaterialTransactionHistory(materialId: number, filters?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hMaterialReceivings, hBatchInputs, hMaterials } = await import("../drizzle/schema.js");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");
  
  // 입고 이력 (Material Receivings)
  const conditions = [eq(hMaterialReceivings.materialId, materialId)];
  if (filters?.startDate) {
    conditions.push(gte(hMaterialReceivings.createdAt, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hMaterialReceivings.createdAt, filters.endDate));
  }
  
  const inboundHistory = await db
    .select({
      date: hMaterialReceivings.createdAt,
      type: sql<string>`'inbound'`,
      quantity: sql<number>`CAST(${hMaterialReceivings.quantity} AS DECIMAL(10,2))`,
      lotNumber: hMaterialReceivings.lotNumber
    })
    .from(hMaterialReceivings)
    .where(and(...conditions));
  
  // 출고 이력 (배치 투입)
  const outboundConditions = [eq(hBatchInputs.materialId, materialId)];
  if (filters?.startDate) {
    outboundConditions.push(gte(hBatchInputs.createdAt, filters.startDate));
  }
  if (filters?.endDate) {
    outboundConditions.push(lte(hBatchInputs.createdAt, filters.endDate));
  }
  
  const outboundHistory = await db
    .select({
      date: hBatchInputs.createdAt,
      type: sql<string>`'outbound'`,
      quantity: sql<number>`CAST(${hBatchInputs.actualQuantity} AS DECIMAL(10,2))`,
      batchId: hBatchInputs.batchId
    })
    .from(hBatchInputs)
    .where(and(...outboundConditions));
  
  return {
    inbound: inboundHistory,
    outbound: outboundHistory
  };
}

/**
 * 재고 회전율 계산
 */
export async function getInventoryTurnoverRate(filters?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hMaterials, hMaterialReceivings, hBatchInputs } = await import("../drizzle/schema.js");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");
  
  // 모든 원재료 조회
  const materials = await db.select().from(hMaterials);
  
  const result = [];
  for (const material of materials) {
    // 기간 내 입고량
    const inboundConditions = [eq(hMaterialReceivings.materialId, material.id)];
    if (filters?.startDate) {
      inboundConditions.push(gte(hMaterialReceivings.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      inboundConditions.push(lte(hMaterialReceivings.createdAt, filters.endDate));
    }
    
    const inboundResult = await db
      .select({
        totalInbound: sql<number>`COALESCE(SUM(CAST(quantity AS DECIMAL(10,2))), 0)`
      })
      .from(hMaterialReceivings)
      .where(and(...inboundConditions));
    
    // 기간 내 출고량
    const outboundConditions = [eq(hBatchInputs.materialId, material.id)];
    if (filters?.startDate) {
      outboundConditions.push(gte(hBatchInputs.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      outboundConditions.push(lte(hBatchInputs.createdAt, filters.endDate));
    }
    
    const outboundResult = await db
      .select({
        totalOutbound: sql<number>`COALESCE(SUM(CAST(actual_quantity AS DECIMAL(10,2))), 0)`
      })
      .from(hBatchInputs)
      .where(and(...outboundConditions));
    
    // 현재 재고량 (총 입고 - 총 출고)
    const totalInboundAll = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(quantity AS DECIMAL(10,2))), 0)`
      })
      .from(hMaterialReceivings)
      .where(eq(hMaterialReceivings.materialId, material.id));
    
    const totalOutboundAll = await db
      .select({
        total: sql<number>`COALESCE(SUM(CAST(actual_quantity AS DECIMAL(10,2))), 0)`
      })
      .from(hBatchInputs)
      .where(eq(hBatchInputs.materialId, material.id));
    
    const totalInbound = inboundResult[0]?.totalInbound || 0;
    const totalOutbound = outboundResult[0]?.totalOutbound || 0;
    const currentStock = (totalInboundAll[0]?.total || 0) - (totalOutboundAll[0]?.total || 0);
    
    // 평균 재고 = (기초 재고 + 기말 재고) / 2
    // 기초 재고 = 현재 재고 + 출고량 - 입고량
    const beginningStock = currentStock + totalOutbound - totalInbound;
    const avgStock = (beginningStock + currentStock) / 2;
    
    // 회전율 = 출고량 / 평균 재고
    const turnoverRate = avgStock > 0 ? totalOutbound / avgStock : 0;
    
    // 회전 일수 = 기간 일수 / 회전율
    const periodDays = filters?.startDate && filters?.endDate
      ? Math.ceil((filters.endDate.getTime() - filters.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : 365;
    const turnoverDays = turnoverRate > 0 ? periodDays / turnoverRate : 0;
    
    result.push({
      materialId: material.id,
      materialName: material.materialName,
      currentStock: parseFloat(currentStock.toString()),
      totalInbound: parseFloat(totalInbound.toString()),
      totalOutbound: parseFloat(totalOutbound.toString()),
      avgStock: parseFloat(avgStock.toFixed(1)),
      turnoverRate: parseFloat(turnoverRate.toFixed(2)),
      turnoverDays: parseFloat(turnoverDays.toFixed(1))
    });
  }
  
  return result.sort((a, b) => b.turnoverRate - a.turnoverRate);
}

/**
 * 장기 재고 항목 식별
 */
export async function getSlowMovingItems(thresholdDays: number = 90) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hMaterialReceivings, hMaterials } = await import("../drizzle/schema.js");
  const { eq, sql, and, gt } = await import("drizzle-orm");
  
  // 현재 날짜 기준으로 thresholdDays 이상 경과한 입고 조회
  const slowMovingItems = await db
    .select({
      lotId: hMaterialReceivings.id,
      lotNumber: hMaterialReceivings.lotNumber,
      materialId: hMaterialReceivings.materialId,
      materialName: hMaterials.materialName,
      currentQuantity: sql<number>`CAST(${hMaterialReceivings.quantity} AS DECIMAL(10,2))`,
      createdAt: hMaterialReceivings.createdAt,
      daysSinceCreation: sql<number>`DATEDIFF(NOW(), ${hMaterialReceivings.createdAt})`
    })
    .from(hMaterialReceivings)
    .leftJoin(hMaterials, eq(hMaterialReceivings.materialId, hMaterials.id))
    .where(
      and(
        sql`CAST(${hMaterialReceivings.quantity} AS DECIMAL(10,2)) > 0`,
        sql`DATEDIFF(NOW(), ${hMaterialReceivings.createdAt}) >= ${thresholdDays}`
      )
    )
    .orderBy(sql`DATEDIFF(NOW(), ${hMaterialReceivings.createdAt}) DESC`);
  
  return slowMovingItems;
}

// 원재료 단가 업데이트 (이력 자동 저장)
export async function updateMaterialPrice(id: number, unitPrice: number, changedBy?: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hMaterials, hMaterialPriceHistory } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  // 기존 단가 조회
  const [material] = await db
    .select({ unitPrice: hMaterials.unitPrice })
    .from(hMaterials)
    .where(eq(hMaterials.id, id));
  
  const oldPrice = material?.unitPrice ? parseFloat(material.unitPrice) : null;
  
  // 단가 업데이트
  await db
    .update(hMaterials)
    .set({ unitPrice: unitPrice.toString() })
    .where(eq(hMaterials.id, id));
  
  // 이력 저장
  await db.insert(hMaterialPriceHistory).values({
    materialId: id,
    oldPrice: oldPrice?.toString(),
    newPrice: unitPrice.toString(),
    changedBy: changedBy || null,
    reason: reason || null
  });
  
  return { success: true };
}

// 재고 회전율 알림 생성
export async function createInventoryTurnoverAlert(materialId: number, turnoverRate: number, thresholdRate: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hNotifications, hMaterials } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  // 원재료 정보 조회
  const material = await db
    .select()
    .from(hMaterials)
    .where(eq(hMaterials.id, materialId))
    .limit(1);
  
  if (material.length === 0) {
    return { success: false, message: "원재료를 찾을 수 없습니다." };
  }
  
  const materialName = material[0].materialName;
  
  // 알림 생성 (관리자에게 userId=1로 가정)
  await db.insert(hNotifications).values({
    userId: 1,
    notificationType: "inventory_turnover",
    title: `재고 회전율 경고: ${materialName}`,
    message: `원재료 "${materialName}"의 회전율이 ${turnoverRate.toFixed(2)}회로, 설정된 임계값 ${thresholdRate}회 이하입니다. 재고 최적화가 필요합니다.`,
    priority: "high",
    isRead: 0
  });
  
  return { success: true };
}

// 월별 수익률 추이 조회
export async function getProfitabilityTrendByMonth(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatches, hBatchInputs, hMaterials } = await import("../drizzle/schema.js");
  const { sql, gte, lte, and, isNotNull, eq } = await import("drizzle-orm");
  
  let conditions = [isNotNull(hBatches.revenue)];
  if (startDate) {
    conditions.push(gte(hBatches.plannedDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(hBatches.plannedDate, endDate));
  }
  
  // 월별 매출 및 비용 집계
  const monthlyTrend = await db
    .select({
      month: sql<string>`DATE_FORMAT(${hBatches.plannedDate}, '%Y-%m')`,
      totalRevenue: sql<number>`SUM(CAST(${hBatches.revenue} AS DECIMAL(15,2)))`,
      totalCost: sql<number>`
        COALESCE(SUM(
          (SELECT SUM(CAST(bi.quantity AS DECIMAL(15,2)) * CAST(m.unit_price AS DECIMAL(15,2)))
           FROM h_batch_inputs bi
           JOIN h_materials m ON bi.material_id = m.id
           WHERE bi.batch_id = ${hBatches.id})
        ), 0)
      `,
      batchCount: sql<number>`COUNT(*)`
    })
    .from(hBatches)
    .where(and(...conditions))
    .groupBy(sql`DATE_FORMAT(${hBatches.plannedDate}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${hBatches.plannedDate}, '%Y-%m')`);
  
  // 이익률 계산
  const result = monthlyTrend.map(row => ({
    ...row,
    profitMargin: row.totalRevenue > 0 
      ? ((row.totalRevenue - row.totalCost) / row.totalRevenue) * 100 
      : 0
  }));
  
  return result;
}

// 분기별 수익률 추이 조회
export async function getProfitabilityTrendByQuarter(startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hBatches, hBatchInputs, hMaterials } = await import("../drizzle/schema.js");
  const { sql, gte, lte, and, isNotNull, eq } = await import("drizzle-orm");
  
  let conditions = [isNotNull(hBatches.revenue)];
  if (startDate) {
    conditions.push(gte(hBatches.plannedDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(hBatches.plannedDate, endDate));
  }
  
  // 분기별 매출 및 비용 집계
  const quarterlyTrend = await db
    .select({
      quarter: sql<string>`CONCAT(YEAR(${hBatches.plannedDate}), '-Q', QUARTER(${hBatches.plannedDate}))`,
      totalRevenue: sql<number>`SUM(CAST(${hBatches.revenue} AS DECIMAL(15,2)))`,
      totalCost: sql<number>`
        COALESCE(SUM(
          (SELECT SUM(CAST(bi.quantity AS DECIMAL(15,2)) * CAST(m.unit_price AS DECIMAL(15,2)))
           FROM h_batch_inputs bi
           JOIN h_materials m ON bi.material_id = m.id
           WHERE bi.batch_id = ${hBatches.id})
        ), 0)
      `,
      batchCount: sql<number>`COUNT(*)`
    })
    .from(hBatches)
    .where(and(...conditions))
    .groupBy(sql`CONCAT(YEAR(${hBatches.plannedDate}), '-Q', QUARTER(${hBatches.plannedDate}))`)
    .orderBy(sql`CONCAT(YEAR(${hBatches.plannedDate}), '-Q', QUARTER(${hBatches.plannedDate}))`);
  
  // 이익률 계산
  const result = quarterlyTrend.map(row => ({
    ...row,
    profitMargin: row.totalRevenue > 0 
      ? ((row.totalRevenue - row.totalCost) / row.totalRevenue) * 100 
      : 0
  }));
  
  return result;
}

// 원재료 단가 이력 조회
export async function getMaterialPriceHistory(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hMaterialPriceHistory } = await import("../drizzle/schema.js");
  const { eq, desc } = await import("drizzle-orm");
  
  const history = await db
    .select()
    .from(hMaterialPriceHistory)
    .where(eq(hMaterialPriceHistory.materialId, materialId))
    .orderBy(desc(hMaterialPriceHistory.changedAt));
  
  return history;
}

// 재고 회전율 임계값 설정
export async function setInventoryTurnoverThreshold(materialId: number, thresholdRate: number, alertEnabled: boolean = true) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hInventoryTurnoverSettings } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  // 기존 설정 확인
  const [existing] = await db
    .select()
    .from(hInventoryTurnoverSettings)
    .where(eq(hInventoryTurnoverSettings.materialId, materialId));
  
  if (existing) {
    // 업데이트
    await db
      .update(hInventoryTurnoverSettings)
      .set({ 
        thresholdRate: thresholdRate.toString(),
        alertEnabled: alertEnabled ? 1 : 0
      })
      .where(eq(hInventoryTurnoverSettings.materialId, materialId));
  } else {
    // 신규 생성
    await db.insert(hInventoryTurnoverSettings).values({
      materialId,
      thresholdRate: thresholdRate.toString(),
      alertEnabled: alertEnabled ? 1 : 0
    });
  }
  
  return { success: true };
}

// 재고 회전율 임계값 조회
export async function getInventoryTurnoverSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hInventoryTurnoverSettings, hMaterials } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  const settings = await db
    .select({
      id: hInventoryTurnoverSettings.id,
      materialId: hInventoryTurnoverSettings.materialId,
      materialName: hMaterials.materialName,
      thresholdRate: hInventoryTurnoverSettings.thresholdRate,
      alertEnabled: hInventoryTurnoverSettings.alertEnabled
    })
    .from(hInventoryTurnoverSettings)
    .leftJoin(hMaterials, eq(hInventoryTurnoverSettings.materialId, hMaterials.id));
  
  return settings;
}

/**
 * 지수 평활법 (Exponential Smoothing) 계산
 * @param data 과거 데이터 배열
 * @param alpha 평활 계수 (0~1, 기본값 0.3)
 * @returns 예측값
 */
function exponentialSmoothing(data: number[], alpha: number = 0.3): number {
  if (data.length === 0) return 0;
  if (data.length === 1) return data[0];
  
  let smoothed = data[0];
  for (let i = 1; i < data.length; i++) {
    smoothed = alpha * data[i] + (1 - alpha) * smoothed;
  }
  
  return smoothed;
}

/**
 * 트렌드 계산 (선형 회귀)
 * @param data 과거 데이터 배열
 * @returns 트렌드 기울기
 */
function calculateTrend(data: number[]): number {
  if (data.length < 2) return 0;
  
  const n = data.length;
  const sumX = (n * (n - 1)) / 2; // 0 + 1 + 2 + ... + (n-1)
  const sumY = data.reduce((sum, val) => sum + val, 0);
  const sumXY = data.reduce((sum, val, idx) => sum + idx * val, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // 0^2 + 1^2 + 2^2 + ... + (n-1)^2
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
}

// 배치 수익성 예측 (지수 평활법 + 트렌드 기반)
export async function getProfitabilityForecast() {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  
  // 과거 3개월 데이터 조회
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  const batches = await db
    .select()
    .from(hBatches)
    .where(sql`${hBatches.plannedDate} >= ${threeMonthsAgo.toISOString().split('T')[0]}`)
    .orderBy(hBatches.plannedDate);
  
  if (batches.length === 0) {
    return { forecast: null, historicalData: [] };
  }
  
  // 월별 수익률 계산
  const monthlyData: { [key: string]: { totalRevenue: number; totalCost: number; count: number } } = {};
  
  for (const batch of batches) {
    const month = batch.plannedDate.toISOString().substring(0, 7); // YYYY-MM
    const revenue = batch.revenue ? parseFloat(batch.revenue) : 0;
    
    // 배치 비용 계산
    const inputs = await db
      .select({
        quantity: sql<string>`CAST(${hBatchInputs.actualQuantity} AS CHAR)`,
        unitPrice: hMaterials.unitPrice
      })
      .from(hBatchInputs)
      .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
      .where(eq(hBatchInputs.batchId, batch.id));
    
    const cost = inputs.reduce((sum, input) => {
      const qty = parseFloat(input.quantity || "0");
      const price = input.unitPrice ? parseFloat(input.unitPrice) : 0;
      return sum + (qty * price);
    }, 0);
    
    if (!monthlyData[month]) {
      monthlyData[month] = { totalRevenue: 0, totalCost: 0, count: 0 };
    }
    
    monthlyData[month].totalRevenue += revenue;
    monthlyData[month].totalCost += cost;
    monthlyData[month].count += 1;
  }
  
  // 월별 수익률 계산
  const historicalData = Object.entries(monthlyData).map(([month, data]) => {
    const profitMargin = data.totalCost > 0
      ? ((data.totalRevenue - data.totalCost) / data.totalRevenue) * 100
      : 0;
    return {
      month,
      totalRevenue: data.totalRevenue,
      totalCost: data.totalCost,
      profitMargin: Math.round(profitMargin * 100) / 100,
      batchCount: data.count
    };
  });
  
  // 지수 평활법 + 트렌드 기반 예측
  const revenueData = historicalData.map(d => d.totalRevenue);
  const costData = historicalData.map(d => d.totalCost);
  const profitMarginData = historicalData.map(d => d.profitMargin);
  
  // 지수 평활법 적용 (alpha = 0.3)
  const smoothedRevenue = exponentialSmoothing(revenueData, 0.3);
  const smoothedCost = exponentialSmoothing(costData, 0.3);
  const smoothedProfitMargin = exponentialSmoothing(profitMarginData, 0.3);
  
  // 트렌드 계산
  const revenueTrend = calculateTrend(revenueData);
  const costTrend = calculateTrend(costData);
  const profitMarginTrend = calculateTrend(profitMarginData);
  
  // 예측값 = 평활값 + 트렌드
  const predictedRevenue = smoothedRevenue + revenueTrend;
  const predictedCost = smoothedCost + costTrend;
  const predictedProfitMargin = smoothedProfitMargin + profitMarginTrend;
  
  // 다음 달 예측
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const forecastMonth = nextMonth.toISOString().substring(0, 7);
  
  return {
    forecast: {
      month: forecastMonth,
      predictedRevenue: Math.round(predictedRevenue),
      predictedCost: Math.round(predictedCost),
      predictedProfitMargin: Math.round(predictedProfitMargin * 100) / 100
    },
    historicalData
  };
}

// 재고 회전율 임계값 기반 자동 알림 생성
export async function checkAndCreateTurnoverAlerts() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hInventoryTurnoverSettings, hMaterials, hNotifications } = await import("../drizzle/schema.js");
  const { eq, and, sql } = await import("drizzle-orm");
  
  // alertEnabled가 활성화된 설정만 조회
  const settings = await db
    .select({
      materialId: hInventoryTurnoverSettings.materialId,
      materialName: hMaterials.materialName,
      thresholdRate: hInventoryTurnoverSettings.thresholdRate
    })
    .from(hInventoryTurnoverSettings)
    .leftJoin(hMaterials, eq(hInventoryTurnoverSettings.materialId, hMaterials.id))
    .where(eq(hInventoryTurnoverSettings.alertEnabled, 1));
  
  const alertsCreated: Array<{ materialId: number; materialName: string; turnoverRate: number; threshold: number }> = [];
  
  for (const setting of settings) {
    if (!setting.materialId || !setting.thresholdRate) continue;
    
    const threshold = parseFloat(setting.thresholdRate);
    
    // 해당 원재료의 회전율 계산
    const turnoverDataList = await getInventoryTurnoverRate();
    const turnoverData = turnoverDataList.find(item => item.materialId === setting.materialId);
    
    if (!turnoverData || turnoverData.turnoverRate === null) continue;
    
    // 회전율이 임계값보다 낮으면 (장기 재고) 알림 생성
    if (turnoverData.turnoverRate < threshold) {
      // 중복 알림 방지: 최근 24시간 이내에 동일한 원재료에 대한 알림이 있는지 확인
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const [recentAlert] = await db
        .select()
        .from(hNotifications)
        .where(
          and(
            eq(hNotifications.notificationType, "inventory_turnover"),
            sql`${hNotifications.message} LIKE ${`%${setting.materialName}%`}`,
            sql`${hNotifications.createdAt} >= ${oneDayAgo.toISOString().split('T')[0]}`
          )
        );
      
      if (!recentAlert) {
        // 알림 생성
        await db.insert(hNotifications).values({
          userId: 1, // 시스템 알림 (관리자에게 전송)
          notificationType: "inventory_turnover",
          title: "재고 회전율 임계값 경고",
          message: `원재료 "${setting.materialName}"의 회전율(${turnoverData.turnoverRate.toFixed(1)}회)이 임계값(${threshold}회)보다 낮습니다. 장기 재고 관리가 필요합니다.`,
          referenceType: "material",
          referenceId: setting.materialId,
          priority: "high",
          actionUrl: `/materials?materialId=${setting.materialId}`,
          isRead: 0
        });
        
        alertsCreated.push({
          materialId: setting.materialId,
          materialName: setting.materialName || "알 수 없음",
          turnoverRate: turnoverData.turnoverRate,
          threshold
        });
      }
    }
  }
  
  return {
    success: true,
    alertsCreated: alertsCreated.length,
    details: alertsCreated
  };
}

// 배치 수익성 예측값 저장
export async function saveProfitabilityForecast(data: {
  targetMonth: string;
  predictedRevenue: number;
  predictedCost: number;
  predictedProfitMargin: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hProfitabilityForecasts } = await import("../drizzle/schema.js");
  
  await db.insert(hProfitabilityForecasts).values({
    forecastDate: new Date(),
    targetMonth: data.targetMonth,
    predictedRevenue: data.predictedRevenue.toString(),
    predictedCost: data.predictedCost.toString(),
    predictedProfitMargin: data.predictedProfitMargin.toString()
  });
  
  return { success: true };
}

// 과거 예측값 조회 (실제값과 비교)
export async function getProfitabilityForecastHistory() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hProfitabilityForecasts } = await import("../drizzle/schema.js");
  const { desc } = await import("drizzle-orm");
  
  const forecasts = await db
    .select()
    .from(hProfitabilityForecasts)
    .orderBy(desc(hProfitabilityForecasts.targetMonth))
    .limit(12); // 최근 12개월
  
  return forecasts.map(f => ({
    targetMonth: f.targetMonth,
    predictedRevenue: parseFloat(f.predictedRevenue),
    predictedCost: parseFloat(f.predictedCost),
    predictedProfitMargin: parseFloat(f.predictedProfitMargin),
    actualRevenue: f.actualRevenue ? parseFloat(f.actualRevenue) : null,
    actualCost: f.actualCost ? parseFloat(f.actualCost) : null,
    actualProfitMargin: f.actualProfitMargin ? parseFloat(f.actualProfitMargin) : null,
    forecastDate: f.forecastDate
  }));
}

// 실제값 업데이트 (월 마감 후)
export async function updateActualProfitability(data: {
  targetMonth: string;
  actualRevenue: number;
  actualCost: number;
  actualProfitMargin: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hProfitabilityForecasts } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  await db
    .update(hProfitabilityForecasts)
    .set({
      actualRevenue: data.actualRevenue.toString(),
      actualCost: data.actualCost.toString(),
      actualProfitMargin: data.actualProfitMargin.toString()
    })
    .where(eq(hProfitabilityForecasts.targetMonth, data.targetMonth));
  
  return { success: true };
}

// 모든 알림 읽음 처리
export async function markAllNotificationsAsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hNotifications } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  await db
    .update(hNotifications)
    .set({ isRead: 1 })
    .where(eq(hNotifications.userId, userId));
  
  return { success: true };
}

// 모든 알림 삭제
export async function deleteAllNotifications(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hNotifications } = await import("../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  await db
    .delete(hNotifications)
    .where(eq(hNotifications.userId, userId));
  
  return { success: true };
}


// 검사 결과 부적합 발생 시 알림 생성
export async function checkAndCreateInspectionFailureAlerts() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { hInspectionRecords, hNotifications, users } = await import("../drizzle/schema.js");
  const { eq, and, gte } = await import("drizzle-orm");
  
  // 최근 24시간 이내의 부적합 검사 결과 조회
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const failedInspections = await db
    .select({
      id: hInspectionRecords.id,
      inspectionType: hInspectionRecords.inspectionType,
      siteId: hInspectionRecords.siteId,
      result: hInspectionRecords.result,
      findings: hInspectionRecords.findings,
      inspectionDate: hInspectionRecords.inspectionDate
    })
    .from(hInspectionRecords)
    .where(
      and(
        eq(hInspectionRecords.result, "fail"),
        gte(hInspectionRecords.createdAt, oneDayAgo)
      )
    );
  
  let createdCount = 0;
  
  for (const inspection of failedInspections) {
    // 이미 알림이 생성되었는지 확인 (중복 방지)
    const existingAlert = await db
      .select()
      .from(hNotifications)
      .where(
        and(
          eq(hNotifications.title, `검사 부적합: 사이트 ID ${inspection.siteId}`),
          gte(hNotifications.createdAt, oneDayAgo)
        )
      )
      .limit(1);
    
    if (existingAlert.length > 0) continue;
    
    // 관리자 사용자 조회
    const adminUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));
    
    // 각 관리자에게 알림 생성
    for (const admin of adminUsers) {
      await db.insert(hNotifications).values({
        userId: admin.id,
        title: `검사 부적합: 사이트 ID ${inspection.siteId}`,
        message: `${inspection.inspectionType || "검사"}에서 부적합 판정이 발생했습니다. ${inspection.findings ? `소견: ${inspection.findings}` : ""}`,
        notificationType: "error",
        priority: "urgent",
        actionUrl: `/inspections?recordId=${inspection.id}`,
        isRead: 0
      });
      createdCount++;
    }
  }
  
  return { success: true, createdCount };
}

/**
 * 알림 조치 완료 처리
 */
export async function markNotificationAsResolved(notificationId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const conditions = [eq(hNotifications.id, notificationId)];
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  
  await db
    .update(hNotifications)
    .set({ isResolved: 1, resolvedAt: new Date() })
    .where(and(...conditions));
}

/**
 * 알림 통계 조회
 */
export async function getNotificationStatistics(startDate?: string, endDate?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { sql } = await import("drizzle-orm");
  
  let dateFilter = sql``;
  if (startDate && endDate) {
    dateFilter = sql` AND createdAt >= ${startDate} AND createdAt <= ${endDate}`;
  } else if (startDate) {
    dateFilter = sql` AND createdAt >= ${startDate}`;
  } else if (endDate) {
    dateFilter = sql` AND createdAt <= ${endDate}`;
  }
  
  const tenantFilter = tenantId ? sql` AND tenant_id = ${tenantId}` : sql``;
  
  // ★ 성능 개선: 6개 쿼리 → 3개로 통합
  // 1) 총 알림 + 미해결 + 평균해결시간 통합 조회
  const summaryRaw: any = await db.execute(sql`
    SELECT 
      COUNT(*) as totalCount,
      SUM(CASE WHEN isResolved = 0 THEN 1 ELSE 0 END) as unresolvedCount,
      AVG(CASE WHEN isResolved = 1 AND resolvedAt IS NOT NULL 
          THEN TIMESTAMPDIFF(HOUR, createdAt, resolvedAt) ELSE NULL END) as avgHours
    FROM ${hNotifications} 
    WHERE 1=1${dateFilter}${tenantFilter}
  `);
  const summary = Array.isArray(summaryRaw) && summaryRaw[0] ? (Array.isArray(summaryRaw[0]) ? summaryRaw[0][0] : summaryRaw[0]) : {};
  const totalNotifications = Number(summary?.totalCount || 0);
  const unresolvedCount = Number(summary?.unresolvedCount || 0);
  const resolvedCount = totalNotifications - unresolvedCount;
  const overallAvgResolutionHours = Number(summary?.avgHours || 0);
  
  // 2) 타입별 빈도 + 해결시간 통합 조회
  const typeStatsRaw = await db.execute(sql`
    SELECT 
      notificationType as type, 
      COUNT(*) as count,
      AVG(CASE WHEN isResolved = 1 AND resolvedAt IS NOT NULL 
          THEN TIMESTAMPDIFF(HOUR, createdAt, resolvedAt) ELSE NULL END) as avgHours
    FROM ${hNotifications} 
    WHERE 1=1${dateFilter}${tenantFilter}
    GROUP BY notificationType
  `);
  const typeRows = Array.isArray(typeStatsRaw) && Array.isArray(typeStatsRaw[0]) ? typeStatsRaw[0] : typeStatsRaw;
  const typeDistribution = (typeRows as any[]).map((row: any) => ({
    name: row.type || "기타",
    count: Number(row.count)
  }));
  const avgResolutionTime = (typeRows as any[])
    .filter((row: any) => row.avgHours != null)
    .map((row: any) => ({
      type: row.type || "기타",
      avgHours: Number(row.avgHours || 0)
    }));
  
  // 3) 미해결 알림 추이
  let trendDateFilter = dateFilter;
  if (!startDate && !endDate) {
    trendDateFilter = sql` AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
  }
  const unresolvedTrendRaw = await db.execute(sql`
    SELECT DATE(createdAt) as date, COUNT(*) as count
    FROM ${hNotifications}
    WHERE isResolved = 0${trendDateFilter}${tenantFilter}
    GROUP BY DATE(createdAt)
    ORDER BY date ASC
  `);
  const trendRows = Array.isArray(unresolvedTrendRaw) && Array.isArray(unresolvedTrendRaw[0]) ? unresolvedTrendRaw[0] : unresolvedTrendRaw;
  const unresolvedTrend = (trendRows as any[]).map((row: any) => ({
    date: row.date,
    count: Number(row.count)
  }));
  
  return {
    totalNotifications,
    unresolvedCount,
    resolvedCount,
    typeDistribution,
    avgResolutionTime,
    overallAvgResolutionHours,
    unresolvedTrend
  };
}

/**
 * 활성 배치 목록 조회 (실시간 모니터링용)
 */
export async function getActiveBatches() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { sql } = await import("drizzle-orm");
  
  // 최근 7일 이내의 배치 조회
  const batchesRaw = await db.execute(sql`
    SELECT 
      b.batchId,
      b.batchCode as batchNumber,
      b.plannedQuantity as quantity,
      b.plannedDate as startTime,
      DATE_ADD(b.plannedDate, INTERVAL 8 HOUR) as expectedEndTime,
      p.productName,
      'in_progress' as status,
      (SELECT COUNT(*) FROM hCcpInstances WHERE batchId = b.batchId) as ccpCheckCount,
      (SELECT COUNT(*) FROM hCcpInstances WHERE batchId = b.batchId AND status = 'completed') as ccpCheckCompletedCount
    FROM hBatches b
    LEFT JOIN h_products_v2 p ON b.product_id = p.id
    WHERE b.plannedDate >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    ORDER BY b.plannedDate DESC
    LIMIT 20
  `);
  
  return batchesRaw.map((row: any) => ({
    batchId: row.batchId,
    batchNumber: row.batchNumber,
    quantity: Number(row.quantity || 0),
    unit: "개",
    startTime: row.startTime,
    expectedEndTime: row.expectedEndTime,
    productName: row.productName || "알 수 없음",
    status: row.status,
    ccpCheckCount: Number(row.ccpCheckCount || 0),
    ccpCheckCompletedCount: Number(row.ccpCheckCompletedCount || 0)
  }));
}

/**
 * 재고 소비 패턴 분석 (과거 30일 기준)
 */
export async function getInventoryConsumptionPattern(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { sql } = await import("drizzle-orm");
  
  // 과거 30일간의 재고 변화 데이터 조회
  const consumptionData = await db.execute(sql`
    SELECT 
      DATE(createdAt) as date,
      SUM(CASE WHEN changeType = 'out' THEN ABS(changeQuantity) ELSE 0 END) as dailyConsumption
    FROM hInventoryTransactions
    WHERE id = ${materialId}
      AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY DATE(createdAt)
    ORDER BY date DESC
  `);
  
  const consumptions = consumptionData.map((row: any) => Number(row.dailyConsumption || 0));
  
  if (consumptions.length === 0) {
    return { averageDailyConsumption: 0, trend: 0 };
  }
  
  // 평균 일일 소비량 계산
  const averageDailyConsumption = consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
  
  // 트렌드 계산 (최근 7일 vs 이전 23일)
  const recent7Days = consumptions.slice(0, 7);
  const previous23Days = consumptions.slice(7);
  
  const recent7DaysAvg = recent7Days.length > 0 
    ? recent7Days.reduce((a, b) => a + b, 0) / recent7Days.length 
    : 0;
  const previous23DaysAvg = previous23Days.length > 0 
    ? previous23Days.reduce((a, b) => a + b, 0) / previous23Days.length 
    : 0;
  
  const trend = previous23DaysAvg > 0 
    ? ((recent7DaysAvg - previous23DaysAvg) / previous23DaysAvg) * 100 
    : 0;
  
  return { averageDailyConsumption, trend };
}

/**
 * 재고 소진 예측
 */
export async function predictInventoryDepletion(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { sql } = await import("drizzle-orm");
  
  // 현재 재고 수량 조회
  const currentStockRaw = await db.execute(sql`
    SELECT 
      COALESCE(inv.available_quantity, 0) as currentStock,
      COALESCE(mat.safety_stock_level, 0) as safetyStock,
      COALESCE(inv.reorder_point, inv.min_stock_level, 0) as reorderPoint
    FROM h_materials mat
    LEFT JOIN h_inventory inv ON inv.material_id = mat.id
    WHERE mat.id = ${materialId}
    LIMIT 1
  `);
  
  if ((currentStockRaw as any[]).length === 0) {
    throw new Error("Material not found");
  }
  
  const row = currentStockRaw[0] as any;
  const currentStock = Number(row.currentStock || 0);
  const safetyStock = Number(row.safetyStock || 0);
  const reorderPoint = Number(row.reorderPoint || 0);
  
  // 소비 패턴 분석
  const { averageDailyConsumption, trend } = await getInventoryConsumptionPattern(materialId);
  
  if (averageDailyConsumption === 0) {
    return {
      currentStock,
      safetyStock,
      reorderPoint,
      averageDailyConsumption: 0,
      predictedDepletionDays: null,
      shouldReorder: false,
      urgencyLevel: "normal"
    };
  }
  
  // 트렌드를 반영한 예상 일일 소비량 계산
  const adjustedDailyConsumption = averageDailyConsumption * (1 + trend / 100);
  
  // 예상 소진 일수 계산
  const predictedDepletionDays = Math.floor(currentStock / adjustedDailyConsumption);
  
  // 발주 필요 여부 판단
  const shouldReorder = currentStock <= reorderPoint;
  
  // 긴급도 판단
  let urgencyLevel = "normal";
  if (currentStock <= safetyStock) {
    urgencyLevel = "urgent";
  } else if (currentStock <= reorderPoint) {
    urgencyLevel = "high";
  } else if (predictedDepletionDays <= 7) {
    urgencyLevel = "medium";
  }
  
  return {
    currentStock,
    safetyStock,
    reorderPoint,
    averageDailyConsumption: adjustedDailyConsumption,
    predictedDepletionDays,
    shouldReorder,
    urgencyLevel
  };
}

/**
 * 재고 예측 기반 자동 발주 알림 생성
 */
export async function checkAndCreateReorderAlerts() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { sql } = await import("drizzle-orm");
  
  // 모든 원재료 조회
  const materialsRaw = await db.execute(sql`
    SELECT id, material_name
    FROM h_materials
    WHERE is_active = 1
  `);
  // db.execute returns [rows, fields] in mysql2 - extract rows
  const materials = Array.isArray(materialsRaw) && Array.isArray(materialsRaw[0]) ? materialsRaw[0] : materialsRaw;
  
  let alertCount = 0;
  
  for (const material of materials as any[]) {
    try {
      const materialId = material.id;
      const materialName = material.material_name;
      
      if (!materialId) {
        console.error('Material ID is undefined:', material);
        continue;
      }
      
      const prediction = await predictInventoryDepletion(materialId);
      
      // 발주 필요 시 알림 생성
      if (prediction.shouldReorder) {
        // 중복 알림 방지 (24시간 이내)
        const existingAlertsRaw = await db.execute(sql`
          SELECT id
          FROM h_notifications
          WHERE notification_type = 'reorder'
            AND JSON_EXTRACT(metadata, '$.materialId') = ${materialId}
            AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);
        const existingAlerts = Array.isArray(existingAlertsRaw) && Array.isArray(existingAlertsRaw[0]) ? existingAlertsRaw[0] : existingAlertsRaw;
        
        if ((existingAlerts as any[]).length === 0) {
          // 모든 사용자에게 알림 생성
          const usersRaw = await db.execute(sql`SELECT id FROM users`);
          const usersList = Array.isArray(usersRaw) && Array.isArray(usersRaw[0]) ? usersRaw[0] : usersRaw;
          
          for (const user of usersList as any[]) {
            await createNotification({
              userId: user.id,
              notificationType: "reorder",
              title: `재고 발주 필요: ${materialName}`,
              message: `현재 재고: ${prediction.currentStock}, 안전 재고: ${prediction.safetyStock}, 예상 소진: ${prediction.predictedDepletionDays}일 후`,
              priority: prediction.urgencyLevel === "urgent" ? "urgent" : prediction.urgencyLevel === "high" ? "high" : "medium",
              actionUrl: `/materials?materialId=${materialId}`,
              metadata: JSON.stringify({
                materialId: materialId,
                materialName: materialName,
                currentStock: prediction.currentStock,
                predictedDepletionDays: prediction.predictedDepletionDays
              })
            });
          }
          
          alertCount++;
        }
      }
    } catch (error) {
      console.error(`재고 예측 실패 (materialId: ${material?.id}):`, error);
    }
  }
  
  return { alertCount };
}

/**
 * 배치 완료 전 체크리스트 확인
 */
export async function checkBatchCompletionReadiness(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 배치 정보 조회
  const batches = await db
    .select()
    .from(hBatches)
    .where(eq(hBatches.id, batchId))
    .limit(1);
  const batch = batches[0];

  if (!batch) {
    throw new Error("배치를 찾을 수 없습니다");
  }

  // 1. 원재료 투입 확인
  const materialInputs = await db
    .select()
    .from(hBatchInputs)
    .where(eq(hBatchInputs.batchId, batchId));

  const hasMaterialInputs = materialInputs.length > 0;

  // 2. CCP 점검 완료 확인
  const ccpInstances = await db
    .select()
    .from(hCcpInstances)
    .where(eq(hCcpInstances.batchId, batchId));

  let ccpCompletedCount = 0;
  let ccpTotalCount = ccpInstances.length;

  for (const instance of ccpInstances) {
    const records = await db
      .select()
      .from(hCcpRecords)
      .where(eq(hCcpRecords.instanceId, instance.id));

    if (records.length > 0) {
      ccpCompletedCount++;
    }
  }

  const ccpCompleted = ccpTotalCount === 0 || ccpCompletedCount === ccpTotalCount;

  // 체크리스트 결과
  const checks = {
    hasMaterialInputs: {
      passed: hasMaterialInputs,
      message: hasMaterialInputs
        ? `원재료 투입 완료 (${materialInputs.length}건)`
        : "원재료 투입 기록이 없습니다"
    },
    ccpCompleted: {
      passed: ccpCompleted,
      message: ccpCompleted
        ? `CCP 점검 완료 (${ccpCompletedCount}/${ccpTotalCount})`
        : `CCP 점검 미완료 (${ccpCompletedCount}/${ccpTotalCount})`
    }
  };

  const canComplete = hasMaterialInputs && ccpCompleted;
  const warnings: string[] = [];

  if (!hasMaterialInputs) {
    warnings.push("원재료 투입 기록이 없습니다.");
  }
  if (!ccpCompleted) {
    warnings.push(`CCP 점검이 완료되지 않았습니다 (${ccpCompletedCount}/${ccpTotalCount}).`);
  }

  return {
    canComplete,
    checks,
    warnings
  };
}

/**
 * 배치 완료 처리
 */
export async function completeBatch(params: {
  batchId: number;
  actualQuantity: number;
  defectQuantity?: number;
  revenue?: number;
  completionNotes?: string;
  idempotencyKey: string;
}) {
  const { batchId, actualQuantity, defectQuantity, revenue, completionNotes, idempotencyKey } = params;
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 1. idempotency 키 검증 (중복 완료 방지)
  const existingBatches = await db
    .select()
    .from(hBatches)
    .where(eq(hBatches.id, batchId))
    .limit(1);
  const existingBatch = existingBatches[0];

  if (!existingBatch) {
    throw new Error("배치를 찾을 수 없습니다");
  }

  if (existingBatch.completionIdempotencyKey === idempotencyKey) {
    throw new Error("이미 처리된 요청입니다 (중복 완료)");
  }

  if (existingBatch.status === "completed") {
    throw new Error("이미 완료된 배치입니다");
  }

  // 2. 배치 완료 처리 (원가 확정은 재고 정산 후 업데이트)
  await db
    .update(hBatches)
    .set({
      status: "completed",
      actualQuantity: actualQuantity.toString(),
      revenue: revenue?.toString(),
      notes: completionNotes,
      completionIdempotencyKey: idempotencyKey,
      completedAt: new Date(),
      endTime: new Date()
    })
    .where(eq(hBatches.id, batchId));

  // 3. 원재료 소비 및 재고 정산
  let totalMaterialCost = 0;
  try {
    const { hBatchInputs, hInventory, hInventoryTransactions } = await import("../drizzle/schema");
    
    // 배치 투입 내역 조회
    const batchInputs = await db
      .select()
      .from(hBatchInputs)
      .where(eq(hBatchInputs.batchId, batchId));
    
    // 원재료 소비 처리
    for (const input of batchInputs) {
      // 재고 차감
      await db
        .update(hInventory)
        .set({
          totalQuantity: sql`total_quantity - ${input.actualQuantity || input.plannedQuantity}`,
          availableQuantity: sql`available_quantity - ${input.actualQuantity || input.plannedQuantity}`
        })
        .where(eq(hInventory.materialId, input.materialId));
      
      // 재고 거래 기록 생성
      await db.insert(hInventoryTransactions).values({
        materialId: input.materialId,
        transactionType: "out",
        quantity: input.actualQuantity || input.plannedQuantity,
        unitPrice: input.unitPrice || "0",
        totalPrice: input.totalPrice || "0",
        batchId: batchId,
        transactionDate: new Date(),
        notes: `배치 완료 - 원재료 소비 (배치 ID: ${batchId})`,
        createdBy: 1, // TODO: completedBy 파라미터 추가
      } as any);
      
      // 원가 누적
      totalMaterialCost += parseFloat(input.totalPrice || "0");
    }
    
    // 완제품 재고 입고
    const finishedGoodsInventory = await db
      .select()
      .from(hInventory)
      .where(eq(hInventory.productId, existingBatch.productId))
      .limit(1);
    
    if (finishedGoodsInventory.length > 0) {
      await db
        .update(hInventory)
        .set({
          totalQuantity: sql`total_quantity + ${actualQuantity}`,
          availableQuantity: sql`available_quantity + ${actualQuantity}`
        })
        .where(eq(hInventory.productId, existingBatch.productId));
    } else {
      await db.insert(hInventory).values({
        productId: existingBatch.productId,
        totalQuantity: actualQuantity.toString(),
        availableQuantity: actualQuantity.toString(),
        reservedQuantity: "0",
        unit: "kg",
        location: "완제품 창고"
      } as any);
    }
    
    // 완제품 입고 거래 기록 (kg 기준 총량)
    await db.insert(hInventoryTransactions).values({
      materialId: existingBatch.productId,
      transactionType: "in",
      quantity: actualQuantity.toString(),
      unitPrice: "0",
      totalPrice: "0",
      batchId: batchId,
      transactionDate: new Date(),
      notes: `배치 완료 - 완제품 입고 (배치 ID: ${batchId}, ${actualQuantity}kg)`,
      createdBy: 1,
    } as any);
  } catch (error) {
    console.error(`[배치 완료] 재고 정산 실패:`, error);
  }

  // ★ 3-2. SKU별 제품 LOT 자동 생성 (production_sku_output 기반)
  try {
    // getRawConnection is already available in this file
    const pool = await getRawConnection();
    const tenantId = existingBatch.tenantId;
    if (!tenantId) throw new Error('[P0 보안] tenantId is required for completeBatch');
    
    // production_sku_output에서 이 배치의 SKU 실적 조회
    const [skuOutputRows] = await pool.execute(
      `SELECT pso.sku_id, pso.quantity, pso.total_kg, pso.defective_qty,
              ps.sku_code, ps.sku_name, ps.sales_unit, ps.unit_price, ps.kg_per_sales_unit,
              COALESCE(im.item_name, p.product_name) as product_name
       FROM production_sku_output pso
       JOIN product_skus ps ON pso.sku_id = ps.id
       LEFT JOIN item_master im ON ps.item_id = im.id AND im.tenant_id = ?
       LEFT JOIN h_products_v2 p ON p.id = ? AND p.tenant_id = ?
       WHERE pso.batch_id = ? AND pso.tenant_id = ?`,
      [tenantId, existingBatch.productId, tenantId, batchId, tenantId]
    );
    
    const skuRows = skuOutputRows as any[];
    if (skuRows.length > 0) {
      const batchCode = existingBatch.batchCode || `B${batchId}`;
      const todayStr = new Date().toISOString().slice(0, 10);
      
      for (const sku of skuRows) {
        const skuQty = parseInt(sku.quantity) || 0;
        if (skuQty <= 0) continue;
        
        const lotNumber = `${batchCode}-${sku.sku_code || sku.sku_id}`;
        const salesUnit = sku.sales_unit || "box";
        const unitPrice = sku.unit_price ? parseFloat(sku.unit_price) : 0;
        const productName = sku.product_name || "제품";
        const skuName = sku.sku_name || "";
        
        // 이미 이 배치+SKU로 생성된 LOT가 있는지 확인
        const [existingLots] = await pool.execute(
          `SELECT id FROM h_inventory_lots WHERE batch_id = ? AND sku_id = ? AND tenant_id = ? LIMIT 1`,
          [batchId, sku.sku_id, tenantId]
        );
        
        if ((existingLots as any[]).length > 0) {
          await pool.execute(
            `UPDATE h_inventory_lots SET quantity = ?, available_quantity = ? WHERE id = ?`,
            [skuQty.toString(), skuQty.toString(), (existingLots as any[])[0].id]
          );
          continue;
        }
        
        // SKU별 LOT 생성
        const [insertResult] = await pool.execute(
          `INSERT INTO h_inventory_lots (
            tenant_id, batch_id, product_id, sku_id, sku_name, lot_number,
            quantity, available_quantity, unit, unit_price,
            production_date, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')`,
          [
            tenantId, batchId, existingBatch.productId,
            sku.sku_id, skuName, lotNumber,
            skuQty.toString(), skuQty.toString(), salesUnit, unitPrice.toString(),
            todayStr
          ]
        );
        
        const lotId = (insertResult as any).insertId;
        
        // SKU별 입고 트랜잭션 기록
        const { hInventoryTransactions: hInvTxSchema } = await import("../drizzle/schema");
        await db.insert(hInvTxSchema).values({
          tenantId,
          lotId,
          transactionType: "inbound",
          quantity: skuQty.toString(),
          unit: salesUnit,
          notes: `생산 완료 SKU 입고 (배치: ${batchCode}, SKU: ${skuName}, ${productName})`,
          createdBy: 1,
          performedBy: 1,
          transactionDate: todayStr,
        } as any);
        
        console.log(`[completeBatch] SKU LOT 생성: ${lotNumber} (${skuName}, ${skuQty} ${salesUnit})`);
      }
      console.log(`[completeBatch] 배치 #${batchId}: ${skuRows.length}개 SKU LOT 생성 완료`);
    } else {
      // SKU 실적 없으면 기존 방식으로 fallback (배치 단위 LOT 1개)
      console.log(`[completeBatch] 배치 #${batchId}: SKU 실적 없음, fallback LOT 생성`);
      const { createProductLotFromBatch } = await import("./db/productOutboundManagement");
      const tenantId = existingBatch.tenantId;
    if (!tenantId) throw new Error('[P0 보안] tenantId is required for completeBatch');
      const batchCode = existingBatch.batchCode || `B${batchId}`;
      await createProductLotFromBatch({
        batchId,
        batchCode,
        productId: existingBatch.productId,
        productName: "제품",
        quantity: actualQuantity,
        unit: "kg",
        lotNumber: `PROD-${batchCode}`,
        userId: 1,
      }, tenantId);
    }
  } catch (skuLotErr) {
    console.error(`[completeBatch] SKU LOT 생성 실패:`, skuLotErr);
  }
  
  // 3-1. 원가 확정 업데이트
  if (totalMaterialCost > 0) {
    await db
      .update(hBatches)
      .set({
        actualCost: totalMaterialCost.toFixed(2),
        costFinalizedAt: new Date()
      } as any)
      .where(eq(hBatches.id, batchId));
  }

  // 4. CCP 인스턴스 종결 (status: approved로 변경)
  await db
    .update(hCcpInstances)
    .set({ status: "approved" })
    .where(eq(hCcpInstances.batchId, batchId));

  // 5. 배치 완료 보고서 PDF 생성
  let pdfUrl: string | null = null;
  let pdfGenerated = false;
  try {
    const { generateBatchCompletionReport } = await import("./reports/batchCompletionReport");
    pdfUrl = await generateBatchCompletionReport(batchId);
    pdfGenerated = true;
    console.log(`[Batch Completion] PDF report generated: ${pdfUrl}`);
    
    // PDF URL을 DB에 저장
    await db
      .update(hBatches)
      .set({ completionReportUrl: pdfUrl })
      .where(eq(hBatches.id, batchId));
  } catch (error) {
    console.error(`[Batch Completion] PDF generation failed:`, error);
    // PDF 생성 실패해도 배치 완료는 진행
  }
  // 6. [자동화] 배치 완료 시 문서 자동 생성 + 일일일지 + 승인 요청 트리거
  let autoGeneratedDocs: any[] = [];
  try {
    // 6-1. 문서 자동 생성
    autoGeneratedDocs = await autoGenerateDocumentsForBatch(
      batchId,
      existingBatch.siteId,
      existingBatch.productId,
      new Date(),
      1
    );
    console.log(`[Batch Completion] ${autoGeneratedDocs.length}건 문서 자동 생성`);
    
    // 6-2. 일일일지 자동 생성
    try {
      const rawConn2 = await getRawConnection();
      if (rawConn2) {
        const today = new Date().toISOString().split('T')[0];
        const now2 = new Date().toISOString().replace('T', ' ').split('.')[0];
        await rawConn2.execute(
          "INSERT IGNORE INTO h_daily_reports (site_id, report_date, report_type, summary, status, created_at, updated_at) VALUES (?, ?, 'production', ?, 'completed', ?, ?)",
          [existingBatch.siteId, today, JSON.stringify({ batchId, actualQuantity, autoGenerated: true }), now2, now2]
        );
        console.log(`[Batch Completion] 일일일지 자동 생성 완료`);
      }
    } catch (dailyErr) {
      console.error(`[Batch Completion] 일일일지 자동 생성 실패:`, dailyErr);
    }
    
    // 6-3. 승인 요청 자동 생성
    if (autoGeneratedDocs.length > 0) {
      try {
        for (const doc of autoGeneratedDocs) {
          await db.insert(hApprovalRequests).values({
            batchId,
            siteId: existingBatch.siteId,
            documentInstanceId: doc.id,
            requestType: 'document_approval',
            title: `[자동] ${doc.documentTypeName} 승인 요청`,
            description: `배치 완료에 따른 ${doc.documentTypeName} 자동 승인 요청입니다.`,
            status: 'pending',
            requestedBy: 1,
            createdAt: new Date(),
          } as any);
        }
        console.log(`[Batch Completion] ${autoGeneratedDocs.length}건 승인 요청 자동 생성`);
      } catch (approvalErr) {
        console.error(`[Batch Completion] 승인 요청 자동 생성 실패:`, approvalErr);
      }
    }
  } catch (autoGenError) {
    console.error(`[Batch Completion] 자동 문서 생성 실패:`, autoGenError);
  }


  return {
    success: true,
    message: "배치가 성공적으로 완료되었습니다",
    data: {
      batchId,
      actualQuantity,
      defectQuantity,
      revenue,
      pdfGenerated,
      pdfUrl,
      autoGeneratedDocuments: autoGeneratedDocs.length
    }
  };
}


/**
 * 원재료별 유통기한 알림 기준일 일괄 업데이트
 * @param expiryWarningDays 기본 유통기한 알림 기준일 (일)
 * @returns 업데이트된 원재료 개수
 */
export async function batchUpdateExpiryWarningDays(expiryWarningDays: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(hMaterials)
    .set({ expiryWarningDays })
    .where(eq(hMaterials.expiryWarningDays, 7)); // 기본값 7일인 원재료만 업데이트

  return result[0].affectedRows || 0;
}

/**
 * 알림 타입별 개수 조회 (읽지 않은 알림만)
 */
export async function getNotificationCountsByType(userId?: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(hNotifications.isRead, 0)];
  if (userId) conditions.push(eq(hNotifications.userId, userId));
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  const whereConditions = and(...conditions);
  const results = await db
    .select({
      notificationType: hNotifications.notificationType,
      count: sql<number>`count(*)`
    })
    .from(hNotifications)
    .where(whereConditions)
    .groupBy(hNotifications.notificationType);

  // 결과를 객체로 변환 { notificationType: count }
  const counts: Record<string, number> = {};
  for (const row of results) {
    if (row.notificationType) {
      counts[row.notificationType] = row.count;
    }
  }

  return counts;
}


/**
 * 선택한 알림 읽음 처리
 */
export async function markMultipleNotificationsAsRead(notificationIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  const { inArray } = await import("drizzle-orm");
  const { hNotifications } = await import("../drizzle/schema.js");

  await db
    .update(hNotifications)
    .set({ isRead: 1 })
    .where(inArray(hNotifications.id, notificationIds));
}

/**
 * 선택한 알림 삭제
 */
export async function deleteMultipleNotifications(notificationIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  const { inArray } = await import("drizzle-orm");
  const { hNotifications } = await import("../drizzle/schema.js");

  await db
    .delete(hNotifications)
    .where(inArray(hNotifications.id, notificationIds));
}

// 읽은 알림 자동 삭제 (30일 경과)
export async function deleteOldReadNotifications(days: number = 30, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const conditions = [
    eq(hNotifications.isRead, 1),
    lte(hNotifications.createdAt, cutoffDate)
  ];
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  
  const result = await db.delete(hNotifications)
    .where(and(...conditions));
  
  return { deletedCount: (result as any).rowsAffected || 0 };
}

// 특정 타입 알림 자동 아카이브
export async function archiveNotificationsByType(notificationType: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  
  const conditions = [eq(hNotifications.notificationType, notificationType)];
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  
  // 아카이브 기능은 isRead를 1로 설정하여 구현
  const result = await db.update(hNotifications)
    .set({ isRead: 1 })
    .where(and(...conditions));
  
  return { archivedCount: (result as any).rowsAffected || 0 };
}

// 재고 LOT 삭제
export async function deleteInventoryLot(lotId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(hInventoryLots).where(eq(hInventoryLots.id, lotId));
  return { success: true };
}

// 사용자 삭제
export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(users).where(eq(users.id, userId));
  return { success: true };
}

// ============================================================================
// Equipment Profile Management (설비 프로필 관리)
// ============================================================================

/**
 * 설비 프로필 생성
 */
export async function createEquipment(equipment: {
  code: string;
  name: string;
  type: string;
  ccpType?: string;
  defaultTemperature?: string;
  defaultPressure?: string;
    edgeTemperature?: string;
    centerTemperature?: string;
    batchOperationTime?: number;
  defaultTime?: number;
  monitoringInterval?: number;
  rowsPerBatch?: number;
  status?: string;
  notes?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { equipments } = await import("../drizzle/schema");
  
  const [result] = await db.insert(equipments).values({
    code: equipment.code,
    name: equipment.name,
    type: equipment.type,
    ccpType: equipment.ccpType || null,
    defaultTemperature: equipment.defaultTemperature || null,
    defaultPressure: equipment.defaultPressure || null,
    defaultTime: equipment.defaultTime || null,
    monitoringInterval: equipment.monitoringInterval || 10,
    rowsPerBatch: equipment.rowsPerBatch || 4,
    status: equipment.status || "active",
    notes: equipment.notes || null,
    ...(tenantId ? { tenantId } : {}),
  } as any);

  return Number(result.insertId);
}

/**
 * 설비 프로필 목록 조회
 */
export async function getAllEquipments(filters?: {
  type?: string;
  ccpType?: string;
  status?: string;
  page?: number;
  limit?: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, limit: 50 };

  const { equipments } = await import("../drizzle/schema");
  const { count, and: andOp } = await import("drizzle-orm");
  
  // ✅ P0 FIX: tenant_id 필터 강제
  const conditions: any[] = [];
  if (tenantId) {
    conditions.push(eq(equipments.tenantId, tenantId));
  }
  if (filters?.type) {
    conditions.push(eq(equipments.type, filters.type));
  }
  if (filters?.ccpType) {
    conditions.push(eq(equipments.ccpType, filters.ccpType));
  }
  if (filters?.status) {
    conditions.push(eq(equipments.status, filters.status));
  }
  
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const offset = (page - 1) * limit;
  
  const whereClause = conditions.length > 0 ? andOp(...conditions) : undefined;
  
  const items = await db.select().from(equipments).where(whereClause).limit(limit).offset(offset);
  
  const [{ count: total }] = await db.select({ count: count() }).from(equipments).where(whereClause);
  
  return { items, total, page, limit };
}

/**
 * 설비 프로필 상세 조회
 */
export async function getEquipmentById(equipmentId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { equipments } = await import("../drizzle/schema");
  const { and: andOp } = await import("drizzle-orm");
  
  // ✅ P0 FIX: tenant_id 필터 강제
  const conditions: any[] = [eq(equipments.id, equipmentId)];
  if (tenantId) {
    conditions.push(eq(equipments.tenantId, tenantId));
  }
  
  const result = await db.select().from(equipments).where(andOp(...conditions)).limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

/**
 * 설비 프로필 수정
 */
export async function updateEquipment(
  equipmentId: number,
  updates: {
    code?: string;
    name?: string;
    type?: string;
    ccpType?: string;
    defaultTemperature?: string;
    defaultPressure?: string;
    edgeTemperature?: string;
    centerTemperature?: string;
    batchOperationTime?: number;
    defaultTime?: number;
    feSensitivity?: string;
    stsSensitivity?: string;
    detectionSpeed?: string;
    dailyProductCount?: number;
    workStartTime?: string;
    workEndTime?: string;
    lunchStartTime?: string;
    lunchEndTime?: string;
    monitoringInterval?: number;
    rowsPerBatch?: number;
    status?: string;
    notes?: string;
  },
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { equipments } = await import("../drizzle/schema");
  
  // undefined/빈 값 제거 - decimal 필드 올바르게 처리
  const cleanUpdates: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null && value !== '') {
      cleanUpdates[key] = value;
    }
  }
  
  if (Object.keys(cleanUpdates).length === 0) {
    return { success: true };
  }
  
  // ✅ P0 FIX: tenant_id 필터 강제
  const { and: andOp } = await import("drizzle-orm");
  const conditions: any[] = [eq(equipments.id, equipmentId)];
  if (tenantId) {
    conditions.push(eq(equipments.tenantId, tenantId));
  }
  
  await db.update(equipments).set(cleanUpdates as any).where(andOp(...conditions));
  
  return { success: true };
}

/**
 * 설비 프로필 삭제
 */
export async function deleteEquipment(equipmentId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { equipments } = await import("../drizzle/schema");
  const { and: andOp } = await import("drizzle-orm");
  
  // ✅ P0 FIX: tenant_id 필터 강제
  const conditions: any[] = [eq(equipments.id, equipmentId)];
  if (tenantId) {
    conditions.push(eq(equipments.tenantId, tenantId));
  }
  
  await db.delete(equipments).where(andOp(...conditions));
  
  return { success: true };
}

/**
 * CCP 유형별 설비 목록 조회
 */
export async function getEquipmentsByCcpType(ccpType: string, tenantId?: number) {
  const db = await getDb();
  if (!db) return [];

  const { equipments } = await import("../drizzle/schema");
  
  const { and } = await import("drizzle-orm");
  
  // ✅ P0 FIX: tenant_id 필터 강제
  const conditions: any[] = [
    eq(equipments.ccpType, ccpType),
    eq(equipments.status, "active")
  ];
  if (tenantId) {
    conditions.push(eq(equipments.tenantId, tenantId));
  }
  
  const result = await db
    .select()
    .from(equipments)
    .where(and(...conditions));
  
  return result;
}

/**
 * 배치 투입 내역 추가
 */
export async function addBatchInput(input: {
  batchId: number;
  materialId: number;
  quantity: string;
  unitPrice?: string;
  totalPrice?: string;
  notes?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hBatchInputs } = await import("../drizzle/schema");
  
  const [result] = await db.insert(hBatchInputs).values({
    batchId: input.batchId,
    materialId: input.materialId,
    quantity: input.quantity,
    unitPrice: input.unitPrice || "0",
    totalPrice: input.totalPrice || "0",
    notes: input.notes || null,
    createdBy: input.createdBy
  } as any);

  return Number(result.insertId);
}

/**
 * 배치 투입 내역 조회
 */
export async function getBatchInputs(batchId: number) {
  const db = await getDb();
  if (!db) return [];

  const { hBatchInputs } = await import("../drizzle/schema");
  
  const result = await db
    .select()
    .from(hBatchInputs)
    .where(eq(hBatchInputs.batchId, batchId));
  
  return result;
}


// ============================================================================
// 원가 분석 관련 함수
// ============================================================================

/**
 * 원재료별 원가 비중 집계
 */
export async function getMaterialCostBreakdown(params: {
  siteId: number;
  startDate?: Date;
  endDate?: Date;
  productId?: number;
  status?: string;
}) {
  const { siteId, startDate, endDate, productId, status } = params;
  
  // 배치 필터 조건 구성
  const batchConditions = [eq(hBatches.siteId, siteId)];
  
  if (startDate) {
    batchConditions.push(gte(hBatches.plannedDate, startDate));
  }
  
  if (endDate) {
    batchConditions.push(lte(hBatches.plannedDate, endDate));
  }
  
  if (productId) {
    batchConditions.push(eq(hBatches.productId, productId));
  }
  
  if (status) {
    batchConditions.push(eq(hBatches.status, status as any));
  }
  
  // 배치 목록 조회
  const db = await getDb();
  if (!db) {
    throw new Error("데이터베이스 연결에 실패했습니다.");
  }
  
  const batches = await db
    .select({ id: hBatches.id })
    .from(hBatches)
    .where(and(...batchConditions));
  
  if (batches.length === 0) {
    return [];
  }
  
  const batchIds = batches.map((b: any) => b.id);
  
  // 원재료별 원가 집계
  const result = await db
    .select({
      materialId: hBatchInputs.materialId,
      materialName: hMaterials.materialName,
      totalCost: sql<number>`SUM(${hBatchInputs.totalPrice})`.as('total_cost'),
      count: sql<number>`COUNT(*)`.as('count')
    })
    .from(hBatchInputs)
    .innerJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .where(sql`${hBatchInputs.batchId} IN (${sql.join(batchIds.map((id: any) => sql`${id}`), sql`, `)})`)
    .groupBy(hBatchInputs.materialId, hMaterials.materialName)
    .orderBy(desc(sql`SUM(${hBatchInputs.totalPrice})`));
  
  return result;
}

// ============================================================================
// 원재료 입고/LOT 관리 API
// ============================================================================

/**
 * 원재료 입고 등록 (LOT 생성)
 */
export async function receiveMaterial(params: {
  materialId: number;
  quantity: number;
  unit: string;
  receiptDate: string;
  expiryDate?: string;
  lotNumber?: string;
  location?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // LOT 번호 자동 생성 (제공되지 않은 경우)
  const lotNumber = params.lotNumber || `LOT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  
  // 트랜잭션 시작
  return await db.transaction(async (tx) => {
    // 1. hInventoryLots에 LOT 생성
    const [lot] = await tx.insert(hInventoryLots).values({
      materialId: params.materialId,
      productId: null,
      lotNumber,
      quantity: params.quantity.toString(),
      availableQuantity: params.quantity.toString(),
      unit: params.unit,
      receiptDate: params.receiptDate,
      expiryDate: params.expiryDate || null,
      supplierName: "", // supplierId로부터 조회 필요
      location: params.location || "",
      status: "available"
    } as any);
    
    const lotId = lot.insertId;
    
    // 2. hInventoryTransactions에 입고 거래 생성
    await tx.insert(hInventoryTransactions).values({
      lotId,
      transactionType: "receipt",
      quantity: params.quantity.toString(),
      unit: params.unit,
      // transactionDate 필드 없음 (createdAt 자동 생성)
      referenceType: "material_receipt",
      referenceId: null,
      createdBy: 0, // 시스템 자동 입고
      notes: ""
    });
    
    // 3. hMaterialReceipts 대신 hInventoryLots의 notes에 입고 정보 기록
    // (hMaterialReceipts 테이블이 스키마에 없으므로 생략)
    
    // 4. hInventory 총 재고 업데이트 (생략 - hInventoryLots만 사용)
    
    return { lotId, lotNumber };
  });
}

/**
 * FEFO 방식 LOT 조회 (유통기한 가까운 순)
 */
export async function getLotsByMaterialFefo(params: {
  materialId: number;
  siteId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const conditions = [
    eq(hInventoryLots.materialId, params.materialId),
    eq(hInventoryLots.status, "available"),
    gt(hInventoryLots.availableQuantity, "0"),
  ];
  
  if (params.siteId) {
    // siteId는 hInventory를 통해 조인 필요
  }
  
  const lots = await db
    .select()
    .from(hInventoryLots)
    .where(and(...conditions))
    .orderBy(asc(hInventoryLots.expiryDate)); // FEFO: 유통기한 가까운 순
  
  return lots;
}

/**
 * LOT 재고 차감 (배치 투입 시)
 */
export async function deductLotQuantity(params: {
  lotId: number;
  quantity: number;
  batchId: number;
  performedBy: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return await db.transaction(async (tx) => {
    // 1. LOT 정보 조회
    const [lot] = await tx
      .select()
      .from(hInventoryLots)
      .where(eq(hInventoryLots.id, params.lotId));
    
    if (!lot) {
      throw new Error("LOT를 찾을 수 없습니다.");
    }
    
    const availableQty = parseFloat(lot.availableQuantity);
    if (availableQty < params.quantity) {
      throw new Error(`재고 부족: 가용 수량 ${availableQty}, 요청 수량 ${params.quantity}`);
    }
    
    // 2. LOT 가용 수량 차감
    const newAvailableQty = availableQty - params.quantity;
    await tx
      .update(hInventoryLots)
      .set({
        availableQuantity: newAvailableQty.toString(),
        status: newAvailableQty === 0 ? "used" : "available"
      })
      .where(eq(hInventoryLots.id, params.lotId));
    
    // 3. 수불 거래 생성 (사용)
    await tx.insert(hInventoryTransactions).values({
      lotId: params.lotId,
      transactionType: "usage",
      quantity: params.quantity.toString(),
      unit: lot.unit,
      // transactionDate 필드 없음 (createdAt 자동 생성)
      referenceType: "batch",
      referenceId: params.batchId,
      createdBy: params.performedBy,
      notes: params.notes || `배치 ${params.batchId}에 투입`
    });
    
    // 4. hInventory 총 재고 업데이트
    if (lot.materialId) {
      const [inventory] = await tx
        .select()
        .from(hInventory)
        .where(eq(hInventory.materialId, lot.materialId));
      
      if (inventory) {
        const newTotal = parseFloat(inventory.totalQuantity) - params.quantity;
        const newAvailable = parseFloat(inventory.availableQuantity) - params.quantity;
        await tx
          .update(hInventory)
          .set({
            totalQuantity: newTotal.toString(),
            availableQuantity: newAvailable.toString()
          })
          .where(eq(hInventory.id, inventory.id));
      }
    }
    
    return { success: true, newAvailableQty };
  });
}

/**
 * 수불 거래 내역 조회
 */
export async function getInventoryTransactions(params: {
  lotId?: number;
  materialId?: number;
  startDate?: string;
  endDate?: string;
  transactionType?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const conditions = [];
  
  if (params.lotId) {
    conditions.push(eq(hInventoryTransactions.lotId, params.lotId));
  }
  
  if (params.startDate) {
    conditions.push(sql`${hInventoryTransactions.createdAt} >= ${params.startDate}`);
  }
  
  if (params.endDate) {
    conditions.push(sql`${hInventoryTransactions.createdAt} <= ${params.endDate}`);
  }
  
  if (params.transactionType) {
    conditions.push(eq(hInventoryTransactions.transactionType, params.transactionType as any));
  }
  
  let query = db
    .select()
    .from(hInventoryTransactions)
    .orderBy(desc(hInventoryTransactions.createdAt));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  if (params.limit) {
    query = query.limit(params.limit) as any;
  }
  
  if (params.offset) {
    query = query.offset(params.offset) as any;
  }
  
  return await query;
}

// ============================================================================
// 생산 일정 관리 (Production Schedule)
// ============================================================================

/**
 * 기간별 배치 일정 조회 (캘린더용)
 */
export async function getBatchSchedule(params: {
  startDate: string;
  endDate: string;
  siteId?: number;
  status?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { hBatches, hProductsV2 } = await import("../drizzle/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  
  const conditions = [
    eq(hBatches.tenantId, params.tenantId),
    sql`${hBatches.plannedDate} >= ${params.startDate}`,
    sql`${hBatches.plannedDate} <= ${params.endDate}`,
  ];
  
  if (params.siteId) {
    conditions.push(eq(hBatches.siteId, params.siteId));
  }
  
  if (params.status) {
    conditions.push(eq(hBatches.status, params.status as any));
  }
  
  const batches = await db
    .select({
      batch: hBatches,
      product: hProductsV2
    })
    .from(hBatches)
    .leftJoin(hProductsV2, and(eq(hBatches.productId, hProductsV2.id), eq(hProductsV2.tenantId, params.tenantId)))
    .where(and(...conditions))
    .orderBy(hBatches.plannedDate);
  
  return batches.map((row) => ({
    ...row.batch,
    productName: row.product?.productName || "\uc54c \uc218 \uc5c6\uc74c",
    productCode: row.product?.productCode || ""
  }));
}

/**
 * 배치별 원재료 소요량 계산
 */
export async function calculateMaterialRequirements(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { hBatches, recipes, recipeLines, hMaterials, hInventoryLots } = await import("../drizzle/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  
  // 1. 배치 정보 조회 (tenantId가 있으면 격리 적용)
  const batchConditions = [eq(hBatches.id, batchId)];
  if (tenantId) {
    batchConditions.push(eq(hBatches.tenantId, tenantId));
  }
  const [batch] = await db
    .select()
    .from(hBatches)
    .where(and(...batchConditions))
    .limit(1);
  
  if (!batch) throw new Error("배치를 찾을 수 없습니다");
  
  // 2. 제품의 레시피 조회
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(
      eq(recipes.productId, batch.productId),
      eq(recipes.isActive, 1)
    ))
    .limit(1);
  
  if (!recipe) {
    return {
      batchId,
      plannedQuantity: batch.plannedQuantity,
      materials: [],
      totalCost: 0
    };
  }
  
  // 3. 레시피 라인 조회 (원재료 목록)
  const recipeLinesData = await db
    .select({
      recipeLine: recipeLines,
      material: hMaterials
    })
    .from(recipeLines)
    .leftJoin(hMaterials, eq(recipeLines.materialId, hMaterials.id))
    .where(eq(recipeLines.recipeId, recipe.id));
  
  // 4. 각 원재료별 필요 수량 및 재고 현황 계산
  const materialRequirements = await Promise.all(
    recipeLinesData.map(async (line) => {
      const material = line.material;
      const recipeLine = line.recipeLine;
      
      if (!material || !recipeLine) return null;
      
      // 필요 수량 계산 (배치 수량 * 레시피 비율)
      const requiredQuantity = parseFloat(batch.plannedQuantity) * parseFloat(recipeLine.quantity);
      
      // 현재 재고 조회 (가용 수량 합계)
      const [stockResult] = await db
        .select({
          totalStock: sql<number>`SUM(${hInventoryLots.availableQuantity})`
        })
        .from(hInventoryLots)
        .where(and(
          eq(hInventoryLots.materialId, material.id),
          eq(hInventoryLots.status, "available")
        ));
      
      const currentStock = stockResult?.totalStock || 0;
      const shortage = Math.max(0, requiredQuantity - currentStock);
      
      // 비용 계산
      const unitPrice = parseFloat(material.unitPrice || "0");
      const totalCost = requiredQuantity * unitPrice;
      
      return {
        materialId: material.id,
        materialName: material.materialName,
        materialCode: material.materialCode,
        requiredQuantity,
        currentStock,
        shortage,
        unit: recipeLine.unit,
        unitPrice,
        totalCost,
        isShortage: shortage > 0
      };
    })
  );
  
  const validMaterials = materialRequirements.filter((m) => m !== null);
  const totalCost = validMaterials.reduce((sum, m) => sum + (m?.totalCost || 0), 0);
  
  return {
    batchId,
    plannedQuantity: batch.plannedQuantity,
    materials: validMaterials,
    totalCost
  };
}

/**
 * 생산 능력 분석 (일별/주별)
 */
export async function analyzeProductionCapacity(params: {
  startDate: string;
  endDate: string;
  siteId?: number;
  groupBy?: "day" | "week";
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { hBatches, hProductsV2 } = await import("../drizzle/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  
  const conditions = [
    sql`${hBatches.plannedDate} >= ${params.startDate}`,
    sql`${hBatches.plannedDate} <= ${params.endDate}`,
  ];
  
  if (params.siteId) {
    conditions.push(eq(hBatches.siteId, params.siteId));
  }
  
  const groupBy = params.groupBy || "day";
  const dateFormat = groupBy === "week" ? "%Y-%u" : "%Y-%m-%d";
  
  // 일별/주별 생산량 집계 (raw SQL로 GROUP BY 오류 회피)
  const result = await db.execute(sql`
    SELECT 
      DATE_FORMAT(planned_date, ${dateFormat}) as date,
      COUNT(*) as totalBatches,
      COALESCE(SUM(planned_quantity), 0) as totalPlannedQuantity,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedBatches,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN actual_quantity ELSE 0 END), 0) as totalActualQuantity
    FROM h_batches
    WHERE tenant_id = ${params.tenantId}
      AND planned_date >= ${params.startDate} AND planned_date <= ${params.endDate}
    GROUP BY DATE_FORMAT(planned_date, ${dateFormat})
    ORDER BY DATE_FORMAT(planned_date, ${dateFormat})
  `);
   return (result as any[]).map((row: any) => ({
    period: row.date,
    plannedCount: Number(row.totalBatches) || 0,
    completedCount: Number(row.completedBatches) || 0,
    plannedQuantity: parseFloat(row.totalPlannedQuantity?.toString() || "0"),
    actualQuantity: parseFloat(row.totalActualQuantity?.toString() || "0"),
    utilizationRate: Number(row.totalBatches) > 0 ? (Number(row.completedBatches) / Number(row.totalBatches)) * 100 : 0
  }));
}

/**
 * 제품별 생산 능력 분석
 */
export async function analyzeProductionCapacityByProduct(params: {
  startDate: string;
  endDate: string;
  siteId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { hBatches, hProductsV2 } = await import("../drizzle/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  
  const conditions = [
    eq(hBatches.tenantId, params.tenantId),
    sql`${hBatches.plannedDate} >= ${params.startDate}`,
    sql`${hBatches.plannedDate} <= ${params.endDate}`,
  ];
  
  if (params.siteId) {
    conditions.push(eq(hBatches.siteId, params.siteId));
  }
  
  const result = await db
    .select({
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      productCode: hProductsV2.productCode,
      batchCount: sql<number>`COUNT(*)`,
      totalPlannedQuantity: sql<number>`SUM(${hBatches.plannedQuantity})`,
      totalActualQuantity: sql<number>`SUM(${hBatches.actualQuantity})`,
      completedCount: sql<number>`SUM(CASE WHEN ${hBatches.status} = 'completed' THEN 1 ELSE 0 END)`
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .groupBy(hBatches.productId, hProductsV2.productName, hProductsV2.productCode)
    .orderBy(sql`SUM(${hBatches.plannedQuantity}) DESC`);
  
  return result.map((row) => ({
    productId: row.productId,
    productName: row.productName || "알 수 없음",
    productCode: row.productCode || "",
    batchCount: row.batchCount || 0,
    totalPlannedQuantity: row.totalPlannedQuantity || 0,
    totalActualQuantity: row.totalActualQuantity || 0,
    completedCount: row.completedCount || 0,
    completionRate: row.batchCount > 0 
      ? ((row.completedCount || 0) / row.batchCount) * 100 
      : 0
  }));
}

// ============================================================================
// 재고 현황 대시보드 (Inventory Dashboard)
// ============================================================================

/**
 * 실시간 재고 현황 조회
 */
export async function getInventoryDashboard(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { hInventoryLots, hMaterials } = await import("../drizzle/schema");
  const { sql, eq, and } = await import("drizzle-orm");
  
  // 1. 전체 재고 통계
  const [stockStats] = await db
    .select({
      totalLots: sql<number>`COUNT(*)`,
      totalValue: sql<number>`SUM(${hInventoryLots.availableQuantity} * CAST(${hMaterials.unitPrice} AS DECIMAL(10,2)))`,
      availableLots: sql<number>`SUM(CASE WHEN ${hInventoryLots.status} = 'available' THEN 1 ELSE 0 END)`,
      expiringSoonLots: sql<number>`SUM(CASE WHEN ${hInventoryLots.status} = 'available' AND ${hInventoryLots.expiryDate} <= DATE_ADD(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END)`
    })
    .from(hInventoryLots)
    .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(tenantId ? eq(hMaterials.tenantId, tenantId) : undefined);
  
  // 2. 원재료별 재고 현황 (hMaterials 기준 LEFT JOIN → 재고 0인 원재료도 표시)
  const materialStocks = await db
    .select({
      materialId: hMaterials.id,
      materialName: hMaterials.materialName,
      materialCode: hMaterials.materialCode,
      totalQuantity: sql<number>`COALESCE(SUM(CASE WHEN ${hInventoryLots.status} = 'available' THEN ${hInventoryLots.availableQuantity} ELSE 0 END), 0)`,
      lotCount: sql<number>`COALESCE(SUM(CASE WHEN ${hInventoryLots.status} = 'available' THEN 1 ELSE 0 END), 0)`,
      unit: hMaterials.unit,
      unitPrice: hMaterials.unitPrice,
      safetyStockLevel: hMaterials.safetyStockLevel,
      expiryWarningDays: hMaterials.expiryWarningDays
    })
    .from(hMaterials)
    .leftJoin(hInventoryLots, eq(hMaterials.id, hInventoryLots.materialId))
    .where(and(
      eq(hMaterials.isActive, 1),
      tenantId ? eq(hMaterials.tenantId, tenantId) : undefined
    ))
    .groupBy(hMaterials.id, hMaterials.materialName, hMaterials.materialCode, hMaterials.unit, hMaterials.unitPrice, hMaterials.safetyStockLevel, hMaterials.expiryWarningDays);
  
  // 3. 재고 부족 원재료 (safetyStockLevel 이하)
  const lowStockMaterials = materialStocks.filter((m) => {
    const safetyStock = parseFloat(m.safetyStockLevel || "0");
    return safetyStock > 0 && m.totalQuantity < safetyStock;
  });
  
  // 4. 유통기한 임박 LOT (expiryWarningDays 이내)
  const expiringLots = await db
    .select({
      lot: hInventoryLots,
      material: hMaterials
    })
    .from(hInventoryLots)
    .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(and(
      eq(hInventoryLots.status, "available"),
      sql`${hInventoryLots.expiryDate} IS NOT NULL`,
      sql`${hInventoryLots.expiryDate} <= DATE_ADD(NOW(), INTERVAL COALESCE(${hMaterials.expiryWarningDays}, 7) DAY)`,
      tenantId ? eq(hMaterials.tenantId, tenantId) : undefined
    ))
    .orderBy(hInventoryLots.expiryDate);
  
  return {
    stats: {
      totalLots: Number(stockStats.totalLots) || 0,
      totalValue: parseFloat(stockStats.totalValue?.toString() || "0"),
      availableLots: Number(stockStats.availableLots) || 0,
      expiringSoonLots: Number(stockStats.expiringSoonLots) || 0,
      lowStockCount: lowStockMaterials.length
    },
    materialStocks: materialStocks.map((m) => ({
      ...m,
      totalValue: m.totalQuantity * parseFloat(m.unitPrice || "0"),
      isLowStock: parseFloat(m.safetyStockLevel || "0") > 0 && m.totalQuantity < parseFloat(m.safetyStockLevel || "0")
    })),
    lowStockMaterials,
    expiringLots: expiringLots.map((row) => ({
      ...row.lot,
      materialName: row.material?.materialName || "알 수 없음",
      materialCode: row.material?.materialCode || "",
      expiryWarningDays: row.material?.expiryWarningDays || 7,
      daysUntilExpiry: row.lot.expiryDate 
        ? Math.ceil((new Date(row.lot.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null
    }))
  };
}

/**
 * 재고 이동 추이 (일별)
 */
export async function getInventoryTrend(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  materialId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || new Date().toISOString().split('T')[0];
  const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const { hInventoryTransactions, hInventoryLots } = await import("../drizzle/schema");
  const { sql, and, eq } = await import("drizzle-orm");
  
  const conditions = [
    sql`DATE(${hInventoryTransactions.createdAt}) >= ${startDate}`,
    sql`DATE(${hInventoryTransactions.createdAt}) <= ${endDate}`,
  ];
  
  if (params.materialId) {
    conditions.push(eq(hInventoryLots.materialId, params.materialId));
  }
  
  // hInventoryLots → hMaterials JOIN으로 tenantId 필터링 (별도 서브쿼리)
  if (params.tenantId) {
    const { hMaterials } = await import("../drizzle/schema");
    conditions.push(sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})`);
  }
  
  const trend = await db
    .select({
      date: sql<string>`DATE(${hInventoryTransactions.createdAt})`,
      receiptQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'receipt' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      usageQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'usage' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      adjustmentQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'adjustment' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      transactionCount: sql<number>`COUNT(*)`
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(and(...conditions))
    .groupBy(sql`DATE(${hInventoryTransactions.createdAt})`)
    .orderBy(sql`DATE(${hInventoryTransactions.createdAt})`);
  
  return trend.map((row) => ({
    date: row.date,
    receiptQuantity: row.receiptQuantity || 0,
    usageQuantity: row.usageQuantity || 0,
    adjustmentQuantity: row.adjustmentQuantity || 0,
    netChange: (row.receiptQuantity || 0) - (row.usageQuantity || 0) + (row.adjustmentQuantity || 0),
    transactionCount: row.transactionCount || 0
  }));
}

/**
 * 원재료별 재고 회전율 분석
 */
export async function getInventoryTurnoverAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  materialId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || new Date().toISOString().split('T')[0];
  const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const { hInventoryTransactions, hMaterials, hInventoryLots } = await import("../drizzle/schema");
  const { sql, and, eq } = await import("drizzle-orm");
  
  // 1. 기간 내 사용량 조회 (lotId를 통해 materialId 얻기)
  const usageData = await db
    .select({
      materialId: hInventoryLots.materialId,
      totalUsage: sql<number>`SUM(${hInventoryTransactions.quantity})`
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(and(
      eq(hInventoryTransactions.transactionType, "usage"),
      sql`DATE(${hInventoryTransactions.createdAt}) >= ${startDate}`,
      sql`DATE(${hInventoryTransactions.createdAt}) <= ${endDate}`,
      params.tenantId ? sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})` : undefined
    ))
    .groupBy(hInventoryLots.materialId);
  
  // 2. 현재 재고 조회
  const currentStock = await db
    .select({
      materialId: hInventoryLots.materialId,
      totalStock: sql<number>`SUM(${hInventoryLots.availableQuantity})`
    })
    .from(hInventoryLots)
    .where(and(
      eq(hInventoryLots.status, "available"),
      params.tenantId ? sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})` : undefined
    ))
    .groupBy(hInventoryLots.materialId);
  
  // 3. 원재료 정보와 결합 (tenantId 필터 포함)
  const materials = await db.select().from(hMaterials).where(
    params.tenantId ? eq(hMaterials.tenantId, params.tenantId) : undefined
  );
  
  // 4. 회전율 계산
  const turnoverRates = materials.map((material) => {
    const usage = usageData.find((u) => u.materialId === material.id);
    const stock = currentStock.find((s) => s.materialId === material.id);
    
    const totalUsage = usage?.totalUsage || 0;
    const totalStock = stock?.totalStock || 0;
    
    // 회전율 = 사용량 / 평균 재고 (간단히 현재 재고로 근사)
    const turnoverRate = totalStock > 0 ? totalUsage / totalStock : 0;
    
    // 재고 일수 = 재고 / (일평균 사용량)
    const daysDiff = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
    const avgDailyUsage = daysDiff > 0 ? totalUsage / daysDiff : 0;
    const daysOfStock = avgDailyUsage > 0 ? totalStock / avgDailyUsage : 0;
    
    return {
      materialId: material.id,
      materialName: material.materialName,
      materialCode: material.materialCode,
      totalUsage,
      totalStock,
      turnoverRate: turnoverRate.toFixed(2),
      daysOfStock: Math.ceil(daysOfStock),
      avgDailyUsage: avgDailyUsage.toFixed(2)
    };
  });
  
  return turnoverRates.sort((a, b) => parseFloat(b.turnoverRate) - parseFloat(a.turnoverRate));
}

/**
 * 생산 일정 최적화 제안 생성
 */
export async function optimizeProductionSchedule(params: {
  startDate: string;
  endDate: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 기간 내 계획된 배치 조회 (★ hProductsV2 사용)
  const batches = await db
    .select({
      id: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      plannedDate: hBatches.plannedDate,
      plannedQuantity: hBatches.plannedQuantity,
      status: hBatches.status
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(
      and(
        eq(hBatches.tenantId, params.tenantId),
        sql`${hBatches.plannedDate} >= ${params.startDate}`,
        sql`${hBatches.plannedDate} <= ${params.endDate}`,
        sql`${hBatches.status} IN ('planned', 'running')`
      )
    )
    .orderBy(hBatches.plannedDate);

  // 2. 각 배치별 필요한 원재료 조회
  const batchMaterials = await Promise.all(
    batches.map(async (batch: any) => {
      try {
        const materials = await calculateMaterialRequirements(batch.id);
        return {
          batchId: batch.id,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          plannedDate: batch.plannedDate,
          materials: materials.materials.filter((m: any) => m.shortage > 0)
        };
      } catch (error) {
        // 레시피가 없는 경우 빈 배열 반환
        return {
          batchId: batch.id,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          plannedDate: batch.plannedDate,
          materials: []
        };
      }
    })
  );

  // 3. 재고 부족이 있는 배치 필터링
  const batchesWithShortage = batchMaterials.filter((b: any) => b.materials.length > 0);

  // 4. LLM API를 사용하여 최적화 제안 생성
  let suggestions: any[] = [];
  
  if (batchesWithShortage.length > 0) {
    try {
      const { invokeLLM } = await import("./_core/llm");
      
      // LLM에 전달할 배치 정보 준비
      const batchInfo = batchesWithShortage.map((batch: any) => ({
        batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
        productName: batch.productName,
        plannedDate: batch.plannedDate,
        shortages: batch.materials.map((m: any) => ({
          material: m.materialName,
          shortage: `${m.shortage.toFixed(2)} ${m.unit}`,
          currentStock: `${m.currentStock.toFixed(2)} ${m.unit}`
        }))
      }));
      
      const prompt = `다음은 HACCP 식품 제조 공장의 생산 일정과 재고 부족 현황입니다.

배치 정보:
${JSON.stringify(batchInfo, null, 2)}

각 배치에 대해 다음 사항을 분석하고 제안해주세요:
1. 재고 부족 문제의 심각성 평가
2. 최적의 해결 방안 (일정 조정, 긴급 발주, 대체 원재료 사용 등)
3. 우선순위 (high/medium/low)

JSON 형식으로 응답해주세요:
{
  "suggestions": [
    {
      "batchCode": "배치 코드",
      "issue": "문제 설명",
      "suggestion": "구체적인 해결 방안",
      "priority": "high/medium/low"
    }
  ]
}`;
      
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "당신은 HACCP 식품 제조 공장의 생산 계획 최적화 전문가입니다." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "production_optimization",
            strict: true,
            schema: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      batchCode: { type: "string" },
                      issue: { type: "string" },
                      suggestion: { type: "string" },
                      priority: { type: "string", enum: ["high", "medium", "low"] }
                    },
                    required: ["batchCode", "issue", "suggestion", "priority"],
                    additionalProperties: false
                  }
                }
              },
              required: ["suggestions"],
              additionalProperties: false
            }
          }
        }
      });
      
      const content = response.choices[0].message.content;
      const llmResult = JSON.parse(typeof content === "string" ? content : "{}");
      
      // LLM 결과를 기존 배치 정보와 결합
      suggestions = batchesWithShortage.map((batch: any) => {
        const llmSuggestion = llmResult.suggestions?.find(
          (s: any) => s.batchCode === batch.batchCode
        );
        
        return {
          batchId: batch.batchId,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          currentDate: batch.plannedDate,
          issue: llmSuggestion?.issue || `재고 부족 (${batch.materials.length}건)`,
          suggestion: llmSuggestion?.suggestion || "일정 연기 또는 원재료 긴급 발주 필요",
          priority: (llmSuggestion?.priority || "high") as "high" | "medium" | "low"
        };
      });
    } catch (error) {
      console.error("LLM API 호출 실패, 기본 제안 사용:", error);
      
      // LLM API 실패 시 기본 제안 사용
      suggestions = batchesWithShortage.map((batch: any) => {
        const shortageList = batch.materials
          .map((m: any) => `${m.materialName}: ${m.shortage.toFixed(2)} ${m.unit} 부족`)
          .join(", ");

        return {
          batchId: batch.batchId,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          currentDate: batch.plannedDate,
          issue: `재고 부족 (${shortageList})`,
          suggestion: "일정 연기 또는 원재료 긴급 발주 필요",
          priority: "high" as const
        };
      });
    }
  }

  return {
    totalBatches: batches.length,
    batchesWithIssues: suggestions.length,
    suggestions
  };
}

/**
 * 최적화 제안 적용 (배치 일정 변경)
 */
export async function applyScheduleOptimization(params: {
  batchId: number;
  newPlannedDate: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(hBatches)
    .set({
      plannedDate: new Date(params.newPlannedDate)
    })
    .where(and(eq(hBatches.id, params.batchId), eq(hBatches.tenantId, params.tenantId)));

  return { success: true };
}

/**
 * 재고 예측 분석 (과거 사용 패턴 기반)
 */
export async function predictInventoryShortage(params: {
  materialId: number;
  days: number; // 예측 기간 (일)
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 과거 30일간 재고 거래 내역 조회
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const transactions = await db
    .select({
      createdAt: hInventoryTransactions.createdAt,
      quantity: hInventoryTransactions.quantity,
      transactionType: hInventoryTransactions.transactionType
    })
    .from(hInventoryTransactions)
    .innerJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(
      and(
        eq(hInventoryLots.materialId, params.materialId),
        sql`${hInventoryTransactions.createdAt} >= ${thirtyDaysAgo.toISOString().split('T')[0]}`,
        params.tenantId ? sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})` : undefined
      )
    )
    .orderBy(hInventoryTransactions.createdAt);
  
  // 2. 일평균 사용량 계산 (사용 거래만)
  const usageTransactions = transactions.filter(t => t.transactionType === "usage");
  const totalUsage = usageTransactions.reduce((sum, t) => sum + Math.abs(Number(t.quantity)), 0);
  const dailyAverageUsage = usageTransactions.length > 0 ? totalUsage / 30 : 0;
  
  // 3. 현재 재고 조회
  const currentStock = await db
    .select({
      totalQuantity: sql<number>`COALESCE(SUM(${hInventoryLots.quantity}), 0)`
    })
    .from(hInventoryLots)
    .where(
      and(
        eq(hInventoryLots.materialId, params.materialId),
        sql`${hInventoryLots.status} = 'available'`,
        params.tenantId ? sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})` : undefined
      )
    );
  
  const currentQuantity = Number(currentStock[0]?.totalQuantity || 0);
  
  // 4. 예측: 재고 부족 예상 일자 계산
  const daysUntilShortage = dailyAverageUsage > 0 ? Math.floor(currentQuantity / dailyAverageUsage) : 999;
  const shortageDate = new Date();
  shortageDate.setDate(shortageDate.getDate() + daysUntilShortage);
  
  // 5. 권장 발주량 계산 (예측 기간 동안 필요한 수량)
  const recommendedOrderQuantity = dailyAverageUsage * params.days;
  
  return {
    materialId: params.materialId,
    currentStock: currentQuantity,
    dailyAverageUsage: dailyAverageUsage,
    daysUntilShortage: daysUntilShortage,
    shortageDate: daysUntilShortage < 999 ? shortageDate.toISOString().split('T')[0] : null,
    recommendedOrderQuantity: Math.ceil(recommendedOrderQuantity),
    isUrgent: daysUntilShortage <= 7
  };
}

/**
 * 모든 원재료 재고 부족 예측
 */
export async function predictAllInventoryShortage(days: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 모든 원재료 조회 (tenantId 필터 포함)
  const materials = await db
    .select({
      id: hMaterials.id,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      unit: hMaterials.unit
    })
    .from(hMaterials)
    .where(tenantId ? eq(hMaterials.tenantId, tenantId) : undefined);
  
  // 2. 각 원재료별로 재고 부족 예측
  const predictions = await Promise.all(
    materials.map(async (material) => {
      try {
        const prediction = await predictInventoryShortage({
          materialId: material.id,
          days,
          tenantId
        });
        return {
          ...prediction,
          materialCode: material.materialCode,
          materialName: material.materialName,
          unit: material.unit
        };
      } catch (error) {
        console.error(`Failed to predict shortage for material ${material.id}:`, error);
        return null;
      }
    })
  );
  
  // 3. null 제거 및 부족 예상 원재료만 필터링
  return predictions
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .filter((p) => p.daysUntilShortage < 999)
    .sort((a, b) => a.daysUntilShortage - b.daysUntilShortage);
}

/**
 * 자동 발주 제안 생성 (모든 원재료 대상)
 */
export async function generatePurchaseOrderSuggestions(params: {
  days: number; // 예측 기간 (일)
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 모든 활성 원재료 조회 (tenantId 필터 포함)
  const conditions: any[] = [eq(hMaterials.isActive, 1)];
  if (params.tenantId) {
    conditions.push(eq(hMaterials.tenantId, params.tenantId));
  }
  const materials = await db
    .select({
      id: hMaterials.id,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      unit: hMaterials.unit,
      safetyStockLevel: hMaterials.safetyStockLevel
    })
    .from(hMaterials)
    .where(and(...conditions));
  
  // 2. 각 원재료별 재고 예측 분석
  const suggestions = await Promise.all(
    materials.map(async (material: any) => {
      const prediction = await predictInventoryShortage({
        materialId: material.id,
        days: params.days,
        tenantId: params.tenantId
      });
      
      const safetyStock = Number(material.safetyStockLevel || 0);
      const leadTime = 7; // 기본 리드타임 7일
      
      // 안전 재고 미달 또는 리드타임 내 부족 예상 시 발주 제안
      const needsOrder = 
        prediction.currentStock < safetyStock ||
        prediction.daysUntilShortage <= leadTime;
      
      if (!needsOrder) return null;
      
      return {
        materialId: material.id,
        materialCode: material.materialCode,
        materialName: material.materialName,
        unit: material.unit,
        currentStock: prediction.currentStock,
        safetyStockLevel: safetyStock,
        dailyUsage: prediction.dailyAverageUsage,
        daysUntilShortage: prediction.daysUntilShortage,
        shortageDate: prediction.shortageDate,
        recommendedOrderQuantity: prediction.recommendedOrderQuantity,
        leadTimeDays: leadTime,
        priority: prediction.isUrgent ? "urgent" as const : "normal" as const,
        reason: prediction.currentStock < safetyStock
          ? "안전 재고 미달"
          : `${prediction.daysUntilShortage}일 내 재고 부족 예상`
      };
    })
  );
  
  return suggestions.filter((s): s is NonNullable<typeof s> => s !== null);
}

/**
 * 모든 원재료 재고 부족 예측 (UI용)
 */
export async function predictAllMaterialsShortage(params: {
  days: number; // 예측 기간 (일)
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 모든 활성 원재료 조회 (tenantId 필터 포함)
  const conditions: any[] = [eq(hMaterials.isActive, 1)];
  if (params.tenantId) {
    conditions.push(eq(hMaterials.tenantId, params.tenantId));
  }
  const materials = await db
    .select({
      id: hMaterials.id,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      unit: hMaterials.unit
    })
    .from(hMaterials)
    .where(and(...conditions));
  
  // 2. 각 원재료별 재고 예측
  const predictions = await Promise.all(
    materials.map(async (material: any) => {
      const prediction = await predictInventoryShortage({
        materialId: material.id,
        days: params.days,
        tenantId: params.tenantId
      });
      
      // 예측 기간 내 부족이 예상되는 경우만 반환
      if (prediction.daysUntilShortage > params.days) {
        return null;
      }
      
      return {
        materialId: material.id,
        materialCode: material.materialCode,
        materialName: material.materialName,
        unit: material.unit,
        currentStock: prediction.currentStock,
        avgDailyUsage: prediction.dailyAverageUsage,
        predictedShortageDate: prediction.shortageDate,
        daysUntilShortage: prediction.daysUntilShortage
      };
    })
  );
  
  return predictions
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.daysUntilShortage - b.daysUntilShortage);
}

/**
 * 배치별 원가 분석
 */
export async function getBatchCostAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  productId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || new Date().toISOString().split('T')[0];
  const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // 1. 기간 내 완료된 배치 조회
  const conditions = [
    sql`${hBatches.startTime} >= ${startDate}`,
    sql`${hBatches.endTime} <= ${endDate}`,
    eq(hBatches.status, "completed")
  ];
  if (params.tenantId) {
    conditions.push(eq(hBatches.tenantId, params.tenantId));
  }
  const batches = await db
    .select({
      id: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      plannedQuantity: hBatches.plannedQuantity,
      actualQuantity: hBatches.actualQuantity,
      startTime: hBatches.startTime,
      endTime: hBatches.endTime,
      plannedCost: hBatches.plannedCost,
      actualCost: hBatches.actualCost
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .orderBy(hBatches.startTime);
  
  // 2. 각 배치별 원재료 비용 계산
  const batchCosts = await Promise.all(
    batches.map(async (batch: any) => {
      // 배치에 사용된 원재료 거래 내역 조회 (referenceType = 'batch', referenceId = batchId)
      const transactions = await db
        .select({
          quantity: hInventoryTransactions.quantity,
          materialId: hInventoryLots.materialId
        })
        .from(hInventoryTransactions)
        .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
        .where(
          and(
            eq(hInventoryTransactions.referenceType, "batch"),
            eq(hInventoryTransactions.referenceId, batch.id),
            eq(hInventoryTransactions.transactionType, "usage")
          )
        );
      
      // 원가 계산 (간소화: 수량만 합산)
      const totalQuantity = transactions.reduce(
        (sum: number, t: any) => sum + Math.abs(Number(t.quantity) || 0),
        0
      );
      
      // TODO: 실제 원가 계산은 원재료 단가 정보가 필요함
      const materialCost = totalQuantity * 100; // 임시 단가 100원 사용
      
      // 생산 시간 계산 (시간 단위)
      const productionTime = batch.startTime && batch.endTime
        ? (new Date(batch.endTime).getTime() - new Date(batch.startTime).getTime()) / (1000 * 60 * 60)
        : 0;
      
      // 단위당 원가 계산
      const unitCost = batch.actualQuantity > 0
        ? materialCost / batch.actualQuantity
        : 0;
      
      return {
        batchId: batch.id,
        batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
        productName: batch.productName,
        plannedQuantity: batch.plannedQuantity,
        actualQuantity: batch.actualQuantity,
        plannedCost: Number(batch.plannedCost || 0),
        actualCost: Number(batch.actualCost || 0),
        materialCost: Number(materialCost.toFixed(2)),
        unitCost: Number(unitCost.toFixed(2)),
        productionTime: Number(productionTime.toFixed(2))
      };
    })
  );
  
  return batchCosts;
}

/**
 * 생산 시간 추이 분석
 */
export async function getProductionTimeAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  productId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || new Date().toISOString().split('T')[0];
  const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // sql 템플릿으로 전체 쿼리 작성 (ONLY_FULL_GROUP_BY 모드 호환)
  const tenantFilter = params.tenantId ? sql`AND tenant_id = ${params.tenantId}` : sql``;
  const result = await db.execute<{
    date: string;
    avgProductionTime: number;
    totalBatches: number;
  }>(sql`
    SELECT 
      DATE(start_time) as date,
      AVG(TIMESTAMPDIFF(HOUR, start_time, end_time)) as avgProductionTime,
      COUNT(*) as totalBatches
    FROM h_batches
    WHERE start_time >= ${startDate}
      AND end_time <= ${endDate}
      AND status = 'completed'
      ${tenantFilter}
    GROUP BY DATE(start_time)
    ORDER BY DATE(start_time)
  `);
  
  return result.map((r: any) => ({
    date: r.date,
    avgProductionTime: Number(r.avgProductionTime) || 0,
    totalBatches: Number(r.totalBatches) || 0
  }));
}

/**
 * 불량률 분석
 */
export async function getDefectRateAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  productId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || new Date().toISOString().split('T')[0];
  const startDate = params.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const conditions = [
    sql`${hBatches.startTime} >= ${startDate}`,
    sql`${hBatches.endTime} <= ${endDate}`,
    eq(hBatches.status, "completed")
  ];
  if (params.tenantId) {
    conditions.push(eq(hBatches.tenantId, params.tenantId));
  }
  const result = await db
    .select({
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      totalPlanned: sql<number>`SUM(${hBatches.plannedQuantity})`,
      totalActual: sql<number>`SUM(${hBatches.actualQuantity})`,
      batchCount: sql<number>`COUNT(*)`
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .groupBy(hBatches.productId, hProductsV2.productName);
  
  return result.map((r: any) => {
    const totalPlanned = Number(r.totalPlanned || 0);
    const totalActual = Number(r.totalActual || 0);
    const defectRate = totalPlanned > 0
      ? ((totalPlanned - totalActual) / totalPlanned) * 100
      : 0;
    
    return {
      productId: r.productId,
      productName: r.productName,
      totalPlanned,
      totalActual,
      defectRate: Number(defectRate.toFixed(2)),
      batchCount: Number(r.batchCount || 0)
    };
  });
}

// ============================================================================
// Phase 123: 발주 제안 승인/거부 워크플로우
// ============================================================================

/**
 * 발주 제안 승인 및 자동 발주 주문 생성
 */
export async function approvePurchaseOrderSuggestion(params: {
  materialId: number;
  quantity: number;
  approvedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 1. 원재료 정보 조회
  const [material] = await db
    .select()
    .from(hMaterials)
    .where(eq(hMaterials.id, params.materialId));
  
  if (!material) {
    throw new Error("원재료를 찾을 수 없습니다");
  }
  
  // 2. 발주 주문 생성 (간소화: 발주 테이블이 없으므로 재고 거래로 기록)
  const now = new Date();
  
  // 3. LOT 생성 (발주 승인 = 입고 예정)
  const [newLot] = await db
    .insert(hInventoryLots)
    .values({
      materialId: params.materialId,
      lotNumber: `PO-${Date.now()}`,
      quantity: params.quantity.toString(),
      availableQuantity: params.quantity.toString(),
      unit: material.unit || "kg",
      expiryDate: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), // 90일 후 유통기한
      receiptDate: now,
      status: "available"
    })
    .$returningId();
  
  // 4. 거래 내역 기록
  await db.insert(hInventoryTransactions).values({
    lotId: newLot.id,
    transactionType: "receipt",
    quantity: params.quantity.toString(),
    unit: material.unit || "kg",
    createdBy: params.approvedBy,
    notes: `발주 제안 승인 - 자동 생성`
  });
  
  return {
    success: true,
    lotId: newLot.id,
    message: "발주 제안이 승인되었으며, 입고 예정 LOT가 생성되었습니다"
  };
}

/**
 * 발주 제안 거부
 */
export async function rejectPurchaseOrderSuggestion(params: {
  materialId: number;
  rejectedBy: number;
  reason?: string;
}) {
  // 간소화: 거부 내역은 로그로만 기록
  console.log(`[발주 제안 거부] 원재료 ID: ${params.materialId}, 거부자: ${params.rejectedBy}, 사유: ${params.reason || "없음"}`);
  
  return {
    success: true,
    message: "발주 제안이 거부되었습니다"
  };
}

/**
 * 발주 제안 이력 조회
 */
export async function getPurchaseProposalHistory(params: {
  startDate?: string;
  endDate?: string;
  status?: "draft" | "submitted" | "approved" | "received" | "cancelled";
  materialId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const { hPurchaseOrders, hPurchaseOrderItems, hMaterials, hSuppliers } = await import("../drizzle/schema");
  const { and, eq, gte, lte, sql } = await import("drizzle-orm");
  
  const conditions = [];
  
  if (params.startDate) {
    conditions.push(gte(hPurchaseOrders.orderDate, new Date(params.startDate)));
  }
  if (params.endDate) {
    conditions.push(lte(hPurchaseOrders.orderDate, new Date(params.endDate)));
  }
  if (params.status) {
    conditions.push(eq(hPurchaseOrders.status, params.status));
  }
  
  // 발주 주문 조회
  const orders = await db
    .select({
      id: hPurchaseOrders.id,
      poNumber: hPurchaseOrders.poNumber,
      orderDate: hPurchaseOrders.orderDate,
      expectedDeliveryDate: hPurchaseOrders.expectedDeliveryDate,
      totalAmount: hPurchaseOrders.totalAmount,
      status: hPurchaseOrders.status,
      notes: hPurchaseOrders.notes,
      createdAt: hPurchaseOrders.createdAt,
      supplierId: hPurchaseOrders.supplierId
    })
    .from(hPurchaseOrders)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${hPurchaseOrders.orderDate} DESC`);
  
  // 각 발주 주문의 항목 조회
  const ordersWithItems = await Promise.all(
    orders.map(async (order) => {
      const items = await db
        .select({
          id: hPurchaseOrderItems.id,
          materialId: hPurchaseOrderItems.materialId,
          materialName: hMaterials.materialName,
          materialCode: hMaterials.materialCode,
          quantity: hPurchaseOrderItems.quantity,
          unit: hPurchaseOrderItems.unit,
          unitPrice: hPurchaseOrderItems.unitPrice,
          totalPrice: hPurchaseOrderItems.totalPrice,
          notes: hPurchaseOrderItems.notes
        })
        .from(hPurchaseOrderItems)
        .leftJoin(hMaterials, eq(hPurchaseOrderItems.materialId, hMaterials.id))
        .where(eq(hPurchaseOrderItems.poId, order.id));
      
      // 원재료 필터링
      const filteredItems = params.materialId
        ? items.filter((item) => item.materialId === params.materialId)
        : items;
      
      // 원재료 필터링 후 항목이 없으면 해당 주문 제외
      if (params.materialId && filteredItems.length === 0) {
        return null;
      }
      
      // 공급업체 정보 조회
      const [supplier] = await db
        .select({
          supplierName: hSuppliers.supplierName
        })
        .from(hSuppliers)
        .where(eq(hSuppliers.id, order.supplierId));
      
      return {
        ...order,
        supplierName: supplier?.supplierName || "알 수 없음",
        items: filteredItems
      };
    })
  );
  
  // null 제거 (원재료 필터링으로 제외된 경우)
  return ordersWithItems.filter((order) => order !== null);
}


// ============================================================
// 통합 대시보드 탭별 API (Phase 134)
// ============================================================

/**
 * 생산 효율성 탭 통합 데이터 조회
 * - 배치별 원가 분석
 * - 생산 시간 추이
 * - 불량률 분석
 */
export async function getProductionEfficiencyData(params: {
  siteId: number;
  startDate?: string;
  endDate?: string;
  productId?: number;
}) {
  const [costAnalysis, timeAnalysis, defectAnalysis] = await Promise.all([
    getBatchCostAnalysis(params),
    getProductionTimeAnalysis(params),
    getDefectRateAnalysis(params),
  ]);

  return {
    costAnalysis,
    timeAnalysis,
    defectAnalysis
  };
}

/**
 * 재고 추이 탭 통합 데이터 조회
 * - 재고 추이
 * - 재고 회전율
 * - 유통기한 임박 원재료
 */
export async function getInventoryTrendData(params: {
  siteId: number;
  startDate?: string;
  endDate?: string;
  materialId?: number;
  tenantId: number;
}) {
  const [inventoryTrend, turnoverAnalysis, expiringMaterials] = await Promise.all([
    getInventoryTrend(params),
    getInventoryTurnoverAnalysis(params),
    getExpiringMaterials(params.tenantId),
  ]);

  return {
    inventoryTrend,
    turnoverAnalysis,
    expiringMaterials
  };
}

// 검사 통계 대시보드
export * from "./db/inspectionStatistics";

// 승인 워크플로우 대시보드
export * from "./db/approvalDashboard";

export * from "./db/productionPrediction";
export * from "./db/lotTraceHistory";


// ==================== 사용자 그룹 관리 ====================

/**
 * 그룹 생성
 */
export async function createGroup(data: {
  name: string;
  description?: string;
  groupType: "department" | "team" | "project" | "custom";
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroups } = await import("../drizzle/schema_main");

  const [result] = await db.insert(userGroups).values({
    name: data.name,
    description: data.description,
    groupType: data.groupType,
    createdBy: data.createdBy
  });

  return result.insertId;
}

/**
 * 모든 그룹 조회
 */
export async function getAllGroups() {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroups, users } = await import("../drizzle/schema_main");

  const groups = await db
    .select({
      id: userGroups.id,
      name: userGroups.name,
      description: userGroups.description,
      groupType: userGroups.groupType,
      createdAt: userGroups.createdAt,
      updatedAt: userGroups.updatedAt,
      createdBy: userGroups.createdBy,
      creatorName: users.name
    })
    .from(userGroups)
    .leftJoin(users, eq(userGroups.createdBy, users.id))
    .orderBy(desc(userGroups.createdAt));

  return groups;
}

/**
 * 그룹 정보 수정
 */
export async function updateGroup(
  groupId: number,
  data: {
    name?: string;
    description?: string;
    groupType?: "department" | "team" | "project" | "custom";
  }
) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroups } = await import("../drizzle/schema_main");

  await db
    .update(userGroups)
    .set(data)
    .where(eq(userGroups.id, groupId));

  return true;
}

/**
 * 그룹 삭제
 */
export async function deleteGroup(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroups } = await import("../drizzle/schema_main");

  await db.delete(userGroups).where(eq(userGroups.id, groupId));

  return true;
}

/**
 * 그룹에 멤버 추가
 */
export async function addGroupMember(data: {
  groupId: number;
  userId: number;
  role: "member" | "leader" | "admin";
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroupMembers } = await import("../drizzle/schema_main");

  await db.insert(userGroupMembers).values({
    groupId: data.groupId,
    userId: data.userId,
    role: data.role
  });

  return true;
}

/**
 * 그룹에서 멤버 제거
 */
export async function removeGroupMember(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroupMembers } = await import("../drizzle/schema_main");

  await db
    .delete(userGroupMembers)
    .where(
      and(
        eq(userGroupMembers.groupId, groupId),
        eq(userGroupMembers.userId, userId)
      )
    );

  return true;
}

/**
 * 그룹 멤버 목록 조회
 */
export async function getGroupMembers(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroupMembers, users } = await import("../drizzle/schema_main");

  const members = await db
    .select({
      id: userGroupMembers.id,
      groupId: userGroupMembers.groupId,
      userId: userGroupMembers.userId,
      role: userGroupMembers.role,
      joinedAt: userGroupMembers.joinedAt,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role
    })
    .from(userGroupMembers)
    .innerJoin(users, eq(userGroupMembers.userId, users.id))
    .where(eq(userGroupMembers.groupId, groupId))
    .orderBy(desc(userGroupMembers.joinedAt));

  return members;
}

/**
 * 사용자가 속한 그룹 목록 조회
 */
export async function getUserGroups(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroupMembers, userGroups } = await import("../drizzle/schema_main");

  const groups = await db
    .select({
      id: userGroups.id,
      name: userGroups.name,
      description: userGroups.description,
      groupType: userGroups.groupType,
      memberRole: userGroupMembers.role,
      joinedAt: userGroupMembers.joinedAt
    })
    .from(userGroupMembers)
    .innerJoin(userGroups, eq(userGroupMembers.groupId, userGroups.id))
    .where(eq(userGroupMembers.userId, userId))
    .orderBy(desc(userGroupMembers.joinedAt));

  return groups;
}

/**
 * 재고 출고
 */
export async function releaseInventoryStock(params: {
  lotId: number;
  quantity: number;
  reason?: string;
  userId: number;
}) {
  const db = await getDb();
  
  const { hInventoryLots, hInventoryTransactions } = await import("../drizzle/schema_main");
  const { eq } = await import("drizzle-orm");
  
  // LOT 조회
  const lot = await db.select().from(hInventoryLots).where(eq(hInventoryLots.id, params.lotId)).limit(1);
  if (!lot || lot.length === 0) {
    throw new Error("LOT를 찾을 수 없습니다");
  }
  
  const currentLot = lot[0];
  const availableQty = parseFloat(currentLot.availableQuantity);
  
  if (availableQty < params.quantity) {
    throw new Error(`가용 수량이 부족합니다 (가용: ${availableQty}, 요청: ${params.quantity})`);
  }
  
  // 가용 수량 감소
  await db.update(hInventoryLots)
    .set({
      availableQuantity: (availableQty - params.quantity).toString()
    })
    .where(eq(hInventoryLots.id, params.lotId));
  
  // 거래 기록 생성
  await db.insert(hInventoryTransactions).values({
    lotId: params.lotId,
    materialId: currentLot.materialId,
    transactionType: "release",
    quantity: params.quantity.toString(),
    unit: currentLot.unit,
    transactionDate: new Date(),
    reason: params.reason || "재고 출고",
    userId: params.userId
  });
  
  return { success: true, message: "재고 출고가 완료되었습니다" };
}

/**
 * 입고 내역 조회
 */
export async function getInventoryReceiptHistory() {
  const db = await getDb();
  
  const { hInventoryLots, hMaterials } = await import("../drizzle/schema_main");
  const { desc, eq } = await import("drizzle-orm");
  
  const receipts = await db
    .select({
      id: hInventoryLots.id,
      lotNumber: hInventoryLots.lotNumber,
      materialId: hInventoryLots.materialId,
      materialName: hMaterials.materialName,
      quantity: hInventoryLots.quantity,
      unit: hInventoryLots.unit,
      receiptDate: hInventoryLots.receiptDate,
      expiryDate: hInventoryLots.expiryDate
    })
    .from(hInventoryLots)
    .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .orderBy(desc(hInventoryLots.receiptDate))
    .limit(100);
  
  return receipts;
}

/**
 * 재고 조정
 */
export async function adjustInventoryStock(params: {
  lotId: number;
  quantityChange: number;
  reason: string;
  userId: number;
}) {
  const db = await getDb();
  
  const { hInventoryLots, hInventoryTransactions } = await import("../drizzle/schema_main");
  const { eq } = await import("drizzle-orm");
  
  // LOT 조회
  const lot = await db.select().from(hInventoryLots).where(eq(hInventoryLots.id, params.lotId)).limit(1);
  if (!lot || lot.length === 0) {
    throw new Error("LOT를 찾을 수 없습니다");
  }
  
  const currentLot = lot[0];
  const currentQty = parseFloat(currentLot.quantity);
  const currentAvailableQty = parseFloat(currentLot.availableQuantity);
  const newQty = currentQty + params.quantityChange;
  const newAvailableQty = currentAvailableQty + params.quantityChange;
  
  if (newQty < 0 || newAvailableQty < 0) {
    throw new Error("조정 후 수량이 음수가 될 수 없습니다");
  }
  
  // 수량 조정
  await db.update(hInventoryLots)
    .set({
      quantity: newQty.toString(),
      availableQuantity: newAvailableQty.toString()
    })
    .where(eq(hInventoryLots.id, params.lotId));
  
  // 거래 기록 생성
  await db.insert(hInventoryTransactions).values({
    lotId: params.lotId,
    materialId: currentLot.materialId,
    transactionType: params.quantityChange > 0 ? "adjustment_increase" : "adjustment_decrease",
    quantity: Math.abs(params.quantityChange).toString(),
    unit: currentLot.unit,
    transactionDate: new Date(),
    reason: params.reason,
    userId: params.userId
  });
  
  return { success: true, message: "재고 조정이 완료되었습니다" };
}

/**
 * 재고 출고
 */
// 배치 생성 시 자동 문서 생성 함수
export async function autoGenerateDocumentsForBatch(
  batchId: number,
  siteId: number,
  productId: number,
  workDate: Date,
  createdBy: number
) {
  const db = await getDb();
  if (!db) {
    console.error('[autoGenerateDocumentsForBatch] DB 연결 실패');
    return [];
  }
  
  try {
    const rawConn = await getRawConnection();
    if (!rawConn) {
      console.error('[autoGenerateDocumentsForBatch] Raw connection 실패');
      return [];
    }
    
    const workDateStr = workDate instanceof Date 
      ? workDate.toISOString().split('T')[0] 
      : workDate;
    const now = new Date().toISOString().replace('T', ' ').split('.')[0];
    
    // 1. auto_generate_on_batch = 1인 문서 유형 조회
    const [docTypes] = await rawConn.execute(
      "SELECT id, code, name, category FROM document_types WHERE auto_generate_on_batch = 1"
    );
    
    if (!docTypes || (docTypes as any[]).length === 0) {
      console.log('[autoGenerateDocumentsForBatch] 자동 생성 대상 문서 유형 없음');
      return [];
    }
    
    const generatedDocs: any[] = [];
    
    // 2. 각 문서 유형별로 document_instances 생성
    for (const docType of (docTypes as any[])) {
      // 이미 생성된 문서가 있는지 확인 (중복 방지)
      const [existing] = await rawConn.execute(
        "SELECT id FROM document_instances WHERE batch_id = ? AND document_type_id = ? AND site_id = ?",
        [batchId, docType.id, siteId]
      );
      
      if ((existing as any[]).length > 0) {
        console.log(`[autoGenerateDocumentsForBatch] 이미 존재: batch=${batchId}, docType=${docType.code}`);
        continue;
      }
      
      // document_instances 생성
      const [result] = await rawConn.execute(
        `INSERT INTO document_instances 
         (site_id, document_type_id, batch_id, product_id, work_date, status, is_auto_generated, created_by, created_at) 
         VALUES (?, ?, ?, ?, ?, 'pending_review', 1, ?, ?)`,
        [siteId, docType.id, batchId, productId, workDateStr, createdBy, now]
      );
      
      const insertId = (result as any).insertId;
      generatedDocs.push({
        id: insertId,
        documentTypeCode: docType.code,
        documentTypeName: docType.name,
        category: docType.category,
      });
      
      console.log(`[autoGenerateDocumentsForBatch] 문서 생성: batch=${batchId}, docType=${docType.code}, id=${insertId}`);
    }
    
    console.log(`[autoGenerateDocumentsForBatch] 총 ${generatedDocs.length}건 문서 자동 생성 완료`);
    return generatedDocs;
  } catch (error) {
    console.error('[autoGenerateDocumentsForBatch] 오류:', error);
    return [];
  }
}


// ==================== 테넌트 관리 ====================

/**
 * 테넌트 상세 정보 조회
 */
export async function getTenantDetail(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const rawConn = await getRawConnection();
  if (!rawConn) throw new Error("Raw connection failed");
  
  // 1) 테넌트 기본 정보
  const [tenantInfo] = await rawConn.execute(
    "SELECT id, name, status, created_at as createdAt FROM tenants WHERE id = ?",
    [tenantId]
  );
  
  if (!tenantInfo || (tenantInfo as any[]).length === 0) {
    throw new Error("Tenant not found");
  }
  
  // 2) 구성원 목록
  const [members] = await rawConn.execute(
    "SELECT id, email, name, role, approval_status as approvalStatus, is_active as isActive, last_login_at as lastLoginAt, created_at as createdAt FROM users WHERE tenant_id = ? ORDER BY created_at",
    [tenantId]
  );
  
  // 3) 사용 데이터량 통계
  const [batchCount] = await rawConn.execute(
    "SELECT COUNT(*) as count FROM h_batches WHERE tenant_id = ?",
    [tenantId]
  );
  
  const [ccpCount] = await rawConn.execute(
    "SELECT COUNT(*) as count FROM h_ccp_instances WHERE tenant_id = ?",
    [tenantId]
  );
  
  const [docCount] = await rawConn.execute(
    "SELECT COUNT(*) as count FROM h_documents WHERE tenant_id = ?",
    [tenantId]
  );
  
  const [checklistCount] = await rawConn.execute(
    "SELECT COUNT(*) as count FROM h_checklist_instances WHERE tenant_id = ?",
    [tenantId]
  );
  
  // 4) 활동 통계
  const [loginStats] = await rawConn.execute(
    "SELECT COUNT(DISTINCT user_id) as active_users, COUNT(*) as total_logins FROM h_audit_logs WHERE tenant_id = ? AND action = 'auth.login' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
    [tenantId]
  );
  
  const [lastActivity] = await rawConn.execute(
    "SELECT MAX(created_at) as last_activity FROM h_audit_logs WHERE tenant_id = ?",
    [tenantId]
  );
  
  return {
    tenant: (tenantInfo as any[])[0],
    members: (members as any[]) || [],
    memberCount: ((members as any[]) || []).length,
    dataUsage: {
      batches: (batchCount as any[])[0]?.count || 0,
      ccpInstances: (ccpCount as any[])[0]?.count || 0,
      documents: (docCount as any[])[0]?.count || 0,
      checklists: (checklistCount as any[])[0]?.count || 0
    },
    activityStats: {
      activeUsersLast7Days: (loginStats as any[])[0]?.active_users || 0,
      totalLoginsLast7Days: (loginStats as any[])[0]?.total_logins || 0,
      lastActivity: (lastActivity as any[])[0]?.last_activity || null
    }
  };
}

/**
 * 모든 테넌트 목록 조회
 */
export async function getAllTenants() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const rawConn = await getRawConnection();
  if (!rawConn) throw new Error("Raw connection failed");
  
  const [tenants] = await rawConn.execute(
    "SELECT id, name, status, created_at as createdAt FROM tenants ORDER BY created_at"
  );
  
  return (tenants as any[]) || [];
}
