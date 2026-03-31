/**
 * 토스페이먼츠 정기결제 연동 서비스
 *
 * PG 계약 후 .env에 아래 값 설정:
 *   TOSS_SECRET_KEY=test_sk_xxxxxxxx
 *   TOSS_CLIENT_KEY=test_ck_xxxxxxxx
 *
 * 흐름:
 *   1. 프론트에서 카드 등록 → 빌링키 발급 (TossPayments SDK)
 *   2. 빌링키를 서버로 전달 → DB 저장
 *   3. 매월 1일 스케줄러에서 자동 결제 (빌링키 기반)
 *   4. 결제 실패 시 3일 유예 → 5일 후 읽기 전용 전환
 *
 * 참고: https://docs.tosspayments.com/reference/billing
 */

const TOSS_API_URL = "https://api.tosspayments.com/v1/billing";

function getSecretKey(): string {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) throw new Error("[결제] TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다");
  return key;
}

function getAuthHeader(): string {
  const encoded = Buffer.from(getSecretKey() + ":").toString("base64");
  return `Basic ${encoded}`;
}

// ─── 타입 정의 ───

export interface BillingKeyResult {
  billingKey: string;
  customerKey: string;
  cardCompany: string;
  cardNumber: string; // 마스킹된 카드번호
  method: string;
}

export interface PaymentResult {
  paymentKey: string;
  orderId: string;
  amount: number;
  status: "DONE" | "CANCELED" | "FAILED";
  approvedAt: string;
  receipt?: { url: string };
}

// ─── 빌링키 발급 (카드 등록) ───

/**
 * 프론트에서 받은 authKey로 빌링키 발급
 * (프론트: TossPayments SDK의 requestBillingAuth 후 리다이렉트된 authKey)
 */
export async function issueBillingKey(params: {
  authKey: string;
  customerKey: string;
}): Promise<BillingKeyResult> {
  if (!process.env.TOSS_SECRET_KEY) {
    // PG 미연동 시 mock 반환
    console.log("[결제] PG 미연동 - mock 빌링키 발급");
    return {
      billingKey: `mock_billing_${Date.now()}`,
      customerKey: params.customerKey,
      cardCompany: "테스트카드",
      cardNumber: "****-****-****-1234",
      method: "카드",
    };
  }

  const res = await fetch(`${TOSS_API_URL}/authorizations/issue`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authKey: params.authKey,
      customerKey: params.customerKey,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`빌링키 발급 실패: ${error.message || res.statusText}`);
  }

  const data = await res.json();
  return {
    billingKey: data.billingKey,
    customerKey: data.customerKey,
    cardCompany: data.card?.company || "",
    cardNumber: data.card?.number || "",
    method: data.method || "카드",
  };
}

// ─── 빌링키로 자동 결제 ───

/**
 * 저장된 빌링키로 정기 결제 실행
 * 스케줄러에서 매월 1일 호출
 */
export async function chargeBilling(params: {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
}): Promise<PaymentResult> {
  if (!process.env.TOSS_SECRET_KEY) {
    // PG 미연동 시 mock 결제
    console.log(`[결제] PG 미연동 - mock 결제: ${params.orderName} ${params.amount}원`);
    return {
      paymentKey: `mock_pay_${Date.now()}`,
      orderId: params.orderId,
      amount: params.amount,
      status: "DONE",
      approvedAt: new Date().toISOString(),
    };
  }

  const res = await fetch(`${TOSS_API_URL}/${params.billingKey}`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customerKey: params.customerKey,
      amount: params.amount,
      orderId: params.orderId,
      orderName: params.orderName,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`결제 실패: ${error.message || res.statusText}`);
  }

  const data = await res.json();
  return {
    paymentKey: data.paymentKey,
    orderId: data.orderId,
    amount: data.totalAmount,
    status: data.status,
    approvedAt: data.approvedAt,
    receipt: data.receipt,
  };
}

// ─── 결제 취소 ───

export async function cancelPayment(params: {
  paymentKey: string;
  cancelReason: string;
  cancelAmount?: number; // 부분 취소 시
}): Promise<{ status: string }> {
  if (!process.env.TOSS_SECRET_KEY) {
    console.log(`[결제] PG 미연동 - mock 취소: ${params.paymentKey}`);
    return { status: "CANCELED" };
  }

  const res = await fetch(`https://api.tosspayments.com/v1/payments/${params.paymentKey}/cancel`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cancelReason: params.cancelReason,
      ...(params.cancelAmount ? { cancelAmount: params.cancelAmount } : {}),
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`결제 취소 실패: ${error.message || res.statusText}`);
  }

  const data = await res.json();
  return { status: data.status };
}

// ─── 월 정기결제 실행 (스케줄러용) ───

/**
 * 전체 테넌트 월 정기결제 처리
 * scheduler.ts에서 매월 1일 호출
 */
export async function processMonthlyBilling(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  const { getDb } = await import("../../db");
  const { sql: sqlTag } = await import("drizzle-orm");
  const { PLAN_CONFIG } = await import("../../utils/planConfig");

  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const result = { processed: 0, succeeded: 0, failed: 0, errors: [] as string[] };

  // 활성 테넌트 중 빌링키가 있는 것만 조회
  const [tenants] = await db.execute(sqlTag`
    SELECT t.id, t.name, t.subscription_package as plan, t.billing_key, t.customer_key
    FROM tenants t
    WHERE t.status = 'active'
      AND t.billing_key IS NOT NULL
      AND t.billing_key != ''
  `);

  for (const tenant of (tenants as any[])) {
    result.processed++;
    const plan = PLAN_CONFIG[tenant.plan as keyof typeof PLAN_CONFIG];
    if (!plan) continue;

    const orderId = `HACCP-${tenant.id}-${new Date().toISOString().slice(0, 7).replace("-", "")}`;
    const amount = Math.round(plan.monthlyPrice * 1.1); // 부가세 포함

    try {
      const payment = await chargeBilling({
        billingKey: tenant.billing_key,
        customerKey: tenant.customer_key,
        amount,
        orderId,
        orderName: `HACCP-ONE ${plan.name} 월 이용료`,
      });

      // 결제 이력 저장
      await db.execute(sqlTag`
        INSERT INTO subscription_payments
          (tenant_id, payment_key, order_id, amount, tax_amount, status, plan, paid_at)
        VALUES
          (${tenant.id}, ${payment.paymentKey}, ${orderId}, ${plan.monthlyPrice},
           ${Math.round(plan.monthlyPrice * 0.1)}, 'paid', ${tenant.plan}, NOW())
      `);

      result.succeeded++;
      console.log(`[결제] 테넌트 ${tenant.id} (${tenant.name}): ${amount}원 결제 성공`);
    } catch (err: any) {
      result.failed++;
      result.errors.push(`테넌트 ${tenant.id}: ${err.message}`);
      console.error(`[결제] 테넌트 ${tenant.id} 결제 실패:`, err.message);

      // 결제 실패 시 유예 기간 설정 (5일)
      await db.execute(sqlTag`
        UPDATE tenants
        SET grace_period_end_date = DATE_ADD(NOW(), INTERVAL 5 DAY)
        WHERE id = ${tenant.id}
      `);
    }
  }

  return result;
}
