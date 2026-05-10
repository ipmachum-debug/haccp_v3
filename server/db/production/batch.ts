import { eq, and, desc, sql } from "drizzle-orm";
import { getDb, getRawConnection } from "../connection";
import {
  hBatches,
  hBatchInputs,
  hCcpInstances,
  hCcpRows,
  hCcpTemplates,
  hCcpTemplateRows,
  hMfReports,
  hMfReportVersions,
  hMfIngredients,
  hMaterials
} from "../../../drizzle/schema";

/**
 * 배치 관리 DB 헬퍼 함수
 * 모든 함수에 tenantId 필터링 적용
 */

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
  createdBy: number;
  notes?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  // 1. 배치 생성
  const [batch] = await db.insert(hBatches).values({
    tenantId: data.tenantId,
    siteId: data.siteId,
    batchCode: data.batchCode,
    productId: data.productId,
    recipeId: data.recipeId,
    plannedQuantity: data.plannedQuantity,
    plannedDate: data.plannedDate,
    status: "planned",
    createdBy: data.createdBy,
    notes: data.notes
  } as any);
  
  const batchId = batch.insertId;
  const plannedQty = parseFloat(data.plannedQuantity);
  
  // 2. 품목제조보고의 배합비를 기준으로 원재료 투입 계획 자동 생성
  try {
    // 2-1. 제품의 품목제조보고 조회
    const mfReport = await db
      .select({ id: hMfReports.id })
      .from(hMfReports)
      .where(and(
        eq(hMfReports.productId, data.productId),
        eq(hMfReports.tenantId, data.tenantId)
      ))
      .limit(1);
    
    if (mfReport.length > 0) {
      // 2-2. 최신 승인된 버전 조회
      const latestVersion = await db
        .select({ id: hMfReportVersions.id })
        .from(hMfReportVersions)
        .where(and(
          eq(hMfReportVersions.mfReportId, mfReport[0].id),
          eq(hMfReportVersions.approvalStatus, "APPROVED")
        ))
        .orderBy(desc(hMfReportVersions.versionNo))
        .limit(1);
      
      if (latestVersion.length > 0) {
        // 2-3. 배합비(원재료 함량) 조회
        const ingredients = await db
          .select({
            materialId: hMfIngredients.materialId,
            quantity: hMfIngredients.quantity,
            unit: hMfIngredients.unit,
            processGroupId: hMfIngredients.processGroupId
          })
          .from(hMfIngredients)
          .where(eq(hMfIngredients.mfReportVersionId, latestVersion[0].id))
          .orderBy(hMfIngredients.lineNo);
        
        // 2-4. 배합비 × 생산량으로 원재료 투입 계획 생성 (process_group_id 포함)
        // ★ 2026-05-10 (PR #297): unit_price/total_price 마스터 lookup 후 INSERT 시 채움
        // ★ 2026-05-10 (PR #298): material_id 표준화 — h_mf_ingredients.material_id (= item_master.id) 를
        //    자재명 매칭으로 canonical h_materials.id 로 변환 후 INSERT.
        //    단가는 4단 폴백: h_materials → 마지막 입고 lot → item_master.default_unit_price.
        if (ingredients.length > 0) {
          const candidateRawIds = ingredients
            .map((ing) => ing.materialId)
            .filter((id): id is number => id !== null);

          const conn = await getRawConnection();
          // ★ ID 표준화 맵: rawId(item_master.id) → canonicalId(h_materials.id)
          const idMap = new Map<number, number>();
          if (candidateRawIds.length > 0) {
            const ph = candidateRawIds.map(() => "?").join(",");
            const [mapRows]: any = await conn.execute(
              `SELECT im.id AS raw_id, im.item_name,
                      hm.id AS hm_id, hm.material_name
                 FROM item_master im
                 LEFT JOIN h_materials hm
                   ON hm.tenant_id = im.tenant_id
                  AND TRIM(hm.material_name) = TRIM(im.item_name)
                WHERE im.tenant_id = ? AND im.id IN (${ph})`,
              [data.tenantId, ...candidateRawIds],
            );
            for (const r of (mapRows as any[])) {
              const rawId = Number(r.raw_id);
              const hmId = r.hm_id ? Number(r.hm_id) : null;
              if (hmId) idMap.set(rawId, hmId);
              else idMap.set(rawId, rawId);
            }
            for (const rawId of candidateRawIds) {
              if (!idMap.has(rawId)) idMap.set(rawId, rawId);
            }
          }

          const canonicalIds = Array.from(new Set(Array.from(idMap.values())));

          // 단가 lookup 1차: h_materials.unit_price (canonicalId)
          const priceMap = new Map<number, number>();
          if (canonicalIds.length > 0) {
            const ph = canonicalIds.map(() => "?").join(",");
            const [priceRows]: any = await conn.execute(
              `SELECT id, unit_price FROM h_materials
                WHERE tenant_id = ? AND id IN (${ph}) AND unit_price > 0`,
              [data.tenantId, ...canonicalIds],
            );
            for (const r of (priceRows as any[])) {
              const p = parseFloat(r.unit_price ?? 0);
              if (p > 0) priceMap.set(Number(r.id), p);
            }
          }

          // 단가 lookup 2차: 마지막 입고 lot.unit_price
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
              [data.tenantId, ...stillMissing],
            );
            for (const r of (lotRows as any[])) {
              const p = parseFloat(r.unit_price ?? 0);
              if (p > 0) priceMap.set(Number(r.material_id), p);
            }
          }

          // 단가 lookup 3차: item_master.default_unit_price
          const stillMissing2 = canonicalIds.filter((id) => !priceMap.has(id));
          if (stillMissing2.length > 0) {
            const ph = stillMissing2.map(() => "?").join(",");
            const [imRows]: any = await conn.execute(
              `SELECT id, default_unit_price FROM item_master
                WHERE tenant_id = ? AND id IN (${ph})
                  AND default_unit_price > 0`,
              [data.tenantId, ...stillMissing2],
            );
            for (const r of (imRows as any[])) {
              const p = parseFloat(r.default_unit_price ?? 0);
              if (p > 0) priceMap.set(Number(r.id), p);
            }
          }

          const batchInputs = ingredients
            .filter(ing => ing.materialId !== null)
            .map(ing => {
              const plannedQ = (parseFloat(ing.quantity) / 100) * plannedQty;
              const rawId = Number(ing.materialId!);
              const canonicalId = idMap.get(rawId) ?? rawId;
              const unitPrice = priceMap.get(canonicalId) ?? 0;
              const totalPrice = unitPrice > 0 ? plannedQ * unitPrice : 0;
              return {
                batchId,
                materialId: canonicalId,                          // ★ canonical h_materials.id
                plannedQuantity: plannedQ,
                unit: ing.unit,
                processGroupId: ing.processGroupId ?? null,
                unitPrice: unitPrice.toFixed(2),
                totalPrice: totalPrice.toFixed(2),
                tenantId: data.tenantId
              };
            });
          
          if (batchInputs.length > 0) {
            await db.insert(hBatchInputs).values(batchInputs as any);
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to auto-generate batch inputs from MF report:", error);
    // 원재료 자동 생성 실패해도 배치 생성은 성공으로 처리
  }
  
  return batch;
}

/**
 * 배치 목록 조회
 */
export async function listBatches(filters: {
  siteId?: number;
  productId?: number;
  status?: string;
  limit?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  let query = db.select().from(hBatches);

  const conditions = [eq(hBatches.tenantId, filters.tenantId)];
  if (filters.siteId) {
    conditions.push(eq(hBatches.siteId, filters.siteId));
  }
  if (filters.productId) {
    conditions.push(eq(hBatches.productId, filters.productId));
  }
  if (filters.status) {
    conditions.push(eq(hBatches.status, filters.status as any));
  }

  query = query.where(and(...conditions)) as any;
  query = query.orderBy(desc(hBatches.createdAt)) as any;

  if (filters.limit) {
    query = query.limit(filters.limit) as any;
  }

  return await query;
}

/**
 * 배치 상세 조회
 */
export async function getBatchById(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hBatches.id, batchId)];
  if (tenantId) {
    conditions.push(eq(hBatches.tenantId, tenantId as number));
  }
  const [batch] = await db
    .select()
    .from(hBatches)
    .where(and(...conditions));
  return batch;
}

/**
 * 배치 상태 업데이트
 */
export async function updateBatchStatus(
  batchId: number,
  status: string,
  additionalData?: {
    startTime?: Date;
    endTime?: Date;
    actualQuantity?: string;
    lotNumber?: string;
  },
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const updateData: any = { status };

  if (additionalData?.startTime) {
    updateData.startTime = additionalData.startTime;
  }
  if (additionalData?.endTime) {
    updateData.endTime = additionalData.endTime;
  }
  if (additionalData?.actualQuantity) {
    updateData.actualQuantity = additionalData.actualQuantity;
  }
  if (additionalData?.lotNumber) {
    updateData.lotNumber = additionalData.lotNumber;
  }

  const conditions = [eq(hBatches.id, batchId)];
  if (tenantId) {
    conditions.push(eq(hBatches.tenantId, tenantId as number));
  }
  await db.update(hBatches).set(updateData).where(and(...conditions));
}

/**
 * 원재료 투입 기록
 */
export async function addBatchInput(data: {
  batchId: number;
  materialId: number;
  lotId?: number;
  plannedQuantity: string;
  actualQuantity?: string;
  unit: string;
  inputTime?: Date;
  inputBy?: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [input] = await db.insert(hBatchInputs).values({
    batchId: data.batchId,
    materialId: data.materialId,
    lotId: data.lotId,
    plannedQuantity: data.plannedQuantity,
    actualQuantity: data.actualQuantity,
    unit: data.unit,
    inputTime: data.inputTime,
    inputBy: data.inputBy,
    notes: data.notes
  });
  return input;
}

/**
 * 배치 원재료 목록 조회
 */
export async function getBatchInputs(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  return await db
    .select()
    .from(hBatchInputs)
    .where(eq(hBatchInputs.batchId, batchId));
}

/**
 * CCP 템플릿 조회
 */
export async function getCcpTemplates(filters?: {
  ccpType?: string;
  isActive?: boolean;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  let query = db.select().from(hCcpTemplates);

  const conditions = [];
  if (filters?.tenantId) {
    conditions.push(eq(hCcpTemplates.tenantId, filters.tenantId));
  }
  if (filters?.ccpType) {
    conditions.push(eq(hCcpTemplates.ccpType, filters.ccpType));
  }
  if (filters?.isActive !== undefined) {
    conditions.push(eq(hCcpTemplates.isActive, filters.isActive ? 1 : 0));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query;
}

/**
 * CCP 템플릿 행 조회
 */
export async function getCcpTemplateRows(templateId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  return await db
    .select()
    .from(hCcpTemplateRows)
    .where(eq(hCcpTemplateRows.templateId, templateId))
    .orderBy(hCcpTemplateRows.sortOrder);
}

/**
 * CCP 인스턴스 자동 생성
 */
export async function createCcpInstance(data: {
  siteId: number;
  workDate: string;
  ccpType: string;
  productName?: string;
  productId?: number;
  batchId?: number;
  criticalLimitMin?: string;
  criticalLimitMax?: string;
  unit?: string;
  createdBy?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [instance] = await db.insert(hCcpInstances).values({
    tenantId: data.tenantId,
    siteId: data.siteId,
    workDate: new Date(data.workDate),
    ccpType: data.ccpType,
    productName: data.productName,
    productId: data.productId,
    batchId: data.batchId,
    status: "draft",
    createdBy: data.createdBy
  });
  return instance;
}

/**
 * CCP 인스턴스 목록 조회
 */
export async function listCcpInstances(filters: {
  siteId?: number;
  batchId?: number;
  status?: string;
  limit?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  let query = db.select().from(hCcpInstances);

  const conditions = [eq(hCcpInstances.tenantId, filters.tenantId)];
  if (filters.siteId) {
    conditions.push(eq(hCcpInstances.siteId, filters.siteId));
  }
  if (filters.batchId) {
    conditions.push(eq(hCcpInstances.batchId, filters.batchId));
  }
  if (filters.status) {
    conditions.push(eq(hCcpInstances.status, filters.status as any));
  }

  query = query.where(and(...conditions)) as any;
  query = query.orderBy(desc(hCcpInstances.createdAt)) as any;

  if (filters.limit) {
    query = query.limit(filters.limit) as any;
  }

  return await query;
}

/**
 * CCP 점검 기록 추가
 * P0: tenantId 지원 추가
 */
export async function addCcpRow(data: {
  instanceId: number;
  sortOrder?: number;
  rowType: "measurement" | "corrective_action" | "verification";
  measuredAt?: Date;
  tempC?: string;
  durationMin?: number;
  pressureBar?: string;
  result?: "PASS" | "FAIL" | "N/A";
  note?: string;
  autoGenerated?: boolean;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const insertData: any = {
    instanceId: data.instanceId,
    sortOrder: data.sortOrder,
    rowType: data.rowType,
    measuredAt: data.measuredAt,
    tempC: data.tempC,
    durationMin: data.durationMin,
    pressureBar: data.pressureBar,
    result: data.result,
    note: data.note,
    autoGenerated: data.autoGenerated ? 1 : 0
  };
  if (data.tenantId) insertData.tenantId = data.tenantId;
  const [row] = await db.insert(hCcpRows).values(insertData);
  return row;
}

/**
 * CCP 점검 기록 조회
 * P0: tenantId 지원 추가
 */
export async function getCcpRows(instanceId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = tenantId
    ? and(eq(hCcpRows.instanceId, instanceId), eq(hCcpRows.tenantId, tenantId as number))
    : eq(hCcpRows.instanceId, instanceId);
  return await db
    .select()
    .from(hCcpRows)
    .where(conditions)
    .orderBy(hCcpRows.sortOrder);
}

/**
 * CCP 승인
 * P0: tenantId 지원 추가
 */
export async function approveCcpInstance(
  instanceId: number,
  approvedBy: number,
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = tenantId
    ? and(eq(hCcpInstances.id, instanceId), eq(hCcpInstances.tenantId, tenantId as number))
    : eq(hCcpInstances.id, instanceId);
  await db
    .update(hCcpInstances)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approvedBy
    })
    .where(conditions);
}

/**
 * CCP 반려
 * P0: tenantId 지원 추가
 */
export async function rejectCcpInstance(
  instanceId: number,
  approvedBy: number,
  rejectionReason: string,
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = tenantId
    ? and(eq(hCcpInstances.id, instanceId), eq(hCcpInstances.tenantId, tenantId as number))
    : eq(hCcpInstances.id, instanceId);
  await db
    .update(hCcpInstances)
    .set({
      status: "rejected",
      approvedAt: new Date(),
      approvedBy
    })
    .where(conditions);
}
