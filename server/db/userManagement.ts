import { eq, inArray } from "drizzle-orm";
import { getDb } from "./connection";
import { InsertUser, users } from "../../drizzle/schema";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.email) {
    throw new Error("User email is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: any = {
      email: user.email,
      passwordHash: user.passwordHash || "",
      name: user.name || null
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastLoginAt !== undefined) {
      values.lastLoginAt = user.lastLoginAt;
      updateSet.lastLoginAt = user.lastLoginAt;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }
    if (user.siteId !== undefined) {
      values.siteId = user.siteId;
      updateSet.siteId = user.siteId;
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastLoginAt = new Date();
    }

    await db.insert(users).values(values as any).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUsersByRole(role: "admin" | "worker" | "inspector" | "user" | "audit") {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get users: database not available");
    return [];
  }

  const result = await db.select().from(users).where(eq(users.role, role as any));

  return result;
}

export async function createUser(user: {
  email: string;
  passwordHash: string;
  name?: string;
  role?: "user" | "admin" | "super_admin";
  siteId?: number;
  isActive?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(users).values(user as any);
}

export async function updateUserLastLogin(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId));
}

export async function getAllUsers(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    approvalStatus: users.approvalStatus,
    isActive: users.isActive,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
    tenantId: users.tenantId
  }).from(users);

  // tenant_id 필터링 (제공된 경우)
  if (tenantId !== undefined) {
    query = query.where(eq(users.tenantId, tenantId)) as any;
  }

  return await query.orderBy(users.createdAt);
}

export async function updateUserRole(userId: number, role: "admin" | "worker" | "monitor" | "employee") {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({ role: role })
    .where(eq(users.id, userId));
}

export async function approveUser(userId: number, role: "admin" | "worker" | "monitor") {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({
      approvalStatus: "approved",
      isActive: 1,
      role: role
    })
    .where(eq(users.id, userId));
}

export async function toggleUserActive(userId: number, isActive: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({ isActive: isActive ? 1 : 0 })
    .where(eq(users.id, userId));
}

export async function batchApproveUsers(userIds: number[], role: "admin" | "worker" | "monitor") {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({
      approvalStatus: "approved",
      isActive: 1,
      role: role
    })
    .where(inArray(users.id, userIds));
}

export async function rejectUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({
      approvalStatus: "rejected",
      isActive: 0
    })
    .where(eq(users.id, userId));
}

export async function batchRejectUsers(userIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(users)
    .set({
      approvalStatus: "rejected",
      isActive: 0
    })
    .where(inArray(users.id, userIds));
}

export async function inviteUser(email: string, name: string, role: "admin" | "worker" | "monitor", invitedBy: number, userMemo?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 기본 비밀번호 생성 (임시 비밀번호)
  const bcrypt = await import("bcrypt");
  const tempPassword = Math.random().toString(36).slice(-8);
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const [newUser] = await db.insert(users).values({
    email,
    passwordHash,
    name,
    role,
    approvalStatus: "approved",
    isActive: 1,
    invitedBy,
    invitedAt: new Date(),
    userMemo
  });

  return { userId: Number(newUser.insertId), tempPassword };
}

// 사용자 삭제
export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(users).where(eq(users.id, userId));
  return { success: true };
}
