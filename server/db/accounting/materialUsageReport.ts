/**
 * 원료수불 기간 보고서 (주간 / 월간)
 * -----------------------------------------------------------------------------
 * 2가지 종류의 보고서를 지원:
 *
 *  1) 주간 보고서 (생산/소모 중심)
 *     ──────────────────────────────────────────────────────────
 *     - 주차 헤더 (W10 | 2026.04.06(월) ~ 2026.04.12(일))
 *     - 주간 요약: 생산량(kg/종) + 판매출고(kg/종) + 재료입고(kg/종)
 *     - 생산 실적: 날짜별 제품 / 생산량
 *     - 원재료 사용: 날짜별 원재료 / 사용량 + 일별 소계
 *     - 주간 합계 (품목별): 원재료별 주간 총 사용량
 *
 *  2) 월간 원료수불 보고서 (전월재고/입고/사용/현재고/단가/금액)
 *     ──────────────────────────────────────────────────────────
 *     - 기존 material_ledger_monthly 기반
 *     - 별도 함수 generateMonthlyExcel() / getMonthlyLedger() 사용
 *
 * 본 파일은 1번(주간) 데이터를 반환한다.
 *
 * ✅ 테넌트 격리: 모든 JOIN/SELECT 에 tenant_id 필터 적용
 */
import { getRawConnection } from "../connection";
import { getRows } from "../../utils/dbHelpers";

// ============================================================================
// 타입 정의
// ============================================================================

export interface ProductionEntry {
  date: string; // YYYY-MM-DD
  productId: number;
  productCode: string; // 품목제조번호
  productName: string;
  batchCode: string;
  quantity: number; // 생산량
  unit: string;
  status: string;
}

export interface DailyMaterialUsage {
  date: string; // YYYY-MM-DD
  items: Array<{
    materialId: number;
    materialCode: string;
    materialName: string;
    quantity: number;
    unit: string;
  }>;
  subtotal: number;
}

export interface MaterialWeeklyTotal {
  materialId: number;
  materialCode: string;
  materialName: string;
  totalQuantity: number;
  unit: string;
}

export interface WeeklySummary {
  productionKg: number;
  productionKinds: number;
  salesKg: number;
  salesKinds: number;
  receivingKg: number;
  receivingKinds: number;
}

export interface CompanyInfo {
  companyName: string;
  businessNumber: string;
  address: string;
  phone: string;
}

export interface ProductMaterialUsage {
  productId: number;
  productCode: string;
  productName: string;
  totalProduction: number;
  unit: string;
  materials: Array<{
    materialId: number;
    materialName: string;
    totalQuantity: number;
    unit: string;
  }>;
}

export interface PrevPeriodComparison {
  prevProductionKg: number;
  prevSalesKg: number;
  prevReceivingKg: number;
  productionDelta: number; // % 차이
  salesDelta: number;
  receivingDelta: number;
}

export interface MaterialUsageReport {
  period: {
    start: string;
    end: string;
    type: "week" | "month" | "custom";
    weekNumber?: number; // ISO 주차
    label: string; // "W10 | 2026.04.06(월) ~ 2026.04.12(일)"
  };
  company: CompanyInfo; // 회사 정보 (보고서 헤더용)
  summary: WeeklySummary;
  productions: ProductionEntry[]; // 날짜별 생산 (정렬: 날짜→배치순)
  dailyMaterialUsage: DailyMaterialUsage[]; // 날짜별 원재료 사용
  materialWeeklyTotal: MaterialWeeklyTotal[]; // 주간 합계 (품목별)
  productMaterialUsage: ProductMaterialUsage[]; // 제품별 원재료 사용 (cross-tab)
  comparison: PrevPeriodComparison; // 전기간 대비
  totals: {
    batchCount: number;
    productCount: number;
    materialCount: number;
    totalUsage: number;
  };
  generatedAt: string;
}

// ============================================================================
// 유틸
// ============================================================================

/** ISO 주차 번호 계산 (1-53) */
function getISOWeek(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7; // 월=0
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

const KOR_DAY = ["일", "월", "화", "수", "목", "금", "토"];
function fmtDateKR(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}(${KOR_DAY[d.getDay()]})`;
}

function makeLabel(start: string, end: string, type: "week" | "month" | "custom"): string {
  if (type === "week") {
    const w = getISOWeek(start);
    return `W${w} | ${fmtDateKR(start)} ~ ${fmtDateKR(end)}`;
  }
  if (type === "month") {
    const [y, m] = start.split("-");
    return `${y}년 ${Number(m)}월 원료수불 보고서`;
  }
  return `${fmtDateKR(start)} ~ ${fmtDateKR(end)}`;
}

// ============================================================================
// 메인 함수
// ============================================================================

/**
 * 기간별 원료수불 보고서 데이터 생성 (주간 형식)
 *
 * @param start YYYY-MM-DD (포함, 보통 월요일)
 * @param end YYYY-MM-DD (포함, 보통 일요일)
 * @param tenantId 테넌트 ID
 * @param type week | month | custom (메타데이터)
 */
export async function getMaterialUsageReport(
  start: string,
  end: string,
  tenantId: number,
  type: "week" | "month" | "custom" = "week",
): Promise<MaterialUsageReport> {
  const db = await getRawConnection();
  const label = makeLabel(start, end, type);
  const weekNumber = type === "week" ? getISOWeek(start) : undefined;

  // ───── 1. 생산 실적 (h_batches × h_products) ─────
  interface BatchProductRow {
    batch_id: number;
    batch_code: string;
    product_id: number;
    product_code: string;
    product_name: string;
    planned_date: string;
    actual_quantity: number | null;
    planned_quantity: number;
    status: string;
    unit: string | null;
  }
  const batchResult = await db.execute(
    `SELECT
       b.id AS batch_id,
       b.batch_code,
       b.product_id,
       COALESCE(p.product_code, '') AS product_code,
       COALESCE(p.product_name, '') AS product_name,
       DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS planned_date,
       b.actual_quantity,
       COALESCE(b.planned_quantity, 0) AS planned_quantity,
       b.status,
       COALESCE(p.unit, 'kg') AS unit
     FROM h_batches b
     LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
     WHERE b.tenant_id = ?
       AND b.planned_date BETWEEN ? AND ?
       AND b.status IN ('completed','approved','shipped','archived')
     ORDER BY b.planned_date ASC, b.batch_order ASC, b.id ASC`,
    [tenantId, start, end],
  );
  const batchRows = getRows<BatchProductRow>(batchResult);

  const productions: ProductionEntry[] = batchRows.map((r) => {
    const qty = r.actual_quantity != null ? Number(r.actual_quantity) : Number(r.planned_quantity);
    return {
      date: String(r.planned_date),
      productId: Number(r.product_id) || 0,
      productCode: String(r.product_code || ""),
      productName: String(r.product_name || ""),
      batchCode: String(r.batch_code || ""),
      quantity: Math.round((qty || 0) * 1000) / 1000,
      unit: String(r.unit || "kg"),
      status: String(r.status || ""),
    };
  });

  const productionKg = productions.reduce((acc, p) => acc + p.quantity, 0);
  const productionKindsSet = new Set(productions.map((p) => p.productId));

  // ───── 2. 원재료 사용량 ─────
  // 우선순위:
  //   1차: h_batch_inputs (배치별 BOM 기준 실적)
  //   2차: h_production_material_usage (배치별 폴백)
  //   3차: material_ledger_daily (일자별 집계 — autoMaterialIssue 가 호출되지 않은
  //        과거 배치도 입출고 마감 시점 데이터로 채워짐)
  let dailyMaterialUsage: DailyMaterialUsage[] = [];
  const materialMap = new Map<number, MaterialWeeklyTotal>();

  interface InputRow {
    batch_id: number;
    planned_date: string;
    material_id: number;
    material_code: string;
    material_name: string;
    quantity: number;
    unit: string;
  }
  let inputRows: InputRow[] = [];

  if (batchRows.length > 0) {
    const batchIds = batchRows.map((r) => Number(r.batch_id));
    const ph = batchIds.map(() => "?").join(",");

    const inputsResult = await db.execute(
      `SELECT
         bi.batch_id,
         DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS planned_date,
         bi.material_id,
         COALESCE(m.material_code, '') AS material_code,
         COALESCE(m.material_name, '') AS material_name,
         ROUND(COALESCE(bi.actual_quantity, bi.planned_quantity, 0), 3) AS quantity,
         COALESCE(bi.unit, m.unit, 'kg') AS unit
       FROM h_batch_inputs bi
       JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = bi.tenant_id
       JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
       WHERE bi.tenant_id = ?
         AND bi.batch_id IN (${ph})
         AND m.material_name NOT LIKE '%정제수%'
       ORDER BY b.planned_date ASC, m.material_name ASC`,
      [tenantId, ...batchIds],
    );
    inputRows = getRows<InputRow>(inputsResult);

    // 2차 폴백: h_production_material_usage
    if (inputRows.length === 0) {
      const pmuResult = await db.execute(
        `SELECT
           pmu.batch_id,
           DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS planned_date,
           pmu.material_id,
           COALESCE(m.material_code, '') AS material_code,
           COALESCE(m.material_name, '') AS material_name,
           ROUND(COALESCE(pmu.actual_quantity, pmu.planned_quantity, 0), 3) AS quantity,
           COALESCE(pmu.unit, m.unit, 'kg') AS unit
         FROM h_production_material_usage pmu
         JOIN h_batches b ON b.id = pmu.batch_id AND b.tenant_id = pmu.tenant_id
         JOIN h_materials m ON m.id = pmu.material_id AND m.tenant_id = pmu.tenant_id
         WHERE pmu.tenant_id = ?
           AND pmu.batch_id IN (${ph})
           AND m.material_name NOT LIKE '%정제수%'
         ORDER BY b.planned_date ASC, m.material_name ASC`,
        [tenantId, ...batchIds],
      );
      inputRows = getRows<InputRow>(pmuResult);
    }
  }

  // ★ 3차 폴백: material_ledger_daily (배치 무관, 일자별 사용량 직접 집계)
  // - h_batch_inputs / h_production_material_usage 모두 비어있을 때 사용
  // - 또는 batch가 없는 기간에도 일자별 소모량을 보여주기 위함
  if (inputRows.length === 0) {
    interface LedgerRow {
      planned_date: string;
      material_id: number;
      material_code: string;
      material_name: string;
      quantity: number;
      unit: string;
    }
    const ledgerResult = await db.execute(
      `SELECT
         d.ledger_date AS planned_date,
         d.material_id,
         COALESCE(m.material_code, '') AS material_code,
         COALESCE(m.material_name, '') AS material_name,
         ROUND(SUM(COALESCE(d.usage_qty, 0)), 3) AS quantity,
         COALESCE(m.unit, 'kg') AS unit
       FROM material_ledger_daily d
       JOIN h_materials m ON m.id = d.material_id AND m.tenant_id = d.tenant_id
       WHERE d.tenant_id = ?
         AND d.ledger_date BETWEEN ? AND ?
         AND COALESCE(d.usage_qty, 0) > 0
         AND m.material_name NOT LIKE '%정제수%'
       GROUP BY d.ledger_date, d.material_id, m.material_code, m.material_name, m.unit
       ORDER BY d.ledger_date ASC, m.material_name ASC`,
      [tenantId, start, end],
    );
    const ledgerRows = getRows<LedgerRow>(ledgerResult);
    inputRows = ledgerRows.map((r) => ({
      batch_id: 0, // 배치 매핑 불가
      planned_date: String(r.planned_date),
      material_id: Number(r.material_id),
      material_code: String(r.material_code || ""),
      material_name: String(r.material_name || ""),
      quantity: Number(r.quantity) || 0,
      unit: String(r.unit || "kg"),
    }));
  }

  if (inputRows.length > 0) {

    // 날짜별 → 원재료 합산
    const dateMap = new Map<string, Map<number, DailyMaterialUsage["items"][number]>>();
    for (const row of inputRows) {
      const date = String(row.planned_date);
      const mid = Number(row.material_id);
      const qty = Number(row.quantity) || 0;

      if (!dateMap.has(date)) dateMap.set(date, new Map());
      const dayMap = dateMap.get(date)!;
      const existing = dayMap.get(mid);
      if (existing) {
        existing.quantity += qty;
      } else {
        dayMap.set(mid, {
          materialId: mid,
          materialCode: String(row.material_code || ""),
          materialName: String(row.material_name || ""),
          quantity: qty,
          unit: String(row.unit || "kg"),
        });
      }

      // 주간 합계
      const wt = materialMap.get(mid);
      if (wt) {
        wt.totalQuantity += qty;
      } else {
        materialMap.set(mid, {
          materialId: mid,
          materialCode: String(row.material_code || ""),
          materialName: String(row.material_name || ""),
          totalQuantity: qty,
          unit: String(row.unit || "kg"),
        });
      }
    }

    dailyMaterialUsage = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayMap]) => {
        const items = Array.from(dayMap.values())
          .map((it) => ({
            ...it,
            quantity: Math.round(it.quantity * 1000) / 1000,
          }))
          .sort((a, b) => b.quantity - a.quantity);
        const subtotal = items.reduce((acc, it) => acc + it.quantity, 0);
        return {
          date,
          items,
          subtotal: Math.round(subtotal * 1000) / 1000,
        };
      });
  }

  const materialWeeklyTotal = Array.from(materialMap.values())
    .map((m) => ({ ...m, totalQuantity: Math.round(m.totalQuantity * 1000) / 1000 }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  // ───── 3. 판매출고 (h_inventory_transactions: outbound 만) ─────
  // ★ usage 는 배치 소모이므로 제외 → 'outbound' 또는 'shipment' 만 카운트
  interface OutRow { qty: number; kinds: number }
  const outResult = await db.execute(
    `SELECT
       COALESCE(SUM(t.quantity), 0) AS qty,
       COUNT(DISTINCT l.material_id) AS kinds
     FROM h_inventory_transactions t
     LEFT JOIN h_inventory_lots l ON l.id = t.lot_id AND l.tenant_id = t.tenant_id
     WHERE t.tenant_id = ?
       AND t.transaction_type = 'outbound'
       AND t.transaction_date BETWEEN ? AND ?`,
    [tenantId, start, end],
  );
  const outRows = getRows<OutRow>(outResult);
  const salesKg = Number(outRows?.[0]?.qty || 0);
  const salesKinds = Number(outRows?.[0]?.kinds || 0);

  // ───── 4. 재료입고 (h_inbound_lines: confirmed) ─────
  interface InRow { qty: number; kinds: number }
  const inResult = await db.execute(
    `SELECT
       COALESCE(SUM(l.stock_quantity), 0) AS qty,
       COUNT(DISTINCT l.material_id) AS kinds
     FROM h_inbound_lines l
     JOIN h_inbound_headers h ON h.id = l.header_id AND h.tenant_id = l.tenant_id
     WHERE l.tenant_id = ?
       AND h.status = 'confirmed'
       AND h.inbound_date BETWEEN ? AND ?`,
    [tenantId, start, end],
  );
  const inRows = getRows<InRow>(inResult);
  const receivingKg = Number(inRows?.[0]?.qty || 0);
  const receivingKinds = Number(inRows?.[0]?.kinds || 0);

  // ───── 5. 회사 정보 (companies 테이블) ─────
  const companyInfo: CompanyInfo = { companyName: "", businessNumber: "", address: "", phone: "" };
  try {
    const compResult: any = await db.execute(
      `SELECT company_name, business_number, address, phone
       FROM companies WHERE tenant_id = ? LIMIT 1`,
      [tenantId],
    );
    const compRows: any[] = (compResult?.[0] as any[]) || [];
    if (compRows[0]) {
      companyInfo.companyName = String(compRows[0].company_name || "");
      companyInfo.businessNumber = String(compRows[0].business_number || "");
      companyInfo.address = String(compRows[0].address || "");
      companyInfo.phone = String(compRows[0].phone || "");
    }
  } catch (e) {
    // companies 없으면 tenants.name 폴백
    try {
      const tnResult: any = await db.execute(
        `SELECT name FROM tenants WHERE id = ? LIMIT 1`,
        [tenantId],
      );
      const tnRows: any[] = (tnResult?.[0] as any[]) || [];
      if (tnRows[0]) companyInfo.companyName = String(tnRows[0].name || "");
    } catch {}
  }

  // ───── 6. 제품별 원재료 사용 (cross-tab) ─────
  // ★ GROUP BY 제거: MySQL 8 sql_mode=only_full_group_by 호환을 위해
  //    raw row 를 가져와 JS 에서 집계
  const productUsageMap = new Map<number, ProductMaterialUsage>();
  if (batchRows.length > 0) {
    const batchIds = batchRows.map((r) => Number(r.batch_id));
    const ph2 = batchIds.map(() => "?").join(",");
    interface PMURow {
      product_id: number;
      product_code: string;
      product_name: string;
      product_unit: string;
      batch_qty: number;
      material_id: number | null;
      material_name: string;
      material_unit: string;
      mat_qty: number;
    }
    const pmuResult: any = await db.execute(
      `SELECT
         b.product_id,
         COALESCE(p.product_code, '') AS product_code,
         COALESCE(p.product_name, '') AS product_name,
         COALESCE(p.unit, 'kg') AS product_unit,
         COALESCE(b.actual_quantity, b.planned_quantity, 0) AS batch_qty,
         bi.material_id,
         COALESCE(m.material_name, '') AS material_name,
         COALESCE(bi.unit, m.unit, 'kg') AS material_unit,
         COALESCE(bi.actual_quantity, bi.planned_quantity, 0) AS mat_qty
       FROM h_batches b
       LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
       LEFT JOIN h_batch_inputs bi ON bi.batch_id = b.id AND bi.tenant_id = b.tenant_id
       LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
       WHERE b.tenant_id = ?
         AND b.id IN (${ph2})
         AND (m.material_name IS NULL OR m.material_name NOT LIKE '%정제수%')
       ORDER BY p.product_name, m.material_name`,
      [tenantId, ...batchIds],
    );
    const pmuRows: PMURow[] = (pmuResult?.[0] as PMURow[]) || [];

    // 제품별 집계 + 원재료별 집계를 JS 에서 처리
    const productionByProduct = new Map<number, number>(); // productId → total batch_qty
    for (const b of batchRows) {
      const pid = Number(b.product_id);
      const qty = b.actual_quantity != null ? Number(b.actual_quantity) : Number(b.planned_quantity) || 0;
      productionByProduct.set(pid, (productionByProduct.get(pid) || 0) + qty);
    }

    for (const row of pmuRows) {
      const pid = Number(row.product_id);
      if (!productUsageMap.has(pid)) {
        productUsageMap.set(pid, {
          productId: pid,
          productCode: String(row.product_code || ""),
          productName: String(row.product_name || ""),
          totalProduction:
            Math.round((productionByProduct.get(pid) || 0) * 1000) / 1000,
          unit: String(row.product_unit || "kg"),
          materials: [],
        });
      }
      if (row.material_id) {
        const pg = productUsageMap.get(pid)!;
        // 같은 제품의 동일 원재료가 여러 row 에 나올 수 있으므로 재료 ID 기준 누적
        const mid = Number(row.material_id);
        const existing = pg.materials.find((m) => m.materialId === mid);
        const qty = Number(row.mat_qty) || 0;
        if (existing) {
          existing.totalQuantity += qty;
        } else {
          pg.materials.push({
            materialId: mid,
            materialName: String(row.material_name || ""),
            totalQuantity: qty,
            unit: String(row.material_unit || "kg"),
          });
        }
      }
    }

    // 최종적으로 round 처리
    for (const pg of productUsageMap.values()) {
      for (const m of pg.materials) {
        m.totalQuantity = Math.round(m.totalQuantity * 1000) / 1000;
      }
    }
  }
  const productMaterialUsage = Array.from(productUsageMap.values()).sort((a, b) =>
    a.productName.localeCompare(b.productName),
  );

  // ───── 7. 전기간(이전 동일 길이) 비교 ─────
  const startD = new Date(start + "T00:00:00");
  const endD = new Date(end + "T00:00:00");
  const periodDays = Math.round((endD.getTime() - startD.getTime()) / (24 * 3600 * 1000)) + 1;
  const prevEndD = new Date(startD);
  prevEndD.setDate(prevEndD.getDate() - 1);
  const prevStartD = new Date(prevEndD);
  prevStartD.setDate(prevStartD.getDate() - (periodDays - 1));
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const prevStart = fmt(prevStartD);
  const prevEnd = fmt(prevEndD);

  let prevProductionKg = 0;
  let prevSalesKg = 0;
  let prevReceivingKg = 0;
  try {
    const prevProdResult: any = await db.execute(
      `SELECT COALESCE(SUM(COALESCE(actual_quantity, planned_quantity, 0)), 0) AS qty
       FROM h_batches
       WHERE tenant_id = ? AND planned_date BETWEEN ? AND ?
         AND status IN ('completed','approved','shipped','archived')`,
      [tenantId, prevStart, prevEnd],
    );
    prevProductionKg = Number((prevProdResult?.[0] as any[])?.[0]?.qty || 0);

    const prevOutResult: any = await db.execute(
      `SELECT COALESCE(SUM(quantity), 0) AS qty
       FROM h_inventory_transactions
       WHERE tenant_id = ?
         AND transaction_type IN ('outbound','usage')
         AND transaction_date BETWEEN ? AND ?`,
      [tenantId, prevStart, prevEnd],
    );
    prevSalesKg = Number((prevOutResult?.[0] as any[])?.[0]?.qty || 0);

    const prevInResult: any = await db.execute(
      `SELECT COALESCE(SUM(l.stock_quantity), 0) AS qty
       FROM h_inbound_lines l
       JOIN h_inbound_headers h ON h.id = l.header_id AND h.tenant_id = l.tenant_id
       WHERE l.tenant_id = ? AND h.status = 'confirmed'
         AND h.inbound_date BETWEEN ? AND ?`,
      [tenantId, prevStart, prevEnd],
    );
    prevReceivingKg = Number((prevInResult?.[0] as any[])?.[0]?.qty || 0);
  } catch {}

  const calcDelta = (cur: number, prev: number): number => {
    if (prev <= 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  };

  const comparison: PrevPeriodComparison = {
    prevProductionKg: Math.round(prevProductionKg * 10) / 10,
    prevSalesKg: Math.round(prevSalesKg * 10) / 10,
    prevReceivingKg: Math.round(prevReceivingKg * 10) / 10,
    productionDelta: calcDelta(productionKg, prevProductionKg),
    salesDelta: calcDelta(salesKg, prevSalesKg),
    receivingDelta: calcDelta(receivingKg, prevReceivingKg),
  };

  return {
    period: { start, end, type, weekNumber, label },
    company: companyInfo,
    summary: {
      productionKg: Math.round(productionKg * 10) / 10,
      productionKinds: productionKindsSet.size,
      salesKg: Math.round(salesKg * 10) / 10,
      salesKinds,
      receivingKg: Math.round(receivingKg * 10) / 10,
      receivingKinds,
    },
    productions,
    dailyMaterialUsage,
    materialWeeklyTotal,
    productMaterialUsage,
    comparison,
    totals: {
      batchCount: productions.length,
      productCount: productionKindsSet.size,
      materialCount: materialWeeklyTotal.length,
      totalUsage: materialWeeklyTotal.reduce((a, m) => a + m.totalQuantity, 0),
    },
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 보고서 저장/관리 (material_usage_reports 테이블)
// ============================================================================

export interface SavedReportRow {
  id: number;
  reportType: "week" | "month" | "custom";
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  weekNumber: number | null;
  title: string;
  status: "draft" | "pending_review" | "pending_approval" | "approved" | "rejected";
  summaryProductionKg: number;
  summaryProductionKinds: number;
  summarySalesKg: number;
  summaryReceivingKg: number;
  materialCount: number;
  batchCount: number;
  approvalRequestId: number | null;
  createdBy: number;
  createdAt: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  rejectedBy: number | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  printedAt: string | null;
  printedBy: number | null;
}

/**
 * 보고서 생성 (스냅샷 저장)
 *
 * 흐름:
 *   1) getMaterialUsageReport 으로 본문 데이터 생성
 *   2) material_usage_reports 에 INSERT (status='pending_review' 기본)
 *   3) (선택) h_approval_requests 에 검토/승인 요청 자동 등록
 */
export async function createMaterialUsageReport(params: {
  tenantId: number;
  userId: number;
  type: "week" | "month" | "custom";
  start: string;
  end: string;
  title?: string;
  notes?: string;
  autoSubmit?: boolean; // true 면 즉시 검토 요청 (h_approval_requests)
  siteId?: number;
}): Promise<{ id: number; reportType: string; status: string }> {
  const db = await getRawConnection();
  const { tenantId, userId, type, start, end, title, notes, autoSubmit, siteId } = params;

  // 1) 데이터 생성
  const data = await getMaterialUsageReport(start, end, tenantId, type);

  const computedTitle =
    title ||
    (type === "week"
      ? `주간 원료수불 보고서 (${data.period.label})`
      : type === "month"
        ? `${data.period.label}`
        : `원료수불 보고서 (${data.period.label})`);

  // 2) UPSERT (같은 기간/타입 → 덮어쓰기)
  const insertResult: any = await db.execute(
    `INSERT INTO material_usage_reports
       (tenant_id, report_type, period_start, period_end, period_label, week_number,
        title, report_data,
        summary_production_kg, summary_production_kinds,
        summary_sales_kg, summary_receiving_kg,
        material_count, batch_count,
        status, created_by, notes)
     VALUES (?, ?, ?, ?, ?, ?,
             ?, CAST(? AS JSON),
             ?, ?,
             ?, ?,
             ?, ?,
             ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       report_data = VALUES(report_data),
       summary_production_kg = VALUES(summary_production_kg),
       summary_production_kinds = VALUES(summary_production_kinds),
       summary_sales_kg = VALUES(summary_sales_kg),
       summary_receiving_kg = VALUES(summary_receiving_kg),
       material_count = VALUES(material_count),
       batch_count = VALUES(batch_count),
       status = CASE WHEN status IN ('approved','pending_approval','pending_review') THEN status ELSE 'draft' END,
       updated_at = NOW()`,
    [
      tenantId,
      type,
      start,
      end,
      data.period.label,
      data.period.weekNumber || null,
      computedTitle,
      JSON.stringify(data),
      data.summary.productionKg,
      data.summary.productionKinds,
      data.summary.salesKg,
      data.summary.receivingKg,
      data.totals.materialCount,
      data.totals.batchCount,
      autoSubmit ? "pending_review" : "draft",
      userId,
      notes || null,
    ],
  );

  // 신규 생성이면 insertId, 업데이트면 기존 id 조회
  let reportId = Number((insertResult as any)?.[0]?.insertId || 0);
  if (!reportId) {
    const lookup: any = await db.execute(
      `SELECT id FROM material_usage_reports
       WHERE tenant_id = ? AND report_type = ? AND period_start = ? AND period_end = ?`,
      [tenantId, type, start, end],
    );
    reportId = Number((lookup?.[0] as any[])?.[0]?.id || 0);
  }

  // 3) 자동 검토 요청 (h_approval_requests 에 등록)
  if (autoSubmit && reportId > 0) {
    try {
      const apReq: any = await db.execute(
        `INSERT INTO h_approval_requests
           (tenant_id, site_id, request_type, reference_type, reference_id,
            title, description, status, priority, requested_by, requested_at)
         VALUES (?, ?, 'material_usage_report', 'material_usage_report', ?, ?, ?, 'pending_review', 'medium', ?, NOW())`,
        [
          tenantId,
          siteId || 1,
          reportId,
          computedTitle,
          `${data.period.label} - 생산 ${data.summary.productionKg}kg, 사용 원재료 ${data.totals.materialCount}종`,
          userId,
        ],
      );
      const apReqId = Number((apReq as any)?.[0]?.insertId || 0);
      if (apReqId > 0) {
        await db.execute(
          `UPDATE material_usage_reports SET approval_request_id = ?, status = 'pending_review' WHERE id = ?`,
          [apReqId, reportId],
        );
      }
    } catch (e) {
      console.error("[material_usage_reports] 검토요청 등록 실패 (보고서는 저장됨):", e);
    }
  }

  return { id: reportId, reportType: type, status: autoSubmit ? "pending_review" : "draft" };
}

/** 보고서 목록 조회 */
export async function listMaterialUsageReports(params: {
  tenantId: number;
  reportType?: "week" | "month" | "custom";
  status?: string;
  startFrom?: string;
  startTo?: string;
  limit?: number;
}): Promise<SavedReportRow[]> {
  const db = await getRawConnection();
  const conds: string[] = ["tenant_id = ?"];
  const args: any[] = [params.tenantId];

  if (params.reportType) {
    conds.push("report_type = ?");
    args.push(params.reportType);
  }
  if (params.status) {
    conds.push("status = ?");
    args.push(params.status);
  }
  if (params.startFrom) {
    conds.push("period_start >= ?");
    args.push(params.startFrom);
  }
  if (params.startTo) {
    conds.push("period_start <= ?");
    args.push(params.startTo);
  }

  const limit = Math.min(Math.max(params.limit || 100, 1), 500);

  const result: any = await db.execute(
    `SELECT
       id, report_type, period_start, period_end, period_label, week_number,
       title, status,
       summary_production_kg, summary_production_kinds,
       summary_sales_kg, summary_receiving_kg,
       material_count, batch_count,
       approval_request_id,
       created_by, created_at,
       reviewed_by, reviewed_at,
       approved_by, approved_at,
       rejected_by, rejected_at, rejection_reason,
       printed_at, printed_by
     FROM material_usage_reports
     WHERE ${conds.join(" AND ")}
     ORDER BY period_start DESC, id DESC
     LIMIT ${limit}`,
    args,
  );
  const rows: any[] = (result?.[0] as any[]) || [];
  return rows.map((r) => ({
    id: Number(r.id),
    reportType: r.report_type,
    periodStart: String(r.period_start).slice(0, 10),
    periodEnd: String(r.period_end).slice(0, 10),
    periodLabel: String(r.period_label || ""),
    weekNumber: r.week_number != null ? Number(r.week_number) : null,
    title: String(r.title || ""),
    status: r.status,
    summaryProductionKg: Number(r.summary_production_kg) || 0,
    summaryProductionKinds: Number(r.summary_production_kinds) || 0,
    summarySalesKg: Number(r.summary_sales_kg) || 0,
    summaryReceivingKg: Number(r.summary_receiving_kg) || 0,
    materialCount: Number(r.material_count) || 0,
    batchCount: Number(r.batch_count) || 0,
    approvalRequestId: r.approval_request_id != null ? Number(r.approval_request_id) : null,
    createdBy: Number(r.created_by) || 0,
    createdAt: r.created_at ? String(r.created_at) : "",
    reviewedBy: r.reviewed_by != null ? Number(r.reviewed_by) : null,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    approvedBy: r.approved_by != null ? Number(r.approved_by) : null,
    approvedAt: r.approved_at ? String(r.approved_at) : null,
    rejectedBy: r.rejected_by != null ? Number(r.rejected_by) : null,
    rejectedAt: r.rejected_at ? String(r.rejected_at) : null,
    rejectionReason: r.rejection_reason ? String(r.rejection_reason) : null,
    printedAt: r.printed_at ? String(r.printed_at) : null,
    printedBy: r.printed_by != null ? Number(r.printed_by) : null,
  }));
}

/** 보고서 단건 조회 (본문 포함) */
export async function getSavedMaterialUsageReport(id: number, tenantId: number) {
  const db = await getRawConnection();
  const result: any = await db.execute(
    `SELECT * FROM material_usage_reports WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  const rows: any[] = (result?.[0] as any[]) || [];
  if (rows.length === 0) return null;
  const r = rows[0];
  let body: MaterialUsageReport | null = null;
  try {
    body = typeof r.report_data === "string" ? JSON.parse(r.report_data) : r.report_data;
  } catch {
    body = null;
  }
  return {
    id: Number(r.id),
    tenantId: Number(r.tenant_id),
    reportType: r.report_type,
    periodStart: String(r.period_start).slice(0, 10),
    periodEnd: String(r.period_end).slice(0, 10),
    periodLabel: String(r.period_label || ""),
    weekNumber: r.week_number != null ? Number(r.week_number) : null,
    title: String(r.title || ""),
    status: r.status,
    summaryProductionKg: Number(r.summary_production_kg) || 0,
    summaryProductionKinds: Number(r.summary_production_kinds) || 0,
    summarySalesKg: Number(r.summary_sales_kg) || 0,
    summaryReceivingKg: Number(r.summary_receiving_kg) || 0,
    materialCount: Number(r.material_count) || 0,
    batchCount: Number(r.batch_count) || 0,
    approvalRequestId: r.approval_request_id != null ? Number(r.approval_request_id) : null,
    createdBy: Number(r.created_by) || 0,
    createdAt: r.created_at ? String(r.created_at) : "",
    reviewedBy: r.reviewed_by != null ? Number(r.reviewed_by) : null,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    approvedBy: r.approved_by != null ? Number(r.approved_by) : null,
    approvedAt: r.approved_at ? String(r.approved_at) : null,
    rejectedBy: r.rejected_by != null ? Number(r.rejected_by) : null,
    rejectedAt: r.rejected_at ? String(r.rejected_at) : null,
    rejectionReason: r.rejection_reason ? String(r.rejection_reason) : null,
    printedAt: r.printed_at ? String(r.printed_at) : null,
    printedBy: r.printed_by != null ? Number(r.printed_by) : null,
    notes: r.notes || null,
    body,
  };
}

/** 검토 요청 (draft → pending_review) */
export async function submitReportForReview(id: number, userId: number, tenantId: number) {
  const db = await getRawConnection();
  await db.execute(
    `UPDATE material_usage_reports
     SET status = 'pending_review', reviewed_by = NULL, reviewed_at = NULL,
         approved_by = NULL, approved_at = NULL,
         rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
     WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  return { id, status: "pending_review" };
}

/** 검토 완료 (pending_review → pending_approval) */
export async function reviewReport(id: number, userId: number, tenantId: number) {
  const db = await getRawConnection();
  await db.execute(
    `UPDATE material_usage_reports
     SET status = 'pending_approval', reviewed_by = ?, reviewed_at = NOW()
     WHERE id = ? AND tenant_id = ? AND status IN ('pending_review','draft')`,
    [userId, id, tenantId],
  );
  return { id, status: "pending_approval" };
}

/** 최종 승인 (pending_approval → approved) */
export async function approveReport(id: number, userId: number, tenantId: number) {
  const db = await getRawConnection();
  await db.execute(
    `UPDATE material_usage_reports
     SET status = 'approved', approved_by = ?, approved_at = NOW()
     WHERE id = ? AND tenant_id = ?`,
    [userId, id, tenantId],
  );
  // 연동된 approval_request 도 업데이트
  await db.execute(
    `UPDATE h_approval_requests ar
       JOIN material_usage_reports mur ON mur.approval_request_id = ar.id
     SET ar.status = 'approved', ar.approved_by = ?, ar.approved_at = NOW()
     WHERE mur.id = ? AND mur.tenant_id = ?`,
    [userId, id, tenantId],
  );
  return { id, status: "approved" };
}

/** 반려 */
export async function rejectReport(id: number, userId: number, reason: string, tenantId: number) {
  const db = await getRawConnection();
  await db.execute(
    `UPDATE material_usage_reports
     SET status = 'rejected', rejected_by = ?, rejected_at = NOW(), rejection_reason = ?
     WHERE id = ? AND tenant_id = ?`,
    [userId, reason, id, tenantId],
  );
  await db.execute(
    `UPDATE h_approval_requests ar
       JOIN material_usage_reports mur ON mur.approval_request_id = ar.id
     SET ar.status = 'rejected', ar.rejected_by = ?, ar.rejected_at = NOW(), ar.rejection_reason = ?
     WHERE mur.id = ? AND mur.tenant_id = ?`,
    [userId, reason, id, tenantId],
  );
  return { id, status: "rejected" };
}

/** 인쇄 이력 기록 */
export async function markReportPrinted(id: number, userId: number, tenantId: number) {
  const db = await getRawConnection();
  await db.execute(
    `UPDATE material_usage_reports
     SET printed_at = NOW(), printed_by = ?
     WHERE id = ? AND tenant_id = ?`,
    [userId, id, tenantId],
  );
  return { id };
}

/** 보고서 삭제 */
export async function deleteReport(id: number, tenantId: number) {
  const db = await getRawConnection();
  await db.execute(
    `DELETE FROM material_usage_reports WHERE id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  // 연동된 approval request 도 삭제
  await db.execute(
    `DELETE FROM h_approval_requests
     WHERE request_type = 'material_usage_report' AND reference_id = ? AND tenant_id = ?`,
    [id, tenantId],
  );
  return { id, deleted: true };
}

// ============================================================================
// 자동 생성 (스케줄러용)
// ============================================================================

/**
 * 지정된 테넌트에 대해 지난 주(월~일)의 보고서를 자동 생성한다.
 * - 이미 같은 기간 보고서가 approved 면 건너뜀
 * - draft 면 덮어씀, pending_* 면 데이터만 갱신
 */
export async function autoGenerateLastWeekReport(tenantId: number, systemUserId = 1) {
  const today = new Date();
  const day = today.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const thisMon = new Date(today);
  thisMon.setDate(today.getDate() + diffToMon);
  const lastMon = new Date(thisMon);
  lastMon.setDate(thisMon.getDate() - 7);
  const lastSun = new Date(lastMon);
  lastSun.setDate(lastMon.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return createMaterialUsageReport({
    tenantId,
    userId: systemUserId,
    type: "week",
    start: fmt(lastMon),
    end: fmt(lastSun),
    autoSubmit: true,
  });
}

