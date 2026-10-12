import { describe, it, expect } from "vitest";
import { isFkViolation, translateFkError } from "./utils/fkError";

describe("fkError", () => {
  it("1451 (부모 삭제 차단) → 삭제 불가 메시지, 제약명으로 라벨", () => {
    const e = Object.assign(new Error("x"), { errno: 1451, code: "ER_ROW_IS_REFERENCED_2",
      sqlMessage: "Cannot delete or update a parent row: a foreign key constraint fails (`db`.`h_inventory_transactions`, CONSTRAINT `fk_tx_lot` FOREIGN KEY (`lot_id`) REFERENCES `h_inventory_lots` (`id`))" });
    expect(isFkViolation(e)).toBe(true);
    const t = translateFkError(e, "LOT") as Error;
    expect(t.message).toContain("삭제할 수 없습니다");
    expect(t.message).toContain("LOT 기준");
  });

  it("1452 (없는 부모) → 네임스페이스 안내", () => {
    const e = Object.assign(new Error("x"), { errno: 1452, sqlMessage: "... CONSTRAINT `fk_mf_reports_item` FOREIGN KEY ..." });
    const t = translateFkError(e, "품목제조보고") as Error;
    expect(t.message).toContain("존재하지 않습니다");
    expect(t.message).toContain("품목");
  });

  it("FK 위반이 아니면 원래 에러 그대로", () => {
    const e = new Error("other");
    expect(translateFkError(e)).toBe(e);
    expect(isFkViolation(null)).toBe(false);
  });
});
