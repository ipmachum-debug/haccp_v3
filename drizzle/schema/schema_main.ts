/**
 * schema_main.ts - 배럴 파일 (하위 호환성 유지)
 *
 * v2-rebuild: 1,931줄 모놀리식 → 8개 도메인 파일로 분할
 *
 * 기존 import 그대로 동작:
 *   import { tenants, users, hBatches } from "../../drizzle/schema/schema_main";
 *
 * 도메인별 import (권장):
 *   import { tenants, users } from "../../drizzle/schema/schema_main_core";
 *   import { hBatches } from "../../drizzle/schema/schema_main_batch";
 */

export * from "./schema_main_core";
export * from "./schema_main_products";
export * from "./schema_main_recipes";
export * from "./schema_main_batch";
export * from "./schema_main_ccp";
export * from "./schema_main_haccpChecklist";
export * from "./schema_main_accounting";
export * from "./schema_main_system";
