// @ts-nocheck
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { 
  checklistInstances, 
  checklistTemplates,
  checklistApprovals,
  checklistInstanceItems 
} from "../../../drizzle/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { storagePut } from "../../storage";
import { invokeLLM } from "../../_core/llm";
import { requireTenantId } from "../../helpers/tenantGuards";

import { todayKST, formatLocalDate} from "../../utils/timezone";

/**
 * 체크리스트 인스턴스 라우터
 * 실제 체크리스트 작성/제출/승인 로직
 * 
 * P0 FIX: 모든 쿼리에 tenantId 조건 추가
 */

export const checklistInstanceRouter = router({
  /**
   * 인스턴스 목록 조회
   */
  list: tenantRequiredProcedure
    .input(
      z.object({
        periodKey: z.string().optional(), // YYYY-MM-DD, YYYY-Www, YYYY-MM, YYYY
        status: z.enum(["pending", "in_progress", "completed", "pending_review", "approved", "rejected", "skipped", "cancelled"]).optional(),
        templateId: z.number().optional(),
        startDate: z.string().optional(), // YYYY-MM-DD
        endDate: z.string().optional(), // YYYY-MM-DD
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = requireTenantId(ctx);

      const conditions = [eq(checklistInstances.tenantId, tenantId)];

      if (input.periodKey) {
        conditions.push(eq(checklistInstances.periodKey, input.periodKey));
      }

      if (input.status) {
        conditions.push(eq(checklistInstances.status, input.status));
      }

      if (input.templateId) {
        conditions.push(eq(checklistInstances.templateId, input.templateId));
      }

      if (input.startDate) {
        conditions.push(gte(checklistInstances.targetDate, input.startDate));
      }

      if (input.endDate) {
        conditions.push(lte(checklistInstances.targetDate, input.endDate));
      }

      const instances = await db.query.checklistInstances.findMany({
        where: and(...conditions),
        orderBy: [desc(checklistInstances.targetDate)],
        with: {
          template: true,
        },
      });

      return instances;
    }),

  /**
   * 인스턴스 상세 조회
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = requireTenantId(ctx);

      const instance = await db.query.checklistInstances.findFirst({
        where: and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId)),
        with: {
          template: true,
          items: true,
          approvals: true,
        },
      });

      if (!instance) {
        throw new Error("인스턴스를 찾을 수 없습니다.");
      }

      return instance;
    }),

  /**
   * 인스턴스 생성 (수동)
   */
  create: tenantRequiredProcedure
    .input(
      z.object({
        templateId: z.number(),
        periodKey: z.string(), // YYYY-MM-DD, YYYY-Www, YYYY-MM, YYYY
        targetDate: z.string(), // YYYY-MM-DD
        dueDate: z.string().optional(),
        assignedTo: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 템플릿 존재 확인 (같은 테넌트의 것만)
      const template = await db.query.checklistTemplates.findFirst({
        where: and(eq(checklistTemplates.id, input.templateId), eq(checklistTemplates.tenantId, tenantId)),
      });

      if (!template) {
        throw new Error("템플릿을 찾을 수 없습니다.");
      }

      // 인스턴스 생성
      const [instance] = await db.insert(checklistInstances).values({
        tenantId,
        templateId: input.templateId,
        periodKey: input.periodKey,
        targetDate: input.targetDate,
        dueDate: input.dueDate || null,
        assignedTo: input.assignedTo || null,
        status: "pending",
        createdBy: ctx.user.id,
      });

      return {
        success: true,
        instanceId: instance.insertId,
      };
    }),

  /**
   * 인스턴스 업데이트 (작성 중)
   */
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.record(z.any()).optional(), // 체크리스트 데이터 (JSON)
        attachments: z.array(z.object({
          url: z.string(),
          key: z.string(),
          fileName: z.string(),
          mimeType: z.string(),
        })).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 인스턴스 존재 확인 (테넌트 격리)
      const instance = await db.query.checklistInstances.findFirst({
        where: and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId)),
      });

      if (!instance) {
        throw new Error("인스턴스를 찾을 수 없습니다.");
      }

      // 업데이트
      const updates: any = {
        status: "in_progress",
      };

      if (input.data !== undefined) {
        updates.data = input.data;
      }

      if (input.attachments !== undefined) {
        const attachmentsWithMeta = input.attachments.map(att => ({
          ...att,
          uploadedAt: new Date().toISOString(),
          uploadedBy: ctx.user.id,
        }));
        updates.attachments = attachmentsWithMeta;
      }

      await db.update(checklistInstances).set(updates).where(
        and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId))
      );

      return { success: true };
    }),

  /**
   * 첨부파일 업로드
   */
  uploadAttachment: tenantRequiredProcedure
    .input(
      z.object({
        instanceId: z.number(),
        file: z.object({
          name: z.string(),
          type: z.string(),
          data: z.string(), // base64
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 인스턴스 존재 확인 (테넌트 격리)
      const instance = await db.query.checklistInstances.findFirst({
        where: and(eq(checklistInstances.id, input.instanceId), eq(checklistInstances.tenantId, tenantId)),
      });

      if (!instance) {
        throw new Error("인스턴스를 찾을 수 없습니다.");
      }

      // base64 디코딩
      const buffer = Buffer.from(input.file.data, "base64");

      // S3 업로드
      const fileKey = `tenant-${tenantId}/checklist-attachments/${input.instanceId}/${Date.now()}-${input.file.name}`;
      const { url, key } = await storagePut(fileKey, buffer, input.file.type);

      // 기존 첨부파일에 추가
      const existingAttachments = (instance.attachments as any[]) || [];
      const newAttachment = {
        url,
        key,
        fileName: input.file.name,
        mimeType: input.file.type,
        uploadedAt: new Date().toISOString(),
        uploadedBy: ctx.user.id,
      };

      await db
        .update(checklistInstances)
        .set({
          attachments: [...existingAttachments, newAttachment],
        })
        .where(and(eq(checklistInstances.id, input.instanceId), eq(checklistInstances.tenantId, tenantId)));

      return {
        success: true,
        attachment: newAttachment,
      };
    }),

  /**
   * 인스턴스 제출
   */
  submit: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 인스턴스 존재 확인 (테넌트 격리)
      const instance = await db.query.checklistInstances.findFirst({
        where: and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId)),
        with: {
          template: true,
        },
      });

      if (!instance) {
        throw new Error("인스턴스를 찾을 수 없습니다.");
      }

      // 상태 업데이트
      const newStatus = instance.template.requiresApproval ? "pending_review" : "completed";

      await db
        .update(checklistInstances)
        .set({
          status: newStatus,
          completedAt: new Date().toISOString(),
          completedBy: ctx.user.id,
        })
        .where(and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId)));

      return { success: true, status: newStatus };
    }),

  /**
   * 인스턴스 승인
   */
  approve: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 인스턴스 존재 확인 (테넌트 격리)
      const instance = await db.query.checklistInstances.findFirst({
        where: and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId)),
      });

      if (!instance) {
        throw new Error("인스턴스를 찾을 수 없습니다.");
      }

      if (instance.status !== "pending_review") {
        throw new Error("승인 대기 상태가 아닙니다.");
      }

      // 승인 처리
      await db
        .update(checklistInstances)
        .set({
          status: "approved",
          reviewedAt: new Date().toISOString(),
          reviewedBy: ctx.user.id,
          reviewComments: input.comment || null,
        })
        .where(and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId)));

      // 승인 이력 기록
      await db.insert(checklistApprovals).values({
        instanceId: input.id,
        approverId: ctx.user.id,
        action: "APPROVE",
        comment: input.comment || null,
      });

      return { success: true };
    }),

  /**
   * 인스턴스 반려
   */
  reject: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        reason: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 인스턴스 존재 확인 (테넌트 격리)
      const instance = await db.query.checklistInstances.findFirst({
        where: and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId)),
      });

      if (!instance) {
        throw new Error("인스턴스를 찾을 수 없습니다.");
      }

      if (instance.status !== "pending_review") {
        throw new Error("승인 대기 상태가 아닙니다.");
      }

      // 반려 처리
      await db
        .update(checklistInstances)
        .set({
          status: "rejected",
          rejectedReason: input.reason,
          reviewedAt: new Date().toISOString(),
          reviewedBy: ctx.user.id,
        })
        .where(and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId)));

      // 승인 이력 기록
      await db.insert(checklistApprovals).values({
        instanceId: input.id,
        approverId: ctx.user.id,
        action: "REJECT",
        comment: input.reason,
      });

      return { success: true };
    }),

  /**
   * AI 자동 작성
   */
  generateWithAI: tenantRequiredProcedure
    .input(
      z.object({
        templateId: z.number(),
        periodKey: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 템플릿 조회 (테넌트 격리)
      const template = await db.query.checklistTemplates.findFirst({
        where: and(eq(checklistTemplates.id, input.templateId), eq(checklistTemplates.tenantId, tenantId)),
      });

      if (!template) {
        throw new Error("템플릿을 찾을 수 없습니다.");
      }

      // 기존 유사 기록 조회 (같은 템플릿, 최근 30일, 같은 테넌트)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentInstances = await db.query.checklistInstances.findMany({
        where: and(
          eq(checklistInstances.tenantId, tenantId),
          eq(checklistInstances.templateId, input.templateId),
          gte(checklistInstances.targetDate, formatLocalDate(thirtyDaysAgo)),
          eq(checklistInstances.status, "approved")
        ),
        orderBy: [desc(checklistInstances.targetDate)],
        limit: 5,
      });

      // LLM 프롬프트 생성
      let prompt = `다음 체크리스트 템플릿을 기반으로 자동으로 작성해주세요.

**템플릿 정보:**
- 이름: ${template.name}
- 설명: ${template.description || '없음'}
- 카테고리: ${template.category}
- 기간: ${input.periodKey}

`;

      if (recentInstances.length > 0) {
        prompt += `**최근 작성된 기록 (${recentInstances.length}건):**
`;
        recentInstances.forEach((instance: any, index: number) => {
          prompt += `
${index + 1}. 기간: ${instance.periodKey}
`;
          if (instance.data) {
            prompt += `   내용: ${JSON.stringify(instance.data, null, 2)}
`;
          }
        });
      }

      prompt += `
**요청 사항:**
1. 최근 기록을 참고하여 유사한 패턴으로 작성해주세요.
2. 현재 날짜는 ${todayKST()}입니다.
3. 현실적이고 구체적인 내용으로 작성해주세요.
4. JSON 형식으로 반환해주세요. (key-value 형태)

**출력 형식:**
\`\`\`json
{
  "field1": "value1",
  "field2": "value2",
  ...
}
\`\`\`
`;

      // LLM 호출
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "당신은 HACCP 식품 안전 관리 시스템의 체크리스트 작성 전문가입니다. 기존 기록을 분석하여 현실적이고 정확한 내용을 작성합니다.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = response.choices[0].message.content;

      // JSON 추출
      let generatedData: any = {};
      try {
        // content가 string인지 확인
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        const jsonMatch = contentStr.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          generatedData = JSON.parse(jsonMatch[1]);
        } else {
          generatedData = JSON.parse(contentStr);
        }
      } catch (error) {
        console.error("AI 응답 JSON 파싱 실패:", error);
        throw new Error("AI가 생성한 내용을 파싱할 수 없습니다.");
      }

      return {
        success: true,
        data: generatedData,
      };
    }),

  /**
   * 인스턴스 삭제
   */
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = requireTenantId(ctx);

      // 인스턴스 존재 확인 (테넌트 격리)
      const instance = await db.query.checklistInstances.findFirst({
        where: and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId)),
      });

      if (!instance) {
        throw new Error("인스턴스를 찾을 수 없습니다.");
      }

      await db.delete(checklistInstances).where(
        and(eq(checklistInstances.id, input.id), eq(checklistInstances.tenantId, tenantId))
      );

      return { success: true };
    }),
});
