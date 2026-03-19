// group 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { lt } from "drizzle-orm";

export const groupRouter = router({
    // 그룹 생성
    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1, "그룹 이름은 필수입니다"),
          description: z.string().optional(),
          groupType: z.enum(["department", "team", "project", "custom"]).default("custom")
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createGroup } = await import("../../db");
        const groupId = await createGroup({
          ...input,
          createdBy: ctx.user.id
        });
        return { success: true, groupId };
      }),

    // 그룹 목록 조회
    list: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getAllGroups } = await import("../../db");
      return await getAllGroups();
    }),

    // 그룹 정보 수정
    update: adminProcedure
      .input(
        z.object({
          groupId: z.number(),
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          groupType: z.enum(["department", "team", "project", "custom"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateGroup } = await import("../../db");
        const { groupId, ...data } = input;
        await updateGroup(groupId, data);
        return { success: true };
      }),

    // 그룹 삭제
    delete: adminProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteGroup } = await import("../../db");
        await deleteGroup(input.groupId);
        return { success: true };
      }),

    // 그룹에 멤버 추가
    addMember: adminProcedure
      .input(
        z.object({
          groupId: z.number(),
          userId: z.number(),
          role: z.enum(["member", "leader", "admin"]).default("member")
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { addGroupMember } = await import("../../db");
        await addGroupMember({ ...input, tenantId: ctx.tenantId ?? undefined });
        return { success: true };
      }),

    // 그룹에서 멤버 제거
    removeMember: adminProcedure
      .input(
        z.object({
          groupId: z.number(),
          userId: z.number()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { removeGroupMember } = await import("../../db");
        await removeGroupMember(input.groupId, input.userId);
        return { success: true };
      }),

    // 그룹 멤버 목록 조회
    getMembers: tenantRequiredProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getGroupMembers } = await import("../../db");
        return await getGroupMembers(input.groupId);
      }),

    // 사용자가 속한 그룹 목록 조회
    getUserGroups: tenantRequiredProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getUserGroups } = await import("../../db");
        return await getUserGroups(input.userId);
      })
});
