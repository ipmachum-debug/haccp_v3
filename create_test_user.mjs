import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';

async function createTestUser() {
  const password = 'test1234';
  const passwordHash = await bcrypt.hash(password, 10);
  
  console.log('Generated password hash:', passwordHash);
  
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Golden1004',
    database: 'haccp_tenant_db'
  });
  
  try {
    // 기존 사용자 삭제
    await connection.execute('DELETE FROM users WHERE email = ?', ['dduckdanji@naver.com']);
    console.log('Deleted existing user if any');
    
    // 새 사용자 생성
    await connection.execute(`
      INSERT INTO users (tenant_id, email, password_hash, name, role, is_active, email_verified, approval_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [1, 'dduckdanji@naver.com', passwordHash, '테스트 관리자', 'admin', 1, 1, 'approved']);
    
    console.log('✅ Test user created successfully!');
    console.log('Email: dduckdanji@naver.com');
    console.log('Password: test1234');
    
    // 사용자 확인
    const [rows] = await connection.execute('SELECT id, email, name, role FROM users WHERE email = ?', ['dduckdanji@naver.com']);
    console.log('User details:', rows[0]);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

createTestUser();
