/**
 * 배치 처리 방식(mode) 계약 — 일괄 생성의 행별 수동/자동이 저장까지 이어짐 (지티 QA B02, 2026-10-18)
 *   bulkCreateForDay → createSingleBatch({ mode }) → createBatch({ mode }) → h_batches.mode.
 *   이전엔 createSingleBatch 가 createBatch 에 mode 를 넘기지 않아 수동 행이 auto 로 저장됐다 (요청 제목만 [수동]).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("batch mode 계약", () => {
  it("createSingleBatch 가 createBatch 에 mode 를 넘긴다", () => {
    const src = readFileSync(join(__dirname, "services/batchOrchestrator.ts"), "utf-8");
    const call = src.slice(src.indexOf("batchId = await createBatch({"), src.indexOf("});", src.indexOf("batchId = await createBatch({")));
    expect(call).toMatch(/mode: input\.mode/);
  });
  it("일괄 생성은 행별 mode 를 createSingleBatch 에 넘긴다", () => {
    const src = readFileSync(join(__dirname, "routers/production/batch.crud.router.ts"), "utf-8");
    expect(src).toMatch(/const mode = item\.mode \?\? input\.defaultMode;[\s\S]{0,1500}?\n\s+mode,\n/);
  });
});
