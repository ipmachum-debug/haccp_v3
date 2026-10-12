/**
 * MySQL FK 위반 → 사용자 메시지 (v3 4단계 업무 FK, 2026-10-12)
 *
 *   1451 ER_ROW_IS_REFERENCED_2 : 자식이 참조 중인 부모를 지우려 함 (RESTRICT)
 *   1452 ER_NO_REFERENCED_ROW_2 : 존재하지 않는 부모를 가리키는 자식을 넣으려 함
 *
 * 쓰기 경로가 try/catch 에서 이 함수로 감싸 던지면, 화면에는 "이력이 있어 삭제할 수 없습니다" 가 보인다.
 */

const LABELS: Record<string, string> = {
  fk_batches_product: "제품",
  fk_batch_inputs_batch: "배치",
  fk_batch_inputs_material: "원재료",
  fk_sku_output_batch: "배치",
  fk_lots_material: "원재료",
  fk_lots_product: "제품",
  fk_tx_lot: "LOT",
  fk_tx_material: "원재료",
  fk_mf_reports_item: "품목",
  fk_mf_versions_report: "품목제조보고",
  fk_mf_ingredients_version: "BOM 버전",
  fk_mf_ingredients_item: "품목",
  fk_skus_item: "품목",
};

export function isFkViolation(err: unknown): boolean {
  const e = err as any;
  return !!e && (e.errno === 1451 || e.errno === 1452 || e.code === "ER_ROW_IS_REFERENCED_2" || e.code === "ER_NO_REFERENCED_ROW_2");
}

function constraintName(err: any): string | null {
  const m = /CONSTRAINT `([a-z0-9_]+)`/i.exec(String(err?.sqlMessage ?? err?.message ?? ""));
  return m ? m[1] : null;
}

/** FK 위반이면 한국어 Error 로 바꿔 돌려주고, 아니면 원래 에러를 그대로 돌려준다. */
export function translateFkError(err: unknown, what = "이 항목"): unknown {
  if (!isFkViolation(err)) return err;
  const e = err as any;
  const name = constraintName(e);
  const label = (name && LABELS[name]) || "연결된 데이터";
  if (e.errno === 1451 || e.code === "ER_ROW_IS_REFERENCED_2") {
    return new Error(`${what}은(는) 참조하는 이력(${label} 기준 거래·LOT·투입)이 있어 삭제할 수 없습니다. 비활성화 처리하세요.`);
  }
  return new Error(`${what}이(가) 가리키는 ${label}이(가) 존재하지 않습니다. 품목 id 네임스페이스를 확인하세요 (11-identity-policy-v3.md).`);
}
