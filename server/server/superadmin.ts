import { Router } from "express";
import { getDb } from "./db";
import { users, tenants } from "../drizzle/schema_main";
import { auditLogs } from "../drizzle/schema/audit";
import { eq, desc, count, sql } from "drizzle-orm";

const router = Router();

// 권한 검증 미들웨어
const requireSuperAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== "super_admin") {
    return res.status(403).json({ error: "슈퍼관리자 권한이 필요합니다" });
  }
  next();
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
      .where(eq(users.isApproved, false))
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
        isApproved: true,
        role: role || "worker",
        updatedAt: new Date()
      })
      .where(eq(users.id, parseInt(userId)));

    // 감사 로그 기록
    await db.insert(auditLogs).values({
      userId: req.user.id,
      action: "USER_APPROVED",
      entityType: "user",
      entityId: userId,
      details: JSON.stringify({ role }),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
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
      userId: req.user.id,
      action: "USER_REJECTED",
      entityType: "user",
      entityId: userId,
      details: JSON.stringify({ reason }),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
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
        isActive: tenants.isActive,
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
      isActive: true
    });

    // 감사 로그 기록
    await db.insert(auditLogs).values({
      userId: req.user.id,
      action: "TENANT_CREATED",
      entityType: "tenant",
      entityId: result[0].insertId.toString(),
      details: JSON.stringify({ name, slug }),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.json({ success: true, tenantId: result[0].insertId });
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

    const newStatus = !tenant[0].isActive;

    await db
      .update(tenants)
      .set({ isActive: newStatus })
      .where(eq(tenants.id, parseInt(tenantId)));

    // 감사 로그 기록
    await db.insert(auditLogs).values({
      userId: req.user.id,
      action: newStatus ? "TENANT_ACTIVATED" : "TENANT_DEACTIVATED",
      entityType: "tenant",
      entityId: tenantId,
      details: JSON.stringify({ isActive: newStatus }),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    res.json({ success: true, isActive: newStatus });
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
      db.select({ count: count() }).from(users).where(eq(users.isApproved, false)),
      // 전체 테넌트 수
      db.select({ count: count() }).from(tenants),
      // 활성 테넌트 수
      db.select({ count: count() }).from(tenants).where(eq(tenants.isActive, true))
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
