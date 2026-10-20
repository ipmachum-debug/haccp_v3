/**
 * 번호 종류 컴파일 검사 (2026-10-20, 번호 체계 2단계) — 실행되지 않는다. `tsc` 가 이 파일을 검사한다.
 *   `@ts-expect-error` 줄은 '여기서 오류가 나야 정상' 이라는 뜻 — 누가 타입을 느슨하게 바꿔 오류가 사라지면 tsc 가 실패한다.
 *   즉 생산 제품 번호를 BOM(정체성) 칸에 넘기는 실수, 이름표 없는 숫자를 넘기는 실수를 빌드가 막는지 지킨다.
 */
import { asItemMasterId, asInventoryMaterialId, asProductionProductId } from "../../../shared/identity/itemIds";
import { selectBomVersion, toItemMasterIdFromMaterial, toItemMasterIdFromProduct, toProductionProductId, inventoryMaterialIdOfItem } from "./itemIdentityService";

export function __itemIdKindsCompileCheck(): void {
  const t = 1;
  // 맞는 종류 — 통과
  void selectBomVersion(asProductionProductId(350), t);
  void toProductionProductId(asItemMasterId(352), t);
  void toItemMasterIdFromProduct(asProductionProductId(350), t);
  void toItemMasterIdFromMaterial(asInventoryMaterialId(726), t);
  void inventoryMaterialIdOfItem(asItemMasterId(351), t);

  // @ts-expect-error 정체성 번호(BOM)를 생산 제품 칸에 — 2026-10-20 신규 회사 시험에서 난 실수의 반대 방향
  void selectBomVersion(asItemMasterId(352), t);
  // @ts-expect-error 생산 제품 번호를 정체성 칸에
  void toProductionProductId(asProductionProductId(350), t);
  // @ts-expect-error 재고 원료 번호를 정체성 칸에
  void inventoryMaterialIdOfItem(asInventoryMaterialId(726), t);
  // @ts-expect-error 이름표 없는 숫자 — 어느 표에서 읽었는지 경계에서 밝혀야 한다
  void selectBomVersion(350, t);
}
