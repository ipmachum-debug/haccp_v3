/**
 * BOM 트리 분해 — PR #254
 *
 * 식약처 품목제조보고서 양식 (트리 구조 + 원산지 [...] + 인덴트 └) 출력 지원.
 *
 * 입력: mf_report_version_id
 * 출력: 평탄화된 트리 구조 — depth + ratio + origin
 *
 * 알고리즘:
 *   1. h_mf_ingredients 의 line_no 순으로 처리
 *   2. 각 항목의 entity 결정:
 *      - intermediate_id 있음 → 중간재 (직접 참조)
 *      - material_id 만 있고 h_materials.kind='MIXED' AND h_intermediates.linked_material_id 매칭됨 → 중간재 (간접)
 *      - 그 외 → 원재료 (RAW / FLAVOR_SPECIFIC)
 *   3. 중간재면 h_mixed_material_components 재귀 expand (linkedMaterialId 추적)
 *   4. 무한 루프 방지: 깊이 제한 (max 5) + visited set
 *
 * 작성: 2026-05-05 (PR #254)
 */

import { sql } from "drizzle-orm";
import { getDb } from "../connection";

export interface FlattenedRow {
  /** 표시 순서 (1부터) */
  lineNo: number;
  /** 깊이 — 0 = BOM 직접, 1+ = 중간재 분해 */
  depth: number;
  /** 항목 종류 */
  type: "RAW" | "MIXED" | "FLAVOR_SPECIFIC";
  /** 표시 이름 (원재료 또는 중간재) */
  name: string;
  /** 카테고리 (있으면 표시: 예 "조림류 [백옥앙금]") */
  category: string | null;
  /** 원산지 (예: "국내산", "중국산") — 양식의 [...] 안 텍스트 */
  origin: string | null;
  /** 배합비 (%) — null 이면 빈칸 표시 (양식상 중간재 내부 일부 항목은 빈칸) */
  ratio: number | null;
  /** 부가 메타: 직접 참조한 entity ID (디버깅용) */
  refType: "material" | "intermediate";
  refId: number;
}

interface BomIngredient {
  id: number;
  line_no: number;
  material_id: number | null;
  intermediate_id: number | null;
  quantity: string | number;
  unit: string;
  is_deductible: number;
  material_type: "RAW" | "MIXED" | "FLAVOR_SPECIFIC";
  flavor_name: string | null;
  is_additional: number;
}

interface MaterialRow {
  id: number;
  material_code: string;
  material_name: string;
  kind: "RAW" | "MIXED";
}

interface IntermediateRow {
  id: number;
  intermediate_code: string;
  intermediate_name: string;
  category: string | null;
  linked_material_id: number | null;
}

interface ComponentRow {
  id: number;
  intermediate_material_id: number;
  component_material_id: number;
  ratio_percent: string | number | null;
  grams_per_kg: string | number | null;
  note: string | null;
}

const MAX_DEPTH = 5;

/**
 * note 필드에서 원산지 파싱.
 * 예: "국내산", "중국산", "원산지: 외국산" 등 — 한국어 N단어 추출.
 */
function parseOrigin(note: string | null): string | null {
  if (!note) return null;
  // 흔한 패턴: "국내산", "중국산", "미국산", "베트남산", "외국산", "수입산"
  const m = note.match(/([가-힣]{2,5}산)/);
  if (m) return m[1];
  return null;
}

/**
 * 최상위 진입 함수 — version 의 BOM 을 평탄화 트리로 반환
 */
export async function flattenBomTree(
  mfReportVersionId: number,
  tenantId: number,
): Promise<{
  reportNo: string | null;
  productName: string | null;
  versionNo: number | null;
  rows: FlattenedRow[];
  totalRatio: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 메타 정보 (보고번호 + 제품명 + version no)
  const metaResult: any = await db.execute(sql`
    SELECT
      r.report_no, r.product_id, p.product_name AS product_name,
      v.version_no
    FROM h_mf_report_versions v
    JOIN h_mf_reports r ON r.id = v.mf_report_id AND r.tenant_id = ${tenantId}
    LEFT JOIN h_products_v2 p ON p.id = r.product_id AND p.tenant_id = ${tenantId}
    WHERE v.id = ${mfReportVersionId} AND v.tenant_id = ${tenantId}
    LIMIT 1
  `);
  const metaRows = ((metaResult as any)?.[0] ?? []) as any[];
  const meta = metaRows[0] || {};

  // BOM 라인
  const bomResult: any = await db.execute(sql`
    SELECT
      id, line_no, material_id, intermediate_id, quantity, unit,
      is_deductible, material_type, flavor_name, is_additional
    FROM h_mf_ingredients
    WHERE mf_report_version_id = ${mfReportVersionId}
      AND tenant_id = ${tenantId}
    ORDER BY line_no ASC, id ASC
  `);
  const bom = (((bomResult as any)?.[0] ?? []) as any[]) as BomIngredient[];

  // 사전 캐싱 — 한 번에 fetch
  const allMaterialIds = new Set<number>();
  const allIntermediateIds = new Set<number>();
  for (const b of bom) {
    if (b.material_id) allMaterialIds.add(b.material_id);
    if (b.intermediate_id) allIntermediateIds.add(b.intermediate_id);
  }

  // 중간재 컴포넌트 fetch 시 추가 material id 들 모임
  // (재귀로 따라가야 하니 iteratively expand)
  const materialMap = new Map<number, MaterialRow>();
  const intermediateMap = new Map<number, IntermediateRow>();
  const componentsByIntermediateId = new Map<number, ComponentRow[]>();

  // 먼저 모든 intermediate 후보 fetch (linked_material_id 도 가져옴)
  if (allMaterialIds.size > 0) {
    await loadMaterials(db, tenantId, [...allMaterialIds], materialMap);
    // kind='MIXED' 인 material 의 linked intermediate 도 같이 로드
    const mixedIds = [...materialMap.values()].filter((m) => m.kind === "MIXED").map((m) => m.id);
    if (mixedIds.length > 0) {
      await loadIntermediatesByLinkedMaterialId(db, tenantId, mixedIds, intermediateMap);
    }
  }
  if (allIntermediateIds.size > 0) {
    await loadIntermediatesByIds(db, tenantId, [...allIntermediateIds], intermediateMap);
  }

  // 중간재 컴포넌트 — 모든 known intermediate id 의 components iteratively load
  // (component 가 또 MIXED 일 수 있으니 추가 material/intermediate 도 로드)
  const queue: number[] = [...intermediateMap.keys()];
  const loadedIntermediateIds = new Set<number>();
  while (queue.length > 0) {
    const batch = queue.splice(0, queue.length).filter((id) => !loadedIntermediateIds.has(id));
    if (batch.length === 0) break;
    batch.forEach((id) => loadedIntermediateIds.add(id));
    await loadComponentsForIntermediates(db, tenantId, batch, componentsByIntermediateId);

    // 새로 발견된 component_material_id 들 → load + linked intermediate 추적
    const newMaterialIds: number[] = [];
    for (const id of batch) {
      const comps = componentsByIntermediateId.get(id) ?? [];
      for (const c of comps) {
        if (c.component_material_id && !materialMap.has(c.component_material_id)) {
          newMaterialIds.push(c.component_material_id);
        }
      }
    }
    if (newMaterialIds.length > 0) {
      await loadMaterials(db, tenantId, newMaterialIds, materialMap);
      const newMixedIds = newMaterialIds
        .map((id) => materialMap.get(id))
        .filter((m): m is MaterialRow => !!m && m.kind === "MIXED")
        .map((m) => m.id);
      if (newMixedIds.length > 0) {
        const before = intermediateMap.size;
        await loadIntermediatesByLinkedMaterialId(db, tenantId, newMixedIds, intermediateMap);
        // 새로 추가된 intermediate 들 — 다음 iteration 에서 components 로드
        for (const i of intermediateMap.values()) {
          if (!loadedIntermediateIds.has(i.id)) queue.push(i.id);
        }
      }
    }
  }

  // 결과 빌드
  const rows: FlattenedRow[] = [];
  let lineNo = 1;
  let totalRatio = 0;

  for (const b of bom) {
    const ratio = Number(b.quantity || 0);
    if (b.is_additional !== 1) totalRatio += ratio;

    let intermediate: IntermediateRow | undefined;
    let material: MaterialRow | undefined;

    // BOM line entity 결정
    if (b.intermediate_id) {
      intermediate = intermediateMap.get(b.intermediate_id);
    } else if (b.material_id) {
      material = materialMap.get(b.material_id);
      if (material?.kind === "MIXED") {
        intermediate = [...intermediateMap.values()].find((i) => i.linked_material_id === material!.id);
      }
    }

    const isMixed = !!intermediate;

    // 메인 라인
    const displayName = isMixed
      ? intermediate!.intermediate_name
      : material?.material_name ?? `(미매칭 #${b.material_id ?? b.intermediate_id})`;

    rows.push({
      lineNo: lineNo++,
      depth: 0,
      type: b.material_type as "RAW" | "MIXED" | "FLAVOR_SPECIFIC",
      name: displayName,
      category: intermediate?.category ?? null,
      origin: null, // BOM 직접 라인은 별도 origin 정보 없음 (h_materials 미보유)
      ratio,
      refType: isMixed ? "intermediate" : "material",
      refId: isMixed ? intermediate!.id : material?.id ?? b.material_id ?? 0,
    });

    // 중간재면 components 재귀 expand
    if (isMixed && intermediate) {
      expandIntermediate(intermediate.id, 1, lineNo, rows, {
        materialMap,
        intermediateMap,
        componentsByIntermediateId,
        visited: new Set([intermediate.id]),
      });
      // lineNo 보정 (rows 의 length - 시작 lineNo)
      lineNo = rows.length + 1;
    }
  }

  return {
    reportNo: meta.report_no ?? null,
    productName: meta.product_name ?? null,
    versionNo: meta.version_no ? Number(meta.version_no) : null,
    rows,
    totalRatio,
  };
}

interface ExpandContext {
  materialMap: Map<number, MaterialRow>;
  intermediateMap: Map<number, IntermediateRow>;
  componentsByIntermediateId: Map<number, ComponentRow[]>;
  visited: Set<number>;
}

function expandIntermediate(
  intermediateId: number,
  depth: number,
  startLineNo: number,
  rows: FlattenedRow[],
  ctx: ExpandContext,
): void {
  if (depth > MAX_DEPTH) return;
  const components = ctx.componentsByIntermediateId.get(intermediateId) ?? [];
  let lineNo = startLineNo;
  for (const c of components) {
    const m = ctx.materialMap.get(c.component_material_id);
    const origin = parseOrigin(c.note);
    const ratio = c.ratio_percent !== null ? Number(c.ratio_percent) : null;

    // 이 component 가 MIXED 라면 중간재 expand 가능?
    let nextIntermediate: IntermediateRow | undefined;
    if (m?.kind === "MIXED") {
      nextIntermediate = [...ctx.intermediateMap.values()].find(
        (i) => i.linked_material_id === m.id,
      );
    }

    rows.push({
      lineNo: lineNo++,
      depth,
      type: m?.kind === "MIXED" ? "MIXED" : "RAW",
      name: m?.material_name ?? `(미매칭 #${c.component_material_id})`,
      category: nextIntermediate?.category ?? null,
      origin,
      ratio,
      refType: nextIntermediate ? "intermediate" : "material",
      refId: nextIntermediate ? nextIntermediate.id : c.component_material_id,
    });

    // 깊이 재귀
    if (nextIntermediate && !ctx.visited.has(nextIntermediate.id)) {
      ctx.visited.add(nextIntermediate.id);
      expandIntermediate(nextIntermediate.id, depth + 1, lineNo, rows, ctx);
      lineNo = rows.length + (startLineNo - rows.length + lineNo); // 보정 (rows 가 늘어났으니)
      lineNo = rows.length + 1; // 단순화 — 마지막 lineNo 이후
    }
  }
}

// ─── 사전 로드 헬퍼 ───

async function loadMaterials(
  db: any,
  tenantId: number,
  ids: number[],
  out: Map<number, MaterialRow>,
): Promise<void> {
  if (ids.length === 0) return;
  const result: any = await db.execute(sql`
    SELECT id, material_code, material_name, kind
    FROM h_materials
    WHERE tenant_id = ${tenantId} AND id IN (${sql.raw(ids.join(","))})
  `);
  const rows = (((result as any)?.[0] ?? []) as any[]) as MaterialRow[];
  for (const r of rows) {
    out.set(Number(r.id), {
      id: Number(r.id),
      material_code: String(r.material_code),
      material_name: String(r.material_name),
      kind: (String(r.kind) as "RAW" | "MIXED") || "RAW",
    });
  }
}

async function loadIntermediatesByIds(
  db: any,
  tenantId: number,
  ids: number[],
  out: Map<number, IntermediateRow>,
): Promise<void> {
  if (ids.length === 0) return;
  const result: any = await db.execute(sql`
    SELECT id, intermediate_code, intermediate_name, category, linked_material_id
    FROM h_intermediates
    WHERE tenant_id = ${tenantId} AND id IN (${sql.raw(ids.join(","))})
  `);
  const rows = (((result as any)?.[0] ?? []) as any[]) as IntermediateRow[];
  for (const r of rows) {
    out.set(Number(r.id), {
      id: Number(r.id),
      intermediate_code: String(r.intermediate_code),
      intermediate_name: String(r.intermediate_name),
      category: r.category ? String(r.category) : null,
      linked_material_id: r.linked_material_id ? Number(r.linked_material_id) : null,
    });
  }
}

async function loadIntermediatesByLinkedMaterialId(
  db: any,
  tenantId: number,
  materialIds: number[],
  out: Map<number, IntermediateRow>,
): Promise<void> {
  if (materialIds.length === 0) return;
  const result: any = await db.execute(sql`
    SELECT id, intermediate_code, intermediate_name, category, linked_material_id
    FROM h_intermediates
    WHERE tenant_id = ${tenantId} AND linked_material_id IN (${sql.raw(materialIds.join(","))})
  `);
  const rows = (((result as any)?.[0] ?? []) as any[]) as IntermediateRow[];
  for (const r of rows) {
    out.set(Number(r.id), {
      id: Number(r.id),
      intermediate_code: String(r.intermediate_code),
      intermediate_name: String(r.intermediate_name),
      category: r.category ? String(r.category) : null,
      linked_material_id: r.linked_material_id ? Number(r.linked_material_id) : null,
    });
  }
}

async function loadComponentsForIntermediates(
  db: any,
  tenantId: number,
  intermediateIds: number[],
  out: Map<number, ComponentRow[]>,
): Promise<void> {
  if (intermediateIds.length === 0) return;
  const result: any = await db.execute(sql`
    SELECT id, intermediate_material_id, component_material_id, ratio_percent, grams_per_kg, note
    FROM h_mixed_material_components
    WHERE tenant_id = ${tenantId} AND intermediate_material_id IN (${sql.raw(intermediateIds.join(","))})
    ORDER BY id ASC
  `);
  const rows = (((result as any)?.[0] ?? []) as any[]) as ComponentRow[];
  for (const r of rows) {
    const list = out.get(Number(r.intermediate_material_id)) ?? [];
    list.push({
      id: Number(r.id),
      intermediate_material_id: Number(r.intermediate_material_id),
      component_material_id: Number(r.component_material_id),
      ratio_percent: r.ratio_percent !== null ? Number(r.ratio_percent) : null,
      grams_per_kg: r.grams_per_kg !== null ? Number(r.grams_per_kg) : null,
      note: r.note ? String(r.note) : null,
    });
    out.set(Number(r.intermediate_material_id), list);
  }
}
