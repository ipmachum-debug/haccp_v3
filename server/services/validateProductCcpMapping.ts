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
 * 정책:
 *   - BOM 매핑 (APPROVED 버전 + ingredients.process_group_id) ≥ 1 → OK
 *   - 수동 매핑 (ccp_process_group_products) ≥ 1 → OK
 *   - 둘 다 0 이면 valid=false (CCP-4P 만으로는 불충분 — 제품별 명시 매핑 필요)
 *
 * 단, 시스템 운영자가 의도적으로 CCP-4P 만 사용하는 케이스도 있으므로 hasMetalDetection 정보 함께 반환.
 */
export async function validateProductCcpMapping(args: {
  productId: number;
  productName: string;
  tenantId: number;
}): Promise<MappingValidation> {
  const { productId, productName, tenantId } = args;
  const conn = await getRawConnection();

  // 1. APPROVED BOM 버전 존재 여부 + ingredients 의 process_group_id ≥ 1 카운트
  const [bomRows] = await conn.execute<any[]>(
    `SELECT
       COUNT(DISTINCT v.id) AS approved_versions,
       COUNT(DISTINCT i.process_group_id) AS group_mappings
     FROM h_mf_reports r
     LEFT JOIN h_mf_report_versions v
       ON v.mf_report_id = r.id
      AND v.approval_status = 'APPROVED'
     LEFT JOIN h_mf_ingredients i
       ON i.mf_report_version_id = v.id
      AND i.process_group_id IS NOT NULL
     WHERE r.product_id = ?
       AND r.tenant_id = ?`,
    [productId, tenantId],
  );
  const approvedVersions = Number((bomRows as any[])[0]?.approved_versions ?? 0);
  const bomMappingCount = Number((bomRows as any[])[0]?.group_mappings ?? 0);
  const hasApprovedBom = approvedVersions > 0;

  // 2. 수동 매핑 (ccp_process_group_products)
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

  // 판정: BOM 또는 수동 매핑 ≥ 1 이면 통과
  const valid = bomMappingCount > 0 || manualMappingCount > 0;

  if (valid) {
    return {
      valid: true,
      bomMappingCount,
      manualMappingCount,
      hasApprovedBom,
      hasMetalDetection,
      message: "",
      guidance: [],
    };
  }

  // 안내 메시지 생성 (사용자 행동 가이드)
  const guidance: string[] = [];
  let message: string;

  if (!hasApprovedBom && manualMappingCount === 0) {
    message = `'${productName}' 제품의 CCP 공정그룹 매핑이 없습니다. 배치 생성을 진행할 수 없습니다.`;
    guidance.push(
      "[1] 마스터 데이터 → 제품-CCP 매핑 메뉴에서 이 제품에 CCP 공정그룹을 매핑해주세요.",
    );
    guidance.push(
      "[2] 또는 품목제조보고(BOM) 를 작성한 뒤 APPROVED 처리하면 BOM 의 공정그룹이 자동 적용됩니다.",
    );
  } else if (hasApprovedBom && bomMappingCount === 0 && manualMappingCount === 0) {
    message = `'${productName}' 제품의 BOM 은 승인됐지만 CCP 공정그룹이 연결된 원재료가 없습니다.`;
    guidance.push(
      "BOM 의 각 원재료에 process_group_id 를 설정하거나, 마스터 데이터 → 제품-CCP 매핑에서 직접 매핑하세요.",
    );
  } else if (!hasApprovedBom && manualMappingCount === 0) {
    message = `'${productName}' 제품의 BOM 이 아직 승인되지 않았고 (DRAFT), 수동 매핑도 없습니다.`;
    guidance.push("[1] BOM 을 APPROVED 처리하거나");
    guidance.push("[2] 마스터 데이터 → 제품-CCP 매핑에서 직접 매핑해주세요.");
  } else {
    message = `'${productName}' 제품의 CCP 매핑 검증 실패.`;
    guidance.push("관리자에게 문의해주세요.");
  }

  if (hasMetalDetection) {
    guidance.push(
      "참고: 시스템에 CCP-4P (금속검출) 그룹은 활성화되어 있으나, 제품별 매핑이 있어야 자동 생성됩니다.",
    );
  }

  return {
    valid: false,
    bomMappingCount,
    manualMappingCount,
    hasApprovedBom,
    hasMetalDetection,
    message,
    guidance,
  };
}
