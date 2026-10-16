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
 * - 입력은 배치가 쓰는 `h_products_v2.id`. 반환은 BOM 조회에 써야 할 product_id 후보 목록.
 * - 후보 순서: 직접 일치(v2 id) → item_master 경유 id. 호출측은 `IN (...)` 으로 찾되,
 *   여러 건이면 `product_id = <v2 id>` 인 행을 우선한다 (`orderByDirectMatchSql` 참고).
 * - 역방향(입력이 item_master.id 인 경우)도 `legacy_product_id` 를 후보에 넣어 흡수한다.
 * - 데이터는 바꾸지 않는다. 근본 정리(h_mf_reports.product_id 를 v2 로 통일)는 별도 마이그레이션.
 */

import type { Pool, PoolConnection, Connection } from "mysql2/promise";
import { getRawConnection } from "../../db/connection";

export type AnyConn = Pick<Pool | PoolConnection | Connection, "execute">;

/**
 * BOM 조회용 product_id 후보 목록.
 * 항상 입력 ID 를 첫 원소로 포함하므로 빈 배열이 되지 않는다.
 */
export async function resolveBomProductIds(
  productId: number,
  tenantId: number,
  conn?: AnyConn,
): Promise<number[]> {
  const ids: number[] = [productId];
  if (!Number.isFinite(productId) || productId <= 0) return ids;

  try {
    const c = conn ?? (await getRawConnection());
    const [rows] = await c.execute<any[]>(
      `SELECT im.id AS candidate
         FROM item_master im
        WHERE im.tenant_id = ? AND im.legacy_product_id = ?
          AND im.item_type IN ('own_product', 'external_product')
       UNION
       SELECT im.legacy_product_id AS candidate
         FROM item_master im
        WHERE im.tenant_id = ? AND im.id = ? AND im.legacy_product_id IS NOT NULL
          AND im.item_type IN ('own_product', 'external_product')`,
      [tenantId, productId, tenantId, productId],
    );
    for (const r of rows as any[]) {
      const n = Number(r.candidate);
      if (Number.isFinite(n) && n > 0 && !ids.includes(n)) ids.push(n);
    }
  } catch (err: any) {
    // 변환 실패는 조용히 직접 일치만 사용 (기존 동작과 동일)
    console.warn(`[bomProductResolver] product=${productId} tenant=${tenantId} 변환 실패: ${err?.message || err}`);
  }
  return ids;
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
  const r = reportAlias;
  return `COALESCE(
    (SELECT p0.id FROM h_products_v2 p0 WHERE p0.id = ${r}.product_id AND p0.tenant_id = ${r}.tenant_id),
    (SELECT im0.legacy_product_id FROM item_master im0
      WHERE im0.id = ${r}.product_id AND im0.tenant_id = ${r}.tenant_id
        AND im0.item_type IN ('own_product', 'external_product') LIMIT 1)
  )`;
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
  productId: number,
  tenantId: number,
  conn?: AnyConn,
): Promise<{ reportId: number; versionId: number; approved: boolean } | null> {
  if (!Number.isFinite(productId) || productId <= 0) return null;
  const c = conn ?? (await getRawConnection());
  const ids = await resolveBomProductIds(productId, tenantId, c);
  const [reports] = await c.execute<any[]>(
    `SELECT id FROM h_mf_reports
      WHERE tenant_id = ? AND product_id IN (${inPlaceholders(ids)})
      ORDER BY (product_id = ?) DESC, id ASC
      LIMIT 1`,
    [tenantId, ...ids, productId],
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
