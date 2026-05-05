/**
 * Partner Document Expiry Scheduler — CRM Phase 3
 *
 * 매일 오전 8시 cron 실행:
 *   - 만료일 7일 이내 / 30일 이내 partner_documents 검색
 *   - 같은 테넌트의 admin 에게 h_notifications 생성
 *   - 중복 알림 방지 (같은 doc_id × 24시간 이내 알림 있으면 skip)
 *
 * 작성: 2026-05-05
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";

interface ExpiryWindow {
  /** 며칠 이내 만료 — 0 = 오늘 만료 (즉시 알림) */
  withinDays: number;
  /** 알림 우선순위 */
  priority: "low" | "medium" | "high" | "urgent";
  /** 사람이 읽을 라벨 */
  label: string;
}

const WINDOWS: ExpiryWindow[] = [
  { withinDays: 0, priority: "urgent", label: "오늘 만료" },
  { withinDays: 7, priority: "high", label: "7일 이내 만료" },
  { withinDays: 30, priority: "medium", label: "30일 이내 만료" },
];

const DOC_TYPE_KOR: Record<string, string> = {
  contract: "계약서",
  tax_invoice: "세금계산서",
  estimate: "견적서",
  purchase_order: "발주서",
  delivery_note: "거래명세서",
  receipt: "영수증",
  quality_cert: "품질보증서",
  iso_cert: "ISO 인증서",
  haccp_cert: "HACCP 인증서",
  biz_license: "사업자등록증",
  nda: "기밀유지협약",
  other: "기타 서류",
};

export async function checkPartnerDocumentExpiry(): Promise<{ alertCount: number }> {
  const db = await getDb();
  if (!db) {
    console.warn("[partnerDocumentExpiry] DB 연결 실패 — skip");
    return { alertCount: 0 };
  }

  let alertCount = 0;

  // 활성 테넌트별 처리
  const tenantsResult: any = await db.execute(sql`SELECT id FROM tenants`);
  const tenantsList = ((tenantsResult as any)?.[0] ?? tenantsResult) as any[];

  for (const t of tenantsList) {
    const tenantId = Number(t.id);
    if (!tenantId) continue;

    try {
      // 만료일이 향후 30일 이내 (또는 이미 만료된 미알림 건도 포함)
      const docsResult: any = await db.execute(sql`
        SELECT pd.id, pd.partner_id, pd.title, pd.doc_type, pd.expires_at,
               p.company_name AS partner_name
        FROM partner_documents pd
        JOIN partners p ON p.id = pd.partner_id AND p.tenant_id = pd.tenant_id
        WHERE pd.tenant_id = ${tenantId}
          AND pd.expires_at IS NOT NULL
          AND pd.expires_at <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          AND pd.expires_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      `);
      const docs = ((docsResult as any)?.[0] ?? []) as any[];

      if (docs.length === 0) continue;

      // 테넌트의 admin 사용자
      const usersResult: any = await db.execute(sql`
        SELECT id FROM users
        WHERE tenant_id = ${tenantId} AND role IN ('admin', 'super_admin')
      `);
      const users = ((usersResult as any)?.[0] ?? []) as any[];
      if (users.length === 0) continue;

      for (const doc of docs) {
        const expiresAt = new Date(doc.expires_at);
        const todayMs = Date.now();
        const diffDays = Math.floor((expiresAt.getTime() - todayMs) / 86400000);

        // 어떤 윈도우에 해당? (가장 작은 windowsDays 매칭)
        const window = WINDOWS.find((w) => diffDays <= w.withinDays);
        if (!window) continue;

        // 중복 방지: 24시간 이내 동일 doc_id 알림 체크
        const dupResult: any = await db.execute(sql`
          SELECT id FROM h_notifications
          WHERE tenant_id = ${tenantId}
            AND notification_type = 'doc_expiry'
            AND JSON_EXTRACT(metadata, '$.docId') = ${doc.id}
            AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          LIMIT 1
        `);
        const dupRows = ((dupResult as any)?.[0] ?? []) as any[];
        if (dupRows.length > 0) continue;

        const docTypeLabel = DOC_TYPE_KOR[doc.doc_type] || doc.doc_type;
        const isExpired = diffDays < 0;
        const title = isExpired
          ? `[만료됨] ${docTypeLabel} — ${doc.partner_name}`
          : `[${window.label}] ${docTypeLabel} — ${doc.partner_name}`;
        const message = `'${doc.title}' 문서가 ${
          isExpired ? `${Math.abs(diffDays)}일 전 만료됨` : `${diffDays}일 후 만료`
        }`;

        for (const u of users) {
          await db.execute(sql`
            INSERT INTO h_notifications
              (tenant_id, user_id, notification_type, title, message,
               priority, action_url, metadata, created_at)
            VALUES
              (${tenantId}, ${u.id}, 'doc_expiry',
               ${title}, ${message}, ${window.priority},
               ${`/dashboard/partners/${doc.partner_id}`},
               ${JSON.stringify({
                 docId: doc.id,
                 partnerId: doc.partner_id,
                 docType: doc.doc_type,
                 expiresAt: doc.expires_at,
                 diffDays,
               })},
               NOW())
          `);
        }
        alertCount++;
      }
    } catch (err: any) {
      console.error(`[partnerDocumentExpiry] tenantId=${tenantId} 실패:`, err?.message ?? err);
    }
  }

  return { alertCount };
}
