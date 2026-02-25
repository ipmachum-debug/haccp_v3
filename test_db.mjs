import mysql from 'mysql2/promise';

async function test() {
  const dbUrl = process.env.DATABASE_URL;
  console.log("DATABASE_URL:", dbUrl);
  
  try {
    const url = new URL(dbUrl);
    console.log("Parsed host:", url.hostname);
    console.log("Parsed port:", url.port);
    console.log("Parsed user:", url.username);
    console.log("Parsed password:", decodeURIComponent(url.password));
    console.log("Parsed database:", url.pathname.slice(1));
    
    const connection = await mysql.createConnection({
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: url.username,
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    });
    
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log("DB Connection SUCCESS:", rows);
    
    const [users] = await connection.execute('SELECT id, email, name FROM users LIMIT 1');
    console.log("Users query SUCCESS:", users);
    
    await connection.end();
  } catch (err) {
    console.error("ERROR:", err.message);
    console.error("CODE:", err.code);
  }
}

test();
