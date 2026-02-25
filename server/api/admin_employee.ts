/**
 * 클라이언트 관리자용 직원 관리 API
 * - 소속 직원 승인/거부
 * - 소속 직원 목록 조회
 * - 소속 직원 삭제
 */

import { Router } from 'express';
import { db } from '../db';
import { users } from '../../drizzle/schema_main';
import { eq, and } from 'drizzle-orm';

const router = Router();

/**
 * 직원 승인 대기 목록 조회 (클라이언트 관리자용)
 * GET /api/admin/pending-employees
 */
router.get('/pending-employees', async (req, res) => {
  try {
    // 클라이언트 관리자 권한 확인
    if (!['admin', 'super_admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: '클라이언트 관리자 권한이 필요합니다.' });
    }

    const tenantId = req.user.tenantId;

    // 승인 대기 중인 직원 조회 (같은 테넌트)
    const pendingEmployees = await db.query.users.findMany({
      where: and(
        eq(users.tenantId, tenantId),
        eq(users.userType, 'employee'),
        eq(users.approvalStatus, 'pending')
      ),
      columns: {
        id: true,
        email: true,
        name: true,
        userType: true,
        userMemo: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      users: pendingEmployees,
    });
  } catch (error) {
    console.error('Get pending employees error:', error);
    res.status(500).json({ error: '승인 대기 목록 조회 중 오류가 발생했습니다.' });
  }
});

/**
 * 직원 승인/거부 (클라이언트 관리자용)
 * POST /api/admin/approve-employee
 */
router.post('/approve-employee', async (req, res) => {
  try {
    const { userId, action, role, adminMemo } = req.body;

    // 클라이언트 관리자 권한 확인
    if (!['admin', 'super_admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: '클라이언트 관리자 권한이 필요합니다.' });
    }

    // 유효성 검사
    if (!userId || !action) {
      return res.status(400).json({ error: '사용자 ID와 액션이 필요합니다.' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: '액션은 approve 또는 reject여야 합니다.' });
    }

    // 사용자 조회
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    // 같은 테넌트인지 확인
    if (user.tenantId !== req.user.tenantId) {
      return res.status(403).json({ error: '다른 회사의 직원은 관리할 수 없습니다.' });
    }

    if (user.userType !== 'employee') {
      return res.status(400).json({ error: '직원만 승인할 수 있습니다.' });
    }

    if (user.approvalStatus !== 'pending') {
      return res.status(400).json({ error: '이미 처리된 요청입니다.' });
    }

    if (action === 'approve') {
      // 승인: 사용자 활성화
      await db.update(users)
        .set({
          approvalStatus: 'approved',
          isActive: true,
          role: role || 'worker', // 부여할 역할 (기본: worker)
          adminMemo: adminMemo || null,
        })
        .where(eq(users.id, userId));

      res.json({
        success: true,
        message: '직원이 승인되었습니다.',
      });
    } else {
      // 거부: 사용자 상태만 업데이트
      await db.update(users)
        .set({
          approvalStatus: 'rejected',
          adminMemo: adminMemo || null,
        })
        .where(eq(users.id, userId));

      res.json({
        success: true,
        message: '직원 승인이 거부되었습니다.',
      });
    }
  } catch (error) {
    console.error('Approve employee error:', error);
    res.status(500).json({ error: '승인 처리 중 오류가 발생했습니다.' });
  }
});

/**
 * 활성 직원 목록 조회 (클라이언트 관리자용)
 * GET /api/admin/active-employees
 */
router.get('/active-employees', async (req, res) => {
  try {
    // 클라이언트 관리자 권한 확인
    if (!['admin', 'super_admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: '클라이언트 관리자 권한이 필요합니다.' });
    }

    const tenantId = req.user.tenantId;

    // 활성 직원 조회 (같은 테넌트)
    const activeEmployees = await db.query.users.findMany({
      where: and(
        eq(users.tenantId, tenantId),
        eq(users.approvalStatus, 'approved'),
        eq(users.isActive, true)
      ),
      columns: {
        id: true,
        email: true,
        name: true,
        role: true,
        userType: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      users: activeEmployees,
    });
  } catch (error) {
    console.error('Get active employees error:', error);
    res.status(500).json({ error: '직원 목록 조회 중 오류가 발생했습니다.' });
  }
});

/**
 * 직원 삭제 (클라이언트 관리자용)
 * DELETE /api/admin/employee/:userId
 */
router.delete('/employee/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 클라이언트 관리자 권한 확인
    if (!['admin', 'super_admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: '클라이언트 관리자 권한이 필요합니다.' });
    }

    // 사용자 조회
    const user = await db.query.users.findFirst({
      where: eq(users.id, parseInt(userId)),
    });

    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    // 같은 테넌트인지 확인
    if (user.tenantId !== req.user.tenantId) {
      return res.status(403).json({ error: '다른 회사의 직원은 삭제할 수 없습니다.' });
    }

    // 관리자는 삭제 불가
    if (user.role === 'admin' || user.role === 'super_admin') {
      return res.status(403).json({ error: '관리자는 삭제할 수 없습니다.' });
    }

    // 사용자 비활성화 (실제 삭제 대신)
    await db.update(users)
      .set({
        isActive: false,
        adminMemo: `${new Date().toISOString()} - 관리자에 의해 삭제됨`,
      })
      .where(eq(users.id, parseInt(userId)));

    res.json({
      success: true,
      message: '직원이 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: '직원 삭제 중 오류가 발생했습니다.' });
  }
});

/**
 * 직원 역할 변경 (클라이언트 관리자용)
 * PUT /api/admin/employee/:userId/role
 */
router.put('/employee/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // 클라이언트 관리자 권한 확인
    if (!['admin', 'super_admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: '클라이언트 관리자 권한이 필요합니다.' });
    }

    // 유효성 검사
    if (!role || !['worker', 'monitor'].includes(role)) {
      return res.status(400).json({ error: '유효한 역할을 선택하세요. (worker, monitor)' });
    }

    // 사용자 조회
    const user = await db.query.users.findFirst({
      where: eq(users.id, parseInt(userId)),
    });

    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    // 같은 테넌트인지 확인
    if (user.tenantId !== req.user.tenantId) {
      return res.status(403).json({ error: '다른 회사의 직원은 수정할 수 없습니다.' });
    }

    // 역할 변경
    await db.update(users)
      .set({ role })
      .where(eq(users.id, parseInt(userId)));

    res.json({
      success: true,
      message: '직원 역할이 변경되었습니다.',
    });
  } catch (error) {
    console.error('Update employee role error:', error);
    res.status(500).json({ error: '역할 변경 중 오류가 발생했습니다.' });
  }
});

export default router;
