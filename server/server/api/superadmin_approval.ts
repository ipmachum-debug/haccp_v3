/**
 * 슈퍼관리자용 승인 API
 * - 클라이언트 관리자 승인/거부
 * - 승인 시 테넌트 자동 생성
 */

import { Router } from 'express';
import { db } from '../db';
import { users, tenants } from '../../drizzle/schema_main';
import { eq, and } from 'drizzle-orm';

const router = Router();

/**
 * 클라이언트 관리자 승인 대기 목록 조회
 * GET /api/superadmin/pending-client-admins
 */
router.get('/pending-client-admins', async (req, res) => {
  try {
    // 슈퍼관리자 권한 확인
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: '슈퍼관리자 권한이 필요합니다.' });
    }

    // 승인 대기 중인 클라이언트 관리자 조회
    const pendingAdmins = await db.query.users.findMany({
      where: and(
        eq(users.userType, 'client_admin'),
        eq(users.approvalStatus, 'pending')
      ),
      columns: {
        id: true,
        email: true,
        name: true,
        userType: true,
        companyName: true,
        businessNumber: true,
        userMemo: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      users: pendingAdmins,
    });
  } catch (error) {
    console.error('Get pending client admins error:', error);
    res.status(500).json({ error: '승인 대기 목록 조회 중 오류가 발생했습니다.' });
  }
});

/**
 * 클라이언트 관리자 승인
 * POST /api/superadmin/approve-client-admin
 */
router.post('/approve-client-admin', async (req, res) => {
  try {
    const { userId, action, adminMemo } = req.body;

    // 슈퍼관리자 권한 확인
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: '슈퍼관리자 권한이 필요합니다.' });
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

    if (user.userType !== 'client_admin') {
      return res.status(400).json({ error: '클라이언트 관리자만 승인할 수 있습니다.' });
    }

    if (user.approvalStatus !== 'pending') {
      return res.status(400).json({ error: '이미 처리된 요청입니다.' });
    }

    if (action === 'approve') {
      // 승인: 테넌트 생성 및 사용자 활성화
      
      // 1. 신규 테넌트 생성
      const newTenant = await db.insert(tenants).values({
        name: user.companyName || `${user.name}의 회사`,
        businessNumber: user.businessNumber || null,
      });

      const tenantId = newTenant.insertId;

      // 2. 사용자 업데이트 (승인 + 테넌트 할당 + 관리자 권한)
      await db.update(users)
        .set({
          approvalStatus: 'approved',
          isActive: true,
          role: 'admin', // 클라이언트 관리자 권한
          tenantId: tenantId,
          adminMemo: adminMemo || null,
        })
        .where(eq(users.id, userId));

      res.json({
        success: true,
        message: '클라이언트 관리자가 승인되었습니다.',
        tenant: {
          id: tenantId,
          name: user.companyName || `${user.name}의 회사`,
          adminUserId: userId,
        },
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
        message: '클라이언트 관리자 승인이 거부되었습니다.',
      });
    }
  } catch (error) {
    console.error('Approve client admin error:', error);
    res.status(500).json({ error: '승인 처리 중 오류가 발생했습니다.' });
  }
});

/**
 * 전체 사용자 목록 조회 (슈퍼관리자용)
 * GET /api/superadmin/all-users
 */
router.get('/all-users', async (req, res) => {
  try {
    // 슈퍼관리자 권한 확인
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: '슈퍼관리자 권한이 필요합니다.' });
    }

    const allUsers = await db.query.users.findMany({
      columns: {
        id: true,
        email: true,
        name: true,
        role: true,
        userType: true,
        tenantId: true,
        approvalStatus: true,
        isActive: true,
        companyName: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      users: allUsers,
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: '사용자 목록 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
