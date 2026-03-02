import { describe, it, expect, beforeAll } from "vitest";
import { generateMaterialCode, generateProductCode, generateSupplierCode } from "./db/codeGenerator";

describe("자동 코드 생성 테스트", () => {
  it("원재료 코드 생성 (MAT-XXX)", async () => {
    const code = await generateMaterialCode();
    expect(code).toMatch(/^MAT-\d{3}$/);
  });

  it("제품 코드 생성 (PRD-XXX)", async () => {
    const code = await generateProductCode();
    expect(code).toMatch(/^PRD-\d{3}$/);
  });

  it("공급업체 코드 생성 (SUP-XXX)", async () => {
    const code = await generateSupplierCode();
    expect(code).toMatch(/^SUP-\d{3}$/);
  });
});
