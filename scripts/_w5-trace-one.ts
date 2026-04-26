import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });
(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [tx]: any = await conn.query(
    `SELECT id, tenant_id, source_id, source_line_id, source_type FROM h_inventory_transactions WHERE source_id = 555 AND source_line_id = 4024`,
  );
  console.log("tx:", tx);
  const [bi]: any = await conn.query(
    `SELECT id, tenant_id, batch_id, material_id FROM h_batch_inputs WHERE id = 4024`,
  );
  console.log("bi:", bi);
  const [m]: any = await conn.query(
    `SELECT id, material_name, tenant_id FROM h_materials WHERE id = ${bi[0]?.material_id ?? 0}`,
  );
  console.log("m:", m);
  await conn.end();
})();
