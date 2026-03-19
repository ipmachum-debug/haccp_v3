/**
 * SendGrid 기반 이메일 발송 서비스
 * - 클라이언트 관리자 승인 알림
 * - 직원 승인 알림
 * - 승인 거부 알림
 */

import sgMail from '@sendgrid/mail';

// SendGrid API 키 설정
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@haccp-one.com';
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'dduckdanji@naver.com';
const APP_URL = process.env.VITE_APP_URL || 'https://haccpone.com';

// SendGrid 초기화
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * 기본 이메일 발송 함수
 */
async function sendEmail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  // SendGrid API 키가 없으면 콘솔 로그만 출력
  if (!SENDGRID_API_KEY) {
    console.log('=== 이메일 발송 (SendGrid 미설정) ===');
    console.log('수신자:', to);
    console.log('제목:', subject);
    console.log('내용:', text);
    console.log('=====================================');
    return true;
  }

  const msg = {
    to,
    from: SENDGRID_FROM_EMAIL,
    subject,
    text,
    html,
  };

  try {
    await sgMail.send(msg);
    console.log(`이메일 발송 성공: ${to}`);
    return true;
  } catch (error) {
    console.error('이메일 발송 실패:', error);
    return false;
  }
}

/**
 * 클라이언트 관리자 승인 요청 알림 (슈퍼관리자에게)
 */
export async function sendClientAdminApprovalRequest(userData: {
  email: string;
  name: string;
  companyName: string;
  businessNumber?: string;
  createdAt: Date;
}): Promise<boolean> {
  const subject = '[HACCP-ONE] 새로운 클라이언트 관리자 승인 요청';
  const text = `
안녕하세요, 슈퍼관리자님.

새로운 클라이언트 관리자 승인 요청이 접수되었습니다.

- 이메일: ${userData.email}
- 이름: ${userData.name}
- 회사명: ${userData.companyName}
- 사업자번호: ${userData.businessNumber || 'N/A'}
- 가입일: ${new Date(userData.createdAt).toLocaleString('ko-KR')}

승인 페이지: ${APP_URL}/super-admin/user-approval

감사합니다.
HACCP-ONE 시스템
  `;

  const html = text.replace(/\n/g, '<br>');

  return sendEmail(SUPER_ADMIN_EMAIL, subject, text, html);
}

/**
 * 클라이언트 관리자 승인 완료 알림
 */
export async function sendClientAdminApprovalComplete(
  userEmail: string,
  userName: string
): Promise<boolean> {
  const subject = '[HACCP-ONE] 계정이 승인되었습니다';
  const text = `
안녕하세요, ${userName}님.

HACCP-ONE 시스템 계정이 승인되었습니다.

이제 시스템의 모든 기능을 사용하실 수 있습니다.

로그인: ${APP_URL}/login

주요 기능:
- 소속 직원 관리 (승인, 거부, 삭제)
- HACCP 체크리스트 관리
- 재고 및 추적성 관리
- 보고서 생성

문의 사항이 있으시면 언제든지 연락주세요.

감사합니다.
HACCP-ONE 시스템
  `;

  const html = text.replace(/\n/g, '<br>');

  return sendEmail(userEmail, subject, text, html);
}

/**
 * 직원 승인 요청 알림 (클라이언트 관리자에게)
 */
export async function sendEmployeeApprovalRequest(
  adminEmail: string,
  userData: {
    email: string;
    name: string;
    userMemo?: string;
    createdAt: Date;
  }
): Promise<boolean> {
  const subject = '[HACCP-ONE] 새로운 직원 승인 요청';
  const text = `
안녕하세요, 관리자님.

새로운 직원 승인 요청이 접수되었습니다.

- 이메일: ${userData.email}
- 이름: ${userData.name}
- 사용자 메모: ${userData.userMemo || 'N/A'}
- 가입일: ${new Date(userData.createdAt).toLocaleString('ko-KR')}

승인 페이지: ${APP_URL}/admin/employee-management

감사합니다.
HACCP-ONE 시스템
  `;

  const html = text.replace(/\n/g, '<br>');

  return sendEmail(adminEmail, subject, text, html);
}

/**
 * 직원 승인 완료 알림
 */
export async function sendEmployeeApprovalComplete(
  userEmail: string,
  userName: string,
  companyName: string
): Promise<boolean> {
  const subject = '[HACCP-ONE] 계정이 승인되었습니다';
  const text = `
안녕하세요, ${userName}님.

${companyName} 관리자가 귀하의 계정을 승인했습니다.

이제 시스템의 기능을 사용하실 수 있습니다.

로그인: ${APP_URL}/login

감사합니다.
HACCP-ONE 시스템
  `;

  const html = text.replace(/\n/g, '<br>');

  return sendEmail(userEmail, subject, text, html);
}

/**
 * 승인 거부 알림
 */
export async function sendApprovalRejection(
  userEmail: string,
  userName: string,
  reason?: string
): Promise<boolean> {
  const subject = '[HACCP-ONE] 계정 승인이 거부되었습니다';
  const text = `
안녕하세요, ${userName}님.

귀하의 계정 승인 요청이 거부되었습니다.

사유: ${reason || '관리자가 사유를 입력하지 않았습니다.'}

문의 사항이 있으시면 관리자에게 연락주세요.

감사합니다.
HACCP-ONE 시스템
  `;

  const html = text.replace(/\n/g, '<br>');

  return sendEmail(userEmail, subject, text, html);
}
