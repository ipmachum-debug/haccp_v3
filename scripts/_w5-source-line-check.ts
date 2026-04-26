import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });
(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows]: any = await conn.query(`
    SELECT id, source_id, source_line_id, lot_id, source_type, notes
    FROM h_inventory_transactions
    WHERE tenant_id = 2 AND source_id IN (579, 580, 581) AND transaction_type = 'usage'
    LIMIT 5
  `);
  console.log("source_line_id 채워졌는가?");
  console.table(rows);
  await conn.end();
})();
