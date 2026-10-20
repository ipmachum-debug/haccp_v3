/**
 * 품목 번호의 종류 (2026-10-20, 번호 체계 2단계 — docs/architecture/11-identity-policy-v3.md)
 *
 * 같은 품목이 두 번호를 가진다:
 *   ItemMasterId        = item_master.id      — 정체성 (BOM·SKU·카탈로그·품목 목록)
 *   ProductionProductId = h_products_v2.id    — 수량 세계의 제품 (생산 건·완제품 LOT)
 *   InventoryMaterialId = h_materials.id      — 수량 세계의 원료 (투입·LOT·재고·원장)
 * 모두 숫자라서 서로 섞어 넘겨도 컴파일러가 몰랐다 (예: 생산 제품 번호를 BOM 제품 칸에, 2026-10-20 신규 회사 시험).
 * 아래 이름표 타입은 실행 때는 그냥 숫자이고, 컴파일 때만 종류가 다르면 막는다.
 * 숫자에 이름표를 붙이는 곳(as…)은 '이 숫자를 그 표에서 읽었다' 가 분명한 경계뿐이어야 한다 — 추측해서 붙이지 않는다.
 * 종류를 바꾸는 일(정체성 ↔ 수량)은 ItemIdentityService 의 FK(legacy_product_id·legacy_material_id) 변환만 한다.
 */
declare const itemIdKind: unique symbol;
type Branded<K extends string> = number & { readonly [itemIdKind]: K };

export type ItemMasterId = Branded<"ItemMasterId">;
export type ProductionProductId = Branded<"ProductionProductId">;
export type InventoryMaterialId = Branded<"InventoryMaterialId">;

/** item_master.id 를 읽은 자리에서만 */
export const asItemMasterId = (n: number | string) => Number(n) as ItemMasterId;
/** h_products_v2.id (생산 건 product_id 포함) 를 읽은 자리에서만 */
export const asProductionProductId = (n: number | string) => Number(n) as ProductionProductId;
/** h_materials.id (투입·LOT·재고 material_id 포함) 를 읽은 자리에서만 */
export const asInventoryMaterialId = (n: number | string) => Number(n) as InventoryMaterialId;
