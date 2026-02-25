import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

describe("Excel Export", () => {
  let adminCaller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    // 관리자 컨텍스트 생성
    const adminContext: Context = {
      user: {
        id: 1,
        email: "admin@test.com",
        name: "Test Admin",
        role: "admin"
      },
      req: {} as any,
      res: {} as any
    };

    adminCaller = appRouter.createCaller(adminContext);
  });

  describe("배치 Excel 내보내기", () => {
    it("배치 데이터를 Excel 파일로 내보낼 수 있어야 함", async () => {
      const result = await adminCaller.excel.exportBatches({});

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("filename");
      expect(result.filename).toMatch(/batches_\d{4}-\d{2}-\d{2}\.xlsx/);
      expect(result.data).toBeTruthy();
      expect(typeof result.data).toBe("string");
    });
  });

  describe("재고 Excel 내보내기", () => {
    it("재고 데이터를 Excel 파일로 내보낼 수 있어야 함", async () => {
      const result = await adminCaller.excel.exportInventory();

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("filename");
      expect(result.filename).toMatch(/inventory_\d{4}-\d{2}-\d{2}\.xlsx/);
      expect(result.data).toBeTruthy();
      expect(typeof result.data).toBe("string");
    });
  });

  describe("Excel 템플릿 다운로드", () => {
    it("배치 템플릿을 다운로드할 수 있어야 함", async () => {
      const result = await adminCaller.excel.downloadBatchTemplate();

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("filename");
      expect(result.filename).toBe("batch_template.xlsx");
      expect(result.data).toBeTruthy();
      expect(typeof result.data).toBe("string");
    });

    it("재고 템플릿을 다운로드할 수 있어야 함", async () => {
      const result = await adminCaller.excel.downloadInventoryTemplate();

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("filename");
      expect(result.filename).toBe("inventory_template.xlsx");
      expect(result.data).toBeTruthy();
      expect(typeof result.data).toBe("string");
    });
  });

  describe("Base64 인코딩 검증", () => {
    it("내보낸 데이터가 유효한 Base64 문자열이어야 함", async () => {
      const result = await adminCaller.excel.exportBatches({});

      // Base64 디코딩 시도
      expect(() => {
        Buffer.from(result.data, "base64");
      }).not.toThrow();

      // 디코딩된 데이터가 비어있지 않아야 함
      const buffer = Buffer.from(result.data, "base64");
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
