/**
 * 품목제조보고 저장 시 원료 행 병합 — 화면이 보내지 않은 값은 원래 행에서 이어받는다 (2026-10-16)
 *
 * 사고: 보고서 422(찹쌀떡) 버전2 원료 9행이 10/13 08:48 KST 에 삭제·재생성되면서 CCP 공정 지정이 전부 사라졌다.
 *   updateMfReport 는 원료를 전부 DELETE 후 화면이 보낸 값만 INSERT 한다. 목록의 '수정' 화면(MfReportModify) 은
 *   processGroupId·adjustedWeightKg 를 보내지 않고 추가 원재료 행은 아예 빼고 보냈다 → 공정 지정·수율조정·추가 원재료 소실.
 *   corrected_quantity·child_sku_id·piece_* 는 어느 화면에서 저장해도 INSERT 에 없어 사라졌다.
 * 규칙:
 *   - 화면은 원래 행의 id 를 같이 보낸다. id 가 같은 버전의 행이면 그 행이 원본.
 *   - 값이 undefined(안 보냄) → 원본 값 유지. null → 명시적으로 비움. 값 → 그 값.
 *   - id 없는 행(새로 추가) 은 보낸 값만. 이름·순서·재료 id 로 원본을 추정하지 않는다.
 */

export interface IncomingIngredient {
  id?: number;
  materialId?: number;
  intermediateId?: number;
  childSkuId?: number | null;
  pieceCount?: number | null;
  pieceWeightG?: number | null;
  quantity: number;
  unit: string;
  isDeductible: number;
  materialType: string;
  flavorName?: string;
  processGroupId?: number | null;
  adjustedWeightKg?: number | null;
  correctedQuantity?: number | null;
  isAdditional?: number;
  /** 운영 기준 원물 kg (수율 기준 PR B) */
  basisRawKg?: number | null;
  /** 전처리 배율 (NULL = 1.0) */
  pretreatmentFactor?: number | null;
  /** 공정 미지정 원료의 들어가는 곳 — direct·late·null (생략 = 유지, 생산 설계 2a) */
  entryStage?: "direct" | "late" | null;
}

export interface ExistingIngredient {
  id: number;
  materialId?: number | null;
  intermediateId?: number | null;
  processGroupId?: number | null;
  adjustedWeightKg?: string | number | null;
  correctedQuantity?: string | number | null;
  childSkuId?: number | null;
  pieceCount?: number | null;
  pieceWeightG?: string | number | null;
  isAdditional?: number | null;
  basisRawKg?: string | number | null;
  pretreatmentFactor?: string | number | null;
  entryStage?: string | null;
}

const keep = <T,>(incoming: T | undefined, original: T | null | undefined): T | null =>
  incoming !== undefined ? (incoming as T) : (original ?? null);
const str = (v: unknown) => (v == null || v === "" ? null : String(v));

export function mergeIngredientRows(incoming: IncomingIngredient[], existing: ExistingIngredient[], versionId: number) {
  const byId = new Map(existing.map((e) => [Number(e.id), e]));
  return incoming.map((ing, index) => {
    const orig = ing.id != null ? byId.get(Number(ing.id)) : undefined;
    const processGroupId = keep(ing.processGroupId, orig?.processGroupId);
    // 같은 줄이라도 원료가 바뀌면 들어가는 곳 확인을 이어받지 않는다 (#600 검토 A4 — 바뀐 근거는 다시 확인)
    const sameMaterial = !!orig && (orig.materialId ?? null) === (ing.materialId || null) && (orig.intermediateId ?? null) === (ing.intermediateId || null);
    return {
      mfReportVersionId: versionId,
      lineNo: index + 1,
      materialId: ing.materialId || null,
      intermediateId: ing.intermediateId || null,
      childSkuId: keep(ing.childSkuId, orig?.childSkuId),
      pieceCount: keep(ing.pieceCount, orig?.pieceCount),
      pieceWeightG: str(keep(ing.pieceWeightG, orig?.pieceWeightG as any)),
      quantity: ing.quantity.toString(),
      correctedQuantity: str(keep(ing.correctedQuantity, orig?.correctedQuantity as any)),
      unit: ing.unit,
      isDeductible: ing.isDeductible,
      materialType: ing.materialType,
      flavorName: ing.flavorName || null,
      processGroupId,
      adjustedWeightKg: str(keep(ing.adjustedWeightKg, orig?.adjustedWeightKg as any)),
      isAdditional: ing.isAdditional ?? orig?.isAdditional ?? 0,
      basisRawKg: str(keep(ing.basisRawKg, orig?.basisRawKg as any)),
      pretreatmentFactor: str(keep(ing.pretreatmentFactor, orig?.pretreatmentFactor as any)),
      // 들어가는 곳: 공정이 있으면(보냈거나 이어받은) 비움 (공정이 우선), 아니면 보낸 값 또는 원래 값 (배합 수정 화면이 몰라도 지워지지 않게)
      entryStage: processGroupId != null ? null : str(keep(ing.entryStage as any, sameMaterial ? (orig?.entryStage as any) : null)),
    };
  });
}

/**
 * 화면이 보낸 원래 행 id 중 현재 버전에 없는 것 (2026-10-16, Codex 배포 검토 P2).
 * 다른 사용자가 먼저 저장했거나 오래 열어 둔 화면이면 생긴다. 있으면 아무것도 지우기 전에 거부해야 한다
 * — 모르는 id 는 원본이 없어 생략한 값(CCP 공정 지정 등)이 비워진다. 재료·이름·순서로 메우지 않는다.
 */
export function unknownIngredientIds(incoming: IncomingIngredient[], existing: ExistingIngredient[]): number[] {
  const known = new Set(existing.map((e) => Number(e.id)));
  const seen = new Set<number>();
  const bad: number[] = [];
  for (const ing of incoming) {
    if (ing.id == null) continue;
    const id = Number(ing.id);
    if (!known.has(id) || seen.has(id)) bad.push(id); // 같은 id 두 번도 거부
    seen.add(id);
  }
  return bad;
}

export const STALE_INGREDIENTS_MESSAGE =
  "배합이 다른 곳에서 먼저 저장되어 화면 정보가 오래되었습니다. 새로고침 후 다시 저장하세요. (저장되지 않았습니다)";
