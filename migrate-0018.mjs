import mysql from 'mysql2/promise';
import fs from 'fs';
import 'dotenv/config';

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);
const sql = fs.readFileSync('./drizzle/0018_tiny_black_widow.sql', 'utf8');
const statements = sql.split('-->').map(s => s.trim()).filter(s => s && !s.startsWith('statement-breakpoint'));

for (const stmt of statements) {
  if (stmt) {
    try {
      await conn.execute(stmt);
      console.log('✓', stmt.substring(0, 60) + '...');
    } catch (err) {
      console.error('✗', stmt.substring(0, 60), err.message);
    }
  }
}

await conn.end();
console.log('✅ 로컬 데이터베이스 마이그레이션 완료!');
