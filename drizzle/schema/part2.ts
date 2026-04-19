/**
 * part2.ts - 배럴 파일 (하위 호환성 유지)
 *
 * v2-rebuild: 2,479줄 모놀리식 → 6개 도메인 파일로 분할
 *
 * 기존 import 그대로 동작:
 *   import { hInventory, hApprovalRequests } from "../drizzle/schema/part2";
 */

export * from "./part2_inventory";
export * from "./part2_hygiene";
export * from "./part2_workflow";
export * from "./part2_quality";
export * from "./part2_system";
export * from "./part2_misc";
