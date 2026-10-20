/**
 * 배치 CRUD (생성/조회/수정/삭제/코드생성)
 * batchFunctions.ts에서 분할
 */
import { eq, and, desc, sql, like, inArray } from "drizzle-orm";
import { getDb, getRawConnection } from "../connection";
import { resolveBomProductIds, selectBomVersion } from "../../lib/identity/itemIdentityService";
import { todayKST, toKSTTimestamp } from "../../utils/timezone";
import { BomQtyError, isPlannedInputRow, plannedInputQty } from "../../lib/production/batchInputPlan";
import { hBatches, hBatchInputs, hCcpInstances, hCcpRecords, hProductsV2, hMaterials, hInventory, hInventoryTransactions, hApprovalRequests } from "../../../drizzle/schema";
import { asProductionProductId } from "../../../shared/identity/itemIds";


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
  /** 생성 요청 줄 번호 (h_batch_create_requests.id) — 같은 INSERT 에 남겨 재시도가 이 생산 건을 찾는다 (2026-10-20) */
  createRequestId?: number | null;
  /** 예정 생산 건 — 만드는 순간부터 예정 (따로 UPDATE 하다 멈추면 예정 아닌 계획이 남았다) */
  planOnly?: boolean;
  /** 지난 날짜 즉시 실행 — 실행 단계가 남았음을 같은 INSERT 에 (커밋 뒤 한 번 처리) */
  activationPending?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // ★ 2026-05-10 (PR #299): 혼합 mfReport (MIXED) 인 제품은 batch 생성 차단
  // 정책: "생산은 단품으로 한다" — 혼합은 출고 단위, 생산 단위 X
  const { hMfReports } = await import("../../../drizzle/schema/schema_recipe_new");

  // ★ 2026-10-07: h_mf_reports.product_id 가 h_products_v2.id / item_master.id 두 네임스페이스를
  //   섞어 쓰므로 (bomProductResolver 참고) 후보 ID 전부로 조회하고 직접 일치를 우선한다.
  const bomProductIds = await resolveBomProductIds(asProductionProductId(batch.productId), batch.tenantId);
  const directFirst = sql`(${hMfReports.productId} = ${batch.productId}) DESC`;

  // ★ 2026-05-10 (PR #299): 혼합 mfReport 차단 (생산은 단품만)
  try {
    const [mfRow] = await db
      .select({ reportType: hMfReports.reportType, reportNo: hMfReports.reportNo })
      .from(hMfReports)
      .where(
        and(
          inArray(hMfReports.productId, bomProductIds),
          eq(hMfReports.tenantId, batch.tenantId),
          eq(hMfReports.status, "ACTIVE"),
        ),
      )
      .orderBy(directFirst)
      .limit(1);
    if (mfRow && mfRow.reportType === "MIXED") {
      throw new Error(
        `[혼합 제품] 이 제품 (보고서 ${mfRow.reportNo}) 은 혼합 SKU 로 등록되어 있어 생산 단위가 아닙니다. ` +
          `각 단품을 별도로 생산하세요. 혼합은 매출 출고 시 자동 분해됩니다.`,
      );
    }
  } catch (err: any) {
    if (err?.message?.includes("[혼합 제품]")) throw err;
    // 다른 조회 에러는 silent — batch 생성 계속 진행
  }

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

  const isAutoCompleted = batch.status === "completed";

  // ★ 2026-10-16 (수율 기준 PR C, Codex #546 P1): 원물·공정 기준은 배치를 만들기 **전에** 계산한다.
  //   회사가 선택했고 버전이 켜져 있는데 계산이 안 되면(기준값 누락·단위 등) 배치를 만들지 않는다 —
  //   조용히 기존 계산(배합비 × 생산량)으로 넘어가면 원료가 과다 차감된다.
  const { prepareBatchMassBasis } = await import("./batchMassBasis");
  const massBasisPlan = await prepareBatchMassBasis(batch.tenantId, batch.productId, parseFloat(batch.plannedQuantity));
  if (massBasisPlan.mode === "error") {
    throw new Error(`[수율 환산] 품목제조보고 버전 ${massBasisPlan.versionId} 의 원물·공정 기준을 계산할 수 없어 배치를 만들지 않았습니다: ${massBasisPlan.reason}`);
  }

  // auto 모드: 종료시간 계산 (시작시간 + BOM 배치수 × 사이클시간)
  // 실제 종료시간은 completeBatch에서 정확히 갱신
  let endTimeStr: string | null = null;
  if (isAutoCompleted && startTimeStr) {
    const [h, m] = (batch.batchStartTime || "09:00").split(":").map(Number);
    const endH = h + 2;
    endTimeStr = `${plannedDateStr} ${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }

  // ★ 2026-10-20 (생산계획 생애주기 검토 4·5): 생산 건 머리글 + 원물·공정 기준 스냅샷 + 원료 투입 계획을 **한 트랜잭션** —
  //   원료 계획을 못 만들면 생산 건도 만들지 않는다 (이전: 기준 계산이 아닌 경로는 투입 없이 생산 건을 남기고 로그만).
  //   준비 미완(setup_pending=1) 으로 넣고, CCP·기록지·행·SKU 까지 확인된 뒤 호출자(오케스트레이터)가 0 으로 바꾼다.
  const pool = await getRawConnection();
  const conn = await (pool as any).getConnection();
  try {
    await conn.beginTransaction();
    const [result]: any = await conn.execute(
      `INSERT INTO h_batches
         (tenant_id, site_id, batch_code, day_batch_group, batch_order,
          product_id, planned_quantity, actual_quantity, planned_date, start_time, end_time,
          status, mode, completed_at, created_by, create_request_id, plan_only, activation_pending, setup_pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
        endTimeStr,
        batch.status || "planned",
        batch.mode || "auto",
        isAutoCompleted ? new Date() : null,
        batch.createdBy,
        batch.createRequestId ?? null,
        batch.planOnly ? 1 : 0,
        batch.activationPending ? 1 : 0,
      ]
    );
    const batchId = Number(result.insertId);
    await insertPlannedBatchInputs(conn, { batchId, tenantId: batch.tenantId, productId: batch.productId, plannedQty: parseFloat(batch.plannedQuantity), massBasisPlan });
    await conn.commit();
    return batchId;
  } catch (e) {
    try { await conn.rollback(); } catch { /* 원래 오류 */ }
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * 원료 투입 계획 — 생산 건 생성·재계획이 같은 함수 (호출자 트랜잭션 conn 안에서).
 *   버전 하나(selectBomVersion) · 배합비 × 계획량 또는 원물·공정 기준 스냅샷 · 단가 조회.
 *   ★ 2026-10-20 (생산계획 생애주기 검토 5): 원료 정체성은 정본 연결(item_master.legacy_material_id → h_materials, 같은 회사)로만.
 *     이름이 같다는 이유로 연결하지 않고, 다른 표의 같은 숫자 id 를 같은 원료로 보지 않는다. 연결이 없으면 설정 오류로 막는다.
 */
export async function insertPlannedBatchInputs(conn: any, a: { batchId: number; tenantId: number; productId: number; plannedQty: number; massBasisPlan?: any }): Promise<number> {
  const { batchId, tenantId, plannedQty } = a;
  const massBasisPlan = a.massBasisPlan ?? (await (await import("./batchMassBasis")).prepareBatchMassBasis(tenantId, a.productId, plannedQty));
  if (massBasisPlan.mode === "error") {
    throw new Error(`[수율 환산] 품목제조보고 버전 ${massBasisPlan.versionId} 의 원물·공정 기준을 계산할 수 없습니다: ${massBasisPlan.reason}`);
  }
  // 1·2. 제품의 품목제조보고 + 사용할 버전 하나 (v2 id 직접 일치 우선, APPROVED 최신 → 없으면 최신)
  //   ★ 2026-10-16: CCP 기록지 투입량(ccpFormSettings) 과 같은 함수로 고른다 (selectBomVersion).
  const picked = await selectBomVersion(asProductionProductId(a.productId), tenantId, conn);
  if (!picked) return 0;
  if (!picked.approved) console.log("[createBatch] APPROVED 버전 없음, 최신 버전 fallback 사용");
  const versionId = picked.versionId;
  const [[ver]]: any = await conn.execute(`SELECT batch_target_kg FROM h_mf_report_versions WHERE id = ?`, [versionId]);
  const batchTargetKg = ver?.batch_target_kg != null && Number(ver.batch_target_kg) > 0 ? Number(ver.batch_target_kg) : null;

  // 3. 배합비 — h_mf_ingredients.material_id = item_master.id, 단위는 item_master.base_unit
  const [ingRows]: any = await conn.execute(
    `SELECT i.id, i.material_id AS materialId, i.quantity, i.corrected_quantity AS correctedQuantity, i.is_deductible AS isDeductible,
            i.unit, i.is_additional AS isAdditional, i.process_group_id AS processGroupId, im.base_unit AS materialUnit
       FROM h_mf_ingredients i LEFT JOIN item_master im ON im.id = i.material_id AND im.tenant_id = ?
      WHERE i.mf_report_version_id = ? ORDER BY i.line_no, i.id`,
    [tenantId, versionId],
  );
  const ingredients = (ingRows as any[]).map((r) => ({
    ...r, materialId: r.materialId != null ? Number(r.materialId) : null, isDeductible: r.isDeductible != null ? Number(r.isDeductible) : null,
    isAdditional: r.isAdditional != null ? Number(r.isAdditional) : null,
  }));

  // ★ 2026-10-16 (수율 기준 PR C): 기준 계산이면 스냅샷을 고정하고 원료 투입 계획(=자동 출고량)을 스냅샷의 행별 원물 kg 로.
  let massBasisRawByIngredient: Map<number, number> | null = null;
  if (massBasisPlan.mode === "basis") {
    if (massBasisPlan.snapshot.versionId !== versionId) {
      throw new Error(`[수율 환산] 기준 버전(${massBasisPlan.snapshot.versionId}) 과 배치 버전(${versionId}) 이 다릅니다`);
    }
    const { saveBatchMassBasis } = await import("./batchMassBasis");
    const stored = await saveBatchMassBasis(conn, batchId, tenantId, massBasisPlan.snapshot, massBasisPlan.subBatchKg);
    massBasisRawByIngredient = recordedRawKgByIngredient({ recorded: true, snapshot: stored.snapshot });
    const missing = ingredients.filter((ing: any) => ing.materialId !== null && ing.isDeductible !== 0 && !massBasisRawByIngredient!.has(Number(ing.id)));
    if (missing.length > 0) {
      throw new Error(`[수율 환산] 원료 행 ${missing.map((m: any) => m.id).join(",")} 이 기준 스냅샷에 없습니다`);
    }
  }

  const filtered = ingredients.filter((ing: any) => isPlannedInputRow(ing));
  if (!filtered.length) return 0;

  // 4. 정본 연결 — item_master.id → legacy_material_id (같은 회사 h_materials 에 있어야)
  const rawIds = Array.from(new Set(filtered.map((ing: any) => Number(ing.materialId))));
  const [mapRows]: any = await conn.query(
    `SELECT im.id AS raw_id, im.item_name, hm.id AS hm_id, hm.material_name
       FROM item_master im
       LEFT JOIN h_materials hm ON hm.id = im.legacy_material_id AND hm.tenant_id = im.tenant_id
      WHERE im.tenant_id = ? AND im.id IN (?)`,
    [tenantId, rawIds],
  );
  const idMap = new Map<number, number>(); // item_master.id → h_materials.id
  const nameOf = new Map<number, string>();
  for (const r of mapRows as any[]) {
    nameOf.set(Number(r.raw_id), String(r.item_name ?? ""));
    if (r.hm_id != null) idMap.set(Number(r.raw_id), Number(r.hm_id));
  }
  const unlinked = rawIds.filter((id) => !idMap.has(id));
  if (unlinked.length) {
    const names = unlinked.slice(0, 3).map((id) => `${nameOf.get(id) || "품목"}(#${id})`).join(", ");
    throw new Error(`[원료 연결] ${names}${unlinked.length > 3 ? ` 외 ${unlinked.length - 3}개` : ""} 이(가) 재고 원료와 연결되어 있지 않아 생산 건을 만들지 않았습니다 — 품목 마스터에서 원료 연결을 먼저 하세요 (이름으로 추정하지 않습니다).`);
  }

  // 5. 단가 — 1차 h_materials.unit_price, 2차 마지막 입고 LOT, 3차 item_master.default_unit_price (각자 자기 표의 id 로)
  const canonicalIds = Array.from(new Set(Array.from(idMap.values())));
  const priceMap = new Map<number, number>();
  {
    const [rows]: any = await conn.query(`SELECT id, unit_price FROM h_materials WHERE tenant_id = ? AND id IN (?) AND unit_price > 0`, [tenantId, canonicalIds]);
    for (const r of rows as any[]) { const p = parseFloat(r.unit_price ?? 0); if (p > 0) priceMap.set(Number(r.id), p); }
  }
  const miss1 = canonicalIds.filter((id) => !priceMap.has(id));
  if (miss1.length) {
    const [rows]: any = await conn.query(
      `SELECT material_id, unit_price FROM (
         SELECT material_id, unit_price, ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY receipt_date DESC, id DESC) AS rn
           FROM h_inventory_lots WHERE tenant_id = ? AND material_id IN (?) AND unit_price IS NOT NULL AND unit_price > 0
       ) t WHERE rn = 1`,
      [tenantId, miss1],
    );
    for (const r of rows as any[]) { const p = parseFloat(r.unit_price ?? 0); if (p > 0) priceMap.set(Number(r.material_id), p); }
  }
  const imPrice = new Map<number, number>(); // item_master.id → default_unit_price
  const miss2Raw = rawIds.filter((rid) => !priceMap.has(idMap.get(rid)!));
  if (miss2Raw.length) {
    const [rows]: any = await conn.query(`SELECT id, default_unit_price FROM item_master WHERE tenant_id = ? AND id IN (?) AND default_unit_price > 0`, [tenantId, miss2Raw]);
    for (const r of rows as any[]) { const p = parseFloat(r.default_unit_price ?? 0); if (p > 0) imPrice.set(Number(r.id), p); }
  }

  const { rawKgToMaterialUnit } = await import("./batchMassBasis");
  let n = 0;
  for (const ing of filtered as any[]) {
    // BOM 줄 계약 (batchInputPlan — 생산 설계 시험 계산·CCP 투입량과 같은 해석): 주원료 % × 계획량, 추가 원재료 kg·g 는
    // 1배치 기준량 대비 비례, 원료 재고 단위(kg·g)로 환산. 정할 수 없는 줄은 생산 건을 만들지 않는다 (2026-10-20 검토 1).
    // 기준 스냅샷이 있으면 그 행의 원물 kg (불리기 전, 재고 출고 기준)
    let plannedQ: number;
    let unit: string;
    if (massBasisRawByIngredient) {
      const conv = rawKgToMaterialUnit(massBasisRawByIngredient.get(Number(ing.id))!, ing.materialUnit);
      if (!conv) throw new Error(`[수율 환산] 원료 행 ${ing.id} 의 단위(${ing.materialUnit}) 는 kg 기준으로 바꿀 수 없습니다`);
      plannedQ = conv.qty;
      unit = conv.unit;
    } else {
      try {
        ({ qty: plannedQ, unit } = plannedInputQty(ing, plannedQty, batchTargetKg, ing.materialUnit));
      } catch (e) {
        if (e instanceof BomQtyError) throw new Error(`[원료 양] ${nameOf.get(Number(ing.materialId)) || `원료 #${ing.materialId}`}: ${e.message} — 생산 건을 만들지 않았습니다`);
        throw e;
      }
    }
    const rawId = Number(ing.materialId);
    const canonicalId = idMap.get(rawId)!;
    const unitPrice = priceMap.get(canonicalId) ?? imPrice.get(rawId) ?? 0;
    const totalPrice = unitPrice > 0 ? plannedQ * unitPrice : 0;
    await conn.execute(
      `INSERT INTO h_batch_inputs (tenant_id, batch_id, material_id, planned_quantity, unit, process_group_id, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, batchId, canonicalId, plannedQ.toFixed(3), unit, ing.processGroupId ?? null, unitPrice.toFixed(2), totalPrice.toFixed(2)],
    );
    n++;
  }
  return n;
}

/** 스냅샷이 기록된 경우 원료 행 id → 원물 kg (차감 대상 행만). 기록 안 됐으면 null → 기존 계산 */
export function recordedRawKgByIngredient(
  mb: { recorded: boolean; snapshot?: { rows: Array<{ ingredientId: number; rawKg: number; isDeductible: boolean }> } } | null | undefined,
): Map<number, number> | null {
  if (!mb?.recorded || !mb.snapshot) return null;
  return new Map(mb.snapshot.rows.filter((r) => r.isDeductible).map((r) => [r.ingredientId, r.rawKg]));
}

export async function getBatchById(batchId: number, tenantId?: number) {
  const conn = await getRawConnection();

  const [rows] = await conn.execute<any[]>(
    `SELECT b.*,
            p.product_name,
            p.product_code,
            (SELECT s.batch_code FROM h_batches s WHERE s.id = b.superseded_by_batch_id AND s.tenant_id = b.tenant_id) AS superseded_by_code
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
     WHERE b.id = ?${tenantId ? " AND b.tenant_id = ?" : ""}
     LIMIT 1`,
    // 2026-10-14: 받은 tenantId 를 조회 조건에 실제로 건다 (이전에는 무시 → 다른 회사 배치 id 로도 조회됨)
    tenantId ? [batchId, tenantId] : [batchId]
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
    planOnly: Number(row.plan_only ?? 0) === 1,
    /** 무효(중복 정리) — 상세 화면 맨 위 안내 + 확인·마감·승인 동작 숨김 (2026-10-20) */
    voidedAt: row.voided_at ?? null,
    voidReason: row.void_reason ?? null,
    supersededByBatchId: row.superseded_by_batch_id != null ? Number(row.superseded_by_batch_id) : null,
    supersededByCode: row.superseded_by_code ?? null,
  };
}

export async function getAllBatches(filters?: {
  siteId?: number;
  status?: string;
  productId?: number;
  tenantId: number;
  page?: number;
  limit?: number;
  /** planned_date >= fromDate (YYYY-MM-DD). 캘린더 뷰에서 월 범위 조회용 */
  fromDate?: string;
  /** planned_date <= toDate (YYYY-MM-DD). 캘린더 뷰에서 월 범위 조회용 */
  toDate?: string;
  /** 'created'(기본, 입력일 최신순) | 'planned'(생산일 최신순 — 대시보드 최근 생산 배치) */
  sort?: "created" | "planned";
  /** 달력 표시 (확인 남음·출고 보류·결재 대기) 함께 (2026-10-20) */
  withMarks?: boolean;
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
  // planned_date 범위 필터 (캘린더 뷰의 월 범위 조회 지원)
  if (filters?.fromDate) {
    whereParts.push("b.planned_date >= ?");
    params.push(filters.fromDate);
  }
  if (filters?.toDate) {
    whereParts.push("b.planned_date <= ?");
    params.push(filters.toDate);
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
    // ★ 2026-10-16: 생산일 정렬은 페이지를 자르기 전에 서버에서 (Codex 대시보드 날짜 검토 P2).
    //   입력일 순 첫 50건을 화면에서 다시 정렬하면 늦게 입력된 과거 생산일·최근 생산일 배치가 빠진다.
    //   planned_date_ymd: DATE 를 문자열 그대로 — Date/UTC 왕복으로 하루 밀리지 않게.
    `SELECT b.*, DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS planned_date_ymd, p.product_name, p.product_code
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
     ${whereClause}
     ORDER BY ${filters?.sort === "planned" ? "(b.planned_date IS NULL) ASC, b.planned_date DESC, b.id DESC" : "b.created_at DESC"}
     LIMIT ? OFFSET ?`,
    [...params, String(limit), String(offset)]
  );

  // 달력 표시 — 무효·취소 아닌 생산 건만 (읽기만)
  const { loadBatchMarks } = await import("../../lib/production/dayChecks");
  const markIds = filters?.withMarks && filters?.tenantId
    ? (dataRows as any[]).filter((r) => !r.voided_at && r.status !== "cancelled").map((r) => Number(r.id))
    : [];
  const marks = markIds.length ? await loadBatchMarks(conn, filters!.tenantId, markIds) : null;

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
      /** 생산일 YYYY-MM-DD (DB DATE 그대로, 없으면 null) — 표시용 */
      plannedDateYmd: row.planned_date_ymd ?? null,
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
      /** 예정만 (첫 현장 확인 전) */
      planOnly: Number(row.plan_only ?? 0) === 1,
      /** 무효(중복 정리) — 정상 달력·합계에서 빼고 이력으로만 (2026-10-20) */
      voidedAt: row.voided_at ?? null,
      supersededByBatchId: row.superseded_by_batch_id != null ? Number(row.superseded_by_batch_id) : null,
      marks: marks?.get(Number(row.id)) ?? null,
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

export async function updateBatchStatus(batchId: number, status: string, tenantId?: number, opts: { keepPlannedStart?: boolean } = {}) {
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
    // 계획 시작시각 유지 (Codex 단지 생산 입력 회귀 F-PROD-02): 자동 시작이거나 업무일이 오늘이 아니면
    //   '지금' 으로 덮어쓰지 않는다 — 과거 업무일 입력 때 시작시각이 입력 시각(다른 날)으로 바뀌었다. 입력 시각은 created_at.
    const { shouldStampStartNow } = await import("../../lib/production/dayProductionGuard");
    const { todayKstDateStr } = await import("../../lib/production/batchBusinessDate");
    const rc: any = await getRawConnection();
    const [cur]: any = await rc.execute(
      `SELECT start_time IS NOT NULL AS has_start, DATE_FORMAT(planned_date, '%Y-%m-%d') AS pd FROM h_batches WHERE id = ?${tenantId ? " AND tenant_id = ?" : ""} LIMIT 1`,
      tenantId ? [batchId, tenantId] : [batchId],
    );
    const c = (cur as any[])[0];
    if (shouldStampStartNow({ hasStartTime: !!Number(c?.has_start ?? 0), plannedDate: c?.pd ?? null, todayKst: todayKstDateStr(), keepPlanned: opts.keepPlannedStart })) {
      updateData.startTime = now;
    }
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

/**
 * 배치 삭제 — 완전한 역수행(undo) + 원자성 (2026-07-03 근본수정)
 * ============================================================================
 * 기존 문제: 배치만/일부 자식만 지우고 h_inventory_lots(제품 LOT)와
 *   h_inventory_transactions(usage/inbound)를 남겨 orphan 발생 →
 *   (a) 삭제 후 batch_code 재사용 시 lot_number 충돌, (b) phantom 제품재고,
 *   (c) BATCH_DELETED 유령 usage. 또 원재료 소모를 안 되돌려 재고 손실.
 *
 * 수정: 하나의 트랜잭션으로
 *   1) 이미 출고/소비된 완제품 LOT 이 있으면 삭제 차단(되돌릴 수 없음).
 *   2) 원재료 소모 복원 — 실제 LOT 을 깎은 usage(lot_id>0)를 그 LOT 에 되돌림
 *      + 해당 자재 집계(h_inventory) 재계산.
 *   3) 배치의 재고 거래(usage/inbound) + 제품 LOT 삭제(orphan 원천 제거).
 *   4) 기존 자식(ccp/inputs/schedules/docs/approvals/sku/metal) 정리.
 *   5) 배치 삭제.
 */
/**
 * 생산 건 삭제 — 손 안 댄 계획만 (2026-10-20, 생산계획 생애주기 검토 6)
 *
 * 원료 출고·확인·저장·결재·완제품 LOT 흔적이 하나라도 있으면 지우지 않는다 — 실행된 생산 건은 이력 보존형 경로(무효·정정)로.
 *   (이전: 출고 거래를 지우고 LOT 수량을 되돌리는 물리 삭제 — 원장 이력이 사라졌다.)
 * 한 트랜잭션 (생산 건 행·기록 행 잠금 뒤 다시 검사): 이 생산 건의 미확인 파생 계획만 정리 —
 *   원료 투입·원물 기준·CCP 공정·회차·이 생산 건 기록지와 행·금속검출 하루 기록지의 이 생산 건 통과 행·SKU 구성·일정 표.
 *   금속검출 하루 기록지는 그날 공용 — 이 생산 건을 기준으로 잡고 있으면 그날 다른 생산 건으로 옮기고, 남는 생산 건이 없고
 *   사람이 손대지 않았을 때만 지운다. 다른 생산 건의 통과 행·사람 기록은 그대로.
 * 표가 없는 DB 만 넘어가고(ER_NO_SUCH_TABLE), 다른 오류는 전부 되돌린다.
 */
export async function deleteBatch(batchId: number, tenantId?: number) {
  if (!tenantId) throw new Error("회사 정보가 필요합니다 (생산 건 삭제).");
  const pool = await getRawConnection();
  // 이력 보존형 복구로 무효 처리된 생산 건은 원본 보존 — 지우면 역거래·대체 관계·보관 이력이 끊긴다 (2026-10-19)
  const { assertBatchNotVoided } = await import("../../lib/production/batchVoidGuard");
  await assertBatchNotVoided(pool, batchId, tenantId);
  const { batchHistoryReasons } = await import("../../lib/production/batchTouchGuard");
  const conn = await (pool as any).getConnection();
  const opt = async (sql: string, p: unknown[]) => {
    try { await conn.execute(sql, p); } catch (e: any) { if (e?.code !== "ER_NO_SUCH_TABLE") throw e; }
  };
  let workDate: string | null = null;
  try {
    await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await conn.beginTransaction();
    const [[b]]: any = await conn.execute(
      `SELECT id, DATE_FORMAT(planned_date, '%Y-%m-%d') AS wd FROM h_batches WHERE id = ? AND tenant_id = ? FOR UPDATE`, [batchId, tenantId]);
    if (!b) { await conn.commit(); return; }
    workDate = b.wd;
    await conn.execute(
      `SELECT r.id FROM h_ccp_form_rows r JOIN h_ccp_form_records f ON f.id = r.form_record_id AND f.tenant_id = r.tenant_id
        WHERE r.tenant_id = ? AND ((f.batch_id = ? AND f.ccp_type <> 'CCP-4P') OR (f.ccp_type = 'CCP-4P' AND r.batch_id = ?)) FOR UPDATE`,
      [tenantId, batchId, batchId]);
    const why = await batchHistoryReasons(conn, batchId, tenantId);
    if (why.length) {
      throw new Error(`손 안 댄 계획만 지울 수 있습니다 — ${why.join(", ")}. 실행된 생산 건은 이력 보존형 경로(무효·정정)로 처리합니다.`);
    }
    const bp = [batchId, tenantId];
    await conn.execute(`DELETE r FROM h_ccp_rows r JOIN h_ccp_instances i ON i.id = r.instance_id AND i.tenant_id = r.tenant_id WHERE i.batch_id = ? AND i.tenant_id = ?`, bp);
    await conn.execute(`DELETE FROM h_ccp_instances WHERE batch_id = ? AND tenant_id = ?`, bp);
    await conn.execute(`DELETE r FROM h_ccp_form_rows r JOIN h_ccp_form_records f ON f.id = r.form_record_id AND f.tenant_id = r.tenant_id WHERE f.batch_id = ? AND f.tenant_id = ? AND f.ccp_type <> 'CCP-4P'`, bp);
    await conn.execute(`DELETE FROM h_ccp_form_records WHERE batch_id = ? AND tenant_id = ? AND ccp_type <> 'CCP-4P'`, bp);
    // 금속검출 하루 기록지(공용): 이 생산 건 통과 행만, 기준 생산 건이면 그날 다른 생산 건으로
    await conn.execute(`DELETE FROM h_ccp_form_rows WHERE batch_id = ? AND tenant_id = ? AND equipment_type = 'passage'`, bp);
    const [[other]]: any = await conn.execute(
      `SELECT id FROM h_batches WHERE tenant_id = ? AND planned_date = ? AND id <> ? AND status <> 'cancelled' AND voided_at IS NULL ORDER BY id LIMIT 1`,
      [tenantId, workDate, batchId]);
    if (other) await conn.execute(`UPDATE h_ccp_form_records SET batch_id = ? WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND batch_id = ?`, [other.id, tenantId, batchId]);
    else {
      const { dropEmptyDailyMetal } = await import("../../lib/production/batchTouchGuard");
      await dropEmptyDailyMetal(conn, tenantId, batchId);
    }
    await conn.execute(`DELETE FROM h_batch_inputs WHERE batch_id = ? AND tenant_id = ?`, bp);
    await conn.execute(`DELETE FROM h_batch_schedules WHERE batch_id = ? AND tenant_id = ?`, bp);
    await opt(`DELETE FROM h_batch_mass_basis WHERE batch_id = ? AND tenant_id = ?`, bp);
    await opt(`DELETE FROM document_instances WHERE batch_id = ? AND tenant_id = ?`, bp);
    await opt(`DELETE FROM production_sku_output WHERE batch_id = ? AND tenant_id = ?`, bp);
    await opt(`DELETE sc FROM h_ccp_metal_sensitivity_checks sc JOIN h_ccp_batch_process_runs pr ON sc.batch_process_run_id = pr.id WHERE pr.batch_id = ? AND pr.tenant_id = ?`, bp);
    await opt(`DELETE sl FROM h_ccp_metal_sku_slots sl JOIN h_ccp_batch_process_runs pr ON sl.batch_process_run_id = pr.id WHERE pr.batch_id = ? AND pr.tenant_id = ?`, bp);
    await opt(`DELETE FROM h_ccp_batch_process_runs WHERE batch_id = ? AND tenant_id = ?`, bp);
    await conn.execute(`DELETE FROM h_batches WHERE id = ? AND tenant_id = ?`, bp);
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch { /* noop */ }
    throw e;
  } finally {
    conn.release();
  }
  // 커밋 뒤: 그날 금속검출 하루 기록지 — 남은 생산 건 기준으로 손 안 댄 행만 맞추고, 비고 손 안 댄 기록지는 정리
  if (workDate) {
    try {
      const [[fr]]: any = await (pool as any).execute(
        `SELECT id, field_mode, detector_equipment_id FROM h_ccp_form_records WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ? ORDER BY id LIMIT 1`, [tenantId, workDate]);
      if (fr && Number(fr.field_mode ?? 0) === 1) {
        const { syncFieldMetalRows } = await import("../../lib/haccp/fieldMetalRows");
        await syncFieldMetalRows(pool, { formRecordId: Number(fr.id), tenantId, workDate, detectorId: fr.detector_equipment_id ?? null });
        const { dailyMetalTouched } = await import("../../lib/production/batchTouchGuard");
        const [[left]]: any = await (pool as any).execute(`SELECT COUNT(*) AS n FROM h_batches WHERE tenant_id = ? AND planned_date = ? AND status <> 'cancelled' AND voided_at IS NULL`, [tenantId, workDate]);
        if (Number(left.n) === 0 && !(await dailyMetalTouched(pool, Number(fr.id), tenantId))) {
          await (pool as any).execute(`DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`, [fr.id, tenantId]);
          await (pool as any).execute(`DELETE FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`, [fr.id, tenantId]);
        }
      }
    } catch (e) {
      console.error(`[deleteBatch] 금속검출 하루 기록지 정리 실패 (생산 건 삭제는 유지) batch=${batchId}:`, e);
    }
  }
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
  // 무효 처리된(이력 보존형 복구) 생산 건이 있는 날은 일괄 삭제하지 않는다 — 하나도 지우기 전에 거부
  const { assertBatchNotVoided } = await import("../../lib/production/batchVoidGuard");
  for (const batchId of batchIds) await assertBatchNotVoided(pool, Number(batchId), tenantId);
  // 실행 흔적이 있는 생산 건이 하나라도 있으면 하나도 지우지 않는다 (2026-10-20, 생산계획 생애주기 검토 6)
  const { batchHistoryReasons } = await import("../../lib/production/batchTouchGuard");
  for (const batchId of batchIds) {
    const why = await batchHistoryReasons(pool, Number(batchId), tenantId);
    if (why.length) throw new Error(`생산 건 #${batchId} 은 지울 수 없습니다 — ${why.join(", ")}. 이 날짜는 일괄 삭제하지 않았습니다.`);
  }

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

