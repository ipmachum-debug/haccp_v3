/**
 * 커뮤니케이션 로그 라우터 (확장 버전)
 * 거래처별 메모/커뮤니케이션 추적, 상태 관리, 댓글, 파일 첨부, 알림 API
 */

import { getDb } from "../db";
import { 
  communicationLogs,
  communicationLogComments,
  communicationLogFiles,
  communicationLogNotifications,
  users,
  partners,
} from "../../drizzle/schema/index";
import { eq, and, desc, asc, like, or, sql, gt } from "drizzle-orm";

/**
 * 커뮤니케이션 로그 생성
 */
export async function createCommunicationLog(data: {
  tenantId: number;
  partnerId: number;
  content: string;
  status?: string;
  authorId: number;
  mentions?: string;
}) {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");
    
    // 거래처 메모는 반드시 partner_id > 0이어야 함
    const partnerId = Number(data.partnerId);
    if (!partnerId || partnerId <= 0) {
      throw new Error("거래처 메모에는 거래처 선택이 필수입니다 (partner_id > 0)");
    }
    
    // Raw SQL로 log_type='partner' 포함해서 한 번에 삽입 (Drizzle 스키마에 log_type이 없으므로)
    try {
      const [result]: any = await db.execute(
        sql`INSERT INTO communication_logs (tenant_id, partner_id, content, status, author_id, mentions, log_type)
            VALUES (${data.tenantId}, ${partnerId}, ${data.content}, ${data.status || "received"}, ${data.authorId}, ${data.mentions || null}, 'partner')`
      );
      
      const insertId = Number(result?.insertId || 0);

      // 멘션된 사용자에게 알림 생성
      if (data.mentions) {
        try {
          const mentionedUserIds = JSON.parse(data.mentions);
          for (const userId of mentionedUserIds) {
            await db.insert(communicationLogNotifications).values({
              tenantId: data.tenantId,
              logId: insertId,
              userId: userId,
              type: "mention",
              message: `새로운 메모에서 멘션되었습니다`,
              isRead: false,
            });
          }
        } catch (e) {
          console.error("[createCommunicationLog] mentions parse error:", e);
        }
      }
      
      return insertId;
    } catch (rawError: any) {
      // log_type 컬럼이 없는 경우 fallback: Drizzle ORM insert + UPDATE
      console.error("[createCommunicationLog] raw insert failed, trying Drizzle fallback:", rawError.message);
      const [result] = await db.insert(communicationLogs).values({
        tenantId: data.tenantId,
        partnerId: partnerId,
        content: data.content,
        status: data.status || "received",
        authorId: data.authorId,
        mentions: data.mentions || null,
      } as any);
      
      try {
        await db.execute(sql.raw(`UPDATE communication_logs SET log_type = 'partner' WHERE id = ${Number(result.insertId)}`));
      } catch (e) {
        // log_type 컬럼이 없는 경우 무시
      }
      
      return result.insertId;
    }
  } catch (error) {
    console.error("[createCommunicationLog] Error:", error);
    throw error;
  }
}

/**
 * 커뮤니케이션 로그 목록 조회 (작성자 이름, 거래처명 포함)
 */
export async function getCommunicationLogs(filters: {
  tenantId: number;
  partnerId?: number;
  status?: string;
  authorId?: number;
  searchQuery?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  try {
    // Raw SQL로 JOIN 쿼리 실행 (작성자 이름 + 거래처명 포함)
    // 거래처 메모 탭: 거래처가 있는 메모만 (partner_id > 0) + 사내공지 제외
    let whereClause = `cl.tenant_id = ${Number(filters.tenantId)}`;
    
    // partner_id > 0: 실제 거래처가 있는 메모만 표시 (사내공지는 partner_id=0)
    whereClause += ` AND cl.partner_id > 0`;
    
    console.log("[getCommunicationLogs] tenantId =", filters.tenantId, "whereClause so far =", whereClause);
    
    if (filters.partnerId) {
      whereClause += ` AND cl.partner_id = ${Number(filters.partnerId)}`;
    }
    if (filters.status) {
      const safeStatus = filters.status.replace(/[^a-z_]/g, '');
      whereClause += ` AND cl.status = '${safeStatus}'`;
    }
    if (filters.authorId) {
      whereClause += ` AND cl.author_id = ${Number(filters.authorId)}`;
    }
    if (filters.searchQuery) {
      const safeQuery = filters.searchQuery.replace(/'/g, "''");
      whereClause += ` AND cl.content LIKE '%${safeQuery}%'`;
    }

    const sortBy = filters.sortBy === "updatedAt" ? "cl.updated_at" : "cl.created_at";
    const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";

    const rows = await db.execute(sql.raw(`
      SELECT 
        cl.id, cl.tenant_id as tenantId, cl.partner_id as partnerId, 
        cl.content, cl.status, cl.author_id as authorId, 
        cl.mentions, cl.created_at as createdAt, cl.updated_at as updatedAt,
        u.name as authorName,
        p.company_name as partnerName
      FROM communication_logs cl
      LEFT JOIN users u ON cl.author_id = u.id
      LEFT JOIN partners p ON cl.partner_id = p.id
      WHERE ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
    `));

    const result = rows[0] || [];
    console.log("[getCommunicationLogs] raw SQL returned", (result as unknown as any[]).length, "rows");
    return result;
  } catch (error) {
    console.error("[getCommunicationLogs] raw SQL Error:", error);
    // 폴백: 기본 쿼리 (partner_id > 0 조건 포함 - 거래처 메모만)
    console.log("[getCommunicationLogs] FALLBACK: using Drizzle ORM with gt(partnerId, 0)");
    const conditions: any[] = [
      eq(communicationLogs.tenantId, filters.tenantId),
      gt(communicationLogs.partnerId, 0),
    ];
    if (filters.partnerId) conditions.push(eq(communicationLogs.partnerId, filters.partnerId));
    if (filters.status) conditions.push(eq(communicationLogs.status, filters.status) as any);
    if (filters.authorId) conditions.push(eq(communicationLogs.authorId, filters.authorId));
    
    return await db.select().from(communicationLogs).where(and(...conditions)).orderBy(desc(communicationLogs.createdAt));
  }
}

/**
 * 커뮤니케이션 로그 상세 조회
 */
export async function getCommunicationLogById(logId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  try {
    const rows = await db.execute(sql.raw(`
      SELECT 
        cl.id, cl.tenant_id as tenantId, cl.partner_id as partnerId, 
        cl.content, cl.status, cl.author_id as authorId, 
        cl.mentions, cl.created_at as createdAt, cl.updated_at as updatedAt,
        u.name as authorName,
        p.company_name as partnerName
      FROM communication_logs cl
      LEFT JOIN users u ON cl.author_id = u.id
      LEFT JOIN partners p ON cl.partner_id = p.id
      WHERE cl.id = ${Number(logId)} AND cl.tenant_id = ${Number(tenantId)}
      LIMIT 1
    `));

    const result = rows[0] as unknown as any[];
    return result && result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[getCommunicationLogById] Error:", error);
    const [log] = await db
      .select()
      .from(communicationLogs)
      .where(and(eq(communicationLogs.id, logId), eq(communicationLogs.tenantId, tenantId)));
    return log;
  }
}

/**
 * 커뮤니케이션 로그 수정 (라우터에서 id, data, tenantId, authorId 형태로 호출)
 */
export async function updateCommunicationLog(
  id: number,
  data: { content?: string; status?: string; mentions?: string },
  tenantId: number,
  authorId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const setData: any = {};
  if (data.content !== undefined) setData.content = data.content;
  if (data.status !== undefined) setData.status = data.status;
  if (data.mentions !== undefined) setData.mentions = data.mentions;

  await db
    .update(communicationLogs)
    .set(setData)
    .where(
      and(
        eq(communicationLogs.id, id),
        eq(communicationLogs.tenantId, tenantId),
        eq(communicationLogs.authorId, authorId)
      )
    );

  return { success: true };
}

/**
 * 커뮤니케이션 로그 삭제
 */
export async function deleteCommunicationLog(logId: number, tenantId: number, authorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  // 관련 댓글, 파일, 알림도 삭제 (cascade가 안 될 경우 대비)
  try {
    await db.delete(communicationLogComments).where(and(eq(communicationLogComments.logId, logId), eq(communicationLogComments.tenantId, tenantId)));
    await db.delete(communicationLogFiles).where(and(eq(communicationLogFiles.logId, logId), eq(communicationLogFiles.tenantId, tenantId)));
    await db.delete(communicationLogNotifications).where(and(eq(communicationLogNotifications.logId, logId), eq(communicationLogNotifications.tenantId, tenantId)));
  } catch (e) {
    console.error("[deleteCommunicationLog] cascade cleanup error:", e);
  }

  await db
    .delete(communicationLogs)
    .where(
      and(
        eq(communicationLogs.id, logId),
        eq(communicationLogs.tenantId, tenantId),
        eq(communicationLogs.authorId, authorId)
      )
    );

  return { success: true };
}

/**
 * 커뮤니케이션 로그 상태 변경
 */
export async function updateCommunicationLogStatus(data: {
  id: number;
  tenantId: number;
  status: string;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  await db
    .update(communicationLogs)
    .set({ status: data.status })
    .where(and(eq(communicationLogs.id, data.id), eq(communicationLogs.tenantId, data.tenantId)));

  // 작성자에게 알림 생성
  try {
    const [log] = await db
      .select()
      .from(communicationLogs)
      .where(eq(communicationLogs.id, data.id));

    if (log && log.authorId !== data.userId) {
      const statusLabel = data.status === "received" ? "접수" : data.status === "in_progress" ? "진행중" : "처리완료";
      await db.insert(communicationLogNotifications).values({
        tenantId: data.tenantId,
        logId: data.id,
        userId: log.authorId,
        type: "status_change",
        message: `메모의 상태가 '${statusLabel}'로 변경되었습니다`,
        isRead: false,
      });
    }
  } catch (e) {
    console.error("[updateCommunicationLogStatus] notification error:", e);
  }

  return { success: true };
}

/**
 * 거래처별 통계
 */
export async function getCommunicationLogStats(partnerId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const stats = await db
    .select({
      status: communicationLogs.status,
      count: sql<number>`count(*)`,
    })
    .from(communicationLogs)
    .where(and(eq(communicationLogs.partnerId, partnerId), eq(communicationLogs.tenantId, tenantId)))
    .groupBy(communicationLogs.status);

  return stats;
}

/**
 * 댓글 생성
 */
export async function createComment(data: {
  tenantId: number;
  logId: number;
  content: string;
  authorId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const [result] = await db.insert(communicationLogComments).values({
    tenantId: data.tenantId,
    logId: data.logId,
    content: data.content,
    authorId: data.authorId,
  });

  // 로그 작성자에게 알림 생성
  try {
    const [log] = await db
      .select()
      .from(communicationLogs)
      .where(eq(communicationLogs.id, data.logId));

    if (log && log.authorId !== data.authorId) {
      await db.insert(communicationLogNotifications).values({
        tenantId: data.tenantId,
        logId: data.logId,
        userId: log.authorId,
        type: "comment",
        message: `새로운 댓글이 추가되었습니다`,
        isRead: false,
      });
    }
  } catch (e) {
    console.error("[createComment] notification error:", e);
  }

  return result.insertId;
}

/**
 * 댓글 목록 조회 (작성자 이름 포함)
 */
export async function getComments(logId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  try {
    const rows = await db.execute(sql.raw(`
      SELECT 
        c.id, c.tenant_id as tenantId, c.log_id as logId,
        c.content, c.author_id as authorId,
        c.created_at as createdAt, c.updated_at as updatedAt,
        u.name as authorName
      FROM communication_log_comments c
      LEFT JOIN users u ON c.author_id = u.id
      WHERE c.log_id = ${Number(logId)} AND c.tenant_id = ${Number(tenantId)}
      ORDER BY c.created_at ASC
    `));

    return rows[0] || [];
  } catch (error) {
    console.error("[getComments] Error:", error);
    return await db
      .select()
      .from(communicationLogComments)
      .where(and(eq(communicationLogComments.logId, logId), eq(communicationLogComments.tenantId, tenantId)))
      .orderBy(asc(communicationLogComments.createdAt));
  }
}

/**
 * 댓글 삭제
 */
export async function deleteComment(commentId: number, tenantId: number, authorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  await db
    .delete(communicationLogComments)
    .where(
      and(
        eq(communicationLogComments.id, commentId),
        eq(communicationLogComments.tenantId, tenantId),
        eq(communicationLogComments.authorId, authorId)
      )
    );

  return { success: true };
}

/**
 * 파일 첨부
 */
export async function attachFile(data: {
  tenantId: number;
  logId: number;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const [result] = await db.insert(communicationLogFiles).values(data);
  return result.insertId;
}

/**
 * 파일 목록 조회
 */
export async function getFiles(logId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  return await db
    .select()
    .from(communicationLogFiles)
    .where(and(eq(communicationLogFiles.logId, logId), eq(communicationLogFiles.tenantId, tenantId)));
}

/**
 * 파일 삭제
 */
export async function deleteFile(fileId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  await db
    .delete(communicationLogFiles)
    .where(and(eq(communicationLogFiles.id, fileId), eq(communicationLogFiles.tenantId, tenantId)));

  return { success: true };
}

/**
 * 알림 목록 조회
 */
export async function getNotifications(userId: number, tenantId: number, unreadOnly: boolean = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const conditions: any[] = [
    eq(communicationLogNotifications.userId, userId),
    eq(communicationLogNotifications.tenantId, tenantId),
  ];

  if (unreadOnly) {
    conditions.push(eq(communicationLogNotifications.isRead, false));
  }

  return await db
    .select()
    .from(communicationLogNotifications)
    .where(and(...conditions))
    .orderBy(desc(communicationLogNotifications.createdAt));
}

/**
 * 알림 읽음 처리
 */
export async function markNotificationAsRead(notificationId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  await db
    .update(communicationLogNotifications)
    .set({ isRead: true })
    .where(
      and(
        eq(communicationLogNotifications.id, notificationId),
        eq(communicationLogNotifications.tenantId, tenantId)
      )
    );

  return { success: true };
}

/**
 * 모든 알림 읽음 처리
 */
export async function markAllNotificationsAsRead(userId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  await db
    .update(communicationLogNotifications)
    .set({ isRead: true })
    .where(
      and(
        eq(communicationLogNotifications.userId, userId),
        eq(communicationLogNotifications.tenantId, tenantId),
        eq(communicationLogNotifications.isRead, false)
      )
    );

  return { success: true };
}
