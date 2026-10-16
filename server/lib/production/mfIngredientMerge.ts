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
}

export interface ExistingIngredient {
  id: number;
  processGroupId?: number | null;
  adjustedWeightKg?: string | number | null;
  correctedQuantity?: string | number | null;
  childSkuId?: number | null;
  pieceCount?: number | null;
  pieceWeightG?: string | number | null;
  isAdditional?: number | null;
}

const keep = <T,>(incoming: T | undefined, original: T | null | undefined): T | null =>
  incoming !== undefined ? (incoming as T) : (original ?? null);
const str = (v: unknown) => (v == null || v === "" ? null : String(v));

export function mergeIngredientRows(incoming: IncomingIngredient[], existing: ExistingIngredient[], versionId: number) {
  const byId = new Map(existing.map((e) => [Number(e.id), e]));
  return incoming.map((ing, index) => {
    const orig = ing.id != null ? byId.get(Number(ing.id)) : undefined;
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
      processGroupId: keep(ing.processGroupId, orig?.processGroupId),
      adjustedWeightKg: str(keep(ing.adjustedWeightKg, orig?.adjustedWeightKg as any)),
      isAdditional: ing.isAdditional ?? orig?.isAdditional ?? 0,
    };
  });
}
