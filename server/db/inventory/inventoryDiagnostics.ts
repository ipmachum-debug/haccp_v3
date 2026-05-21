/**
 * 재고 부족 진단 모듈 — PR-U (2026-05-20)
 *
 * 매출 승인 시 "[SALE-XXXX] 제품 #N 재고 부족: 요청 X, 가용 0.000" 에러가
 * 발생하는 진짜 원인을 자동 진단합니다.
 *
 * scripts/diagnose-product-stock-shortage.sql 과 동일한 로직을 tRPC 로 노출.
 * 사용처: SalesList.tsx 의 "재고 부족" 에러 감지 시 자동 호출 → UI 표시.
 *
 * 진단 카테고리 (우선순위 순):
 *   1. PRODUCT_NOT_FOUND  — productId 가 h_products_v2 에 없음
 *   2. BUNDLE_SHORTAGE    — 혼합 SKU 인데 child SKU 재고가 부족
 *   3. NO_LOTS            — h_inventory_lots 에 행 자체가 없음 (생산 미입고)
 *   4. EXHAUSTED          — LOT 행은 있으나 available_quantity 모두 0 (소진)
 *   5. UNKNOWN            — 위 케이스에 해당하지 않음
 *
 * 응답 페이로드는 클라이언트가 "다음에 무엇을 해야 하는지" 안내문구와
 * 액션 링크 정보를 함께 결정할 수 있도록 풍부하게 구성.
 */

import { getRawConnection } from "../connection";

export type StockDiagnosisCode =
  | "PRODUCT_NOT_FOUND"
  | "BUNDLE_SHORTAGE"
  | "NO_LOTS"
  | "EXHAUSTED"
  | "OK"
  | "UNKNOWN";

export interface BundleChildStockRow {
  childSkuId: number;
  childSkuCode: string;
  childSkuName: string;
  availableKg: number;
  defaultRatio: number | null;
  childPieces: number | null;
  childPieceWeightG: number | null;
}

export interface StockDiagnosisResult {
  productId: number;
  tenantId: number;
  /** 진단 분류 코드 — 클라이언트 UI 분기에 사용 */
  code: StockDiagnosisCode;
  /** 사람이 읽기 좋은 한 줄 요약 (UI 의 큰 글씨 영역) */
  summary: string;
  /** UI 추가 안내 문구 (사용자가 무엇을 해야 하는지) */
  guidance: string;
  /** 권장 액션 (UI 버튼 / 링크 표시용) */
  suggestedActions: Array<{
    label: string;
    href: string;
    /** primary = 강조 색상 버튼, secondary = 보조 링크 */
    kind: "primary" | "secondary";
  }>;
  /** 진단 시점 디버그 정보 — 사장님께 공유하기 좋은 raw 통계 */
  details: {
    product: {
      id: number;
      productName: string | null;
      productCode: string | null;
      unit: string | null;
      isActive: boolean | null;
    } | null;
    /** h_inventory_lots 의 status 별 가용 합 */
    lotsByStatus: Array<{
      status: string;
      lotCount: number;
      sumQuantity: number;
      sumCurrent: number;
      sumAvailable: number;
      fefoUsableSum: number;
    }>;
    /** 번들 부모 SKU 후보 — 있으면 혼합 SKU 경로 */
    bundleParents: Array<{
      parentSkuId: number;
      parentSkuCode: string;
      parentSkuName: string;
      bundleChildCount: number;
    }>;
    /** 부족한 (또는 0 인) 번들 child SKU 들 */
    bundleChildren: BundleChildStockRow[];
    /** FEFO 가용 합계 (h_inventory_lots, status=available, available_qty > 0.001) */
    fefoUsableSum: number;
  };
}

/**
 * 제품의 재고 가용 여부를 다층 진단합니다.
 * 트랜잭션 없이 SELECT 만 사용 (read-only 안전).
 */
export async function diagnoseProductStock(params: {
  productId: number;
  tenantId: number;
  /** 매출 요청 수량 — 진단 메시지에 활용 (옵션) */
  requestedQty?: number;
}): Promise<StockDiagnosisResult> {
  const { productId, tenantId, requestedQty } = params;

  if (!tenantId) throw new Error("[P0 보안] tenantId 누락");
  if (!productId) throw new Error("productId 누락");

  const pool = await getRawConnection();

  // ─── [1] 제품 기본 정보 ─────────────────────────────────────────────
  const [productRows] = await pool.execute(
    `SELECT id, product_name, product_code, unit, is_active
       FROM h_products_v2
      WHERE id = ? AND tenant_id = ?
      LIMIT 1`,
    [productId, tenantId],
  );
  const productRow = (productRows as any[])[0] || null;

  // 제품 없음 → 즉시 종결
  if (!productRow) {
    return {
      productId,
      tenantId,
      code: "PRODUCT_NOT_FOUND",
      summary: `제품 #${productId} 정보가 존재하지 않습니다`,
      guidance:
        "이 매출에 연결된 제품 ID 가 마스터에 없습니다. 매출 수정 다이얼로그에서 정확한 제품을 다시 선택해주세요.",
      suggestedActions: [
        {
          label: "제품 마스터로 이동",
          href: "/master/products",
          kind: "primary",
        },
      ],
      details: {
        product: null,
        lotsByStatus: [],
        bundleParents: [],
        bundleChildren: [],
        fefoUsableSum: 0,
      },
    };
  }

  const productInfo = {
    id: Number(productRow.id),
    productName: productRow.product_name ?? null,
    productCode: productRow.product_code ?? null,
    unit: productRow.unit ?? null,
    isActive:
      productRow.is_active === null || productRow.is_active === undefined
        ? null
        : Boolean(Number(productRow.is_active)),
  };

  // ─── [2] LOT 상태별 합계 ─────────────────────────────────────────────
  const [lotRows] = await pool.execute(
    `SELECT
        COALESCE(status, '(null)') AS status,
        COUNT(*)                                                        AS lot_count,
        ROUND(SUM(COALESCE(quantity, 0)), 3)                            AS sum_quantity,
        ROUND(SUM(COALESCE(current_quantity, 0)), 3)                    AS sum_current,
        ROUND(SUM(COALESCE(available_quantity, 0)), 3)                  AS sum_available,
        ROUND(
          SUM(CASE WHEN COALESCE(available_quantity, 0) > 0.001
                   THEN available_quantity ELSE 0 END), 3
        ) AS fefo_usable_sum
       FROM h_inventory_lots
      WHERE product_id = ? AND tenant_id = ?
      GROUP BY status`,
    [productId, tenantId],
  );
  const lotsByStatus = (lotRows as any[]).map((r) => ({
    status: String(r.status ?? "(null)"),
    lotCount: Number(r.lot_count ?? 0),
    sumQuantity: Number(r.sum_quantity ?? 0),
    sumCurrent: Number(r.sum_current ?? 0),
    sumAvailable: Number(r.sum_available ?? 0),
    fefoUsableSum: Number(r.fefo_usable_sum ?? 0),
  }));
  const totalLotCount = lotsByStatus.reduce((s, r) => s + r.lotCount, 0);
  const fefoUsableSum = lotsByStatus
    .filter((r) => r.status === "available")
    .reduce((s, r) => s + r.fefoUsableSum, 0);

  // ─── [4] 번들 부모 SKU 후보 ──────────────────────────────────────────
  const [bundleParentRows] = await pool.execute(
    `SELECT
        ps.id        AS parent_sku_id,
        ps.sku_code  AS parent_sku_code,
        ps.sku_name  AS parent_sku_name,
        (SELECT COUNT(*) FROM sku_bundles sb
           WHERE sb.parent_sku_id = ps.id AND sb.tenant_id = ps.tenant_id
        ) AS bundle_child_count
       FROM item_master im
       JOIN product_skus ps
         ON ps.item_id = im.id
        AND ps.tenant_id = im.tenant_id
        AND ps.is_active = 1
      WHERE im.legacy_product_id = ? AND im.tenant_id = ?
        AND EXISTS (
          SELECT 1 FROM sku_bundles sb
           WHERE sb.parent_sku_id = ps.id AND sb.tenant_id = im.tenant_id
        )
      ORDER BY ps.is_default DESC, ps.id ASC`,
    [productId, tenantId],
  );
  const bundleParents = (bundleParentRows as any[]).map((r) => ({
    parentSkuId: Number(r.parent_sku_id),
    parentSkuCode: String(r.parent_sku_code ?? ""),
    parentSkuName: String(r.parent_sku_name ?? ""),
    bundleChildCount: Number(r.bundle_child_count ?? 0),
  }));

  // ─── [4-b] 번들 child SKU 재고 ───────────────────────────────────────
  let bundleChildren: BundleChildStockRow[] = [];
  if (bundleParents.length > 0) {
    // bundleParents 의 parent_sku_id 들로 child 재고 조회
    const parentIds = bundleParents.map((p) => p.parentSkuId);
    // mysql2 placeholder 안전 처리: IN (?, ?, ?, ...)
    const placeholders = parentIds.map(() => "?").join(",");
    const [childRows] = await pool.execute(
      `SELECT
          sb.child_sku_id,
          cps.sku_code AS child_sku_code,
          cps.sku_name AS child_sku_name,
          sb.default_ratio,
          sb.child_pieces,
          sb.child_piece_weight_g,
          ROUND(
            COALESCE(
              (SELECT SUM(available_quantity)
                 FROM h_inventory_lots
                WHERE sku_id = sb.child_sku_id
                  AND tenant_id = sb.tenant_id
                  AND available_quantity > 0.001),
              0
            ), 3
          ) AS child_available_kg
         FROM sku_bundles sb
         JOIN product_skus cps ON cps.id = sb.child_sku_id
        WHERE sb.tenant_id = ?
          AND sb.parent_sku_id IN (${placeholders})
        ORDER BY sb.parent_sku_id, sb.sort_order, sb.id`,
      [tenantId, ...parentIds],
    );
    bundleChildren = (childRows as any[]).map((r) => ({
      childSkuId: Number(r.child_sku_id),
      childSkuCode: String(r.child_sku_code ?? ""),
      childSkuName: String(r.child_sku_name ?? ""),
      availableKg: Number(r.child_available_kg ?? 0),
      defaultRatio:
        r.default_ratio === null || r.default_ratio === undefined
          ? null
          : Number(r.default_ratio),
      childPieces:
        r.child_pieces === null || r.child_pieces === undefined
          ? null
          : Number(r.child_pieces),
      childPieceWeightG:
        r.child_piece_weight_g === null || r.child_piece_weight_g === undefined
          ? null
          : Number(r.child_piece_weight_g),
    }));
  }

  // ─── [5/6] 자동 진단 분기 ────────────────────────────────────────────
  const productLabel = `${productInfo.productName ?? `제품 #${productId}`}`;
  const reqText =
    requestedQty && requestedQty > 0
      ? ` (요청 ${requestedQty}${productInfo.unit ?? ""})`
      : "";

  // BUNDLE 경로: 번들 부모가 등록되어 있으면 child 재고 부족인지 확인
  if (bundleParents.length > 0) {
    const shortChildren = bundleChildren.filter((c) => c.availableKg < 0.001);
    if (shortChildren.length > 0) {
      const shortList = shortChildren
        .slice(0, 3)
        .map((c) => c.childSkuName || `SKU#${c.childSkuId}`)
        .join(", ");
      const more =
        shortChildren.length > 3 ? ` 외 ${shortChildren.length - 3}개` : "";
      return {
        productId,
        tenantId,
        code: "BUNDLE_SHORTAGE",
        summary: `${productLabel} 은(는) 혼합 SKU 입니다 — 구성 자식 SKU 의 재고가 부족합니다${reqText}`,
        guidance: `자식 SKU "${shortList}${more}" 의 재고가 0 입니다. 해당 자식 SKU 의 생산 입고를 먼저 등록해주세요.`,
        suggestedActions: [
          {
            label: "생산 등록하러 가기",
            href: "/production/batches",
            kind: "primary",
          },
          {
            label: "재고 현황 보기",
            href: "/inventory/lots",
            kind: "secondary",
          },
          {
            label: "SKU 번들 매핑 확인",
            href: "/master/sku-bundles",
            kind: "secondary",
          },
        ],
        details: {
          product: productInfo,
          lotsByStatus,
          bundleParents,
          bundleChildren,
          fefoUsableSum,
        },
      };
    }
    // 번들이지만 child 가 모두 있다면 → 다른 원인 (OK 가까움)
  }

  // 일반 FEFO 경로
  if (totalLotCount === 0) {
    return {
      productId,
      tenantId,
      code: "NO_LOTS",
      summary: `${productLabel} 은(는) 한 번도 생산 입고된 적이 없습니다${reqText}`,
      guidance:
        "h_inventory_lots 에 해당 제품의 LOT 가 한 건도 없습니다. 생산 관리에서 batch 를 생성하고 완료(입고) 처리하면 매출 승인이 가능합니다.",
      suggestedActions: [
        {
          label: "생산 등록하러 가기",
          href: "/production/batches",
          kind: "primary",
        },
        {
          label: "제품 마스터 확인",
          href: "/master/products",
          kind: "secondary",
        },
      ],
      details: {
        product: productInfo,
        lotsByStatus,
        bundleParents,
        bundleChildren,
        fefoUsableSum,
      },
    };
  }

  if (fefoUsableSum < 0.001) {
    return {
      productId,
      tenantId,
      code: "EXHAUSTED",
      summary: `${productLabel} 의 가용 재고가 모두 소진되었습니다${reqText}`,
      guidance:
        "LOT 행은 존재하지만 available_quantity 가 모두 0 입니다 (이전 매출에서 다 빠져나갔거나, 폐기/만료 처리됨). 추가 생산 입고가 필요합니다.",
      suggestedActions: [
        {
          label: "생산 등록하러 가기",
          href: "/production/batches",
          kind: "primary",
        },
        {
          label: "재고 현황 보기",
          href: "/inventory/lots",
          kind: "secondary",
        },
      ],
      details: {
        product: productInfo,
        lotsByStatus,
        bundleParents,
        bundleChildren,
        fefoUsableSum,
      },
    };
  }

  // 가용 재고는 있지만 요청 수량보다 적은 경우 (= 진짜 부족, OK 가 아님)
  if (requestedQty && fefoUsableSum + 0.001 < requestedQty) {
    return {
      productId,
      tenantId,
      code: "EXHAUSTED",
      summary: `${productLabel} 가용 재고 ${fefoUsableSum.toFixed(3)}${productInfo.unit ?? ""} < 요청 ${requestedQty}${productInfo.unit ?? ""}`,
      guidance:
        "현재 가용 재고가 요청 수량보다 부족합니다. 추가 생산 입고를 등록하거나, 매출 수량을 조정해주세요.",
      suggestedActions: [
        {
          label: "생산 등록하러 가기",
          href: "/production/batches",
          kind: "primary",
        },
        {
          label: "재고 현황 보기",
          href: "/inventory/lots",
          kind: "secondary",
        },
      ],
      details: {
        product: productInfo,
        lotsByStatus,
        bundleParents,
        bundleChildren,
        fefoUsableSum,
      },
    };
  }

  // 가용 재고가 충분히 있는 경우 → 다른 원인 (UNKNOWN)
  if (fefoUsableSum > 0.001) {
    return {
      productId,
      tenantId,
      code: "OK",
      summary: `${productLabel} 가용 재고 ${fefoUsableSum.toFixed(3)}${productInfo.unit ?? ""} — 정상`,
      guidance:
        "재고는 정상입니다. 매출 승인이 다른 사유로 실패했다면 시스템 관리자에게 문의해주세요.",
      suggestedActions: [
        {
          label: "재고 현황 보기",
          href: "/inventory/lots",
          kind: "secondary",
        },
      ],
      details: {
        product: productInfo,
        lotsByStatus,
        bundleParents,
        bundleChildren,
        fefoUsableSum,
      },
    };
  }

  return {
    productId,
    tenantId,
    code: "UNKNOWN",
    summary: `${productLabel} 의 재고 상태를 자동 진단하지 못했습니다`,
    guidance:
      "위 자동 진단 분류에 해당하지 않는 케이스입니다. scripts/diagnose-product-stock-shortage.sql 을 운영 환경에서 실행해 상세 분석해주세요.",
    suggestedActions: [
      {
        label: "재고 현황 보기",
        href: "/inventory/lots",
        kind: "secondary",
      },
    ],
    details: {
      product: productInfo,
      lotsByStatus,
      bundleParents,
      bundleChildren,
      fefoUsableSum,
    },
  };
}
