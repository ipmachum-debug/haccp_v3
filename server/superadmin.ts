/**
 * 슈퍼관리자 REST API
 * 
 * ✅ 보안 강화: JWT 기반 인증 미들웨어 사용
 * ✅ requireTenantAuth로 인증 후 super_admin 역할 검증
 * ✅ getDb() 사용 (시스템 전역 테이블이므로 TenantDb 불필요)
 */
import { Router } from "express";
import { getDb } from "./db";
import { users, tenants } from "../drizzle/schema_main";
import { auditLogs } from "../drizzle/schema/audit";
import { eq, desc, count, sql } from "drizzle-orm";
import { verifyToken } from "./_core/jwtAuth";
import { getUserById } from "./localAuth";
import { COOKIE_NAME } from "../shared/const";

const router = Router();

/**
 * 슈퍼관리자 인증 미들웨어
 * JWT 쿠키에서 사용자를 인증하고 super_admin 역할을 확인
 */
const requireSuperAdmin = async (req: any, res: any, next: any) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: "인증이 필요합니다." });
    }

    const payload = await verifyToken(token);
    if (!payload || !payload.userId) {
      return res.status(401).json({ error: "유효하지 않은 인증 토큰입니다." });
    }

    const dbUser = await getUserById(payload.userId);
    if (!dbUser) {
      return res.status(401).json({ error: "사용자를 찾을 수 없습니다." });
    }

    if (dbUser.role !== "super_admin") {
      return res.status(403).json({ error: "슈퍼관리자 권한이 필요합니다" });
    }

    // req.user에 인증된 사용자 정보 주입
    req.user = dbUser;
    next();
  } catch (error) {
    console.error("[SuperAdmin Auth] Error:", error);
    return res.status(500).json({ error: "인증 처리 중 오류가 발생했습니다." });
  }
};

// 모든 라우트에 슈퍼관리자 권한 필수
router.use(requireSuperAdmin);

// ============================================
// 사용자 승인 API
// ============================================

// 대기 중인 사용자 목록 조회
router.get("/users/pending", async (req, res) => {
  try {
    const db = await getDb();
    const pendingUsers = await db
      .select()
      .from(users)
      .where(eq(users.approvalStatus, "pending"))
      .orderBy(desc(users.createdAt));

    res.json(pendingUsers);
  } catch (error) {
    console.error("대기 중인 사용자 조회 오류:", error);
    res.status(500).json({ error: "사용자 목록 조회 실패" });
  }
});

// 사용자 승인
router.post("/users/:userId/approve", async (req, res) => {
  try {
    const db = await getDb();
    const { userId } = req.params;
    const { role } = req.body;

    await db
      .update(users)
      .set({ 
        approvalStatus: "approved",
        role: role || "worker",
        updatedAt: new Date()
      })
      .where(eq(users.id, parseInt(userId)));

    // 감사 로그 기록
    await db.insert(auditLogs).values({
      userId: (req as any).user.id,
      action: "USER_APPROVED",
      entityType: "user",
      entityId: userId,
      details: JSON.stringify({ role }),
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null
    });

    res.json({ success: true, message: "사용자가 승인되었습니다" });
  } catch (error) {
    console.error("사용자 승인 오류:", error);
    res.status(500).json({ error: "사용자 승인 실패" });
  }
});

// 사용자 거부
router.post("/users/:userId/reject", async (req, res) => {
  try {
    const db = await getDb();
    const { userId } = req.params;
    const { reason } = req.body;

    await db
      .delete(users)
      .where(eq(users.id, parseInt(userId)));

    // 감사 로그 기록
    await db.insert(auditLogs).values({
      userId: (req as any).user.id,
      action: "USER_REJECTED",
      entityType: "user",
      entityId: userId,
      details: JSON.stringify({ reason }),
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null
    });

    res.json({ success: true, message: "사용자가 거부되었습니다" });
  } catch (error) {
    console.error("사용자 거부 오류:", error);
    res.status(500).json({ error: "사용자 거부 실패" });
  }
});

// ============================================
// 테넌트 관리 API
// ============================================

// 테넌트 목록 조회
router.get("/tenants", async (req, res) => {
  try {
    const db = await getDb();
    const tenantList = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        createdAt: tenants.createdAt,
        userCount: sql<number>`(SELECT COUNT(*) FROM ${users} WHERE ${users.tenantId} = ${tenants.id})`
      })
      .from(tenants)
      .orderBy(desc(tenants.createdAt));

    res.json(tenantList);
  } catch (error) {
    console.error("테넌트 목록 조회 오류:", error);
    res.status(500).json({ error: "테넌트 목록 조회 실패" });
  }
});

// 테넌트 상세 정보 조회
router.get("/tenants/:tenantId", async (req, res) => {
  try {
    const db = await getDb();
    const { tenantId } = req.params;

    const tenant = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, parseInt(tenantId)))
      .limit(1);

    if (tenant.length === 0) {
      return res.status(404).json({ error: "테넌트를 찾을 수 없습니다" });
    }

    const tenantUsers = await db
      .select()
      .from(users)
      .where(eq(users.tenantId, parseInt(tenantId)));

    res.json({
      tenant: tenant[0],
      users: tenantUsers
    });
  } catch (error) {
    console.error("테넌트 상세 조회 오류:", error);
    res.status(500).json({ error: "테넌트 상세 조회 실패" });
  }
});

// 테넌트 생성
router.post("/tenants", async (req, res) => {
  try {
    const db = await getDb();
    const { name, slug } = req.body;

    const result = await db.insert(tenants).values({
      name,
      slug,
      status: "active"
    });

    // 감사 로그 기록
    await db.insert(auditLogs).values({
      userId: (req as any).user.id,
      action: "TENANT_CREATED",
      entityType: "tenant",
      entityId: String((result[0] as any).insertId),
      details: JSON.stringify({ name, slug }),
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null
    });

    res.json({ success: true, tenantId: (result[0] as any).insertId });
  } catch (error) {
    console.error("테넌트 생성 오류:", error);
    res.status(500).json({ error: "테넌트 생성 실패" });
  }
});

// 테넌트 활성화/비활성화
router.patch("/tenants/:tenantId/toggle", async (req, res) => {
  try {
    const db = await getDb();
    const { tenantId } = req.params;

    const tenant = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, parseInt(tenantId)))
      .limit(1);

    if (tenant.length === 0) {
      return res.status(404).json({ error: "테넌트를 찾을 수 없습니다" });
    }

    const newStatus = tenant[0].status === "active" ? "suspended" : "active";

    await db
      .update(tenants)
      .set({ status: newStatus as "active" | "suspended" })
      .where(eq(tenants.id, parseInt(tenantId)));

    // 감사 로그 기록
    await db.insert(auditLogs).values({
      userId: (req as any).user.id,
      action: newStatus === "active" ? "TENANT_ACTIVATED" : "TENANT_DEACTIVATED",
      entityType: "tenant",
      entityId: tenantId,
      details: JSON.stringify({ status: newStatus }),
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null
    });

    res.json({ success: true, status: newStatus });
  } catch (error) {
    console.error("테넌트 상태 변경 오류:", error);
    res.status(500).json({ error: "테넌트 상태 변경 실패" });
  }
});

// ============================================
// 시스템 모니터링 API
// ============================================

// 시스템 통계 조회
router.get("/stats", async (req, res) => {
  try {
    const db = await getDb();
    const stats = await Promise.all([
      // 전체 사용자 수
      db.select({ count: count() }).from(users),
      // 승인 대기 중인 사용자 수
      db.select({ count: count() }).from(users).where(eq(users.approvalStatus, "pending")),
      // 전체 테넌트 수
      db.select({ count: count() }).from(tenants),
      // 활성 테넌트 수
      db.select({ count: count() }).from(tenants).where(eq(tenants.status, "active"))
    ]);

    res.json({
      totalUsers: stats[0][0].count,
      pendingUsers: stats[1][0].count,
      totalTenants: stats[2][0].count,
      activeTenants: stats[3][0].count
    });
  } catch (error) {
    console.error("시스템 통계 조회 오류:", error);
    res.status(500).json({ error: "시스템 통계 조회 실패" });
  }
});

// 최근 감사 로그 조회
router.get("/audit-logs", async (req, res) => {
  try {
    const db = await getDb();
    const { limit = 50, offset = 0 } = req.query;

    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json(logs);
  } catch (error) {
    console.error("감사 로그 조회 오류:", error);
    res.status(500).json({ error: "감사 로그 조회 실패" });
  }
});

export default router;
