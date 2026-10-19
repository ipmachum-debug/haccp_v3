/**
 * 제품 CCP 공정그룹 매핑 사전 검증 — PR #263
 *
 * 배치 생성 시 제품의 CCP 공정그룹 매핑을 사전 확인. 매핑이 없으면 배치 생성 자체를 차단하고
 * 사용자에게 친절한 안내 메시지를 띄움.
 *
 * 사용자 피드백:
 * > "매핑되지 않은 CCP 공정이 있다면 진행하지 않고 안내 메세지를 띄워 주는게 맞을거 같아"
 *
 * 4월 17일 batch 580 (흑임자인절미) 0건 CCP 형식 record 사고 재발 방지:
 *   - product 92 의 ccp_process_group_products 매핑 0건 + BOM DRAFT
 *   - autoCreateCcpInstancesForBatch 가 silent 하게 0건 반환
 *   - approval_request 에 "CCP 1건 자동 생성 완료" 거짓 보고
 *   - PDF 출력 시 빈 본문
 *
 * 작성: 2026-05-06 (PR #263)
 */

import { getRawConnection } from "../db/connection";
import { selectBomVersion } from "../lib/identity/itemIdentityService";

export interface MappingValidation {
  /** 진행 가능 여부 */
  valid: boolean;
  /** BOM 기반 매핑 갯수 (h_mf_ingredients.process_group_id) */
  bomMappingCount: number;
  /** 수동 매핑 갯수 (ccp_process_group_products) */
  manualMappingCount: number;
  /** APPROVED 상태 BOM 버전 존재 여부 */
  hasApprovedBom: boolean;
  /** CCP-4P (금속검출) 활성 그룹 존재 여부 */
  hasMetalDetection: boolean;
  /** 사용자 안내 메시지 (valid=false 일 때) */
  message: string;
  /** 안내 행동 가이드 (UI 에 표시) */
  guidance: string[];
}

/**
 * 제품의 CCP 공정그룹 매핑 검증.
 *
 * 정책 (2026-10-19 — 생산 계획 getProcessGroupsForProduct 와 같은 기준, 설계 현황 신호등과 같은 판정):
 *   - 생산에 쓰는 BOM 버전 하나(selectBomVersion)가 있으면 그 버전만 본다 (옛 승인 버전을 합치지 않음)
 *       · 원료에 가열 공정이 있으면 통과
 *       · 가열 공정이 없으면 '금속검출만 하는 제품'(송편·멥쌀가루 등) — 금속검출이 활성이고 원료 들어가는 곳이 모두 정해졌을 때 통과
 *       · 둘 다 없으면 CCP 기록이 하나도 안 생기므로 막는다
 *     수동 연결은 보지 않는다 (BOM 이 정본 — 계획도 BOM 이 있으면 수동 연결을 쓰지 않음)
 *   - BOM 버전이 없으면 이전처럼 수동 연결(가열 공정) ≥ 1 이어야 통과 (4월 흑임자인절미 0건 사고 방지)
 */
export async function validateProductCcpMapping(args: {
  productId: number;
  productName: string;
  tenantId: number;
}): Promise<MappingValidation> {
  const { productId, productName, tenantId } = args;
  const conn = await getRawConnection();
  const pick = await selectBomVersion(productId, tenantId, conn);

  // 1. 생산에 쓰는 버전의 원료에 지정된 가열 공정 (활성, 금속검출 제외)
  let bomMappingCount = 0;
  if (pick) {
    const [bomRows] = await conn.execute<any[]>(
      `SELECT COUNT(DISTINCT i.process_group_id) AS group_mappings
         FROM h_mf_ingredients i
         JOIN ccp_process_groups g ON g.id = i.process_group_id AND g.tenant_id = ? AND g.status = 'active' AND g.ccp_type != 'CCP-4P'
        WHERE i.mf_report_version_id = ?`,
      [tenantId, pick.versionId],
    );
    bomMappingCount = Number((bomRows as any[])[0]?.group_mappings ?? 0);
  }
  const hasApprovedBom = !!pick?.approved;

  // 가열 공정이 없는 배합: 원료마다 '들어가는 곳'(성형에 바로·나중에 넣음)이 모두 정해졌을 때만 '금속검출만 하는 제품' 으로 본다.
  //   정하지 않은 줄이 있으면 가열 공정을 빠뜨린 것일 수 있다 (예: 시루떡) — 증숙 CCP 없이 만들지 않게 막는다.
  let unclassified = 0;
  if (pick && bomMappingCount === 0) {
    try {
      const [uRows] = await conn.execute<any[]>(
        `SELECT COUNT(*) AS n FROM h_mf_ingredients WHERE mf_report_version_id = ? AND process_group_id IS NULL AND (entry_stage IS NULL OR entry_stage NOT IN ('direct', 'late'))`,
        [pick.versionId],
      );
      unclassified = Number((uRows as any[])[0]?.n ?? 0);
    } catch (e: any) {
      if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
      const [uRows] = await conn.execute<any[]>(`SELECT COUNT(*) AS n FROM h_mf_ingredients WHERE mf_report_version_id = ? AND process_group_id IS NULL`, [pick.versionId]);
      unclassified = Number((uRows as any[])[0]?.n ?? 0);
    }
  }

  // 2. 수동 매핑 (ccp_process_group_products) — BOM 이 없는 제품에만 쓰인다
  const [manualRows] = await conn.execute<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM ccp_process_group_products gp
     JOIN ccp_process_groups g
       ON g.id = gp.process_group_id
      AND g.tenant_id = ?
      AND g.status = 'active'
      AND g.ccp_type != 'CCP-4P'
     WHERE gp.product_id = ?
       AND gp.tenant_id = ?`,
    [tenantId, productId, tenantId],
  );
  const manualMappingCount = Number((manualRows as any[])[0]?.cnt ?? 0);

  // 3. CCP-4P (금속검출) 활성 그룹 존재
  const [metalRows] = await conn.execute<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM ccp_process_groups
     WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND status = 'active'`,
    [tenantId],
  );
  const hasMetalDetection = Number((metalRows as any[])[0]?.cnt ?? 0) > 0;

  const valid = pick ? bomMappingCount > 0 || (hasMetalDetection && unclassified === 0) : manualMappingCount > 0;
  if (valid) {
    return { valid: true, bomMappingCount, manualMappingCount, hasApprovedBom, hasMetalDetection, message: "", guidance: [] };
  }

  const guidance: string[] = [];
  let message: string;
  if (!pick) {
    message = `'${productName}' 제품의 품목제조보고(배합)가 없습니다. 생산 건을 만들 수 없습니다.`;
    guidance.push("품목제조보고(배합)를 등록하고, 원료마다 들어가는 공정을 정해 주세요.");
  } else if (!hasMetalDetection) {
    message = `'${productName}' 제품은 가열 공정도, 사용 중인 금속검출 공정도 없어 CCP 기록이 하나도 생기지 않습니다.`;
    guidance.push("배합에서 원료가 들어가는 가열 공정을 정하거나, 금속검출 공정을 사용으로 바꿔 주세요.");
  } else {
    message = `'${productName}' 제품의 배합에 가열 공정이 없고, 들어가는 곳을 정하지 않은 원료가 ${unclassified}개 있습니다. 가열하는 제품이면 공정을 빠뜨린 것일 수 있어 생산 건을 만들지 않았습니다.`;
    guidance.push("배합에서 원료마다 들어가는 곳(가열 공정 또는 성형에 바로)을 정해 주세요. 모두 성형에 바로라면 금속검출만으로 생산됩니다.");
  }
  return { valid: false, bomMappingCount, manualMappingCount, hasApprovedBom, hasMetalDetection, message, guidance };
}
