import { getDb } from "../connection";
import { hSystemSettings } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface CompanyInfo {
  companyName?: string;
  companyBusinessNumber?: string;
  companyAddress?: string;
  companyRepresentative?: string;
  companyPhone?: string;
}

const COMPANY_KEYS = {
  companyName: "company_name",
  companyBusinessNumber: "company_business_number",
  companyAddress: "company_address",
  companyRepresentative: "company_representative",
  companyPhone: "company_phone"
};

/**
 * 회사 정보 조회
 */
export async function getCompanyInfo(tenantId: number): Promise<CompanyInfo> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const result: CompanyInfo = {};

  for (const key of Object.keys(COMPANY_KEYS)) {
    const settingKey = COMPANY_KEYS[key as keyof typeof COMPANY_KEYS];
    const [setting] = await db
      .select()
      .from(hSystemSettings)
      .where(and(
        eq(hSystemSettings.settingKey, settingKey),
        eq(hSystemSettings.tenantId, tenantId)
      ))
      .limit(1);

    if (setting) {
      result[key as keyof CompanyInfo] = setting.settingValue || undefined;
    }
  }

  // 문서용 회사 정보가 비어 있으면 가입 때 넣은 회사명·사업자번호를 쓴다 — 같은 회사명을 두 번 입력시키지 않게
  //   (2026-10-20 신규 회사 시험). 읽기만 — 저장은 관리자가 [저장] 할 때 기존 경로로.
  if (!result.companyName || !result.companyBusinessNumber) {
    try {
      const { getRawConnection } = await import("../connection");
      const pool: any = await getRawConnection();
      const [rows]: any = await pool.execute(
        `SELECT t.name, (SELECT u.business_number FROM users u WHERE u.tenant_id = t.id AND u.role = 'admin' AND u.business_number IS NOT NULL AND u.business_number <> '' ORDER BY u.id LIMIT 1) AS biz
           FROM tenants t WHERE t.id = ? LIMIT 1`,
        [tenantId],
      );
      const t = (rows as any[])[0];
      if (t) {
        if (!result.companyName && t.name) result.companyName = String(t.name);
        if (!result.companyBusinessNumber && t.biz) result.companyBusinessNumber = String(t.biz);
      }
    } catch (e: any) {
      if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
    }
  }

  return result;
}

/**
 * 회사 정보 업데이트
 */
export async function updateCompanyInfo(data: CompanyInfo, tenantId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  for (const key of Object.keys(data)) {
    const settingKey = COMPANY_KEYS[key as keyof typeof COMPANY_KEYS];
    const value = data[key as keyof CompanyInfo];

    if (value === undefined) continue;

    // 기존 설정 확인
    const [existing] = await db
      .select()
      .from(hSystemSettings)
      .where(and(
        eq(hSystemSettings.settingKey, settingKey),
        eq(hSystemSettings.tenantId, tenantId)
      ))
      .limit(1);

    if (existing) {
      // 업데이트
      await db
        .update(hSystemSettings)
        .set({
          settingValue: value
        })
        .where(and(
          eq(hSystemSettings.settingKey, settingKey),
          eq(hSystemSettings.tenantId, tenantId)
        ));
    } else {
      // 신규 생성
      await db.insert(hSystemSettings).values({
        tenantId,
        settingKey,
        settingValue: value,
        settingType: "text",
        category: "company",
        description: `회사 ${key}`,
        isEditable: 1
      });
    }
  }
}
