import {mysqlTable,  bigint, varchar, text, date, timestamp, mysqlEnum, int} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';
import { users } from "../schema_main";

/**
 * 일반위생관리 체크리스트
 */
export const hygieneChecklists = mysqlTable("hygiene_checklists", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  
  // 기본 정보
  checkDate: date("check_date").notNull(), // 점검 일자
  inspector: varchar("inspector", { length: 100 }).notNull(), // 점검자
  confirmer: varchar("confirmer", { length: 100 }), // 확인자
  
  // 점검 항목 (예/아니오)
  // 주기/관리 섹션
  item1: mysqlEnum("item1", ["yes", "no"]), // 생산물 내부 옆은 상태는 양호한가?
  item2: mysqlEnum("item2", ["yes", "no"]), // 작업장 벽, 제조설비 청소·소독 상태는 양호한가?
  item3: mysqlEnum("item3", ["yes", "no"]), // 위생복 세탁은 실시하였는가?
  item4: mysqlEnum("item4", ["yes", "no"]), // 추가 항목 1
  item5: mysqlEnum("item5", ["yes", "no"]), // 추가 항목 2
  item6: mysqlEnum("item6", ["yes", "no"]), // 추가 항목 3
  item7: mysqlEnum("item7", ["yes", "no"]), // 추가 항목 4
  item8: mysqlEnum("item8", ["yes", "no"]), // 추가 항목 5
  item9: mysqlEnum("item9", ["yes", "no"]), // 추가 항목 6
  item10: mysqlEnum("item10", ["yes", "no"]), // 추가 항목 7
  
  // 특이사항
  specialNotes: text("special_notes"), // 특이사항
  
  // 개선조치 및 결과
  correctiveAction: text("corrective_action"), // 개선조치 및 결과
  
  // 확인
  confirmation: text("confirmation"), // 확인
  
  // 결재 상태
  approvalStatus: mysqlEnum("approval_status", ["draft", "pending_review", "approved", "rejected"]).default("draft"),
  
  // 메타데이터
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
