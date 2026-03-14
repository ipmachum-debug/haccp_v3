import { eq, and, desc, sql, like } from "drizzle-orm";
import { getDb, getRawConnection } from "./connection";
import { hBatches, hBatchInputs, hCcpInstances, hCcpRecords, hProductsV2, hMaterials, hInventory, hInventoryTransactions, hApprovalRequests } from "../../drizzle/schema";

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
  const { hBatches, hBatchInputs } = await import("../../drizzle/schema");
  const { hMfReports, hMfReportVersions, hMfIngredients } = await import("../../drizzle/schema_recipe_new");

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
        const { itemMaster } = await import("../../drizzle/schema/schema_dual_unit");
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

  const { hBatches, hProductsV2 } = await import("../../drizzle/schema");

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

  const { hBatches } = await import("../../drizzle/schema");
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

  const { hBatches } = await import("../../drizzle/schema");

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

  const { hBatches } = await import("../../drizzle/schema");

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

  const { hBatches } = await import("../../drizzle/schema");

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

export async function generateBatchCode(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { hBatches } = await import("../../drizzle/schema.js");
  const { hProductsV2 } = await import("../../drizzle/schema_main.js");
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

export async function generateBatchReport(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hBatches, hProductsV2, hCcpInstances, hCcpRecords, hBatchInputs, hMaterials } = await import("../../drizzle/schema");

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
    const { hBatchInputs, hInventory, hInventoryTransactions } = await import("../../drizzle/schema");

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
        const { hInventoryTransactions: hInvTxSchema } = await import("../../drizzle/schema");
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
      const { createProductLotFromBatch } = await import("./productOutboundManagement");
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
    const { generateBatchCompletionReport } = await import("../reports/batchCompletionReport");
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

  const { hBatchInputs } = await import("../../drizzle/schema");

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

  const { hBatchInputs } = await import("../../drizzle/schema");

  const result = await db
    .select()
    .from(hBatchInputs)
    .where(eq(hBatchInputs.batchId, batchId));

  return result;
}

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
