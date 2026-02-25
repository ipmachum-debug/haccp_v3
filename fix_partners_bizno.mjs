import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env 파일 로드
dotenv.config({ path: join(__dirname, '.env') });

(async () => {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    console.log('🔧 partners.biz_no를 nullable로 변경 중...');
    
    // bizNo를 nullable로 변경
    await connection.execute(`
      ALTER TABLE partners 
      MODIFY COLUMN biz_no VARCHAR(20) NULL
    `);
    
    console.log('✅ partners.biz_no를 nullable로 변경 완료');
  } catch (error) {
    console.error('❌ 에러:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
})();
