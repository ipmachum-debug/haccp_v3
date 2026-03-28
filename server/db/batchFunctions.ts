import { eq, and, desc, sql, like } from "drizzle-orm";
import { getDb, getRawConnection } from "./connection";
import { hBatches, hBatchInputs, hCcpInstances, hCcpRecords, hProductsV2, hMaterials, hInventory, hInventoryTransactions, hApprovalRequests } from "../../drizzle/schema";

import { todayKST, formatLocalDate, toKSTTimestamp} from "../utils/timezone";

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
  if (!db) throw new Error("DB 연결 실패");
  const { hBatches, hBatchInputs } = await import("../../drizzle/schema");
  const { hMfReports, hMfReportVersions, hMfIngredients } = await import("../../drizzle/schema_recipe_new");

  // Format dates as MySQL-compatible strings
  const pd = batch.plannedDate;
  const plannedDateStr = pd instanceof Date
    ? formatLocalDate(pd)
    : String(pd).includes("T") ? String(pd).split("T")[0]
    : String(pd).slice(0, 10);

  const startTimeStr = batch.batchStartTime
    ? `${plannedDateStr} ${batch.batchStartTime}:00`
    : null;

  // Use raw SQL to avoid Drizzle's date serialization and `as any` type issues
  const conn = await getRawConnection();
  const [result]: any = await conn.execute(
    `INSERT INTO h_batches
       (tenant_id, site_id, batch_code, day_batch_group, batch_order,
        product_id, planned_quantity, planned_date, start_time,
        status, mode, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      batch.tenantId,
      batch.siteId,
      batch.batchCode,
      batch.dayBatchGroup || null,
      batch.batchOrder != null ? batch.batchOrder : null,
      batch.productId,
      batch.plannedQuantity,
      plannedDateStr,
      startTimeStr,
      batch.status || "planned",
      batch.mode || "auto",
      batch.createdBy,
    ]
  );

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

        // 4. 배합비 x 생산량으로 원재료 투입 계획 생성 (보정 배합비 기준)
        // 정제수도 투입 계획에 포함 (투입량 표시), 원가 계산에서만 제외
        if (ingredients.length > 0) {
          const batchInputs = ingredients
            .filter((ing: any) => ing.materialId !== null && ing.isDeductible !== 0)
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
  if (!db) throw new Error("DB 연결 실패");

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

  // 페이지네이션 기본값
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const offset = (page - 1) * limit;

  // SQL 조건 빌드
  const whereParts: string[] = [];
  const params: any[] = [];

  if (filters?.tenantId) {
    whereParts.push("b.tenant_id = ?");
    params.push(filters.tenantId);
  }
  if (filters?.siteId) {
    whereParts.push("b.site_id = ?");
    params.push(filters.siteId);
  }
  if (filters?.status) {
    whereParts.push("b.status = ?");
    params.push(filters.status);
  }
  if (filters?.productId) {
    whereParts.push("b.product_id = ?");
    params.push(filters.productId);
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  // COUNT + 데이터를 단일 왕복으로 처리 (Raw SQL + LEFT JOIN product)
  const conn = await getRawConnection();
  if (!conn) return { items: [], total: 0, page, limit, totalPages: 0 };

  const [countRows] = await conn.execute<any[]>(
    `SELECT COUNT(*) as cnt FROM h_batches b ${whereClause}`,
    params
  );
  const total = Number((countRows as any[])[0]?.cnt || 0);

  const [dataRows] = await conn.execute<any[]>(
    `SELECT b.*, p.product_name, p.product_code
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
     ${whereClause}
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, String(limit), String(offset)]
  );

  return {
    items: (dataRows as any[]).map((row: any) => ({
      id: row.id,
      tenantId: row.tenant_id,
      siteId: row.site_id,
      batchCode: row.batch_code,
      dayBatchGroup: row.day_batch_group || null,
      batchOrder: row.batch_order || null,
      productId: row.product_id,
      recipeId: row.recipe_id || null,
      plannedQuantity: row.planned_quantity,
      actualQuantity: row.actual_quantity || null,
      plannedDate: row.planned_date,
      startTime: row.start_time || null,
      endTime: row.end_time || null,
      status: row.status,
      mode: row.mode || null,
      lotNumber: row.lot_number || null,
      expiryDate: row.expiry_date || null,
      revenue: row.revenue || null,
      plannedCost: row.planned_cost || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at || null,
      productName: row.product_name || null,
      productCode: row.product_code || null,
    })),
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
  },
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches } = await import("../../drizzle/schema");

  const updateData: any = {};
  if (data.batchNumber !== undefined) updateData.batchNumber = data.batchNumber;
  if (data.plannedQuantity !== undefined) updateData.plannedQuantity = data.plannedQuantity;
  if (data.plannedStartDate !== undefined) updateData.plannedStartDate = data.plannedStartDate;
  if (data.plannedEndDate !== undefined) updateData.plannedEndDate = data.plannedEndDate;
  if (data.status !== undefined) updateData.status = data.status;

  const conditions: any[] = [eq(hBatches.id, batchId)];
  if (tenantId) conditions.push(eq(hBatches.tenantId, tenantId));

  await db
    .update(hBatches)
    .set(updateData)
    .where(and(...conditions));
}

export async function updateBatchSchedule(
  batchId: number,
  data: {
    plannedDate?: Date;
    startTime?: Date;
    endTime?: Date;
  },
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches } = await import("../../drizzle/schema");

  const updateData: any = {};
  if (data.plannedDate !== undefined) updateData.plannedDate = data.plannedDate;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;

  const conditions: any[] = [eq(hBatches.id, batchId)];
  if (tenantId) conditions.push(eq(hBatches.tenantId, tenantId));

  await db
    .update(hBatches)
    .set(updateData)
    .where(and(...conditions));
}

export async function updateBatchStatus(batchId: number, status: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches } = await import("../../drizzle/schema");

  const conditions: any[] = [eq(hBatches.id, batchId)];
  if (tenantId) conditions.push(eq(hBatches.tenantId, tenantId));

  await db
    .update(hBatches)
    .set({ status } as any)
    .where(and(...conditions));
}

export async function deleteBatch(batchId: number, tenantId?: number) {
  const pool = await getRawConnection();
  if (!tenantId) throw new Error("[보안] deleteBatch: tenantId는 필수입니다.");

  // 관련 데이터 cascade 삭제 (CCP 행 → CCP 인스턴스 → 배치) - tenant_id 필터 필수
  await pool.execute(`DELETE r FROM h_ccp_rows r
    INNER JOIN h_ccp_instances i ON r.instance_id = i.id
    WHERE i.batch_id = ? AND i.tenant_id = ?`, [batchId, tenantId]);
  await pool.execute(`DELETE FROM h_ccp_instances WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
  await pool.execute(`DELETE FROM h_batch_inputs WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
  await pool.execute(`DELETE FROM h_batch_schedules WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);

  // 배치 자체 삭제 - h_batches AND batches (dual table sync)
  await pool.execute(`DELETE FROM h_batches WHERE id = ? AND tenant_id = ?`, [batchId, tenantId]);
  await pool.execute(`DELETE FROM batches WHERE id = ? AND tenant_id = ?`, [batchId, tenantId]);

  // CCP 모니터링 기록지 삭제
  try {
    await pool.execute(`DELETE rows FROM h_ccp_form_rows rows JOIN h_ccp_form_records rec ON rows.form_record_id = rec.id WHERE rec.batch_id = ? AND rec.tenant_id = ?`, [batchId, tenantId]);
    await pool.execute(`DELETE FROM h_ccp_form_records WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
  } catch (_e) { /* ignore if table not exists */ }
  // 문서 인스턴스 삭제
  try {
    await pool.execute(`DELETE FROM document_instances WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
  } catch (_e) { /* ignore if table not exists */ }
  // 승인 요청 삭제
  await pool.execute(`DELETE FROM h_approval_requests WHERE reference_type IN ('batch', 'batch_group') AND reference_id = ? AND tenant_id = ?`, [batchId, tenantId]);
}

export async function generateBatchCode(productId: number, tenantId?: number) {
  const conn = await getRawConnection();

  // 1. 제품 정보 조회 (tenantId 격리)
  let productCode = "00000";
  try {
    if (tenantId) {
      const [v2Rows] = await conn.execute<any[]>(
        "SELECT product_code FROM h_products_v2 WHERE id=? AND tenant_id=? LIMIT 1",
        [productId, tenantId],
      );
      if ((v2Rows as any[]).length > 0 && (v2Rows as any[])[0].product_code) {
        productCode = (v2Rows as any[])[0].product_code;
      }
    } else {
      const [v2Rows] = await conn.execute<any[]>(
        "SELECT product_code FROM h_products_v2 WHERE id=? LIMIT 1",
        [productId],
      );
      if ((v2Rows as any[]).length > 0 && (v2Rows as any[])[0].product_code) {
        productCode = (v2Rows as any[])[0].product_code;
      }
    }
  } catch { /* use default code */ }

  // 2. 오늘 날짜 문자열 생성 (YYYYMMDD) - KST 기준
  const today = new Date();
  const kstOffset = 9 * 60; // UTC+9
  const kstDate = new Date(today.getTime() + kstOffset * 60 * 1000);
  const dateStr = kstDate.toISOString().slice(0, 10).replace(/-/g, "");

  // 3. 해당 날짜의 기존 배치 수 조회 (tenantId 격리)
  const countParams: any[] = tenantId
    ? [tenantId, `${productCode}-${dateStr}-%`]
    : [`${productCode}-${dateStr}-%`];
  const countSql = tenantId
    ? "SELECT COUNT(*) as cnt FROM h_batches WHERE tenant_id=? AND batch_code LIKE ?"
    : "SELECT COUNT(*) as cnt FROM h_batches WHERE batch_code LIKE ?";
  const [countRows] = await conn.execute<any[]>(countSql, countParams);
  const seq = ((countRows as any[])[0]?.cnt || 0) + 1;

  // 4. 배치 번호 생성 (순번은 3자리로 패딩)
  return `${productCode}-${dateStr}-${String(seq).padStart(3, "0")}`;
}

export async function generateBatchReport(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

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

export async function getActiveBatches(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { sql } = await import("drizzle-orm");

  // 최근 7일 이내의 배치 조회 (tenantId 격리)
  const tenantFilter = tenantId ? sql`AND b.tenant_id = ${tenantId}` : sql``;
  const batchesRaw = await db.execute(sql`
    SELECT
      b.id as batchId,
      b.batch_code as batchNumber,
      b.planned_quantity as quantity,
      b.planned_date as startTime,
      DATE_ADD(b.planned_date, INTERVAL 8 HOUR) as expectedEndTime,
      p.product_name as productName,
      'in_progress' as status,
      (SELECT COUNT(*) FROM h_ccp_instances WHERE batch_id = b.id) as ccpCheckCount,
      (SELECT COUNT(*) FROM h_ccp_instances WHERE batch_id = b.id AND status = 'completed') as ccpCheckCompletedCount
    FROM h_batches b
    LEFT JOIN h_products_v2 p ON b.product_id = p.id
    WHERE b.planned_date >= DATE_SUB(NOW(), INTERVAL 7 DAY) ${tenantFilter}
    ORDER BY b.planned_date DESC
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

export async function checkBatchCompletionReadiness(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 배치 정보 조회 (tenantId 격리)
  const conditions: any[] = [eq(hBatches.id, batchId)];
  if (tenantId) conditions.push(eq(hBatches.tenantId, tenantId));

  const batches = await db
    .select()
    .from(hBatches)
    .where(and(...conditions))
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
  tenantId?: number;
}) {
  const { batchId, actualQuantity, defectQuantity, revenue, completionNotes, idempotencyKey, tenantId } = params;
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. idempotency 키 검증 (중복 완료 방지, tenantId 격리)
  const batchConditions: any[] = [eq(hBatches.id, batchId)];
  if (tenantId) batchConditions.push(eq(hBatches.tenantId, tenantId));

  const existingBatches = await db
    .select()
    .from(hBatches)
    .where(and(...batchConditions))
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
    const { hBatchInputs, hInventory, hInventoryTransactions, hMaterials } = await import("../../drizzle/schema");

    // 배치 투입 내역 조회 (원재료명 포함)
    const batchInputs = await db
      .select({
        input: hBatchInputs,
        materialName: hMaterials.materialName
      })
      .from(hBatchInputs)
      .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
      .where(eq(hBatchInputs.batchId, batchId));

    // 정제수 판별 헬퍼
    const isWater = (name: string | null) => {
      if (!name) return false;
      const n = name.toLowerCase();
      return n.includes("정제수") || n.includes("purified water");
    };

    // 원재료 소비 처리 (tenantId 격리 + FEFO LOT 차감)
    // ⚠️ autoMaterialIssue(배치 시작 시)에서 이미 차감된 건은 건너뜀
    //    단, actual_quantity와 TX 기록이 다를 경우 h_inventory/LOT 보정 수행
    const pool = await getRawConnection();

    // 2중 차감 방지: 이미 이 배치에 대한 출고 기록이 있는지 사전 확인
    let existingTxBatchIds = new Set<number>();
    if (pool) {
      try {
        const [txRows]: any = await pool.execute(
          `SELECT DISTINCT source_line_id FROM h_inventory_transactions
           WHERE (source_type = 'BATCH' OR source_type = 'batch_completion')
             AND source_id = ? AND transaction_type = 'usage' AND tenant_id = ?`,
          [batchId, tenantId || existingBatch.tenantId]
        );
        for (const row of (txRows as any[])) {
          if (row.source_line_id) existingTxBatchIds.add(Number(row.source_line_id));
        }
      } catch (_e) { /* 조회 실패 시 무시 - 기존 로직으로 폴백 */ }
    }

    for (const { input, materialName } of batchInputs) {
      // 이미 autoMaterialIssue에서 차감 완료된 원재료 (DB 플래그 기반)
      if (Number(input.inventoryDeducted) === 1) {
        if (!isWater(materialName)) {
          totalMaterialCost += parseFloat(input.totalPrice?.toString() || "0");
        }
        // actual vs TX 차이 보정: autoMaterialIssue가 planned 기반으로 TX를 기록했을 수 있음
        // completeBatch 시점의 actual_quantity와 TX 기록량이 다르면 h_inventory/LOT를 보정
        if (pool) {
          try {
            const actualQty = parseFloat((input.actualQuantity || input.plannedQuantity || "0").toString());
            const effectiveTenantId = tenantId || existingBatch.tenantId;
            // 이 배치+원재료에 대한 TX 출고량 합산 (양수 = 차감된 양)
            const [txRows]: any = await pool.execute(
              `SELECT COALESCE(SUM(ABS(quantity)), 0) as tx_total
               FROM h_inventory_transactions
               WHERE source_type IN ('BATCH','batch_completion') 
                 AND (source_id = ? OR reference_id = ?)
                 AND lot_id IN (SELECT id FROM h_inventory_lots WHERE material_id = ? AND tenant_id = ?)
                 AND transaction_type = 'usage'
                 AND tenant_id = ?`,
              [batchId, batchId, input.materialId, effectiveTenantId, effectiveTenantId]
            );
            const txTotal = parseFloat((txRows as any[])?.[0]?.tx_total || "0");
            const diff = txTotal - actualQty; // 양수면 TX가 더 많이 차감 → 재고 복원 필요
            if (Math.abs(diff) > 0.01) {
              // h_inventory 보정: diff만큼 재고 복원(양수) 또는 추가차감(음수)
              await pool.execute(
                `UPDATE h_inventory 
                 SET total_quantity = GREATEST(total_quantity + ?, 0),
                     available_quantity = GREATEST(available_quantity + ?, 0),
                     last_updated = NOW()
                 WHERE material_id = ? AND tenant_id = ?`,
                [diff, diff, input.materialId, effectiveTenantId]
              );
            }
          } catch (adjustErr: any) {
            console.error(`[completeBatch] TX-actual 보정 실패: ${adjustErr.message}`);
          }
        }
        continue;
      }

      const qty = parseFloat((input.actualQuantity || input.plannedQuantity || "0").toString());
      if (qty <= 0) continue;

      // 2중 차감 방지: h_inventory_transactions에 이미 이 input에 대한 출고 기록이 있으면 건너뜀
      if (existingTxBatchIds.has(Number(input.id))) {
        // inventory_deducted 플래그가 0이었던 것을 1로 보정
        try {
          await db
            .update(hBatchInputs)
            .set({ inventoryDeducted: 1 })
            .where(eq(hBatchInputs.id, input.id));
        } catch (_e) { /* 무시 */ }
        if (!isWater(materialName)) {
          totalMaterialCost += parseFloat(input.totalPrice?.toString() || "0");
        }
        continue;
      }

      // 재고 차감 (tenantId 격리)
      await db
        .update(hInventory)
        .set({
          totalQuantity: sql`GREATEST(total_quantity - ${qty}, 0)`,
          availableQuantity: sql`GREATEST(available_quantity - ${qty}, 0)`,
          lastUpdated: new Date()
        })
        .where(and(
          eq(hInventory.materialId, input.materialId),
          eq(hInventory.tenantId, tenantId || existingBatch.tenantId)
        ));

      // FEFO LOT 차감 시도
      let lotId: number | null = null;
      let unitCost = 0;
      if (pool) {
        try {
          const [lots]: any = await pool.execute(
            `SELECT l.id, l.available_quantity, l.unit_price
             FROM h_inventory_lots l
             JOIN h_inventory i ON l.inventory_id = i.id
             WHERE i.material_id = ? AND i.tenant_id = ? AND l.status = 'available' AND l.available_quantity > 0
             ORDER BY l.receipt_date ASC LIMIT 1`,
            [input.materialId, tenantId || existingBatch.tenantId]
          );
          if ((lots as any[]).length > 0) {
            const lot = (lots as any[])[0];
            lotId = lot.id;
            unitCost = parseFloat(lot.unit_price || "0");
            await pool.execute(
              `UPDATE h_inventory_lots SET available_quantity = GREATEST(available_quantity - ?, 0) WHERE id = ?`,
              [qty, lotId]
            );
          }
        } catch (_e) { /* LOT 차감 실패 시 inventory 차감만 유지 */ }
      }

      // 재고 거래 기록 생성 (transactionType: "usage"로 소모이력에 표시)
      try {
        if (pool) {
          const txnDate = todayKST();
          await pool.execute(
            `INSERT INTO h_inventory_transactions 
             (lot_id, transaction_type, quantity, unit, unit_cost, amount,
              transaction_date, source_type, source_id, action_type, purpose, tenant_id)
             VALUES (?, 'usage', ?, ?, ?, ?, ?, 'batch_completion', ?, 'AUTO_ISSUE', 'production', ?)`,
            [
              lotId || 0, qty, input.unit || 'kg', unitCost, qty * unitCost,
              txnDate, batchId, tenantId || existingBatch.tenantId
            ]
          );
        }
      } catch (_e) { /* 트랜잭션 기록 실패 시 무시 */ }

      // 수불부 반영
      try {
        if (pool) {
          const txnDate = todayKST();
          await pool.execute(
            `INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, usage_qty, notes, source)
             VALUES (?, ?, ?, ?, ?, 'batch_complete')
             ON DUPLICATE KEY UPDATE usage_qty = usage_qty + ?, notes = CONCAT(COALESCE(notes,''), ', ', ?)`,
            [
              tenantId || existingBatch.tenantId, input.materialId, txnDate, qty,
              `배치#${batchId} 완료`, qty, `배치#${batchId} 완료`
            ]
          );
        }
      } catch (_e) { /* 수불부 실패 시 무시 */ }

      // inventory_deducted = 1 설정 (autoMaterialIssue와 동일한 플래그)
      try {
        await db
          .update(hBatchInputs)
          .set({
            inventoryDeducted: 1,
            actualQuantity: qty.toString(),
            unitPrice: unitCost > 0 ? unitCost.toFixed(2) : (input.unitPrice || "0"),
            totalPrice: unitCost > 0 ? (qty * unitCost).toFixed(2) : (input.totalPrice || "0"),
            inputTime: new Date(),
          })
          .where(eq(hBatchInputs.id, input.id));
      } catch (_e) { /* inventory_deducted 업데이트 실패 시 무시 */ }

      // 원가 누적 (정제수 제외)
      if (!isWater(materialName)) {
        const cost = unitCost > 0 ? qty * unitCost : parseFloat(input.totalPrice || "0");
        totalMaterialCost += cost;
      }
    }

    // 완제품 재고 입고 (tenantId 격리)
    const tId = tenantId || existingBatch.tenantId;
    const finishedGoodsInventory = await db
      .select()
      .from(hInventory)
      .where(and(
        eq(hInventory.productId, existingBatch.productId),
        eq(hInventory.tenantId, tId)
      ))
      .limit(1);

    if (finishedGoodsInventory.length > 0) {
      await db
        .update(hInventory)
        .set({
          totalQuantity: sql`total_quantity + ${actualQuantity}`,
          availableQuantity: sql`available_quantity + ${actualQuantity}`
        })
        .where(and(
          eq(hInventory.productId, existingBatch.productId),
          eq(hInventory.tenantId, tId)
        ));
    }
    // 완제품 입고 기록은 SKU LOT 생성에서 처리
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

      }
    } else {
      // SKU 실적 없으면 기존 방식으로 fallback (배치 단위 LOT 1개)
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
    // 6-2. 일일일지 자동 생성
    try {
      const rawConn2 = await getRawConnection();
      if (rawConn2) {
        const today = todayKST();
        const now2 = toKSTTimestamp(new Date());
        await rawConn2.execute(
          "INSERT IGNORE INTO h_daily_reports (site_id, report_date, report_type, summary, status, created_at, updated_at) VALUES (?, ?, 'production', ?, 'completed', ?, ?)",
          [existingBatch.siteId, today, JSON.stringify({ batchId, actualQuantity, autoGenerated: true }), now2, now2]
        );
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
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatchInputs } = await import("../../drizzle/schema");

  // tenantId 격리: 배치 소유권 검증
  if (!input.tenantId) throw new Error("[보안] tenantId는 필수입니다");
  const batchCheck = await db.select({ id: hBatches.id }).from(hBatches)
    .where(and(eq(hBatches.id, input.batchId), eq(hBatches.tenantId, input.tenantId))).limit(1);
  if (batchCheck.length === 0) throw new Error("해당 배치에 대한 접근 권한이 없습니다");

  const [result] = await db.insert(hBatchInputs).values({
    batchId: input.batchId,
    materialId: input.materialId,
    quantity: input.quantity,
    unitPrice: input.unitPrice || "0",
    totalPrice: input.totalPrice || "0",
    notes: input.notes || null,
    createdBy: input.createdBy,
    tenantId: input.tenantId
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
      ? formatLocalDate(workDate)
      : workDate;
    const now = toKSTTimestamp(new Date());

    // 1. auto_generate_on_batch = 1인 문서 유형 조회
    const [docTypes] = await rawConn.execute(
      "SELECT id, code, name, category FROM document_types WHERE auto_generate_on_batch = 1"
    );

    if (!docTypes || (docTypes as any[]).length === 0) {
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

    }

    return generatedDocs;
  } catch (error) {
    console.error('[autoGenerateDocumentsForBatch] 오류:', error);
    return [];
  }
}
