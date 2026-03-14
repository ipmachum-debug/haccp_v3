/**
 * TenantDb - 테넌트 격리가 구조적으로 강제되는 DB 접근 클래스
 * 
 * 핵심 원칙:
 * - 생성 시점에 tenantId가 확정되며, 이후 모든 쿼리에 자동 적용
 * - tenantId를 "잊어버리는 것"이 구조적으로 불가능
 * - tRPC 미들웨어에서 자동 생성되어 ctx.db로 제공
 * 
 * 사용법:
 *   // 라우터에서
 *   list: tenantProcedure.query(async ({ ctx }) => {
 *     return ctx.db.getAllBatches();  // tenantId 자동 적용
 *   })
 */

import { getDb } from "../db";
import { eq, and, desc, asc, sql, gte, lte, isNull, inArray, type SQL } from "drizzle-orm";
import {
  hBatches, hProducts, hProductsV2, hMaterials, hCcpInstances, hCcpRows, hCcpRecords,
  hCcpTemplates, hBatchInputs, hInventoryLots, hInventory, hInventoryTransactions,
  hSuppliers, hApprovalRequests, hApprovalHistory, hNotifications, hNotificationSettings,
  hCcpDeviations, hSupplierEvaluations, users,
  materialInspectionRecords, materialInspectionItems,
  shippingInspectionRecords, shippingInspectionItems,
  hygieneInspectionRecords, hygieneInspectionItems,
} from "../../drizzle/schema";

export class TenantDb {
  public readonly tenantId: number;
  public readonly userId: number;

  constructor(tenantId: number, userId: number) {
    if (!tenantId || tenantId <= 0) {
      throw new Error(`[TenantDb] Invalid tenantId: ${tenantId}. Refusing to create unscoped DB access.`);
    }
    if (!userId || userId <= 0) {
      throw new Error(`[TenantDb] Invalid userId: ${userId}. Refusing to create unscoped DB access.`);
    }
    this.tenantId = tenantId;
    this.userId = userId;
  }

  /**
   * 원본 drizzle DB 인스턴스 반환 (테넌트 필터는 직접 적용 필요)
   * ⚠️ 가급적 TenantDb의 래퍼 메서드를 사용하세요.
   * 직접 사용 시 반드시 tenantId 조건을 포함해야 합니다.
   */
  async raw() {
    return getDb();
  }

  /**
   * 테넌트 필터가 적용된 기본 where 조건 생성 헬퍼
   */
  tenantFilter(table: { tenantId: any }): SQL {
    return eq(table.tenantId, this.tenantId);
  }

  // ============================================================================
  // 배치(Batch) 관련
  // ============================================================================

  async getAllBatches(filters?: {
    status?: string;
    productId?: number;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const db = await getDb();
    const conditions: SQL[] = [eq(hBatches.tenantId, this.tenantId)];

    if (filters?.status) conditions.push(eq(hBatches.status, filters.status) as any);
    if (filters?.productId) conditions.push(eq(hBatches.productId, filters.productId));
    if (filters?.startDate) conditions.push(gte((hBatches as any).productionDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte((hBatches as any).productionDate, filters.endDate));
    if (filters?.search) {
      conditions.push(sql`(${hBatches.batchCode} LIKE ${`%${filters.search}%`})`);
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;

    const items = await db.select().from(hBatches)
      .where(and(...conditions))
      .orderBy(desc(hBatches.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return items;
  }

  async getBatchById(batchId: number) {
    const db = await getDb();
    const result = await db.select().from(hBatches)
      .where(and(
        eq(hBatches.id, batchId),
        eq(hBatches.tenantId, this.tenantId)
      ))
      .limit(1);
    return result[0] ?? null;
  }

  async createBatch(data: {
    productId: number;
    batchCode: string;
    productionDate?: string;
    quantity?: number;
    status?: string;
    [key: string]: any;
  }) {
    const db = await getDb();
    return db.insert(hBatches).values({
      ...data,
      tenantId: this.tenantId,
      createdBy: this.userId,
    } as any);
  }

  async updateBatch(batchId: number, data: Record<string, any>) {
    const db = await getDb();
    return db.update(hBatches)
      .set(data)
      .where(and(
        eq(hBatches.id, batchId),
        eq(hBatches.tenantId, this.tenantId)
      ));
  }

  async deleteBatch(batchId: number) {
    const db = await getDb();
    return db.delete(hBatches)
      .where(and(
        eq(hBatches.id, batchId),
        eq(hBatches.tenantId, this.tenantId)
      ));
  }

  // ============================================================================
  // 제품(Product) 관련
  // ============================================================================

  async getAllProducts() {
    const db = await getDb();
    return db.select().from(hProductsV2)
      .where(eq(hProductsV2.tenantId, this.tenantId))
      .orderBy(asc(hProductsV2.productName));
  }

  async getProductById(productId: number) {
    const db = await getDb();
    const result = await db.select().from(hProductsV2)
      .where(and(
        eq(hProductsV2.id, productId),
        eq(hProductsV2.tenantId, this.tenantId)
      ))
      .limit(1);
    return result[0] ?? null;
  }

  // ============================================================================
  // 원재료(Material) 관련
  // ============================================================================

  async getAllMaterials(filters?: { search?: string; category?: string }) {
    const db = await getDb();
    const conditions: SQL[] = [eq(hMaterials.tenantId, this.tenantId)];

    if (filters?.search) {
      conditions.push(sql`(${(hMaterials as any).name} LIKE ${`%${filters.search}%`} OR ${(hMaterials as any).code} LIKE ${`%${filters.search}%`})`);
    }

    return db.select().from(hMaterials)
      .where(and(...conditions))
      .orderBy(asc((hMaterials as any).name));
  }

  async getMaterialById(materialId: number) {
    const db = await getDb();
    const result = await db.select().from(hMaterials)
      .where(and(
        eq(hMaterials.id, materialId),
        eq(hMaterials.tenantId, this.tenantId)
      ))
      .limit(1);
    return result[0] ?? null;
  }

  // ============================================================================
  // CCP 관련
  // ============================================================================

  async getCcpInstancesByBatchId(batchId: number) {
    const db = await getDb();
    return db.select().from(hCcpInstances)
      .where(and(
        eq(hCcpInstances.batchId, batchId),
        eq(hCcpInstances.tenantId, this.tenantId)
      ));
  }

  async getCcpInstanceById(instanceId: number) {
    const db = await getDb();
    const result = await db.select().from(hCcpInstances)
      .where(and(
        eq(hCcpInstances.id, instanceId),
        eq(hCcpInstances.tenantId, this.tenantId)
      ))
      .limit(1);
    return result[0] ?? null;
  }

  async getAllCcpTemplates() {
    const db = await getDb();
    return db.select().from(hCcpTemplates)
      .where(eq(hCcpTemplates.tenantId, this.tenantId));
  }

  // ============================================================================
  // 재고(Inventory) 관련
  // ============================================================================

  async getAllInventoryLots(filters?: {
    materialId?: number;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const db = await getDb();
    // NOTE: hInventoryLots has no tenantId column - filter via materialId -> hMaterials.tenantId
    const conditions: SQL[] = [];

    if (filters?.materialId) conditions.push(eq(hInventoryLots.materialId, filters.materialId));
    if (filters?.status) conditions.push(eq(hInventoryLots.status, filters.status) as any);

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;

    return db.select().from(hInventoryLots)
      .innerJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
      .where(and(eq(hMaterials.tenantId, this.tenantId), ...conditions))
      .orderBy(desc(hInventoryLots.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);
  }

  // ============================================================================
  // 공급업체(Supplier) 관련
  // ============================================================================

  async getAllSuppliers() {
    const db = await getDb();
    return db.select().from(hSuppliers)
      .where(eq(hSuppliers.tenantId, this.tenantId))
      .orderBy(asc((hSuppliers as any).name));
  }

  // ============================================================================
  // 알림(Notification) 관련
  // ============================================================================

  async getNotifications(filters?: { unreadOnly?: boolean; limit?: number }) {
    const db = await getDb();
    const conditions: SQL[] = [
      eq(hNotifications.tenantId, this.tenantId),
      eq(hNotifications.userId, this.userId),
    ];

    if (filters?.unreadOnly) {
      conditions.push(isNull(hNotifications.readAt));
    }

    return db.select().from(hNotifications)
      .where(and(...conditions))
      .orderBy(desc(hNotifications.createdAt))
      .limit(filters?.limit || 50);
  }

  // ============================================================================
  // 사용자(User) 관련 - 같은 테넌트 사용자만 조회
  // ============================================================================

  async getTenantUsers() {
    const db = await getDb();
    return db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
    }).from(users)
      .where(eq(users.tenantId, this.tenantId))
      .orderBy(asc(users.name));
  }

  // ============================================================================
  // 승인(Approval) 관련
  // ============================================================================

  async getApprovalRequests(filters?: { status?: string }) {
    const db = await getDb();
    const conditions: SQL[] = [eq(hApprovalRequests.tenantId, this.tenantId)];

    if (filters?.status) {
      conditions.push(eq(hApprovalRequests.status, filters.status) as any);
    }

    return db.select().from(hApprovalRequests)
      .where(and(...conditions))
      .orderBy(desc(hApprovalRequests.createdAt));
  }

  // ============================================================================
  // 검사(Inspection) 관련  
  // ============================================================================

  async getMaterialInspections(filters?: { page?: number; limit?: number }) {
    const db = await getDb();
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;

    return db.select().from(materialInspectionRecords)
      .where(eq(materialInspectionRecords.tenantId, this.tenantId))
      .orderBy(desc(materialInspectionRecords.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);
  }

  async getShippingInspections(filters?: { page?: number; limit?: number }) {
    const db = await getDb();
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;

    return db.select().from(shippingInspectionRecords)
      .where(eq(shippingInspectionRecords.tenantId, this.tenantId))
      .orderBy(desc(shippingInspectionRecords.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);
  }

  async getHygieneInspections(filters?: { page?: number; limit?: number }) {
    const db = await getDb();
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;

    return db.select().from(hygieneInspectionRecords)
      .where(eq(hygieneInspectionRecords.tenantId, this.tenantId))
      .orderBy(desc(hygieneInspectionRecords.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);
  }

  // ============================================================================
  // 범용 쿼리 헬퍼 (인라인 쿼리용)
  // ============================================================================

  /**
   * 테넌트 필터가 자동 적용되는 SELECT 쿼리 실행
   * 기존 인라인 getDb() 코드를 점진적으로 대체할 때 사용
   * 
   * @example
   * // Before (위험):
   * const db = await getDb();
   * const items = await db.select().from(hMaterials).where(eq(hMaterials.id, 1));
   * 
   * // After (안전):
   * const items = await ctx.db.selectFrom(hMaterials, eq(hMaterials.id, 1));
   */
  async selectFrom<T extends { tenantId: any }>(
    table: T,
    ...extraConditions: SQL[]
  ) {
    const db = await getDb();
    const conditions = [eq((table as any).tenantId, this.tenantId), ...extraConditions];
    return db.select().from(table as any).where(and(...conditions));
  }

  /**
   * 테넌트 ID가 자동 포함된 INSERT
   */
  async insertInto<T extends { tenantId: any }>(
    table: T,
    data: Record<string, any>
  ) {
    const db = await getDb();
    return db.insert(table as any).values({
      ...data,
      tenantId: this.tenantId,
    });
  }

  /**
   * 테넌트 필터가 자동 적용되는 UPDATE
   */
  async updateIn<T extends { tenantId: any; id: any }>(
    table: T,
    id: number,
    data: Record<string, any>
  ) {
    const db = await getDb();
    return db.update(table as any)
      .set(data)
      .where(and(
        eq((table as any).id, id),
        eq((table as any).tenantId, this.tenantId)
      ));
  }

  /**
   * 테넌트 필터가 자동 적용되는 DELETE
   */
  async deleteFrom<T extends { tenantId: any; id: any }>(
    table: T,
    id: number
  ) {
    const db = await getDb();
    return db.delete(table as any)
      .where(and(
        eq((table as any).id, id),
        eq((table as any).tenantId, this.tenantId)
      ));
  }
}
