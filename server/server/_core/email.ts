import sgMail from '@sendgrid/mail';

/**
 * SendGrid 기반 이메일 발송 설정
 */
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@haccpone.com';
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || 'HACCP ONE';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * 비밀번호 재설정 이메일 발송 (SendGrid)
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  userName: string
): Promise<void> {
  const resetUrl = `${process.env.FRONTEND_URL || "https://haccpone.com"}/reset-password?token=${resetToken}`;

  if (!SENDGRID_API_KEY) {
    console.log('=== 비밀번호 재설정 이메일 (SendGrid 미설정) ===');
    console.log('수신자:', to);
    console.log('재설정 URL:', resetUrl);
    console.log('================================================');
    // SendGrid 미설정 시에도 에러를 던지지 않고 로그만 출력
    return;
  }

  const msg = {
    to,
    from: {
      email: SENDGRID_FROM_EMAIL,
      name: SENDGRID_FROM_NAME,
    },
    subject: '[HACCP-ONE] 비밀번호 재설정 요청',
    text: `안녕하세요, ${userName}님.\n\n비밀번호 재설정 요청을 받았습니다.\n아래 링크를 클릭하여 새로운 비밀번호를 설정해주세요.\n\n${resetUrl}\n\n이 링크는 1시간 동안만 유효합니다.\n비밀번호 재설정을 요청하지 않으셨다면 이 이메일을 무시하세요.\n\nHACCP-ONE 시스템`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 30px;
            margin: 20px 0;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .header h1 {
            color: #2563eb;
            margin: 0;
            font-size: 24px;
          }
          .content {
            background-color: white;
            padding: 25px;
            border-radius: 6px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background-color: #2563eb;
            color: white !important;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: 600;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 14px;
          }
          .warning {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>HACCP-ONE</h1>
            <p style="color: #666; margin-top: 5px;">식품안전 통합 관리 시스템</p>
          </div>
          <div class="content">
            <h2>안녕하세요, ${userName}님</h2>
            <p>비밀번호 재설정 요청을 받았습니다.</p>
            <p>아래 버튼을 클릭하여 새로운 비밀번호를 설정해주세요.</p>
            
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">비밀번호 재설정</a>
            </div>
            
            <div class="warning">
              <strong>주의사항</strong>
              <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                <li>이 링크는 <strong>1시간</strong> 동안만 유효합니다.</li>
                <li>비밀번호 재설정을 요청하지 않으셨다면 이 이메일을 무시하세요.</li>
                <li>링크를 클릭할 수 없다면 아래 URL을 복사하여 브라우저에 붙여넣으세요.</li>
              </ul>
            </div>
            
            <p style="word-break: break-all; font-size: 12px; color: #666; margin-top: 20px;">
              ${resetUrl}
            </p>
          </div>
          <div class="footer">
            <p>이 이메일은 자동으로 발송되었습니다. 회신하지 마세요.</p>
            <p>&copy; 2026 HACCP-ONE. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`[Email] 비밀번호 재설정 이메일 발송 완료: ${to}`);
  } catch (error) {
    console.error(`[Email] 비밀번호 재설정 이메일 발송 실패: ${to}`, error);
    throw new Error("이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

/**
 * 이메일 발송 테스트 (SendGrid)
 */
export async function testEmailConnection(): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.log("[Email] SendGrid API 키가 설정되지 않았습니다.");
    return false;
  }
  console.log("[Email] SendGrid API 키 설정 확인 완료");
  return true;
}
