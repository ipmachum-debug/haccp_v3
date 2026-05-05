/**
 * Partner Activity Recorder — CRM Phase 3 (자동 기록 서비스)
 *
 * 목적: 견적 발송 / 매입·매출 발생 / 결제 등 비즈니스 이벤트 발생 시
 *       partner_activities 에 자동으로 timeline entry 를 기록.
 *
 * 사용 패턴 (라우터에서):
 *   await recordActivity(db, {
 *     tenantId, partnerId, userId,
 *     type: 'quote_sent',
 *     title: `견적 #${quoteNumber} 발송`,
 *     refType: 'quotation',
 *     refId: quoteId,
 *   });
 *
 * 안전 원칙:
 *   - 어떤 실패도 호출자(예: 견적 발송) 를 깨뜨리지 않음 (try/catch + warn log)
 *   - tenantId 는 호출자가 책임 (이미 검증된 컨텍스트)
 *   - 동일 ref (refType + refId) 중복 방지 — 한 견적 = 한 활동
 *
 * 작성: 2026-05-05 (Phase 3)
 */

import { sql } from "drizzle-orm";

export type ActivityType =
  | "call"
  | "email"
  | "meeting"
  | "visit"
  | "note"
  | "quote_sent"
  | "contract_signed"
  | "payment_received"
  | "payment_overdue"
  | "task"
  | "other";

export type ActivityOutcome = "info" | "follow_up" | "won" | "lost" | "blocked";

export interface RecordActivityArgs {
  tenantId: number;
  partnerId: number;
  userId: number;
  type: ActivityType;
  title: string;
  body?: string;
  outcome?: ActivityOutcome;
  refType?: string;
  refId?: number;
  /** 동일 ref 중복 방지 — true 일 때 같은 (refType, refId) 가 이미 있으면 INSERT skip */
  skipIfExists?: boolean;
}

/**
 * partner_activities 에 활동 1건 자동 INSERT.
 * 실패 시 warn 만 출력 — 호출자 비즈니스 로직을 깨지 않음.
 */
export async function recordActivity(db: any, args: RecordActivityArgs): Promise<void> {
  if (!db || !args.tenantId || !args.partnerId || !args.userId) return;
  try {
    // 중복 방지
    if (args.skipIfExists && args.refType && args.refId) {
      const existsResult: any = await db.execute(sql`
        SELECT id FROM partner_activities
        WHERE tenant_id = ${args.tenantId}
          AND partner_id = ${args.partnerId}
          AND ref_type = ${args.refType}
          AND ref_id = ${args.refId}
        LIMIT 1
      `);
      const rows = ((existsResult as any)?.[0] ?? []) as any[];
      if (rows.length > 0) return;
    }

    await db.execute(sql`
      INSERT INTO partner_activities
        (tenant_id, partner_id, activity_type, title, body, outcome,
         occurred_at, ref_type, ref_id, created_by, created_at)
      VALUES
        (${args.tenantId}, ${args.partnerId}, ${args.type},
         ${args.title}, ${args.body ?? null}, ${args.outcome ?? null},
         NOW(), ${args.refType ?? null}, ${args.refId ?? null},
         ${args.userId}, NOW())
    `);
  } catch (err: any) {
    // 비즈니스 로직 깨지 않음 — 단순 로깅
    console.warn(
      `[partnerActivityRecorder] 자동기록 실패 (partner=${args.partnerId}, type=${args.type}):`,
      err?.message ?? err,
    );
  }
}

/**
 * 거래 (매입/매출) 자동 활동 — 단순 wrapper
 */
export async function recordTransactionActivity(
  db: any,
  args: {
    tenantId: number;
    partnerId: number;
    userId: number;
    kind: "purchase" | "sale";
    txId: number;
    itemName: string;
    totalAmount: number;
    transactionDate: string;
  },
): Promise<void> {
  const isPurchase = args.kind === "purchase";
  const krw = new Intl.NumberFormat("ko-KR").format(Math.round(args.totalAmount));
  await recordActivity(db, {
    tenantId: args.tenantId,
    partnerId: args.partnerId,
    userId: args.userId,
    type: "other",
    title: `${isPurchase ? "매입" : "매출"} 등록 — ${args.itemName} ${krw}원`,
    body: `${args.transactionDate} · ${isPurchase ? "공급처" : "고객"}`,
    refType: isPurchase ? "purchase" : "sale",
    refId: args.txId,
    skipIfExists: true,
  });
}

/**
 * 견적 발송 활동
 */
export async function recordQuoteActivity(
  db: any,
  args: {
    tenantId: number;
    partnerId: number;
    userId: number;
    quoteId: number;
    quoteNumber: string;
    title: string | null;
    grandTotal: number;
    status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  },
): Promise<void> {
  // status 가 'sent' 로 전환 시점에만 quote_sent 기록
  // create 시 draft 면 활동 없음 (잡음 방지)
  if (args.status !== "sent" && args.status !== "accepted") return;

  const krw = new Intl.NumberFormat("ko-KR").format(Math.round(args.grandTotal));
  const isAccepted = args.status === "accepted";
  await recordActivity(db, {
    tenantId: args.tenantId,
    partnerId: args.partnerId,
    userId: args.userId,
    type: isAccepted ? "contract_signed" : "quote_sent",
    title: `견적 ${args.quoteNumber}${isAccepted ? " 수락됨" : " 발송"} — ${krw}원`,
    body: args.title ?? null,
    outcome: isAccepted ? "won" : "info",
    refType: "quotation",
    refId: args.quoteId,
    skipIfExists: true,
  });
}
