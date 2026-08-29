/**
 * ★ PR-PP (2026-05-28): 주간 생산계획표 (Weekly Production Plan)
 *
 * 미미스 프로토타입 기반 — 주 단위 카드로 7일 (월~일) 의 생산 행을 관리.
 *   - 한 행 = 한 SKU 생산 계획 (공정: 교반/증숙, 품목, 거래처, 수량, 인력, 비고)
 *   - 주당 작성자 + 주간 공지 + 일별 메모
 *   - JSON payload 로 days 배열을 통째로 저장 (스키마 진화 유연)
 *
 * 키 설계:
 *   - (tenant_id, week_monday) 유니크 — 주당 1 row.
 *   - week_monday 는 항상 월요일 자정 KST 기준 DATE.
 */
import { mysqlTable, int, date, json, varchar, text, timestamp, unique } from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main";

export interface ProductionPlanRow {
  proc: "교반" | "증숙";
  item: string;
  client: string;
  qty: string;     // 문자열로 보존 (입력값 그대로, 소수점/단위 자유)
  staff: string;
  note: string;
}

export interface ProductionPlanDay {
  rows: ProductionPlanRow[];
  notes: string;
}

export interface ProductionPlanPayload {
  days: ProductionPlanDay[]; // 길이 7 (월~일)
}

export const productionPlans = mysqlTable(
  "h_production_plans",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),
    weekMonday: date("week_monday").notNull(), // 해당 주의 월요일 (KST)
    payload: json("payload").notNull(),         // ProductionPlanPayload
    author: varchar("author", { length: 100 }).default(""),
    weeklyNotes: text("weekly_notes"),
    updatedBy: int("updated_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (t) => ({
    uqTenantWeek: unique("uq_tenant_week").on(t.tenantId, t.weekMonday),
  }),
);
