import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { getDb } from "../connection";
import { hBatches, hBatchInputs, hMaterials } from "../../../drizzle/schema";
import { itemMaster } from "../../../drizzle/schema/schema_dual_unit";

import { formatLocalDate } from "../../utils/timezone";

/** 정제수(purified water) 여부 판별 - 가격 계산에서 제외 대상 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
}

/**
 * 배치 생산 비용 분석
 */

export interface BatchCostSummary {
  batchId: number;
  batchCode: string;
  productId: number;
  plannedDate: Date;
  plannedCost: number;
  actualCost: number;
  costDifference: number;
  costDifferencePercent: number;
  status: "under_budget" | "on_budget" | "over_budget";
}

export interface MaterialCostBreakdown {
  materialId: number;
  materialName: string;
  plannedQuantity: number;
  actualQuantity: number;
  unitPrice: number;
  plannedCost: number;
  actualCost: number;
  costDifference: number;
}

export interface CostAnalysisPeriodSummary {
  period: string; // "2024-01" 형식
  totalBatches: number;
  totalPlannedCost: number;
  totalActualCost: number;
  totalCostDifference: number;
  avgCostDifferencePercent: number;
  underBudgetCount: number;
  onBudgetCount: number;
  overBudgetCount: number;
}

/**
 * 배치별 비용 분석 조회
 */
export async function getBatchCostAnalysis(params: {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}, tenantId: number): Promise<BatchCostSummary[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { startDate, endDate, limit = 100 } = params;

  // 배치 조회 조건
  const conditions = [];
  conditions.push(eq(hBatches.tenantId, tenantId));
  if (startDate) {
    conditions.push(gte(hBatches.plannedDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(hBatches.plannedDate, endDate));
  }

  // ★ 2026-05-09 (PR #295): h_batches.actualCost 가 NULL 이면 batch_inputs SUM(unitPrice × quantity) 폴백
  // ★ 2026-05-10 (PR #298 Option B): NULLIF(0) 폴백 + 이름 기반 cross-namespace 폴백 + 정제수 NULL 안전화
  // 신규 배치 다수가 actualCost NULL (autoApprove 경로 등) → 화면에 "-" 표시 사고
  // 폴백 단가: bi.unit_price → h_materials.unit_price (id) → item_master.default_unit_price (id)
  //          → h_materials.unit_price (이름) → item_master.default_unit_price (이름) → 0
  const batches = await db
    .select({
      batchId: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      plannedDate: hBatches.plannedDate,
      plannedCost: hBatches.plannedCost,
      actualCost: hBatches.actualCost,
      // 폴백용 SUM (h_batches.actualCost 0/NULL 일 때만 사용)
      computedActualCost: sql<number>`COALESCE((
        SELECT SUM(
          COALESCE(
            NULLIF(bi.total_price, 0),
            COALESCE(bi.actual_quantity, bi.planned_quantity, 0)
            * COALESCE(
                NULLIF(bi.unit_price, 0),
                NULLIF(m.unit_price, 0),
                NULLIF(im.default_unit_price, 0),
                NULLIF(m_byname.unit_price, 0),
                NULLIF(im_byname.default_unit_price, 0),
                0
              )
          )
        )
        FROM h_batch_inputs bi
        LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
        LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id AND im.item_type = 'raw_material'
        LEFT JOIN h_materials m_byname
          ON m.id IS NULL
         AND m_byname.tenant_id = bi.tenant_id
         AND TRIM(m_byname.material_name) = TRIM(im.item_name)
        LEFT JOIN item_master im_byname
          ON im.id IS NULL
         AND im_byname.tenant_id = bi.tenant_id
         AND im_byname.item_type = 'raw_material'
         AND TRIM(im_byname.item_name) = TRIM(m.material_name)
        WHERE bi.batch_id = h_batches.id AND bi.tenant_id = h_batches.tenant_id
          AND (
            COALESCE(m.material_name, im.item_name, m_byname.material_name, im_byname.item_name) IS NULL
            OR COALESCE(m.material_name, im.item_name, m_byname.material_name, im_byname.item_name) NOT LIKE '%정제수%'
          )
      ), 0)`.as("computed_actual_cost"),
    })
    .from(hBatches)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(hBatches.plannedDate))
    .limit(limit);

  return batches.map((batch) => {
    const plannedCost = Number(batch.plannedCost || 0);
    const dbActualCost = Number(batch.actualCost || 0);
    const computedCost = Number((batch as any).computedActualCost || 0);
    // h_batches.actualCost 가 0 이거나 NULL 이면 계산값 사용
    const actualCost = dbActualCost > 0 ? dbActualCost : computedCost;
    const costDifference = actualCost - plannedCost;
    const costDifferencePercent =
      plannedCost > 0 ? (costDifference / plannedCost) * 100 : 0;

    let status: "under_budget" | "on_budget" | "over_budget" = "on_budget";
    if (costDifferencePercent < -5) {
      status = "under_budget";
    } else if (costDifferencePercent > 5) {
      status = "over_budget";
    }

    return {
      batchId: batch.batchId,
      batchCode: batch.batchCode,
      productId: batch.productId,
      plannedDate: new Date(batch.plannedDate),
      plannedCost,
      actualCost,
      costDifference,
      costDifferencePercent: Math.round(costDifferencePercent * 100) / 100,
      status
    };
  });
}

/**
 * 특정 배치의 원재료별 비용 분석
 */
export async function getBatchMaterialCostBreakdown(
  batchId: number, tenantId: number): Promise<MaterialCostBreakdown[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // ★ 2026-05-09 (PR #295): 듀얼 lookup — h_materials 미등록 (item_master.id=256, 263+) 도 표시
  // 단가도 item_master.default_unit_price 폴백 — newer batches 의 cost=0 사고 차단
  // h_batch_inputs.unitPrice (FEFO LOT 실제단가) 우선, 없으면 master 단가 폴백
  const batchInputs = await db
    .select({
      materialId: hBatchInputs.materialId,
      materialName: sql<string>`COALESCE(${hMaterials.materialName}, ${itemMaster.itemName})`.as("material_name"),
      plannedQuantity: hBatchInputs.plannedQuantity,
      actualQuantity: hBatchInputs.actualQuantity,
      lotUnitPrice: hBatchInputs.unitPrice,
      lotTotalPrice: hBatchInputs.totalPrice,
      masterUnitPrice: sql<string>`COALESCE(${hMaterials.unitPrice}, ${itemMaster.defaultUnitPrice})`.as("master_unit_price"),
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .leftJoin(itemMaster, and(
      eq(itemMaster.id, hBatchInputs.materialId),
      eq(itemMaster.itemType, "raw_material"),
    ))
    .where(eq(hBatchInputs.batchId, batchId));

  return batchInputs.map((input) => {
    const plannedQuantity = Number(input.plannedQuantity || 0);
    const actualQuantity = Number(input.actualQuantity || 0);
    const water = isWaterMaterial(input.materialName);

    // ★ 2026-05-10 (PR #297): 0 도 폴백 트리거 (4/13 이후 unit_price=0 대량 발생 대응)
    // 단가 우선순위: LOT 실제단가 (>0) → 마스터 단가 (h_materials/item_master COALESCE)
    const rawLotPrice = input.lotUnitPrice ? Number(input.lotUnitPrice) : 0;
    const lotPrice = rawLotPrice > 0 ? rawLotPrice : null;
    const masterPrice = input.masterUnitPrice ? Number(input.masterUnitPrice) : 0;
    const unitPrice = water ? 0 : (lotPrice ?? masterPrice);
    const priceSource = water ? "excluded" : (lotPrice !== null ? "lot" : "master");

    const plannedCost = plannedQuantity * unitPrice;
    // ★ 2026-05-10 (PR #297): LOT total_price 도 0 이면 폴백 (수량 × unitPrice)
    const rawLotTotal = input.lotTotalPrice ? Number(input.lotTotalPrice) : 0;
    const lotTotal = rawLotTotal > 0 ? rawLotTotal : null;
    const actualCost = water ? 0 : (lotTotal ?? actualQuantity * unitPrice);
    const costDifference = actualCost - plannedCost;

    return {
      materialId: input.materialId,
      materialName: input.materialName || "Unknown",
      plannedQuantity,
      actualQuantity,
      unitPrice,
      plannedCost: Math.round(plannedCost * 100) / 100,
      actualCost: Math.round(actualCost * 100) / 100,
      costDifference: Math.round(costDifference * 100) / 100,
      isWater: water,
      priceSource  // "lot" | "master" | "excluded"
    };
  });
}

/**
 * 기간별 비용 분석 집계
 */
export async function getCostAnalysisPeriodSummary(params: {
  startDate: Date;
  endDate: Date;
  groupBy: "month" | "week" | "day";
}, tenantId: number): Promise<CostAnalysisPeriodSummary[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { startDate, endDate, groupBy } = params;

  // 배치 조회
  const batches = await db
    .select({
      plannedDate: hBatches.plannedDate,
      plannedCost: hBatches.plannedCost,
      actualCost: hBatches.actualCost
    })
    .from(hBatches)
    .where(
      and(eq(hBatches.tenantId, tenantId as any) , 
        gte(hBatches.plannedDate, startDate),
        lte(hBatches.plannedDate, endDate)
      ) as any
    );

  // 기간별 그룹화
  const periodMap: { [period: string]: BatchCostSummary[] } = {};

  batches.forEach((batch) => {
    const date = new Date(batch.plannedDate);
    let period: string;

    if (groupBy === "month") {
      period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    } else if (groupBy === "week") {
      const weekNumber = getWeekNumber(date);
      period = `${date.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
    } else {
      period = formatLocalDate(date);
    }

    if (!periodMap[period]) {
      periodMap[period] = [];
    }

    const plannedCost = Number(batch.plannedCost || 0);
    const actualCost = Number(batch.actualCost || 0);
    const costDifference = actualCost - plannedCost;
    const costDifferencePercent =
      plannedCost > 0 ? (costDifference / plannedCost) * 100 : 0;

    let status: "under_budget" | "on_budget" | "over_budget" = "on_budget";
    if (costDifferencePercent < -5) {
      status = "under_budget";
    } else if (costDifferencePercent > 5) {
      status = "over_budget";
    }

    periodMap[period].push({
      batchId: 0,
      batchCode: "",
      productId: 0,
      plannedDate: date,
      plannedCost,
      actualCost,
      costDifference,
      costDifferencePercent,
      status
    });
  });

  // 기간별 집계
  const summaries: CostAnalysisPeriodSummary[] = [];

  Object.keys(periodMap)
    .sort()
    .forEach((period) => {
      const periodBatches = periodMap[period];
      const totalBatches = periodBatches.length;
      const totalPlannedCost = periodBatches.reduce(
        (sum, b) => sum + b.plannedCost,
        0
      );
      const totalActualCost = periodBatches.reduce(
        (sum, b) => sum + b.actualCost,
        0
      );
      const totalCostDifference = totalActualCost - totalPlannedCost;
      const avgCostDifferencePercent =
        totalPlannedCost > 0
          ? (totalCostDifference / totalPlannedCost) * 100
          : 0;

      const underBudgetCount = periodBatches.filter(
        (b) => b.status === "under_budget"
      ).length;
      const onBudgetCount = periodBatches.filter(
        (b) => b.status === "on_budget"
      ).length;
      const overBudgetCount = periodBatches.filter(
        (b) => b.status === "over_budget"
      ).length;

      summaries.push({
        period,
        totalBatches,
        totalPlannedCost: Math.round(totalPlannedCost * 100) / 100,
        totalActualCost: Math.round(totalActualCost * 100) / 100,
        totalCostDifference: Math.round(totalCostDifference * 100) / 100,
        avgCostDifferencePercent:
          Math.round(avgCostDifferencePercent * 100) / 100,
        underBudgetCount,
        onBudgetCount,
        overBudgetCount
      });
    });

  return summaries;
}

/**
 * 원재료별 비용 분석 (모든 배치 통합)
 */
export async function getMaterialCostAnalysis(params: {
  startDate?: Date;
  endDate?: Date;
}, tenantId: number): Promise<{
  materialId: number;
  materialName: string;
  totalBatches: number;
  totalPlannedQuantity: number;
  totalActualQuantity: number;
  avgUnitPrice: number;
  totalPlannedCost: number;
  totalActualCost: number;
  totalCostDifference: number;
}[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { startDate, endDate } = params;

  // 배치 조건
  const batchConditions = [];
  batchConditions.push(eq(hBatches.tenantId, tenantId));
  if (startDate) {
    batchConditions.push(gte(hBatches.plannedDate, startDate));
  }
  if (endDate) {
    batchConditions.push(lte(hBatches.plannedDate, endDate));
  }

  // 배치 입력 데이터 조회
  const batchInputs = await db
    .select({
      batchId: hBatchInputs.batchId,
      materialId: hBatchInputs.materialId,
      materialName: hMaterials.materialName,
      plannedQuantity: hBatchInputs.plannedQuantity,
      actualQuantity: hBatchInputs.actualQuantity,
      unitPrice: hMaterials.unitPrice,
      plannedDate: hBatches.plannedDate
    })
    .from(hBatchInputs)
    .leftJoin(hMaterials, eq(hBatchInputs.materialId, hMaterials.id))
    .leftJoin(hBatches, eq(hBatchInputs.batchId, hBatches.id))
    .where(
      batchConditions.length > 0 ? and(...batchConditions) : undefined
    );

  // 원재료별 집계
  const materialMap: {
    [materialId: number]: {
      materialName: string;
      batches: Set<number>;
      totalPlannedQuantity: number;
      totalActualQuantity: number;
      unitPrices: number[];
      totalPlannedCost: number;
      totalActualCost: number;
    };
  } = {};

  batchInputs.forEach((input) => {
    const materialId = input.materialId;
    const plannedQuantity = Number(input.plannedQuantity || 0);
    const actualQuantity = Number(input.actualQuantity || 0);
    // 정제수는 가격 계산에서 제외
    const unitPrice = isWaterMaterial(input.materialName) ? 0 : Number(input.unitPrice || 0);

    if (!materialMap[materialId]) {
      materialMap[materialId] = {
        materialName: input.materialName || "Unknown",
        batches: new Set(),
        totalPlannedQuantity: 0,
        totalActualQuantity: 0,
        unitPrices: [],
        totalPlannedCost: 0,
        totalActualCost: 0
      };
    }

    materialMap[materialId].batches.add(input.batchId);
    materialMap[materialId].totalPlannedQuantity += plannedQuantity;
    materialMap[materialId].totalActualQuantity += actualQuantity;
    materialMap[materialId].unitPrices.push(unitPrice);
    materialMap[materialId].totalPlannedCost += plannedQuantity * unitPrice;
    materialMap[materialId].totalActualCost += actualQuantity * unitPrice;
  });

  // 결과 변환
  return Object.keys(materialMap).map((materialId) => {
    const material = materialMap[Number(materialId)];
    const avgUnitPrice =
      material.unitPrices.reduce((sum, p) => sum + p, 0) /
      material.unitPrices.length;

    return {
      materialId: Number(materialId),
      materialName: material.materialName,
      totalBatches: material.batches.size,
      totalPlannedQuantity: Math.round(material.totalPlannedQuantity * 100) / 100,
      totalActualQuantity: Math.round(material.totalActualQuantity * 100) / 100,
      avgUnitPrice: Math.round(avgUnitPrice * 100) / 100,
      totalPlannedCost: Math.round(material.totalPlannedCost * 100) / 100,
      totalActualCost: Math.round(material.totalActualCost * 100) / 100,
      totalCostDifference:
        Math.round((material.totalActualCost - material.totalPlannedCost) * 100) / 100
    };
  });
}

/**
 * 주차 계산 헬퍼 함수
 */
function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * ★ 2026-05-09 (PR #295): 제품당 원가 변화 시계열
 *
 * 특정 제품의 모든 배치를 시간순으로 정렬하고
 * 각 배치의 kg당 재료원가를 반환 — 단가 변동 추적 + 차트 표시용.
 *
 * 듀얼 lookup 적용 (h_materials + item_master 폴백).
 * actualCost NULL 시 batch_inputs SUM 자동 계산.
 */
export interface ProductCostTrendPoint {
  batchId: number;
  batchCode: string;
  plannedDate: string; // YYYY-MM-DD
  actualQuantityKg: number;
  totalMaterialCost: number;
  costPerKg: number;
}

export async function getProductCostTrend(
  params: {
    productId: number;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  },
  tenantId: number,
): Promise<{
  productId: number;
  productName: string | null;
  points: ProductCostTrendPoint[];
  summary: {
    avgCostPerKg: number;
    minCostPerKg: number;
    maxCostPerKg: number;
    totalBatches: number;
    totalProductionKg: number;
    totalMaterialCost: number;
  };
}> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { productId, startDate, endDate, limit = 200 } = params;

  // 제품명 조회 (듀얼 lookup)
  const { getRawConnection } = await import("../connection");
  const conn = await getRawConnection();
  let productName: string | null = null;
  try {
    const [rows]: any = await conn.execute(
      `SELECT COALESCE(p.product_name, im.item_name) AS product_name
       FROM (SELECT ? AS pid, ? AS tid) q
       LEFT JOIN h_products_v2 p ON p.id = q.pid AND p.tenant_id = q.tid
       LEFT JOIN item_master im ON im.id = q.pid AND im.tenant_id = q.tid AND im.item_type IN ('own_product','external_product')
       LIMIT 1`,
      [productId, tenantId],
    );
    productName = (rows as any[])[0]?.product_name ?? null;
  } catch {
    /* ignore — 이름은 폴백 시 null */
  }

  // ★ 2026-05-11 (PR #306): '정제수' 한글 리터럴을 바인딩 파라미터로 분리.
  //   esbuild 가 SQL 안 한글을 \uXXXX 백슬래시 시퀀스로 이스케이프 컴파일 →
  //   MySQL 패킷 corruption → ER_MALFORMED_PACKET 의 진짜 원인.
  //   유니코드 이스케이프(\uXXXX)로 작성해서 esbuild 가 더 변형하지 않게 함.
  const purifiedWaterLikePattern = "%" + "\uC815\uC81C\uC218" + "%"; // = '%정제수%'

  // 배치 + 원가 (듀얼 lookup + actualCost 폴백)
  // SQL 안 ? 순서대로 params 배열 구성:
  //   [0] NOT LIKE ? (서브쿼리 안, 정제수 패턴)
  //   [1] b.tenant_id = ?
  //   [2] b.product_id = ?
  //   [3..] dateFilter (planned_date >= ? / <= ?)
  //   [last] LIMIT ?
  const dateFilter: string[] = [];
  const params_arr: any[] = [purifiedWaterLikePattern, Number(tenantId), Number(productId)];
  if (startDate) {
    dateFilter.push("AND b.planned_date >= ?");
    params_arr.push(formatLocalDate(startDate));
  }
  if (endDate) {
    dateFilter.push("AND b.planned_date <= ?");
    params_arr.push(formatLocalDate(endDate));
  }
  params_arr.push(Number(limit));

  // ★ 2026-05-10 (PR #297): NULLIF(col, 0) 폴백 + 정제수 필터 NULL 안전화
  // ★ 2026-05-10 (PR #298 Option B): 이름 기반 cross-namespace 폴백 추가
  //   bi.material_id 가 item_master.id namespace 인 케이스를 위해 이름 매칭 폴백:
  //     m_byname: im.item_name → h_materials.material_name JOIN
  //     im_byname: m.material_name → item_master.item_name JOIN
  //   기존엔 unit_price=0 이 NULL 이 아니라 폴백 못 타고 0 반환 → '-' 표시
  //   또한 LEFT JOIN 미매칭 시 material_name=NULL → NULL NOT LIKE → 필터 탈락
  // ★ 2026-05-10 (PR #304 Trend chart fix): status 필터 정정.
  //   - 기존: status IN ('completed','approved','shipped','archived')
  //     → 'approved' 는 enum 에 존재하지 않는 죽은 값
  //     → PR #277 의 'under_review' (작성자 사전 검토) 누락 → 신규 배치가 차트에서 제외됨
  //     → 결과: 하단 배치별 상세 원가 (status 무필터) 는 보이는데 trend 만 비어 보이는 사용자 사고
  //   - 수정: 실제 enum 기준 + 'in_progress' 까지 포함 (재료 투입 시점부터 원가 추적 의미 있음).
  //   - 실제 enum: planned/in_progress/paused/completed/under_review/failed/cancelled/shipped/archived
  //   - 'planned' / 'cancelled' / 'failed' / 'paused' 는 제외 (실제 생산 데이터 없음)
  // ★ 2026-05-10 (PR #304 logging): 진입/결과/에러 명시 로깅
  console.log(
    `[getProductCostTrend] tenantId=${tenantId} productId=${productId} ` +
    `start=${startDate ? formatLocalDate(startDate) : "-"} end=${endDate ? formatLocalDate(endDate) : "-"} limit=${limit}`,
  );
  let rows: any[] = [];
  try {
    // ★ 2026-05-11 (PR #305): conn.execute() → conn.query() 전환.
    //   PM2 프로세스 안에서만 prepared statement 가 ER_MALFORMED_PACKET 으로
    //   깨지는 현상 → 클라이언트 측 보간 사용하는 query() 로 우회.
    const [r]: any = await conn.query(
      `SELECT
       b.id AS batch_id,
       b.batch_code,
       DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS planned_date,
       COALESCE(b.actual_quantity, b.planned_quantity, 0) AS actual_qty_kg,
       COALESCE(NULLIF(b.actual_cost, 0), (
         SELECT SUM(
           COALESCE(
             NULLIF(bi.total_price, 0),
             COALESCE(bi.actual_quantity, bi.planned_quantity, 0)
             * COALESCE(
                 NULLIF(bi.unit_price, 0),
                 NULLIF(m.unit_price, 0),
                 NULLIF(im.default_unit_price, 0),
                 NULLIF(m_byname.unit_price, 0),
                 NULLIF(im_byname.default_unit_price, 0),
                 0
               )
           )
         )
         FROM h_batch_inputs bi
         LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
         LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id AND im.item_type = 'raw_material'
         /* 이름 기반 cross-namespace 폴백 */
         LEFT JOIN h_materials m_byname
           ON m.id IS NULL
          AND m_byname.tenant_id = bi.tenant_id
          AND TRIM(m_byname.material_name) = TRIM(im.item_name)
         LEFT JOIN item_master im_byname
           ON im.id IS NULL
          AND im_byname.tenant_id = bi.tenant_id
          AND im_byname.item_type = 'raw_material'
          AND TRIM(im_byname.item_name) = TRIM(m.material_name)
         WHERE bi.batch_id = b.id AND bi.tenant_id = b.tenant_id
           AND (
             COALESCE(m.material_name, im.item_name, m_byname.material_name, im_byname.item_name) IS NULL
             OR COALESCE(m.material_name, im.item_name, m_byname.material_name, im_byname.item_name) NOT LIKE ?
           )
       ), 0) AS total_material_cost
     FROM h_batches b
     WHERE b.tenant_id = ?
       AND b.product_id = ?
       AND b.status IN ('in_progress','completed','under_review','shipped','archived')
       ${dateFilter.join(" ")}
     ORDER BY b.planned_date ASC, b.id ASC
     LIMIT ?`,
      params_arr,
    );
    rows = (r as any[]) || [];
  } catch (err: any) {
    console.error(
      `[getProductCostTrend] SQL error tenantId=${tenantId} productId=${productId} ` +
      `msg="${err?.message}" code=${err?.code}`,
    );
    throw err;
  }

  const points: ProductCostTrendPoint[] = rows.map((r) => {
    const qtyKg = Number(r.actual_qty_kg) || 0;
    const totalCost = Number(r.total_material_cost) || 0;
    return {
      batchId: Number(r.batch_id),
      batchCode: String(r.batch_code || ""),
      plannedDate: String(r.planned_date),
      actualQuantityKg: Math.round(qtyKg * 1000) / 1000,
      totalMaterialCost: Math.round(totalCost),
      costPerKg: qtyKg > 0 ? Math.round(totalCost / qtyKg) : 0,
    };
  });

  console.log(
    `[getProductCostTrend] result tenantId=${tenantId} productId=${productId} ` +
    `rows=${points.length} productName="${productName ?? "?"}"`,
  );

  // 집계
  const validPoints = points.filter((p) => p.costPerKg > 0);
  const totalProduction = points.reduce((s, p) => s + p.actualQuantityKg, 0);
  const totalCost = points.reduce((s, p) => s + p.totalMaterialCost, 0);
  const avg =
    validPoints.length > 0
      ? validPoints.reduce((s, p) => s + p.costPerKg, 0) / validPoints.length
      : 0;
  const min =
    validPoints.length > 0 ? Math.min(...validPoints.map((p) => p.costPerKg)) : 0;
  const max =
    validPoints.length > 0 ? Math.max(...validPoints.map((p) => p.costPerKg)) : 0;

  return {
    productId,
    productName,
    points,
    summary: {
      avgCostPerKg: Math.round(avg),
      minCostPerKg: min,
      maxCostPerKg: max,
      totalBatches: points.length,
      totalProductionKg: Math.round(totalProduction * 1000) / 1000,
      totalMaterialCost: Math.round(totalCost),
    },
  };
}
