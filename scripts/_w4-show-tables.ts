import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });
(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [t1]: any = await conn.query("SHOW TABLES LIKE 'h_item%'");
  const [t2]: any = await conn.query("SHOW TABLES LIKE 'h_material%'");
  const [t3]: any = await conn.query("SHOW TABLES LIKE '%master%'");
  console.log("h_item%:", t1);
  console.log("h_material%:", t2);
  console.log("%master%:", t3);
  await conn.end();
})();
