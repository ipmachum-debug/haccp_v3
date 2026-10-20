/**
 * 허브 입구 화면 (UI/UX 개편 3-b, 2026-10-14) — /hub/{허브}
 *
 * 명세 §3: 허브의 첫 화면은 기능 목록이 아니라 "지금 처리할 것". 위: 처리할 일 카드(누르면 그 업무 화면) /
 * 아래: 이 허브의 업무 바로가기(사이드바와 같은 목록 — 레이아웃이 계산한 '보이는 메뉴').
 * 숫자는 이미 운영 중인 조회 API 만 쓴다 (새 집계 SQL 없음). 권한이 없어 조회가 막히면 그 카드는 "—".
 */
import type { ReactNode } from "react";
import { Link, useParams } from "wouter";
import { ArrowRight } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useHubMenu } from "@/components/dashboard/HubMenuContext";
import { PageHeader } from "@/components/common/PageHeader";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { unresolvedOnly } from "@/lib/todaySummary";
import { HUBS, HUBS_WITH_HOME, type HubId } from "@shared/navigation/menuRegistry";
import NotFound from "@/pages/NotFound";

type Tone = "neutral" | "attention" | "danger" | "good";

const TONE: Record<Tone, string> = {
  neutral: "border-border",
  attention: "border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/10",
  danger: "border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10",
  good: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
};

/** 숫자 → 카드 색: 0 이면 정상(초록), 있으면 주의/위험 */
export function toneFor(value: number | null | undefined, whenNonZero: Tone = "attention"): Tone {
  if (value == null) return "neutral";
  return value > 0 ? whenNonZero : "good";
}

function Metric({ label, value, unit = "건", sub, tone = "neutral", href, loading }: {
  label: string; value: number | string | null | undefined; unit?: string; sub?: ReactNode; tone?: Tone; href: string; loading?: boolean;
}) {
  const shown = loading ? "…" : value == null ? "—" : typeof value === "number" ? value.toLocaleString() : value;
  return (
    <Link href={href} className={cn("group rounded-2xl border p-4 bg-card hover:shadow-md transition-all flex flex-col gap-1 min-w-0", TONE[tone])} data-testid="hub-metric">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums leading-tight break-all">
        {shown}{value != null && !loading && typeof value === "number" && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
      <span className="mt-auto pt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-70 group-hover:opacity-100">
        바로 처리 <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

const won = (n: number | null | undefined) => (n == null ? null : `${Math.round(n).toLocaleString()}원`);

/* ── 허브별 "지금 처리할 것" ───────────────────────────────────────── */

function TodayCards() {
  const s = trpc.dashboard.getStats.useQuery(undefined, { retry: 1 });
  const d = s.data;
  return (
    <>
      <Metric label="승인 대기" value={d?.pendingApprovalCount} tone={toneFor(d?.pendingApprovalCount)} href="/dashboard/approval" loading={s.isLoading} sub="배치·매출·매입·기록지 결재" />
      <Metric label="읽지 않은 알림" value={d?.unreadNotificationCount} tone={toneFor(d?.unreadNotificationCount)} href="/notifications" loading={s.isLoading} sub="나에게 온 것 + 전체 공지" />
      <Metric label="오늘 미제출 CCP 기록지" value={d?.todayCcpDraftCount} tone={toneFor(d?.todayCcpDraftCount, "danger")} href="/quality/ccp-monitoring" loading={s.isLoading} sub={d ? `오늘 기록지 ${d.todayCcpFormCount ?? 0}건 중` : undefined} />
      <Metric label="진행 중 배치" value={d?.inProgressBatches} href="/dashboard/production/today" loading={s.isLoading} sub={d ? `오늘 완료 ${d.completedToday ?? 0}건` : undefined} />
    </>
  );
}

function TradeCards() {
  const acc = trpc.dashboard.getAccountingSummary.useQuery(undefined, { retry: 1 });
  const po = trpc.purchaseOrder.list.useQuery({ status: "approved" }, { retry: 1 });
  const qt = trpc.quotation.stats.useQuery(undefined, { retry: 1 });
  const a: any = acc.data;
  const poCount = Array.isArray(po.data) ? po.data.length : null;
  return (
    <>
      <Metric label="확정 대기 매출" value={a?.pendingSalesCount} tone={toneFor(a?.pendingSalesCount)} href="/dashboard/accounting/sales/list" loading={acc.isLoading} sub="확정하면 재고 차감·분개" />
      <Metric label="확정 대기 매입" value={a?.pendingPurchasesCount} tone={toneFor(a?.pendingPurchasesCount)} href="/dashboard/accounting/purchases/list" loading={acc.isLoading} sub="확정하면 재고 입고·분개" />
      <Metric label="입고 대기 발주" value={poCount} tone={toneFor(poCount)} href="/dashboard/accounting/purchase-orders" loading={po.isLoading} sub="승인됨 · 입고 처리 전" />
      <Metric label="진행 중 견적" value={(qt.data as any)?.sentCount} href="/dashboard/accounting/quotations" loading={qt.isLoading} sub={qt.data ? `매출 전환 ${(qt.data as any).convertedCount ?? 0}건` : undefined} />
    </>
  );
}

function ItemsCards() {
  const low = trpc.inventory.getLowStock.useQuery(undefined, { retry: 1 });
  const exp = trpc.dashboard.getExpiringMaterials.useQuery(undefined, { retry: 1 });
  const lowN = Array.isArray(low.data) ? low.data.length : null;
  const expN = Array.isArray(exp.data) ? exp.data.length : null;
  return (
    <>
      <Metric label="재고 부족" value={lowN} tone={toneFor(lowN)} href="/inventory-management" loading={low.isLoading} sub="안전재고 미만 원재료" />
      <Metric label="유통기한 임박" value={expN} tone={toneFor(expN, "danger")} href="/inventory-management" loading={exp.isLoading} sub="LOT 기준" />
    </>
  );
}

function ProductionCards() {
  const s = trpc.dashboard.getStats.useQuery(undefined, { retry: 1 });
  const d = s.data;
  return (
    <>
      <Metric label="진행 중 배치" value={d?.inProgressBatches} href="/dashboard/production/today" loading={s.isLoading} sub="생산 화면에서 줄마다 진행·막힌 것" />
      <Metric label="오늘 완료" value={d?.completedToday} tone="good" href="/dashboard/production/today" loading={s.isLoading} sub={d ? `이번 주 ${d.completedWeek ?? 0} · 이번 달 ${d.completedMonth ?? 0}` : undefined} />
      <Metric label="오늘 미제출 CCP 기록지" value={d?.todayCcpDraftCount} tone={toneFor(d?.todayCcpDraftCount, "danger")} href="/quality/ccp-monitoring" loading={s.isLoading} />
    </>
  );
}

function QualityCards() {
  const s = trpc.dashboard.getStats.useQuery(undefined, { retry: 1 });
  const dev = trpc.dashboard.ccpDeviations.useQuery({ limit: 50 }, { retry: 1 }); // Today 와 같은 기준
  const cl = trpc.checklistDashboard.getStats.useQuery(undefined, { retry: 1 });
  const d = s.data;
  const devN = Array.isArray(dev.data) ? unresolvedOnly(dev.data as any[]).length : null;
  const clRows = Array.isArray(cl.data) ? (cl.data as any[]) : null;
  const clPending = clRows ? clRows.reduce((n, r) => n + Math.max(0, (r.total || 0) - (r.completed || 0)), 0) : null;
  return (
    <>
      <Metric label="오늘 미제출 CCP 기록지" value={d?.todayCcpDraftCount} tone={toneFor(d?.todayCcpDraftCount, "danger")} href="/quality/ccp-monitoring" loading={s.isLoading} sub={d ? `오늘 기록지 ${d.todayCcpFormCount ?? 0}건 (공식 기록지 기준)` : undefined} />
      <Metric label="미해결 CCP 이탈" value={devN} tone={toneFor(devN, "danger")} href="/dashboard/haccp/f3-dashboard" loading={dev.isLoading} sub="시정조치가 끝나지 않은 이탈" />
      <Metric label="미완료 점검" value={clPending} tone={toneFor(clPending)} href="/quality/checklists" loading={cl.isLoading} sub="체크리스트 · 점검일지" />
    </>
  );
}

function FinanceCards() {
  const credit = trpc.partnerCredit.summary.useQuery(undefined, { retry: 1 });
  const cash = trpc.cashFlow.dashboard.useQuery(undefined, { retry: 1 });
  const acc = trpc.dashboard.getAccountingSummary.useQuery(undefined, { retry: 1 });
  const c: any = credit.data;
  const accounts: any[] = Array.isArray((cash.data as any)?.bankAccounts) ? (cash.data as any).bankAccounts : [];
  const balance = cash.data ? accounts.reduce((n, a) => n + Number(a.balance || 0), 0) : null;
  const pending = (acc.data as any)?.pendingTotalCount;
  return (
    <>
      <Metric label="미수금" value={won(c?.totalAR)} href="/dashboard/accounting/partner-credit" loading={credit.isLoading} sub={c ? `거래처 ${c.arCount ?? 0}곳` : undefined} tone={c?.totalAR > 0 ? "attention" : "neutral"} />
      <Metric label="미지급금" value={won(c?.totalAP)} href="/dashboard/accounting/partner-credit" loading={credit.isLoading} sub={c ? `거래처 ${c.apCount ?? 0}곳` : undefined} />
      <Metric label="계좌 잔액 합계" value={won(balance)} href="/dashboard/accounting/cash-flow" loading={cash.isLoading} sub={cash.data ? `계좌 ${accounts.length}개` : undefined} />
      <Metric label="미확정 매출·매입" value={pending} tone={toneFor(pending)} href="/dashboard/accounting/sales/list" loading={acc.isLoading} sub="확정해야 분개가 만들어진다" />
    </>
  );
}

const CARDS: Partial<Record<HubId, () => ReactNode>> = {
  today: TodayCards, trade: TradeCards, items: ItemsCards, production: ProductionCards, quality: QualityCards, finance: FinanceCards,
};

const DESCRIPTION: Partial<Record<HubId, string>> = {
  today: "승인할 것, 읽을 알림, 오늘 빠진 기록을 먼저 봅니다.",
  trade: "확정 대기 거래와 입고 대기 발주부터 처리합니다.",
  items: "재고 부족과 유통기한 임박부터 확인합니다.",
  production: "오늘 진행 중인 생산과 기록 상태를 봅니다.",
  quality: "오늘 써야 할 기록지와 미해결 이탈을 먼저 처리합니다.",
  finance: "회계 받은편지함 — 미수·미지급, 잔액, 미확정 거래.",
};

export default function HubHome() {
  const params = useParams<{ hubId: string }>();
  const hubId = params.hubId as HubId;
  const hub = HUBS.find((h) => h.id === hubId);
  if (!hub || !HUBS_WITH_HOME.includes(hubId)) return <NotFound />;
  return (
    <DashboardLayout>
      <HubHomeBody hubId={hubId} label={hub.label} />
    </DashboardLayout>
  );
}

/** 레이아웃 안쪽 — 허브 메뉴 컨텍스트(보이는 메뉴)는 레이아웃이 제공하므로 여기서 읽는다 */
function HubHomeBody({ hubId, label }: { hubId: HubId; label: string }) {
  const sections = useHubMenu();
  const Cards = CARDS[hubId]!;
  const items = sections.find((s) => s.hub.id === hubId)?.items ?? [];
  return (
    <>
      <PageHeader title={label} description={DESCRIPTION[hubId]} hub={null} />
      <section aria-label="지금 처리할 것" className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">지금 처리할 것</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cards />
        </div>
      </section>
      {items.length > 0 && (
        <section aria-label="업무" className="space-y-2 mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground">업무</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {items.map((it) => (
              <Link key={it.path} href={it.path} className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-sm hover:bg-accent transition-colors min-w-0">
                <it.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{it.label}</span>
                {it.section && <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{it.section}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
