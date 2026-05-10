/**
 * 배치 CRUD (생성/조회/수정/삭제/코드생성)
 * batchFunctions.ts에서 분할
 */
import { eq, and, desc, sql, like } from "drizzle-orm";
import { getDb, getRawConnection } from "../connection";
import { todayKST, toKSTTimestamp } from "../../utils/timezone";
import { hBatches, hBatchInputs, hCcpInstances, hCcpRecords, hProductsV2, hMaterials, hInventory, hInventoryTransactions, hApprovalRequests } from "../../../drizzle/schema";


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
  const { hBatches, hBatchInputs } = await import("../../../drizzle/schema");
  const { hMfReports, hMfReportVersions, hMfIngredients } = await import("../../../drizzle/schema/schema_recipe_new");

  // Format dates as MySQL-compatible strings (KST 기준, UTC 변환 방지)
  const pd = batch.plannedDate;
  let plannedDateStr: string;
  if (pd instanceof Date) {
    // KST 기준 로컬 날짜 추출 (toISOString()은 UTC로 변환되어 하루 전으로 밀림 방지)
    const y = pd.getFullYear();
    const m = String(pd.getMonth() + 1).padStart(2, "0");
    const d = String(pd.getDate()).padStart(2, "0");
    plannedDateStr = `${y}-${m}-${d}`;
  } else {
    plannedDateStr = String(pd).includes("T") ? String(pd).split("T")[0]
      : String(pd).slice(0, 10);
  }

  const startTimeStr = batch.batchStartTime
    ? `${plannedDateStr} ${batch.batchStartTime}:00`
    : null;

  // Use raw SQL to avoid Drizzle's date serialization and `as any` type issues
  const conn = await getRawConnection();
  const isAutoCompleted = batch.status === "completed";

  // auto 모드: 종료시간 계산 (시작시간 + BOM 배치수 × 사이클시간)
  // 정확한 계산은 BOM 조회가 필요하므로, 여기서는 시작시간 + 2시간을 기본값으로 설정
  // 실제 종료시간은 completeBatch에서 정확히 갱신
  let endTimeStr: string | null = null;
  if (isAutoCompleted && startTimeStr) {
    // 시작시간에서 2시간 후를 기본 종료시간으로 설정
    const [h, m] = (batch.batchStartTime || "09:00").split(":").map(Number);
    const endH = h + 2;
    endTimeStr = `${plannedDateStr} ${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }

  const [result]: any = await conn.execute(
    `INSERT INTO h_batches
       (tenant_id, site_id, batch_code, day_batch_group, batch_order,
        product_id, planned_quantity, actual_quantity, planned_date, start_time, end_time,
        status, mode, completed_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      batch.tenantId,
      batch.siteId,
      batch.batchCode,
      batch.dayBatchGroup || null,
      batch.batchOrder != null ? batch.batchOrder : null,
      batch.productId,
      batch.plannedQuantity,
      isAutoCompleted ? batch.plannedQuantity : null,
      plannedDateStr,
      startTimeStr,
      endTimeStr,                                        // 종료시간 추가
      batch.status || "planned",
      batch.mode || "auto",
      isAutoCompleted ? new Date() : null,
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
          console.log("[createBatch] APPROVED 버전 없음, 최신 버전 fallback 사용");
        }
      }

      if (latestVersion.length > 0) {
        // 3. 배합비(원재료 함량) 조회
        // item_master.base_unit으로 실제 단위(kg/g) 조회
        // h_mf_ingredients.material_id → item_master.id (직접 참조)
        const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit");
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
        // ★ 2026-05-10 (PR #297): unit_price/total_price 마스터 lookup 후 INSERT 시 채움
        // ★ 2026-05-10 (PR #298): material_id 표준화 — h_mf_ingredients.material_id (= item_master.id) 를
        //    자재명 매칭으로 canonical h_materials.id 로 변환 후 INSERT.
        //    이로써 신규 배치는 lot/inventory 시스템과 ID 네임스페이스가 일치 → 자동출고 정상 작동.
        //    h_materials 에 매칭 없는 자재만 item_master.id 그대로 유지 (호환성 유지).
        if (ingredients.length > 0) {
          const filteredIngredients = ingredients
            .filter((ing: any) => ing.materialId !== null && ing.isDeductible !== 0);

          const candidateRawIds = filteredIngredients
            .map((ing: any) => Number(ing.materialId))
            .filter((id: number) => Number.isFinite(id));

          // ★ ID 표준화 맵: rawId(item_master.id) → canonicalId(h_materials.id)
          //   미매칭 시 raw 그대로 유지 (호환성)
          const idMap = new Map<number, number>(); // rawId → canonicalId
          const nameMap = new Map<number, string>(); // canonicalId → name
          if (candidateRawIds.length > 0) {
            const ph = candidateRawIds.map(() => "?").join(",");
            // item_master.id → item_name → h_materials.id 자재명 매칭
            const [mapRows]: any = await conn.execute(
              `SELECT im.id AS raw_id, im.item_name,
                      hm.id AS hm_id, hm.material_name
                 FROM item_master im
                 LEFT JOIN h_materials hm
                   ON hm.tenant_id = im.tenant_id
                  AND TRIM(hm.material_name) = TRIM(im.item_name)
                WHERE im.tenant_id = ? AND im.id IN (${ph})`,
              [tenantId, ...candidateRawIds],
            );
            for (const r of (mapRows as any[])) {
              const rawId = Number(r.raw_id);
              const hmId = r.hm_id ? Number(r.hm_id) : null;
              const name = r.material_name || r.item_name || null;
              if (hmId) {
                idMap.set(rawId, hmId);
                if (name) nameMap.set(hmId, name);
              } else {
                idMap.set(rawId, rawId); // h_materials 에 없으면 raw 유지
                if (r.item_name) nameMap.set(rawId, r.item_name);
              }
            }
            // 위 lookup 에서 누락된 raw id 는 그대로 raw 사용 (item_master 에도 없는 경우)
            for (const rawId of candidateRawIds) {
              if (!idMap.has(rawId)) idMap.set(rawId, rawId);
            }
          }

          // 표준화된 canonical ID 목록으로 단가 lookup
          const canonicalIds = Array.from(new Set(Array.from(idMap.values())));

          // 단가 lookup 1차: h_materials.unit_price (canonicalId 기준)
          const priceMap = new Map<number, number>(); // canonicalId → unit_price
          if (canonicalIds.length > 0) {
            const ph = canonicalIds.map(() => "?").join(",");
            const [priceRows]: any = await conn.execute(
              `SELECT id, unit_price FROM h_materials
                WHERE tenant_id = ? AND id IN (${ph}) AND unit_price > 0`,
              [tenantId, ...canonicalIds],
            );
            for (const r of (priceRows as any[])) {
              const p = parseFloat(r.unit_price ?? 0);
              if (p > 0) priceMap.set(Number(r.id), p);
            }
          }

          // 단가 lookup 2차: 마지막 입고 lot.unit_price (h_materials 가격 0 인 경우)
          const stillMissing = canonicalIds.filter((id) => !priceMap.has(id));
          if (stillMissing.length > 0) {
            const ph = stillMissing.map(() => "?").join(",");
            const [lotRows]: any = await conn.execute(
              `SELECT material_id, unit_price
                 FROM (
                   SELECT material_id, unit_price,
                          ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY receipt_date DESC, id DESC) AS rn
                     FROM h_inventory_lots
                    WHERE tenant_id = ? AND material_id IN (${ph})
                      AND unit_price IS NOT NULL AND unit_price > 0
                 ) t
                WHERE rn = 1`,
              [tenantId, ...stillMissing],
            );
            for (const r of (lotRows as any[])) {
              const p = parseFloat(r.unit_price ?? 0);
              if (p > 0) priceMap.set(Number(r.material_id), p);
            }
          }

          // 단가 lookup 3차: item_master.default_unit_price (raw id 기준 — h_materials 에 없는 자재)
          const stillMissing2 = canonicalIds.filter((id) => !priceMap.has(id));
          if (stillMissing2.length > 0) {
            const ph = stillMissing2.map(() => "?").join(",");
            const [imRows]: any = await conn.execute(
              `SELECT id, default_unit_price FROM item_master
                WHERE tenant_id = ? AND id IN (${ph})
                  AND default_unit_price > 0`,
              [tenantId, ...stillMissing2],
            );
            for (const r of (imRows as any[])) {
              const p = parseFloat(r.default_unit_price ?? 0);
              if (p > 0) priceMap.set(Number(r.id), p);
            }
          }

          const batchInputs = filteredIngredients
            .map((ing: any) => {
              // 보정 배합비 사용 (없으면 법적 배합비 fallback)
              const ratio = ing.correctedQuantity
                ? parseFloat(ing.correctedQuantity)
                : parseFloat(ing.quantity);
              const plannedQ = (ratio / 100) * plannedQty;
              const rawId = Number(ing.materialId);
              const canonicalId = idMap.get(rawId) ?? rawId;
              const unitPrice = priceMap.get(canonicalId) ?? 0;
              const totalPrice = unitPrice > 0 ? plannedQ * unitPrice : 0;
              if (canonicalId !== rawId) {
                console.info(
                  `[createBatch] id-standardize batch=${batchId} raw=${rawId} -> canonical=${canonicalId} ` +
                  `name="${nameMap.get(canonicalId) ?? "(unknown)"}"`
                );
              }
              return {
                batchId,
                materialId: canonicalId,                          // ★ canonical h_materials.id 저장
                plannedQuantity: plannedQ.toFixed(3),
                unit: ing.materialUnit || "kg",                   // 원재료 실제 단위 사용
                processGroupId: ing.processGroupId ?? null,
                unitPrice: unitPrice.toFixed(2),
                totalPrice: totalPrice.toFixed(2),
                tenantId
              };
            });

          if (batchInputs.length > 0) {
            await db.insert(hBatchInputs).values(batchInputs as any);
            console.log("[createBatch] 원재료 투입 자동생성:", batchInputs.length, "건 (PR#298 ID 표준화)");
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
  const conn = await getRawConnection();

  const [rows] = await conn.execute<any[]>(
    `SELECT b.*,
            p.product_name,
            p.product_code
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
     WHERE b.id = ?
     LIMIT 1`,
    [batchId]
  );

  if ((rows as any[]).length === 0) return undefined;
  const row = (rows as any[])[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    siteId: row.site_id,
    batchCode: row.batch_code,
    productId: row.product_id,
    recipeId: row.recipe_id || null,
    plannedQuantity: row.planned_quantity,
    actualQuantity: row.actual_quantity || null,
    plannedDate: row.planned_date,
    startTime: row.start_time || null,
    endTime: row.end_time || null,
    status: row.status,
    mode: row.mode || null,
    manualStartTime: row.manual_start_time || null,
    manualEndTime: row.manual_end_time || null,
    lotNumber: row.lot_number || null,
    expiryDate: row.expiry_date || null,
    revenue: row.revenue || null,
    plannedCost: row.planned_cost || null,
    actualCost: row.actual_cost || null,
    costFinalizedAt: row.cost_finalized_at || null,
    notes: row.notes || null,
    completionIdempotencyKey: row.completion_idempotency_key || null,
    completedAt: row.completed_at || null,
    completionReportUrl: row.completion_report_url || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    productName: row.product_name || null,
    productCode: row.product_code || null,
  };
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
  if (!db) throw new Error("Database not available");

  const { hBatches } = await import("../../../drizzle/schema");

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
  if (!db) throw new Error("Database not available");

  const { hBatches } = await import("../../../drizzle/schema");

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
  if (!db) throw new Error("Database not available");

  const { hBatches } = await import("../../../drizzle/schema");

  const conditions: any[] = [eq(hBatches.id, batchId)];
  if (tenantId) conditions.push(eq(hBatches.tenantId, tenantId));

  // ★ 상태 전환 시 타임스탬프 자동 설정
  const updateData: any = { status, updatedAt: new Date() };
  const now = new Date();

  // status='completed' 경로 보강:
  //   completeBatch() 를 거치지 않고 이 함수로 직접 'completed' 가 되는 경우
  //   (예: 승인 후 status 드롭다운 변경) 에 actual_quantity 가 NULL 로 남고
  //   h_inventory_lots 에 LOT 가 만들어지지 않아 재고 조정/출고에서 보이지 않음.
  //   여기서 actual_quantity NULL fallback + LOT 자동 생성으로 재발 방지.
  let batchRow: any = null;
  let shouldEnsureLot = false;
  if (status === "in_progress") {
    updateData.startTime = now;
  } else if (status === "completed") {
    updateData.endTime = now;
    updateData.completedAt = now;

    const rows = await db.select().from(hBatches).where(and(...conditions)).limit(1);
    batchRow = rows[0];
    if (batchRow) {
      // actual_quantity NULL → planned_quantity 폴백
      if (batchRow.actualQuantity == null && batchRow.plannedQuantity != null) {
        updateData.actualQuantity = String(batchRow.plannedQuantity);
      }
      shouldEnsureLot = true;
    }
  }

  await db
    .update(hBatches)
    .set(updateData)
    .where(and(...conditions));

  // LOT 자동 생성 (status='completed' & 누락 시에만)
  // ensureBatchLots: SKU 실적 있으면 SKU별 멀티 LOT, 없으면 단일 fallback LOT.
  // 이미 LOT 가 있으면 내부에서 skip. 멱등.
  if (shouldEnsureLot && batchRow && batchRow.tenantId && batchRow.productId) {
    try {
      const { ensureBatchLots } = await import("./productOutboundManagement");
      const result = await ensureBatchLots(batchId, batchRow.tenantId);
      if (result.created.length > 0) {
        console.log(
          `[updateBatchStatus] LOT 자동 생성 (배치#${batchId}, ${result.created.length}건)`,
        );
      }
    } catch (e) {
      console.error(`[updateBatchStatus] LOT 자동 생성 실패 (배치#${batchId}):`, e);
      // LOT 생성 실패해도 status update 자체는 유지 (이미 커밋됨)
    }
  }

  // ★ PR #274: 배치 완료 통합 훅 (actual_quantity 자동 + h_batch_inputs 알람 + 캐시 무효화)
  // batchLifecycle.ts:completeBatch() 의 끝에서 호출되는 공통 훅을 이 경로에서도 호출.
  // 드롭다운으로 직접 'completed' 로 바꾼 경우에도 동일한 후처리 보장.
  if (status === "completed" && batchRow && batchRow.tenantId) {
    try {
      const { runBatchCompletionHooks } = await import(
        "../../lib/production/batchCompletionHooks"
      );
      await runBatchCompletionHooks(batchId, batchRow.tenantId, {
        source: "updateBatchStatus",
      });
    } catch (hookErr) {
      console.error(`[updateBatchStatus] 완료 훅 실행 실패 (배치#${batchId}):`, hookErr);
      // 훅 실패해도 status update 자체는 유지 (이미 커밋됨)
    }
  }
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

  // 배치 자체 삭제 (테넌트 격리 적용)
  // ★ 2026-04-15: 레거시 `batches` 테이블은 존재하지 않음 (h_batches 단일 테이블)
  //   이전: dual table sync 로 batches 도 DELETE → "Table doesn't exist" 에러
  if (tenantId) {
    await pool.execute(`DELETE FROM h_batches WHERE id = ? AND tenant_id = ?`, [batchId, tenantId]);
  } else {
    await pool.execute(`DELETE FROM h_batches WHERE id = ?`, [batchId]);
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
  // 문서 인스턴스 삭제 (document_instances)
  try {
    if (tenantId) {
      await pool.execute(`DELETE FROM document_instances WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
    } else {
      await pool.execute(`DELETE FROM document_instances WHERE batch_id = ?`, [batchId]);
    }
  } catch (_e) { /* ignore if table not exists */ }

  // 승인 요청 삭제 (batch 직접 + batch_group)
  if (tenantId) {
    await pool.execute(`DELETE FROM h_approval_requests WHERE reference_type IN ('batch', 'batch_group') AND reference_id = ? AND tenant_id = ?`, [batchId, tenantId]);
  } else {
    await pool.execute(`DELETE FROM h_approval_requests WHERE reference_type IN ('batch', 'batch_group') AND reference_id = ?`, [batchId]);
  }
  // SKU 생산수량 삭제
  try {
    await pool.execute(`DELETE FROM production_sku_output WHERE batch_id = ?${tenantId ? ' AND tenant_id = ?' : ''}`, tenantId ? [batchId, tenantId] : [batchId]);
  } catch { /* ignore */ }
  // 금속검출 시간 슬롯/감도체크 삭제
  try {
    await pool.execute(
      `DELETE sc FROM h_ccp_metal_sensitivity_checks sc
       JOIN h_ccp_batch_process_runs pr ON sc.batch_process_run_id = pr.id
       WHERE pr.batch_id = ?${tenantId ? ' AND pr.tenant_id = ?' : ''}`,
      tenantId ? [batchId, tenantId] : [batchId]
    );
    await pool.execute(
      `DELETE sl FROM h_ccp_metal_sku_slots sl
       JOIN h_ccp_batch_process_runs pr ON sl.batch_process_run_id = pr.id
       WHERE pr.batch_id = ?${tenantId ? ' AND pr.tenant_id = ?' : ''}`,
      tenantId ? [batchId, tenantId] : [batchId]
    );
    await pool.execute(`DELETE FROM h_ccp_batch_process_runs WHERE batch_id = ?${tenantId ? ' AND tenant_id = ?' : ''}`, tenantId ? [batchId, tenantId] : [batchId]);
  } catch { /* ignore */ }
}

/**
 * 날짜별 일괄 배치 삭제 (관련 모든 데이터 포함)
 * 잘못된 데이터를 롤백할 때 사용
 */
export async function deleteBatchesByDate(plannedDate: string, tenantId: number): Promise<{ deletedCount: number }> {
  const pool = await getRawConnection();
  const [rows] = await pool.execute<any[]>(
    `SELECT id FROM h_batches WHERE planned_date = ? AND tenant_id = ?`,
    [plannedDate, tenantId]
  );
  const batchIds = (rows as any[]).map((r: any) => r.id);
  if (batchIds.length === 0) return { deletedCount: 0 };

  for (const batchId of batchIds) {
    await deleteBatch(batchId, tenantId);
  }

  // 해당 날짜의 일일일지 삭제
  try {
    await pool.execute(
      `DELETE FROM h_generic_checklist_records WHERE form_type = 'daily_log' AND form_date = ? AND tenant_id = ?`,
      [plannedDate, tenantId]
    );
  } catch { /* ignore */ }

  // CCP-4P 통합 기록 삭제 (고아 방지)
  try {
    await pool.execute(
      `DELETE rows FROM h_ccp_form_rows rows
       JOIN h_ccp_form_records rec ON rows.form_record_id = rec.id
       WHERE rec.ccp_type = 'CCP-4P' AND rec.work_date = ? AND rec.tenant_id = ?`,
      [plannedDate, tenantId]
    );
    await pool.execute(
      `DELETE FROM h_ccp_form_records WHERE ccp_type = 'CCP-4P' AND work_date = ? AND tenant_id = ?`,
      [plannedDate, tenantId]
    );
  } catch { /* ignore */ }

  return { deletedCount: batchIds.length };
}

