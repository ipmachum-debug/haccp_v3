/**
 * support.router.ts - 문의 게시판 API
 * 비밀글 기본 + 슈퍼관리자 전체 조회 + 비밀번호 검증 조회/수정
 */
import { publicProcedure, superAdminProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, like, or, sql } from "drizzle-orm";
import { supportTickets } from "../../../drizzle/schema";
import { getDb } from "../../db";
import bcrypt from "bcryptjs";

export const supportRouter = router({
  // ─── 공개: 문의 목록 (공개 글만, 비밀글은 제목 마스킹) ───
  list: publicProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(50).default(10),
      category: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const { page = 1, limit = 10, category, search } = input ?? {};
      const offset = (page - 1) * limit;

      // 공개/비공개 모두 가져오되, 비공개 글은 마스킹 처리
      const conditions: any[] = [];
      if (category && category !== "all") {
        conditions.push(eq(supportTickets.category, category as any));
      }
      if (search) {
        conditions.push(
          or(
            like(supportTickets.subject, `%${search}%`),
            like(supportTickets.content, `%${search}%`),
            like(supportTickets.authorName, `%${search}%`)
          )!
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        db.select({
          id: supportTickets.id,
          authorName: supportTickets.authorName,
          companyName: supportTickets.companyName,
          category: supportTickets.category,
          subject: supportTickets.subject,
          status: supportTickets.status,
          isPublic: supportTickets.isPublic,
          viewCount: supportTickets.viewCount,
          hasReply: sql<number>`CASE WHEN ${supportTickets.reply} IS NOT NULL THEN 1 ELSE 0 END`,
          createdAt: supportTickets.createdAt,
        })
          .from(supportTickets)
          .where(whereClause)
          .orderBy(desc(supportTickets.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(supportTickets)
          .where(whereClause),
      ]);

      // 비공개 글은 제목/작성자 마스킹
      const maskedItems = items.map(item => {
        if (item.isPublic === 0) {
          return {
            ...item,
            subject: "🔒 비밀글입니다",
            authorName: item.authorName.charAt(0) + "**",
            companyName: item.companyName ? item.companyName.charAt(0) + "**" : null,
          };
        }
        return item;
      });

      return {
        items: maskedItems,
        total: countResult[0]?.count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
      };
    }),

  // ─── 공개: 문의 상세 조회 (공개글만 / 비밀글은 비밀번호 필요) ───
  detail: publicProcedure
    .input(z.object({ 
      id: z.number(),
      password: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [ticket] = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id));

      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "문의를 찾을 수 없습니다." });
      }

      // 비공개 글인 경우 비밀번호 검증 필요
      if (ticket.isPublic === 0) {
        if (!input.password) {
          throw new TRPCError({ 
            code: "FORBIDDEN", 
            message: "비밀글입니다. 비밀번호를 입력해주세요.",
          });
        }
        if (!ticket.password) {
          throw new TRPCError({ 
            code: "FORBIDDEN", 
            message: "비밀번호가 설정되지 않은 비밀글입니다. 관리자에게 문의하세요.",
          });
        }
        const isValid = await bcrypt.compare(input.password, ticket.password);
        if (!isValid) {
          throw new TRPCError({ 
            code: "FORBIDDEN", 
            message: "비밀번호가 일치하지 않습니다.",
          });
        }
      }

      // 조회수 증가
      await db.update(supportTickets)
        .set({ viewCount: sql`${supportTickets.viewCount} + 1` })
        .where(eq(supportTickets.id, input.id));

      // 비밀번호는 제거하고 반환
      const { password, ...rest } = ticket;
      return rest;
    }),

  // ─── 공개: 문의 작성 (기본 비밀글) ───
  create: publicProcedure
    .input(z.object({
      authorName: z.string().min(1, "이름을 입력해주세요"),
      authorEmail: z.string().email("올바른 이메일을 입력해주세요"),
      authorPhone: z.string().optional(),
      companyName: z.string().optional(),
      category: z.enum(["general", "pricing", "technical", "demo", "partnership", "bug", "feature", "other"]),
      subject: z.string().min(1, "제목을 입력해주세요"),
      content: z.string().min(1, "내용을 입력해주세요"),
      isPublic: z.boolean().default(false),  // ✨ 기본 비밀글
      password: z.string().min(4, "비밀번호는 최소 4자 이상이어야 합니다").optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // 비밀글이면 비밀번호 필수
      if (!input.isPublic && !input.password) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "비밀글 작성 시 비밀번호를 입력해주세요.",
        });
      }

      // 비밀번호 해싱
      let hashedPassword: string | null = null;
      if (input.password) {
        hashedPassword = await bcrypt.hash(input.password, 10);
      }

      const [result] = await db.insert(supportTickets).values({
        authorName: input.authorName,
        authorEmail: input.authorEmail,
        authorPhone: input.authorPhone ?? null,
        companyName: input.companyName ?? null,
        category: input.category,
        subject: input.subject,
        content: input.content,
        isPublic: input.isPublic ? 1 : 0,
        password: hashedPassword,
        status: "open",
      });

      return { id: result.insertId, message: "문의가 등록되었습니다." };
    }),

  // ─── 공개: 비밀번호 검증 (비밀글 열람/수정 전 확인) ───
  verifyPassword: publicProcedure
    .input(z.object({
      id: z.number(),
      password: z.string().min(1, "비밀번호를 입력해주세요"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [ticket] = await db.select({
        id: supportTickets.id,
        password: supportTickets.password,
        isPublic: supportTickets.isPublic,
      })
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id));

      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "문의를 찾을 수 없습니다." });
      }

      if (ticket.isPublic === 1) {
        return { verified: true };
      }

      if (!ticket.password) {
        throw new TRPCError({ code: "FORBIDDEN", message: "비밀번호가 설정되지 않은 글입니다." });
      }

      const isValid = await bcrypt.compare(input.password, ticket.password);
      if (!isValid) {
        throw new TRPCError({ code: "FORBIDDEN", message: "비밀번호가 일치하지 않습니다." });
      }

      return { verified: true };
    }),

  // ─── 공개: 문의 수정 (비밀번호 검증 후) ───
  update: publicProcedure
    .input(z.object({
      id: z.number(),
      password: z.string().min(1, "비밀번호를 입력해주세요"),
      subject: z.string().min(1, "제목을 입력해주세요").optional(),
      content: z.string().min(1, "내용을 입력해주세요").optional(),
      category: z.enum(["general", "pricing", "technical", "demo", "partnership", "bug", "feature", "other"]).optional(),
      isPublic: z.boolean().optional(),
      newPassword: z.string().min(4, "비밀번호는 최소 4자 이상이어야 합니다").optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [ticket] = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id));

      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "문의를 찾을 수 없습니다." });
      }

      // 비밀번호 검증 (비밀글이든 공개글이든 수정 시 비밀번호 필요)
      if (!ticket.password) {
        throw new TRPCError({ code: "FORBIDDEN", message: "비밀번호가 설정되지 않은 글은 수정할 수 없습니다." });
      }

      const isValid = await bcrypt.compare(input.password, ticket.password);
      if (!isValid) {
        throw new TRPCError({ code: "FORBIDDEN", message: "비밀번호가 일치하지 않습니다." });
      }

      // 수정할 필드만 업데이트
      const updateData: any = {};
      if (input.subject !== undefined) updateData.subject = input.subject;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.isPublic !== undefined) updateData.isPublic = input.isPublic ? 1 : 0;
      if (input.newPassword) {
        updateData.password = await bcrypt.hash(input.newPassword, 10);
      }

      if (Object.keys(updateData).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "수정할 내용이 없습니다." });
      }

      await db.update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, input.id));

      return { message: "문의가 수정되었습니다." };
    }),

  // ─── 슈퍼관리자: 전체 문의 목록 (비밀글 포함, 마스킹 없음) ───
  adminList: superAdminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(50).default(20),
      status: z.string().optional(),
      category: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const { page = 1, limit = 20, status, category, search } = input ?? {};
      const offset = (page - 1) * limit;

      const conditions: any[] = [];
      if (status && status !== "all") {
        conditions.push(eq(supportTickets.status, status as any));
      }
      if (category && category !== "all") {
        conditions.push(eq(supportTickets.category, category as any));
      }
      if (search) {
        conditions.push(
          or(
            like(supportTickets.subject, `%${search}%`),
            like(supportTickets.authorName, `%${search}%`),
            like(supportTickets.authorEmail, `%${search}%`)
          )!
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        db.select()
          .from(supportTickets)
          .where(whereClause)
          .orderBy(desc(supportTickets.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(supportTickets)
          .where(whereClause),
      ]);

      return {
        items: items.map(({ password, ...rest }) => rest),
        total: countResult[0]?.count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
      };
    }),

  // ─── 슈퍼관리자: 문의 상세 (비밀글도 비밀번호 없이 조회) ───
  adminDetail: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [ticket] = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id));

      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "문의를 찾을 수 없습니다." });
      }

      // 조회수 증가
      await db.update(supportTickets)
        .set({ viewCount: sql`${supportTickets.viewCount} + 1` })
        .where(eq(supportTickets.id, input.id));

      const { password, ...rest } = ticket;
      return rest;
    }),

  // ─── 슈퍼관리자: 답변 작성 ───
  reply: superAdminProcedure
    .input(z.object({
      id: z.number(),
      reply: z.string().min(1, "답변을 입력해주세요"),
      status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      await db.update(supportTickets)
        .set({
          reply: input.reply,
          repliedAt: new Date(),
          repliedBy: ctx.user.name || ctx.user.email,
          status: input.status ?? "resolved",
        })
        .where(eq(supportTickets.id, input.id));

      return { message: "답변이 등록되었습니다." };
    }),

  // ─── 슈퍼관리자: 상태 변경 ───
  updateStatus: superAdminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["open", "in_progress", "resolved", "closed"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(supportTickets)
        .set({ status: input.status })
        .where(eq(supportTickets.id, input.id));
      return { message: "상태가 변경되었습니다." };
    }),

  // ─── 슈퍼관리자: 문의 수정 (비밀번호 없이 수정) ───
  adminUpdate: superAdminProcedure
    .input(z.object({
      id: z.number(),
      subject: z.string().min(1).optional(),
      content: z.string().min(1).optional(),
      category: z.enum(["general", "pricing", "technical", "demo", "partnership", "bug", "feature", "other"]).optional(),
      isPublic: z.boolean().optional(),
      status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [ticket] = await db.select({ id: supportTickets.id })
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id));

      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "문의를 찾을 수 없습니다." });
      }

      const updateData: any = {};
      if (input.subject !== undefined) updateData.subject = input.subject;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.isPublic !== undefined) updateData.isPublic = input.isPublic ? 1 : 0;
      if (input.status !== undefined) updateData.status = input.status;

      if (Object.keys(updateData).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "수정할 내용이 없습니다." });
      }

      await db.update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, input.id));

      return { message: "문의가 수정되었습니다." };
    }),

  // ─── 슈퍼관리자: 문의 삭제 ───
  adminDelete: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(supportTickets)
        .where(eq(supportTickets.id, input.id));
      return { message: "문의가 삭제되었습니다." };
    }),
});
