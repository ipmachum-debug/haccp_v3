import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";
import * as db from "./db";

describe("Checklist Template System", () => {
  let templateId: number;
  let instanceId: number;

  const mockAdminContext: Context = {
    user: {
      id: 1,
      email: "admin@test.com",
      name: "Admin User",
      role: "admin"
    }
  };

  const mockWorkerContext: Context = {
    user: {
      id: 2,
      email: "worker@test.com",
      name: "Worker User",
      role: "worker"
    }
  };

  const adminCaller = appRouter.createCaller(mockAdminContext);
  const workerCaller = appRouter.createCaller(mockWorkerContext);

  describe("Template Management", () => {
    it("should create a checklist template with items", async () => {
      const template = await adminCaller.checklistTemplate.create({
        name: "CCP 온도 점검 템플릿",
        description: "CCP 온도 측정 및 기록 체크리스트",
        category: "CCP",
        ccpType: "CCP-2B",
        priority: 10,
        items: [
          {
            sortOrder: 1,
            itemText: "가열 시작 시간",
            inputType: "time",
            required: true,
            helpText: "가열 시작 시간을 기록하세요"
          },
          {
            sortOrder: 2,
            itemText: "목표 온도 (℃)",
            inputType: "temperature",
            required: true,
            validationRules: { min: 85, max: 100, unit: "℃" },
            defaultValue: "98"
          },
          {
            sortOrder: 3,
            itemText: "실제 온도 (℃)",
            inputType: "temperature",
            required: true,
            validationRules: { min: 85, max: 100, unit: "℃" }
          },
          {
            sortOrder: 4,
            itemText: "온도 기준 충족 여부",
            inputType: "checkbox",
            required: true
          },
          {
            sortOrder: 5,
            itemText: "특이사항",
            inputType: "text",
            required: false
          },
        ]
      });

      expect(template).toBeDefined();
      expect(template?.id).toBeGreaterThan(0);
      expect(template?.name).toBe("CCP 온도 점검 템플릿");
      expect(template?.items).toHaveLength(5);

      templateId = template?.id || 0;
    });

    it("should retrieve template by id", async () => {
      const template = await adminCaller.checklistTemplate.getById({
        id: templateId
      });

      expect(template).toBeDefined();
      expect(template.name).toBe("CCP 온도 점검 템플릿");
      expect(template.category).toBe("CCP");
      expect(template.ccpType).toBe("CCP-2B");
      expect(template.items).toHaveLength(5);
    });

    it("should list templates with filters", async () => {
      const templates = await adminCaller.checklistTemplate.list({
        category: "CCP",
        isActive: true
      });

      expect(templates).toBeDefined();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0].category).toBe("CCP");
    });

    it("should update template", async () => {
      const updated = await adminCaller.checklistTemplate.update({
        id: templateId,
        name: "CCP 온도 점검 템플릿 (수정됨)",
        priority: 20
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe("CCP 온도 점검 템플릿 (수정됨)");
      expect(updated?.priority).toBe(20);
    });

    it("should duplicate template", async () => {
      const duplicated = await adminCaller.checklistTemplate.duplicate({
        id: templateId,
        newName: "CCP 온도 점검 템플릿 (복사본)"
      });

      expect(duplicated).toBeDefined();
      expect(duplicated?.id).not.toBe(templateId);
      expect(duplicated?.name).toBe("CCP 온도 점검 템플릿 (복사본)");
      expect(duplicated?.items).toHaveLength(5);
    });
  });

  describe("Checklist Instance", () => {
    it("should create checklist instance from template", async () => {
      const result = await workerCaller.checklistInstance.create({
        templateId,
        batchId: 1,
        scheduledDate: "2026-01-20 08:00:00",
        dueDate: "2026-01-20 18:00:00"
      });

      expect(result).toBeDefined();
      expect(result.instanceId).toBeGreaterThan(0);

      instanceId = result.instanceId;
    });

    it("should retrieve checklist instance with items", async () => {
      const instance = await workerCaller.checklistInstance.getById({
        id: instanceId
      });

      expect(instance).toBeDefined();
      expect(instance.templateId).toBe(templateId);
      expect(instance.batchId).toBe(1);
      expect(instance.status).toBe("pending");
      expect(instance.items).toHaveLength(5);
    });

    it("should update checklist instance item", async () => {
      const instance = await workerCaller.checklistInstance.getById({
        id: instanceId
      });

      const firstItem = instance.items[0];

      const result = await workerCaller.checklistInstance.updateItem({
        itemId: firstItem.id,
        value: "08:30",
        isCompleted: true
      });

      expect(result.success).toBe(true);
    });

    it("should complete checklist instance", async () => {
      // 모든 항목 완료 처리
      const instance = await workerCaller.checklistInstance.getById({
        id: instanceId
      });

      for (const item of instance.items) {
        await workerCaller.checklistInstance.updateItem({
          itemId: item.id,
          value: item.inputType === "checkbox" ? "true" : "98",
          isCompleted: true
        });
      }

      // 인스턴스 완료
      const result = await workerCaller.checklistInstance.complete({
        instanceId
      });

      expect(result.success).toBe(true);

      // 완료 상태 확인
      const completedInstance = await workerCaller.checklistInstance.getById({
        id: instanceId
      });

      expect(completedInstance.status).toBe("completed");
      expect(completedInstance.completedBy).toBe(2);
    });

    it("should retrieve checklists by batch", async () => {
      const checklists = await workerCaller.checklistInstance.getByBatch({
        batchId: 1
      });

      expect(checklists).toBeDefined();
      expect(Array.isArray(checklists)).toBe(true);
      expect(checklists.length).toBeGreaterThan(0);
    });
  });

  describe("Template Deletion", () => {
    it("should delete (deactivate) template", async () => {
      const result = await adminCaller.checklistTemplate.delete({
        id: templateId
      });

      expect(result.success).toBe(true);

      const template = await adminCaller.checklistTemplate.getById({
        id: templateId
      });

      expect(template.isActive).toBe(0);
    });
  });
});
