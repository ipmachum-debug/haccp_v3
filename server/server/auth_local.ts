/**
 * 로컬 인증 시스템 (Manus OAuth 대체)
 * - 로컬 로그인/회원가입
 * - bcrypt 비밀번호 해싱
 * - JWT 세션 관리
 * - 관리자 승인 시스템
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { users } from '../drizzle/schema_main';
import { eq } from 'drizzle-orm';

const router = Router();

// JWT 시크릿 (환경 변수에서 가져오기)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

/**
 * 회원가입
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { 
      email, 
      password, 
      name, 
      userType, 
      userMemo,
      companyName,
      businessNumber,
      tenantId 
    } = req.body;

    // 유효성 검사
    if (!email || !password || !name) {
      return res.status(400).json({ error: '이메일, 비밀번호, 이름은 필수입니다.' });
    }

    // 사용자 유형 검증
    if (userType === 'client_admin' && !companyName) {
      return res.status(400).json({ error: '클라이언트 관리자는 회사명이 필수입니다.' });
    }

    if (userType === 'employee' && !tenantId) {
      return res.status(400).json({ error: '직원은 소속 회사를 선택해야 합니다.' });
    }

    // 이메일 중복 확인
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return res.status(400).json({ error: '이미 등록된 이메일입니다.' });
    }

    // 비밀번호 해싱
    const passwordHash = await bcrypt.hash(password, 10);

    // 사용자 생성
    const newUser = await db.insert(users).values({
      tenantId: userType === 'client_admin' ? 1 : tenantId, // 클라이언트 관리자는 임시 테넌트, 직원은 선택한 테넌트
      email,
      passwordHash,
      name,
      role: 'worker', // 기본 역할 (승인 후 변경)
      approvalStatus: 'pending', // 승인 대기
      isActive: false, // 비활성화 상태
      userType: userType || 'employee',
      userMemo: userMemo || null,
      companyName: companyName || null,
      businessNumber: businessNumber || null,
    });

    // 승인 대기 메시지 구분
    const waitingMessage = userType === 'client_admin'
      ? '회원가입이 완료되었습니다. 슈퍼관리자의 승인을 기다려주세요.'
      : '회원가입이 완료되었습니다. 소속 회사 관리자의 승인을 기다려주세요.';

    res.json({
      success: true,
      message: waitingMessage,
      userId: newUser.insertId,
      userType: userType,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: '회원가입 중 오류가 발생했습니다.' });
  }
});

/**
 * 로그인
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 유효성 검사
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요.' });
    }

    // 사용자 조회
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 승인 상태 확인 (approval_status 사용)
    if (user.approvalStatus === 'pending') {
      return res.status(403).json({
        error: '관리자 승인 대기 중입니다.',
        status: 'pending',
        userType: user.userType,
      });
    }

    if (user.approvalStatus === 'rejected') {
      return res.status(403).json({ 
        error: '계정 승인이 거부되었습니다. 관리자에게 문의하세요.',
        status: 'rejected' 
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: '비활성화된 계정입니다. 관리자에게 문의하세요.' });
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // 쿠키에 토큰 저장
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '로그인 중 오류가 발생했습니다.' });
  }
});

/**
 * 로그아웃
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true, message: '로그아웃되었습니다.' });
});

/**
 * 현재 사용자 정보 조회
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies.auth_token;

    if (!token) {
      return res.status(401).json({ error: '인증되지 않았습니다.' });
    }

    // JWT 검증
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // 사용자 조회 (tenant 정보 포함)
    const user = await db.query.users.findFirst({
      where: eq(users.id, decoded.userId),
      with: {
        tenant: true,
      },
    });

    if (!user || user.approvalStatus !== 'approved' || !user.isActive) {
      return res.status(401).json({ error: '유효하지 않은 사용자입니다.' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name || null,
      approvalStatus: user.approvalStatus,
      userType: user.userType,
      isActive: user.isActive,
    });
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(401).json({ error: '인증되지 않았습니다.' });
  }
});

export default router;
