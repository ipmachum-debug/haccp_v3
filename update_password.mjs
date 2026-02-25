import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';

async function updatePassword() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Golden1004',
    database: 'haccp_tenant_db'
  });

  try {
    // 새 비밀번호 해시 생성
    const password = 'golden1004!';
    const passwordHash = await bcrypt.hash(password, 10);
    
    console.log('Generated password hash:', passwordHash);
    
    // 사용자 비밀번호 업데이트
    const [result] = await connection.execute(
      'UPDATE users SET password_hash = ? WHERE email = ?',
      [passwordHash, 'dduckdanji@naver.com']
    );
    
    console.log('Password updated successfully!');
    console.log('Updated rows:', result.affectedRows);
    
    // 업데이트된 사용자 확인
    const [users] = await connection.execute(
      'SELECT id, email, name, role FROM users WHERE email = ?',
      ['dduckdanji@naver.com']
    );
    
    console.log('Updated user:', users[0]);
    
  } catch (error) {
    console.error('Error updating password:', error);
  } finally {
    await connection.end();
  }
}

updatePassword();
