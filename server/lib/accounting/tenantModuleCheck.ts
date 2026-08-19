import { getDb } from "../../db/connection";
import { tenants } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

const PACKAGE_MODULES: Record<string, { erp: boolean; haccp: boolean }> = {
  starter:    { erp: false, haccp: true },
  standard:   { erp: true,  haccp: false },
  erp_basic:  { erp: true,  haccp: false },
  enterprise: { erp: true,  haccp: true },
  pro:        { erp: true,  haccp: true },
  basic:      { erp: false, haccp: true },
};

export async function isHaccpEnabled(tenantId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;

  const [tenant] = await db
    .select({ plan: tenants.subscriptionPackage })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return true;
  const modules = PACKAGE_MODULES[tenant.plan] || { erp: true, haccp: true };
  return modules.haccp;
}
