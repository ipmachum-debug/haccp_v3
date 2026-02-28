/**
 * 공개 테넌트 API
 * - 회원가입 시 소속 회사 선택을 위한 테넌트 목록 조회
 */

import { Router } from 'express';
import { db } from '../db';
import { tenants } from '../../drizzle/schema_main';

const router = Router();

/**
 * 전체 테넌트 목록 조회 (공개 API)
 * GET /api/public/tenants
 */
router.get('/tenants', async (req, res) => {
  try {
    // 모든 테넌트 조회 (회원가입 시 선택용)
    const allTenants = await db.query.tenants.findMany({
      columns: {
        id: true,
        name: true,
      },
      orderBy: (tenants, { asc }) => [asc(tenants.name)],
    });

    res.json({
      success: true,
      tenants: allTenants,
    });
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({ error: '테넌트 목록 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
