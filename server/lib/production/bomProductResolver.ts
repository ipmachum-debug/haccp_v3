/**
 * BOM(품목제조보고) 제품 ID 네임스페이스 변환 헬퍼
 *
 * ## 배경 (2026-10-07 감사)
 *
 * `h_mf_reports.product_id` 가 두 가지 ID 네임스페이스를 섞어 참조한다:
 *
 * 1. **`h_products_v2.id`** — 배치(`h_batches.product_id`)·CCP 기록지가 쓰는 canonical 제품 ID
 * 2. **`item_master.id`** — 통합 품목 마스터. `item_master.legacy_product_id` 가 1 을 가리킨다.
 *
 * 예: 찹쌀떡(떡마루) 는 `h_products_v2.id = 82`, `item_master.id = 256 (legacy_product_id = 82)`.
 * BOM mf#422 는 `product_id = 256` 으로 저장돼 있어서
 *   - BOM 화면: `COALESCE(h_products_v2.product_name, item_master.item_name)` 로 이름이 나와 정상으로 보임
 *   - 배치 생성: `WHERE product_id = 82` 로만 찾아 BOM 없음 → h_batch_inputs 0건 → 원재료 투입 전무
 * 같은 패턴의 BOM 이 8건 (오메기 4종, 찹쌀떡, 카스테라앙금인절미 2종, 흑임자인절미).
 *
 * 자재 쪽의 `materialIdResolver` 와 같은 역할을 제품 쪽에서 한다.
 *
 * ## 규칙
 *
 * - 입력은 배치가 쓰는 `h_products_v2.id` (ProductionProductId). 반환은 그 제품의 정체성 번호(ItemMasterId) — FK(legacy_product_id) 만.
 * - 숫자가 우연히 같은 다른 품목으로 잇지 않는다 (2026-10-20 번호 체계 2단계에서 직접 일치·역방향 흡수 제거).
 * - 데이터는 바꾸지 않는다. 근본 정리(h_mf_reports.product_id 를 v2 로 통일)는 별도 마이그레이션.
 */

import type { Pool, PoolConnection, Connection } from "mysql2/promise";
import { getRawConnection } from "../../db/connection";
import type { ItemMasterId, ProductionProductId } from "../../../shared/identity/itemIds";

export type AnyConn = Pick<Pool | PoolConnection | Connection, "execute">;

/**
 * 생산 제품 번호 → 그 제품의 BOM 이 쓰는 정체성 번호(item_master.id) 목록 — FK(legacy_product_id) 만 (2026-10-20, 번호 체계 2단계).
 *   이전: 입력 숫자 자체도 후보에 넣고(직접 일치 우선) 역방향(입력이 정체성 번호인 경우)도 흡수했다 →
 *   생산 제품 번호와 같은 숫자의 다른 정체성 품목에 BOM 이 있으면 그것을 골랐다(숫자 우연 일치).
 *   운영 사본 점검(2026-10-20): 이 경로로만 이어지던 것은 연결이 빠진 시험 품목 1건뿐 — 실제 품목은 모두 FK 로 이어짐.
 * 연결이 없으면 빈 배열 (추측하지 않음).
 */
export async function bomItemIdsOfProduct(productId: ProductionProductId, tenantId: number, conn?: AnyConn): Promise<ItemMasterId[]> {
  if (!Number.isFinite(productId) || productId <= 0) return [];
  const c = conn ?? (await getRawConnection());
  const [rows] = await c.execute<any[]>(
    `SELECT im.id FROM item_master im
      WHERE im.tenant_id = ? AND im.legacy_product_id = ? AND im.item_type IN ('own_product', 'external_product')
      ORDER BY im.id`,
    [tenantId, productId],
  );
  return (rows as any[]).map((r) => Number(r.id) as ItemMasterId).filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * BOM 조회용 product_id 목록 — `IN (...)` 에 바로 쓰는 호환 함수. bomItemIdsOfProduct 와 같고, 비면 [0]
 * (h_mf_reports.product_id 는 0 이 없으므로 아무것도 고르지 않는다 — 빈 IN() 오류 방지).
 */
export async function resolveBomProductIds(productId: ProductionProductId, tenantId: number, conn?: AnyConn): Promise<number[]> {
  try {
    const ids = await bomItemIdsOfProduct(productId, tenantId, conn);
    return ids.length ? ids : [0];
  } catch (err: any) {
    console.warn(`[bomProductResolver] product=${productId} tenant=${tenantId} 변환 실패: ${err?.message || err}`);
    return [0];
  }
}

/** mysql2 `?` 플레이스홀더용 — `IN (?, ?, ?)` 조각 */
export function inPlaceholders(ids: number[]): string {
  return ids.map(() => "?").join(", ");
}

/**
 * raw SQL JOIN 에서 `h_mf_reports.product_id` 를 `h_products_v2.id` 로 바꾸는 표현식.
 * 직접 일치가 있으면 그대로, 없으면 item_master.legacy_product_id 로 환산한다.
 *
 *   JOIN h_products_v2 p ON p.tenant_id = r.tenant_id AND p.id = ${bomProductV2IdExpr("r")}
 */
export function bomProductV2IdExpr(reportAlias: string): string {
  // 보고서의 product_id 는 정체성 번호 — 같은 숫자의 생산 제품과 직접 맞추지 않고 FK 로만 (2026-10-20, 번호 체계 2단계)
  const r = reportAlias;
  return `(SELECT im0.legacy_product_id FROM item_master im0
      WHERE im0.id = ${r}.product_id AND im0.tenant_id = ${r}.tenant_id
        AND im0.item_type IN ('own_product', 'external_product') LIMIT 1)`;
}

/**
 * 배치·CCP 가 쓸 품목제조보고 버전 하나 (2026-10-16).
 *
 * 배치 생성(batchCRUD.createBatch) 과 CCP 기록지 투입량(ccpFormSettings) 이 같은 버전을 읽어야 한다.
 * 이전 CCP 는 `approval_status = 'APPROVED'` 인 버전을 전부 JOIN 해 합산했다
 *   → 승인 버전이 2개인 제품(운영 20개) 은 공정 투입 kg 이 두 배 (우유설기 9/14: 4.55 + 4.635 = 9.19kg).
 * 규칙 (createBatch 와 동일):
 *   1) 보고서: product_id 후보(resolveBomProductIds) 중 직접 일치(v2 id) 우선, 같으면 id 작은 순
 *   2) 버전: APPROVED 중 version_no 최신, 없으면 상태 무관 최신 version_no
 * @returns 버전 id 와 보고서 id, 없으면 null
 */
export async function selectBomVersion(
  productId: ProductionProductId,
  tenantId: number,
  conn?: AnyConn,
): Promise<{ reportId: number; versionId: number; approved: boolean } | null> {
  if (!Number.isFinite(productId) || productId <= 0) return null;
  const c = conn ?? (await getRawConnection());
  const ids = await bomItemIdsOfProduct(productId, tenantId, c);
  if (!ids.length) return null;
  const [reports] = await c.execute<any[]>(
    `SELECT id FROM h_mf_reports
      WHERE tenant_id = ? AND product_id IN (${inPlaceholders(ids)})
      ORDER BY id ASC
      LIMIT 1`,
    [tenantId, ...ids],
  );
  const reportId = Number((reports as any[])[0]?.id ?? 0);
  if (!reportId) return null;
  const [versions] = await c.execute<any[]>(
    `SELECT id, approval_status FROM h_mf_report_versions
      WHERE mf_report_id = ?
      ORDER BY (approval_status = 'APPROVED') DESC, version_no DESC, id DESC
      LIMIT 1`,
    [reportId],
  );
  const v = (versions as any[])[0];
  if (!v) return null;
  return { reportId, versionId: Number(v.id), approved: v.approval_status === "APPROVED" };
}
