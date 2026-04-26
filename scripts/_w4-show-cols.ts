import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });
(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [c]: any = await conn.query("SHOW COLUMNS FROM h_material_master");
  console.log("h_material_master columns:");
  for (const r of c) console.log(`  ${r.Field} (${r.Type})`);
  const [c2]: any = await conn.query("SHOW COLUMNS FROM h_inventory_lots");
  console.log("\nh_inventory_lots columns:");
  for (const r of c2) console.log(`  ${r.Field} (${r.Type})`);
  await conn.end();
})();
