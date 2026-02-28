/**
 * 이메일 발송 헬퍼 함수
 * 
 * 실제 프로덕션 환경에서는 SendGrid, AWS SES, Mailgun 등의 이메일 서비스를 사용해야 합니다.
 * 현재는 콘솔 로그로 대체합니다.
 */

/**
 * 이메일 인증 링크 발송
 */
export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const verificationUrl = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
  
  console.log('=== 이메일 인증 링크 발송 ===');
  console.log('수신자:', email);
  console.log('인증 링크:', verificationUrl);
  console.log('===========================');
  
  // TODO: 실제 이메일 발송 로직 구현
  // 예: SendGrid, AWS SES, Mailgun 등 사용
  
  return true;
}

/**
 * 관리자 승인 완료 알림 이메일 발송
 */
export async function sendApprovalNotification(email: string, name: string): Promise<boolean> {
  const loginUrl = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/login`;
  
  console.log('=== 승인 완료 알림 발송 ===');
  console.log('수신자:', email);
  console.log('이름:', name);
  console.log('로그인 링크:', loginUrl);
  console.log('===========================');
  
  // TODO: 실제 이메일 발송 로직 구현
  
  return true;
}

/**
 * 관리자 승인 거부 알림 이메일 발송
 */
export async function sendRejectionNotification(email: string, name: string, reason?: string): Promise<boolean> {
  console.log('=== 승인 거부 알림 발송 ===');
  console.log('수신자:', email);
  console.log('이름:', name);
  console.log('거부 사유:', reason || '관리자에게 문의하세요');
  console.log('===========================');
  
  // TODO: 실제 이메일 발송 로직 구현
  
  return true;
}

/**
 * 비밀번호 재설정 이메일 발송
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const resetUrl = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
  
  console.log('=== 비밀번호 재설정 링크 발송 ===');
  console.log('수신자:', email);
  console.log('재설정 링크:', resetUrl);
  console.log('===========================');
  
  // TODO: 실제 이메일 발송 로직 구현
  
  return true;
}
