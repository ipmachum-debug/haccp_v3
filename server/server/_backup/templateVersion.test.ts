import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { users, checklistTemplates, checklistTemplateItems } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

describe("Template Version Management & AI Suggestions", () => {
  let caller: any;
  let testUserId: number;
  let testTemplateId: number;
  let testItemId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // 테스트 사용자 생성
    const hashedPassword = await bcrypt.hash("testpass123", 10);
    const [user] = await db
      .insert(users)
      .values({
        email: "template-test@example.com",
        passwordHash: hashedPassword,
        name: "Template Test User",
        role: "admin",
        isActive: 1
      })
      .$returningId();

    testUserId = user.id;

    // 테스트 템플릿 생성
    const [template] = await db
      .insert(checklistTemplates)
      .values({
        name: "테스트 템플릿",
        description: "버전 관리 테스트용 템플릿",
        category: "QUALITY",
        priority: 1,
        isActive: 1,
        createdBy: testUserId
      })
      .$returningId();

    testTemplateId = template.id;

    // 테스트 항목 생성
    const [item] = await db
      .insert(checklistTemplateItems)
      .values({
        templateId: testTemplateId,
        label: "온도 측정",
        itemType: "number",
        isRequired: 1,
        sortOrder: 1
      })
      .$returningId();

    testItemId = item.id;

    // tRPC caller 생성
    caller = appRouter.createCaller({
      user: {
        id: testUserId,
        email: "template-test@example.com",
        name: "Template Test User",
        role: "admin"
      }
    });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // 테스트 데이터 정리
    await db.delete(checklistTemplateItems).where(eq(checklistTemplateItems.templateId, testTemplateId));
    await db.delete(checklistTemplates).where(eq(checklistTemplates.id, testTemplateId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe("Template Version Management", () => {
    it("템플릿 버전 생성", async () => {
      const result = await caller.qualityChecklist.createTemplateVersion({
        templateId: testTemplateId,
        changeDescription: "초기 버전 생성"
      });

      expect(result.success).toBe(true);
      expect(result.version).toMatch(/^\d+\.\d+$/);
    });

    it("템플릿 버전 이력 조회", async () => {
      const result = await caller.qualityChecklist.getTemplateVersions({
        templateId: testTemplateId
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty("version");
      expect(result[0]).toHaveProperty("changeDescription");
    });

    it("템플릿 버전 롤백", async () => {
      // 먼저 버전 생성
      await caller.qualityChecklist.createTemplateVersion({
        templateId: testTemplateId,
        changeDescription: "두 번째 버전"
      });

      // 버전 목록 조회
      const versions = await caller.qualityChecklist.getTemplateVersions({
        templateId: testTemplateId
      });

      expect(versions.length).toBeGreaterThanOrEqual(2);

      // 첫 번째 버전으로 롤백
      const firstVersion = versions[versions.length - 1];
      const result = await caller.qualityChecklist.rollbackToVersion({
        versionId: firstVersion.id
      });

      expect(result.message).toContain("롤백되었습니다");
    });
  });

  describe("AI-based Suggestions", () => {
    it("체크리스트 항목 자동 완성 제안 조회", async () => {
      const result = await caller.qualityChecklist.getSuggestions({
        templateId: testTemplateId,
        itemId: testItemId,
        limit: 5
      });

      expect(result).toHaveProperty("suggestions");
      expect(result).toHaveProperty("message");
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it("체크리스트 전체 자동 완성 제안 조회", async () => {
      const result = await caller.qualityChecklist.getInstanceSuggestions({
        templateId: testTemplateId
      });

      expect(result).toHaveProperty("suggestions");
      expect(result).toHaveProperty("message");
      expect(typeof result.suggestions).toBe("object");
    });
  });
});
