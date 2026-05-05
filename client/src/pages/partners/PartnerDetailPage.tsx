/**
 * Partner Detail Page — 거래처 360 페이지 (CRM Phase 1)
 *
 * URL: /dashboard/partners/:id
 *
 * Phase 1 범위:
 *   - 헤더: 아바타 + 이름 + 타입 + 등급 + 태그 + 빠른 액션 (전화/메일/뒤로)
 *   - 좌측 사이드: 기본 정보 + 신용 한도 + AP/AR 잔액
 *   - 우측 메인: 탭 — 개요 / 담당자 / 활동 / 태그
 *
 * Phase 2 (예정): 거래내역 / 견적 / 단가 / 서류 / 분석 탭
 *
 * 작성: 2026-05-05
 */
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Building2,
  ShoppingCart,
  Truck,
  Star,
  TrendingUp,
  TrendingDown,
  FileText,
  Plus,
  Trash2,
  UserCircle,
  Activity,
  Tag,
  Pencil,
  CheckCircle2,
  Calendar,
  Clock,
  X,
  Download,
  ExternalLink,
  Receipt,
  Award,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ROUTES } from "@/lib/routePaths";

function nameToHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}
function initials(name: string): string {
  if (!name) return "?";
  const t = name
    .replace(/^(주식회사|㈜|\(주\))\s*/g, "")
    .replace(/\s*(주식회사|㈜|\(주\))$/g, "")
    .trim();
  if (!t) return "?";
  // 한글: 2자, 영숫자: 2자
  if (/[가-힣]/.test(t[0])) return t.slice(0, 2);
  return t.slice(0, 2).toUpperCase();
}
function fmtKRW(n: number | null | undefined): string {
  if (n == null) return "-";
  return new Intl.NumberFormat("ko-KR").format(Math.round(Number(n) || 0)) + "원";
}
function fmtDate(d: any): string {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("ko-KR");
}
function relativeTime(date: string | Date | null | undefined): string {
  if (!date) return "활동 없음";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "활동 없음";
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return fmtDate(date);
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  meeting: <Calendar className="w-4 h-4" />,
  visit: <MapPin className="w-4 h-4" />,
  note: <FileText className="w-4 h-4" />,
  quote_sent: <FileText className="w-4 h-4" />,
  contract_signed: <CheckCircle2 className="w-4 h-4" />,
  payment_received: <TrendingUp className="w-4 h-4" />,
  payment_overdue: <TrendingDown className="w-4 h-4" />,
  task: <Clock className="w-4 h-4" />,
  other: <Activity className="w-4 h-4" />,
};

const ACTIVITY_LABEL: Record<string, string> = {
  call: "전화",
  email: "이메일",
  meeting: "미팅",
  visit: "방문",
  note: "메모",
  quote_sent: "견적 발송",
  contract_signed: "계약 체결",
  payment_received: "입금",
  payment_overdue: "연체",
  task: "할 일",
  other: "기타",
};

export default function PartnerDetailPage() {
  return (
    <DashboardLayout>
      <PartnerDetailContent />
    </DashboardLayout>
  );
}

function PartnerDetailContent() {
  const [, params] = useRoute("/dashboard/partners/:id");
  const [, navigate] = useLocation();
  const partnerId = Number(params?.id || 0);
  const [tab, setTab] = useState<
    "overview" | "contacts" | "activities" | "tags" | "transactions" | "quotes" | "prices" | "documents" | "analytics"
  >("overview");

  const { data: overview, isLoading } = trpc.partnerCrm.overview.useQuery(
    { partnerId },
    { enabled: partnerId > 0 },
  );

  if (!partnerId) {
    return <div className="p-8 text-center text-muted-foreground">잘못된 접근입니다</div>;
  }

  if (isLoading || !overview) {
    return <div className="p-8 text-center text-muted-foreground">불러오는 중...</div>;
  }

  const p = overview.partner as any;
  const hue = nameToHue(p.company_name || p.companyName || "");
  const init = initials(p.company_name || p.companyName || "");

  return (
    <div className="space-y-4">
      {/* 뒤로가기 */}
      <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.PARTNERS_FEED)}>
        <ArrowLeft className="w-4 h-4 mr-1" /> 거래처 피드로
      </Button>

      {/* 헤더 카드 — LinkedIn / Notion 프로필 스타일 */}
      <Card className="overflow-hidden">
        {/* 상단 그라디언트 cover 배너 */}
        <div
          className="h-20 relative"
          style={{
            background: `linear-gradient(135deg, hsl(${hue}, 55%, 50%) 0%, hsl(${(hue + 40) % 360}, 50%, 40%) 100%)`,
          }}
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 50%, white 0%, transparent 30%), radial-gradient(circle at 80% 30%, white 0%, transparent 30%)",
            }}
          />
        </div>

        <CardContent className="px-6 pb-5 pt-0 relative">
          {/* 좌측: 작은 정사각형 로고 (cover 위에 살짝 걸침) */}
          <div className="flex items-end gap-4 -mt-8 mb-3">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0 ring-4 ring-background shadow-md"
              style={{
                background: `linear-gradient(135deg, hsl(${hue}, 60%, 50%), hsl(${(hue + 30) % 360}, 60%, 42%))`,
              }}
            >
              {init}
            </div>

            {/* 우측 액션: 전화/메일/편집 */}
            <div className="ml-auto flex items-center gap-1.5">
              {p.phone && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${p.phone}`}>
                    <Phone className="w-3.5 h-3.5 mr-1" /> 전화
                  </a>
                </Button>
              )}
              {p.email && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:${p.email}`}>
                    <Mail className="w-3.5 h-3.5 mr-1" /> 메일
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* 회사명 + 배지 */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-xl font-bold">{p.company_name || p.companyName || "(이름 없음)"}</h1>
            {p.grade === "vip" && (
              <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
                <Star className="w-3 h-3 mr-1 fill-current" /> VIP
              </Badge>
            )}
            <PartnerTypeBadge type={p.partner_type || p.partnerType} />
          </div>

          {/* 메타 정보 — 한 줄로 정렬 */}
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
              {p.biz_no && (
                <span className="inline-flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {p.biz_no}
                </span>
              )}
              {p.ceo_name && (
                <span className="inline-flex items-center gap-1">
                  <UserCircle className="w-3 h-3" /> 대표 {p.ceo_name}
                </span>
              )}
              {p.contact_person && (
                <span className="inline-flex items-center gap-1">
                  <UserCircle className="w-3 h-3" /> 담당 {p.contact_person}
                </span>
              )}
              {p.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {p.phone}
                </span>
              )}
              {p.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {p.email}
                </span>
              )}
            </div>
            {p.address && (
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {p.address}
              </div>
            )}
            {(p.biz_type || p.biz_item) && (
              <div className="flex items-center gap-x-3 flex-wrap text-muted-foreground/70">
                {p.biz_type && <span>업태: {p.biz_type}</span>}
                {p.biz_item && <span>종목: {p.biz_item}</span>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="총 매입"
          value={fmtKRW(overview.purchase.total)}
          sub={`${overview.purchase.count}건 · 최근 ${fmtDate(overview.purchase.lastAt)}`}
          icon={<Truck className="w-5 h-5 text-emerald-500" />}
        />
        <StatCard
          label="총 매출"
          value={fmtKRW(overview.sale.total)}
          sub={`${overview.sale.count}건 · 최근 ${fmtDate(overview.sale.lastAt)}`}
          icon={<ShoppingCart className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          label="외상매입금 (AP)"
          value={fmtKRW(overview.apBalance)}
          sub={overview.apBalance > 0 ? "지급 예정" : ""}
          icon={<TrendingDown className="w-5 h-5 text-red-500" />}
        />
        <StatCard
          label="외상매출금 (AR)"
          value={fmtKRW(overview.arBalance)}
          sub={overview.arBalance > 0 ? "수금 예정" : ""}
          icon={<TrendingUp className="w-5 h-5 text-amber-500" />}
        />
      </div>

      {/* 탭 */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="contacts">
            담당자 {overview.counts.contacts > 0 && <Badge variant="secondary" className="ml-1">{overview.counts.contacts}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="activities">
            활동 이력 {overview.counts.activities > 0 && <Badge variant="secondary" className="ml-1">{overview.counts.activities}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="transactions">
            거래내역 {overview.purchase.count + overview.sale.count > 0 && (
              <Badge variant="secondary" className="ml-1">{overview.purchase.count + overview.sale.count}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="quotes">
            견적 {overview.quote.count > 0 && <Badge variant="secondary" className="ml-1">{overview.quote.count}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="prices">단가 추이</TabsTrigger>
          <TabsTrigger value="documents">서류</TabsTrigger>
          <TabsTrigger value="analytics">분석</TabsTrigger>
          <TabsTrigger value="tags">
            태그 {overview.counts.tags > 0 && <Badge variant="secondary" className="ml-1">{overview.counts.tags}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab partner={p} overview={overview} />
        </TabsContent>
        <TabsContent value="contacts" className="mt-4">
          <ContactsTab partnerId={partnerId} />
        </TabsContent>
        <TabsContent value="activities" className="mt-4">
          <ActivitiesTab partnerId={partnerId} />
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          <TransactionsTab partnerId={partnerId} />
        </TabsContent>
        <TabsContent value="quotes" className="mt-4">
          <QuotesTab partnerId={partnerId} />
        </TabsContent>
        <TabsContent value="prices" className="mt-4">
          <PricesTab partnerId={partnerId} />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab partnerId={partnerId} />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <AnalyticsTab partnerId={partnerId} />
        </TabsContent>
        <TabsContent value="tags" className="mt-4">
          <TagsTab partnerId={partnerId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PartnerTypeBadge({ type }: { type: string }) {
  if (type === "supplier") return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">공급처</Badge>;
  if (type === "customer") return <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400">고객</Badge>;
  if (type === "subcontractor") return <Badge className="bg-purple-500/10 text-purple-700 dark:text-purple-400">외주</Badge>;
  return <Badge variant="secondary">{type}</Badge>;
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className="text-xl font-bold mt-2">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Overview Tab ───
function OverviewTab({ partner: p, overview }: { partner: any; overview: any }) {
  return (
    <div className="space-y-4">
      <CreditScoreWidget partnerId={Number(p.id)} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">기본 정보</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="대표자">{p.ceo_name || "-"}</Row>
          <Row label="사업자번호">{p.biz_no || "-"}</Row>
          <Row label="업태">{p.biz_type || "-"}</Row>
          <Row label="종목">{p.biz_item || "-"}</Row>
          <Row label="주소">{p.address || "-"}</Row>
          <Row label="전화">{p.phone || "-"}</Row>
          <Row label="팩스">{p.fax || "-"}</Row>
          <Row label="이메일">{p.email || "-"}</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">거래 조건</CardTitle>
          <TermsEditDialog partner={p} />
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="등급">{p.grade || "-"}</Row>
          <Row label="결제 조건">{p.payment_terms_days ? `${p.payment_terms_days}일` : "-"}</Row>
          <Row label="여신 한도">{fmtKRW(p.credit_limit)}</Row>
          <Row label="기본 할인율">{p.default_discount_rate ? `${p.default_discount_rate}%` : "-"}</Row>
          <Row label="은행">{p.bank_name || "-"}</Row>
          <Row label="계좌">{p.bank_account || "-"}</Row>
          <Row label="등록일">{fmtDate(p.created_at)}</Row>
          <Row label="최근 수정">{relativeTime(p.updated_at)}</Row>
        </CardContent>
      </Card>

      {p.notes && (
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">메모</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{p.notes}</CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

// ─── Phase 4: Credit Score Widget ───
function CreditScoreWidget({ partnerId }: { partnerId: number }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.partnerCrm.latestScore.useQuery({ partnerId });
  const recalcMut = trpc.partnerCrm.recalculateScore.useMutation({
    onSuccess: () => {
      utils.partnerCrm.latestScore.invalidate();
      toast({ title: "신용점수가 재계산되었습니다" });
    },
  });

  const gradeColor: Record<string, { bg: string; ring: string; text: string }> = {
    A: { bg: "bg-emerald-500", ring: "ring-emerald-500/30", text: "text-emerald-600" },
    B: { bg: "bg-blue-500", ring: "ring-blue-500/30", text: "text-blue-600" },
    C: { bg: "bg-amber-500", ring: "ring-amber-500/30", text: "text-amber-600" },
    D: { bg: "bg-red-500", ring: "ring-red-500/30", text: "text-red-600" },
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">신용점수 불러오는 중...</CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">신용/활성도 점수</div>
            <div className="text-xs text-muted-foreground">아직 산정되지 않았습니다</div>
          </div>
          <Button
            size="sm"
            onClick={() => recalcMut.mutate({ partnerId })}
            disabled={recalcMut.isPending}
          >
            {recalcMut.isPending ? "산정 중..." : "지금 산정"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { latest, history } = data as any;
  const c = gradeColor[latest.grade] || gradeColor.C;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* 종합 점수 + 등급 */}
          <div className="flex flex-col items-center shrink-0">
            <div
              className={`relative w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl ring-8 ${c.ring} ${c.bg}`}
            >
              {latest.grade}
              <span className="absolute -bottom-1 right-0 bg-white text-xs px-1.5 py-0.5 rounded-full border font-semibold text-foreground">
                {latest.totalScore}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">신용/활성도</div>
          </div>

          {/* 4 factor breakdown */}
          <div className="flex-1 grid grid-cols-2 gap-2">
            <ScoreBar label="결제 적시성" score={latest.paymentTimelinessScore} max={30} color="emerald" />
            <ScoreBar label="신용 활용도" score={latest.creditUtilizationScore} max={25} color="blue" />
            <ScoreBar label="활동 빈도" score={latest.activityFrequencyScore} max={20} color="purple" />
            <ScoreBar label="거래량 안정성" score={latest.transactionStabilityScore} max={25} color="amber" />
          </div>

          <div className="flex flex-col gap-1 items-end shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => recalcMut.mutate({ partnerId })}
              disabled={recalcMut.isPending}
            >
              {recalcMut.isPending ? "산정 중..." : "재계산"}
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {fmtDate(latest.snapshotDate)} 기준
            </span>
          </div>
        </div>

        {/* 30일 추이 mini chart */}
        {history.length > 1 && (
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={60}>
              <LineChart data={history}>
                <Line type="monotone" dataKey="total" stroke={`var(--${latest.grade === "A" ? "emerald" : latest.grade === "B" ? "blue" : latest.grade === "C" ? "amber" : "red"}-500)`} strokeWidth={2} dot={false} />
                <YAxis hide domain={[0, 100]} />
                <RTooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={(v: any) => `${v}점`}
                  labelFormatter={(l: any) => l}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{history[0]?.date}</span>
              <span>30일 추이</span>
              <span>{history[history.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {/* breakdown 설명 */}
        {latest.breakdown && (
          <details className="mt-3">
            <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
              산정 근거 보기
            </summary>
            <div className="text-xs text-muted-foreground mt-2 grid grid-cols-2 gap-2 bg-muted/30 p-2 rounded">
              <div>
                평균 지연일:{" "}
                {latest.breakdown.avgPaymentDelayDays !== null
                  ? `${latest.breakdown.avgPaymentDelayDays.toFixed(1)}일`
                  : "데이터 없음"}
              </div>
              <div>
                AP 활용:{" "}
                {latest.breakdown.utilizationPct !== null
                  ? `${latest.breakdown.utilizationPct.toFixed(0)}%`
                  : "한도 미설정"}
              </div>
              <div>최근 90일 활동: {latest.breakdown.activityCount90d}건</div>
              <div>
                월거래 변동:{" "}
                {latest.breakdown.monthlyTransactionCV !== null
                  ? `${latest.breakdown.monthlyTransactionCV.toFixed(0)}%`
                  : "표본 부족"}
              </div>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBar({
  label,
  score,
  max,
  color,
}: {
  label: string;
  score: number;
  max: number;
  color: "emerald" | "blue" | "purple" | "amber";
}) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const bgClass = {
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
    amber: "bg-amber-500",
  }[color];
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {score}/{max}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${bgClass} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

// ─── 거래 조건 인라인 수정 다이얼로그 ───
function TermsEditDialog({ partner: p }: { partner: any }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    grade: p.grade ?? "",
    paymentTermsDays: p.payment_terms_days ?? "",
    creditLimit: p.credit_limit ?? "",
    defaultDiscountRate: p.default_discount_rate ?? "",
    bankName: p.bank_name ?? "",
    bankAccount: p.bank_account ?? "",
  });

  const updateMut = trpc.partners.update.useMutation({
    onSuccess: () => {
      utils.partnerCrm.overview.invalidate();
      toast({ title: "거래 조건이 수정되었습니다" });
      setOpen(false);
    },
    onError: (err) => {
      toast({ title: "수정 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // 다이얼로그 열 때마다 최신 값으로 reset
        if (v) {
          setForm({
            grade: p.grade ?? "",
            paymentTermsDays: p.payment_terms_days ?? "",
            creditLimit: p.credit_limit ?? "",
            defaultDiscountRate: p.default_discount_rate ?? "",
            bankName: p.bank_name ?? "",
            bankAccount: p.bank_account ?? "",
          });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2">
          <Pencil className="w-3.5 h-3.5 mr-1" /> 수정
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>거래 조건 수정 — {p.company_name || p.companyName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>등급</Label>
              <Select value={form.grade || "none"} onValueChange={(v) => setForm({ ...form, grade: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">미지정</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="economy">Economy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>결제 조건 (일)</Label>
              <Input
                type="number"
                min={0}
                value={form.paymentTermsDays}
                onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })}
                placeholder="30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>여신 한도 (원)</Label>
              <Input
                type="number"
                min={0}
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
                placeholder="10000000"
              />
            </div>
            <div>
              <Label>기본 할인율 (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.defaultDiscountRate}
                onChange={(e) => setForm({ ...form, defaultDiscountRate: e.target.value })}
                placeholder="5"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>은행</Label>
              <Input
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                placeholder="국민은행"
              />
            </div>
            <div>
              <Label>계좌</Label>
              <Input
                value={form.bankAccount}
                onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                placeholder="123-456-789012"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button
            onClick={() => {
              const payload: any = { id: Number(p.id) };
              if (form.grade !== (p.grade ?? "")) payload.grade = form.grade;
              if (form.paymentTermsDays !== (p.payment_terms_days ?? "")) {
                payload.paymentTermsDays = form.paymentTermsDays === "" ? undefined : Number(form.paymentTermsDays);
              }
              if (form.creditLimit !== (p.credit_limit ?? "")) {
                payload.creditLimit = form.creditLimit === "" ? undefined : Number(form.creditLimit);
              }
              if (form.defaultDiscountRate !== (p.default_discount_rate ?? "")) {
                payload.defaultDiscountRate =
                  form.defaultDiscountRate === "" ? undefined : Number(form.defaultDiscountRate);
              }
              if (form.bankName !== (p.bank_name ?? "")) payload.bankName = form.bankName;
              if (form.bankAccount !== (p.bank_account ?? "")) payload.bankAccount = form.bankAccount;
              updateMut.mutate(payload);
            }}
            disabled={updateMut.isPending}
          >
            {updateMut.isPending ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Contacts Tab ───
function ContactsTab({ partnerId }: { partnerId: number }) {
  const utils = trpc.useUtils();
  const { data: contacts = [], isLoading } = trpc.partnerCrm.contactList.useQuery({ partnerId });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const createMut = trpc.partnerCrm.contactCreate.useMutation({
    onSuccess: () => {
      utils.partnerCrm.contactList.invalidate();
      utils.partnerCrm.overview.invalidate();
      toast({ title: "담당자가 추가되었습니다" });
      setOpen(false);
    },
  });
  const updateMut = trpc.partnerCrm.contactUpdate.useMutation({
    onSuccess: () => {
      utils.partnerCrm.contactList.invalidate();
      toast({ title: "담당자 정보가 수정되었습니다" });
      setOpen(false);
      setEditing(null);
    },
  });
  const deleteMut = trpc.partnerCrm.contactDelete.useMutation({
    onSuccess: () => {
      utils.partnerCrm.contactList.invalidate();
      utils.partnerCrm.overview.invalidate();
      toast({ title: "담당자가 삭제되었습니다" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 담당자 추가</Button>
          </DialogTrigger>
          <ContactDialogContent
            partnerId={partnerId}
            editing={editing}
            onSubmit={(data) => {
              if (editing) updateMut.mutate({ id: editing.id, partnerId, ...data, isActive: true });
              else createMut.mutate({ partnerId, ...data });
            }}
            isPending={createMut.isPending || updateMut.isPending}
          />
        </Dialog>
      </div>
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <UserCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>등록된 담당자가 없습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {contacts.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="p-4 flex gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                  style={{ background: `hsl(${nameToHue(c.name)}, 65%, 55%)` }}
                >
                  {initials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.isPrimary === 1 && <Badge className="text-[10px] bg-amber-500">주담당</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.role} {c.department && `· ${c.department}`}
                  </div>
                  {c.phone && <div className="text-xs mt-1">📞 {c.phone}</div>}
                  {c.mobile && <div className="text-xs">📱 {c.mobile}</div>}
                  {c.email && <div className="text-xs truncate">✉ {c.email}</div>}
                  {c.notes && <div className="text-xs text-muted-foreground mt-1">{c.notes}</div>}
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`'${c.name}' 담당자를 삭제할까요?`)) deleteMut.mutate({ id: c.id });
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactDialogContent({
  partnerId,
  editing,
  onSubmit,
  isPending,
}: {
  partnerId: number;
  editing: any;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    name: editing?.name || "",
    role: editing?.role || "",
    department: editing?.department || "",
    phone: editing?.phone || "",
    mobile: editing?.mobile || "",
    email: editing?.email || "",
    isPrimary: editing?.isPrimary === 1,
    notes: editing?.notes || "",
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "담당자 수정" : "담당자 추가"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>이름 *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>직책</Label>
            <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="구매팀장" />
          </div>
          <div>
            <Label>부서</Label>
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="구매부" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>유선전화</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>휴대전화</Label>
            <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>이메일</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
          />
          이 거래처의 주담당으로 설정
        </label>
        <div>
          <Label>메모</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={!form.name.trim() || isPending}>
          저장
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Activities Tab ───
function ActivitiesTab({ partnerId }: { partnerId: number }) {
  const utils = trpc.useUtils();
  const { data: activities = [], isLoading } = trpc.partnerCrm.activityTimeline.useQuery({
    partnerId,
    limit: 50,
  });
  const [open, setOpen] = useState(false);

  const createMut = trpc.partnerCrm.activityCreate.useMutation({
    onSuccess: () => {
      utils.partnerCrm.activityTimeline.invalidate();
      utils.partnerCrm.overview.invalidate();
      toast({ title: "활동이 기록되었습니다" });
      setOpen(false);
    },
  });

  const deleteMut = trpc.partnerCrm.activityDelete.useMutation({
    onSuccess: () => {
      utils.partnerCrm.activityTimeline.invalidate();
      utils.partnerCrm.overview.invalidate();
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 활동 기록</Button>
          </DialogTrigger>
          <ActivityDialogContent
            partnerId={partnerId}
            onSubmit={(data) => createMut.mutate({ partnerId, ...data })}
            isPending={createMut.isPending}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
      ) : activities.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>활동 이력이 없습니다</p>
          <p className="text-xs mt-1">전화/방문/메일/계약 등을 기록하면 거래처별 타임라인이 만들어집니다</p>
        </div>
      ) : (
        <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-border">
          {activities.map((a: any) => (
            <div key={a.uid} className="relative">
              <div className="absolute -left-[18px] top-1 w-6 h-6 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                {ACTIVITY_ICONS[a.type] || <Activity className="w-3 h-3" />}
              </div>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {ACTIVITY_LABEL[a.type] || a.type}
                        </Badge>
                        {a.source === "comm_log" && (
                          <Badge variant="secondary" className="text-[10px]">
                            메모
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(a.occurredAt)}
                        </span>
                      </div>
                      <div className="font-medium text-sm mt-1">{a.title}</div>
                      {a.body && <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</div>}
                    </div>
                    {a.source === "activity" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          if (confirm("이 활동을 삭제할까요?")) deleteMut.mutate({ id: a.id });
                        }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityDialogContent({
  partnerId,
  onSubmit,
  isPending,
}: {
  partnerId: number;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    activityType: "call" as
      | "call"
      | "email"
      | "meeting"
      | "visit"
      | "note"
      | "task"
      | "other",
    title: "",
    body: "",
    durationMinutes: undefined as number | undefined,
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>활동 기록</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>활동 유형</Label>
          <Select value={form.activityType} onValueChange={(v) => setForm({ ...form, activityType: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="call">📞 전화</SelectItem>
              <SelectItem value="email">✉ 이메일</SelectItem>
              <SelectItem value="meeting">📅 미팅</SelectItem>
              <SelectItem value="visit">📍 방문</SelectItem>
              <SelectItem value="note">📝 메모</SelectItem>
              <SelectItem value="task">⏰ 할 일</SelectItem>
              <SelectItem value="other">🔖 기타</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>제목 *</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="신제품 견적 요청 통화"
          />
        </div>
        <div>
          <Label>상세 내용</Label>
          <Textarea
            rows={4}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="대화/회의 내용 / 다음 액션"
          />
        </div>
        {(form.activityType === "call" || form.activityType === "meeting") && (
          <div>
            <Label>소요 시간 (분)</Label>
            <Input
              type="number"
              value={form.durationMinutes ?? ""}
              onChange={(e) =>
                setForm({ ...form, durationMinutes: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="30"
            />
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={!form.title.trim() || isPending}>
          기록
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Tags Tab ───
const TAG_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

function TagsTab({ partnerId }: { partnerId: number }) {
  const utils = trpc.useUtils();
  const { data: tags = [], isLoading } = trpc.partnerCrm.tagList.useQuery({ partnerId });
  const [newTag, setNewTag] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);

  const addMut = trpc.partnerCrm.tagAdd.useMutation({
    onSuccess: () => {
      utils.partnerCrm.tagList.invalidate();
      utils.partnerCrm.overview.invalidate();
      setNewTag("");
    },
  });
  const removeMut = trpc.partnerCrm.tagRemove.useMutation({
    onSuccess: () => {
      utils.partnerCrm.tagList.invalidate();
      utils.partnerCrm.overview.invalidate();
    },
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-muted-foreground" />
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="새 태그 (예: VIP, 신규, 위험)"
            className="max-w-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTag.trim()) {
                addMut.mutate({ partnerId, tag: newTag.trim(), color });
              }
            }}
          />
          <div className="flex items-center gap-1">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <Button
            size="sm"
            disabled={!newTag.trim() || addMut.isPending}
            onClick={() => addMut.mutate({ partnerId, tag: newTag.trim(), color })}
          >
            추가
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">불러오는 중...</div>
        ) : tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">태그가 없습니다. 위에서 추가하세요.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((t: any) => (
              <div
                key={t.id}
                className="px-3 py-1 rounded-full text-xs flex items-center gap-1.5 text-white"
                style={{ background: t.color || "#6b7280" }}
              >
                <span>{t.tag}</span>
                <button
                  onClick={() => removeMut.mutate({ id: t.id })}
                  className="opacity-70 hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Phase 2: Transactions Tab ───
function TransactionsTab({ partnerId }: { partnerId: number }) {
  const [kind, setKind] = useState<"all" | "purchase" | "sale">("all");
  const { data: txs = [], isLoading } = trpc.partnerCrm.transactions.useQuery({
    partnerId,
    kind,
    limit: 200,
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">필터:</span>
          {(["all", "purchase", "sale"] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={kind === k ? "default" : "outline"}
              onClick={() => setKind(k)}
            >
              {k === "all" ? "전체" : k === "purchase" ? "매입" : "매출"}
            </Button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{txs.length}건</span>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
        ) : txs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">거래내역이 없습니다</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>일자</TableHead>
                <TableHead>구분</TableHead>
                <TableHead>품목</TableHead>
                <TableHead className="text-right">수량</TableHead>
                <TableHead className="text-right">단가</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map((tx: any) => (
                <TableRow key={tx.uid}>
                  <TableCell>{tx.transactionDate}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        tx.kind === "purchase"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                      }
                    >
                      {tx.kind === "purchase" ? "매입" : "매출"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{tx.itemName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tx.quantity} {tx.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtKRW(tx.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmtKRW(tx.totalAmount)}
                  </TableCell>
                  <TableCell>
                    {tx.status && (
                      <Badge variant="secondary" className="text-[10px]">
                        {tx.status}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Phase 2: Quotes Tab ───
function QuotesTab({ partnerId }: { partnerId: number }) {
  const { data: quotes = [], isLoading } = trpc.partnerCrm.quotations.useQuery({
    partnerId,
    limit: 100,
  });

  const statusColor: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
    sent: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    rejected: "bg-red-500/10 text-red-700 dark:text-red-400",
    expired: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  };

  return (
    <Card>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>견적 이력이 없습니다</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>견적번호</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>견적일</TableHead>
                <TableHead>유효기간</TableHead>
                <TableHead className="text-right">총액</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q: any) => (
                <TableRow key={q.id}>
                  <TableCell className="font-mono text-xs">{q.quotationNumber}</TableCell>
                  <TableCell className="max-w-xs truncate">{q.title || "-"}</TableCell>
                  <TableCell>{q.quoteDate}</TableCell>
                  <TableCell className="text-muted-foreground">{q.validUntil || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmtKRW(q.grandTotal)}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColor[q.status] || "bg-gray-500/10"}>{q.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Phase 2: Prices Tab ───
function PricesTab({ partnerId }: { partnerId: number }) {
  const [days, setDays] = useState(180);
  const { data, isLoading } = trpc.partnerCrm.prices.useQuery({ partnerId, days });
  const items = (data?.items ?? []) as any[];
  const [selected, setSelected] = useState<string | null>(null);
  const selectedItem = items.find((i) => i.name === selected) || items[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">기간:</span>
        {[90, 180, 365, 720].map((d) => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            {d}일
          </Button>
        ))}
      </div>
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Receipt className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>매입 단가 이력이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 좌측: 품목 리스트 */}
          <Card className="md:col-span-1 max-h-[500px] overflow-auto">
            <CardContent className="p-2 space-y-1">
              {items.map((it: any) => {
                const isSel = (selectedItem?.name || items[0]?.name) === it.name;
                return (
                  <button
                    key={it.name}
                    onClick={() => setSelected(it.name)}
                    className={`w-full text-left p-2 rounded text-sm transition-colors ${
                      isSel ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="font-medium truncate">{it.name}</div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                      <span>{it.count}회</span>
                      <span className={it.trendPct > 0 ? "text-red-500" : it.trendPct < 0 ? "text-emerald-500" : ""}>
                        {it.trendPct > 0 ? "↑" : it.trendPct < 0 ? "↓" : ""}{" "}
                        {Math.abs(it.trendPct).toFixed(1)}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* 우측: 차트 + 통계 */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{selectedItem?.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
                <Stat label="현재" value={fmtKRW(selectedItem?.last)} />
                <Stat label="평균" value={fmtKRW(selectedItem?.avg)} />
                <Stat label="최저" value={fmtKRW(selectedItem?.min)} />
                <Stat label="최고" value={fmtKRW(selectedItem?.max)} />
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={selectedItem?.points || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtKRW(v).replace("원", "")} />
                  <RTooltip formatter={(v: any) => fmtKRW(v)} />
                  <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-sm mt-0.5">{value}</div>
    </div>
  );
}

// ─── Phase 2: Documents Tab ───
const DOC_TYPE_LABEL: Record<string, string> = {
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
  other: "기타",
};

const DOC_TYPE_ICON: Record<string, React.ReactNode> = {
  contract: <FileText className="w-4 h-4" />,
  tax_invoice: <Receipt className="w-4 h-4" />,
  quality_cert: <ShieldCheck className="w-4 h-4" />,
  iso_cert: <Award className="w-4 h-4" />,
  haccp_cert: <Award className="w-4 h-4" />,
};

function DocumentsTab({ partnerId }: { partnerId: number }) {
  const utils = trpc.useUtils();
  const { data: docs = [], isLoading } = trpc.partnerCrm.documentList.useQuery({ partnerId });
  const [open, setOpen] = useState(false);

  const createMut = trpc.partnerCrm.documentCreate.useMutation({
    onSuccess: () => {
      utils.partnerCrm.documentList.invalidate();
      toast({ title: "서류가 등록되었습니다" });
      setOpen(false);
    },
  });
  const markRecvMut = trpc.partnerCrm.documentMarkReceived.useMutation({
    onSuccess: () => {
      utils.partnerCrm.documentList.invalidate();
      toast({ title: "수령 확인되었습니다" });
    },
  });
  const deleteMut = trpc.partnerCrm.documentDelete.useMutation({
    onSuccess: () => utils.partnerCrm.documentList.invalidate(),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> 서류 등록</Button>
          </DialogTrigger>
          <DocumentDialogContent
            partnerId={partnerId}
            onSubmit={(data) => createMut.mutate({ partnerId, ...data })}
            isPending={createMut.isPending}
          />
        </Dialog>
      </div>
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>등록된 서류가 없습니다</p>
            <p className="text-xs mt-1">계약서·인증서·세금계산서 등의 발급/수령 서류를 추적하세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {docs.map((d: any) => {
            const isExpired = d.expiresAt && new Date(d.expiresAt) < new Date();
            const isExpiringSoon =
              d.expiresAt && !isExpired &&
              (new Date(d.expiresAt).getTime() - Date.now()) < 30 * 86400000;
            return (
              <Card key={d.id} className={isExpired ? "border-red-500/40" : isExpiringSoon ? "border-amber-500/40" : ""}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="text-primary mt-0.5">{DOC_TYPE_ICON[d.docType] || <FileText className="w-4 h-4" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {DOC_TYPE_LABEL[d.docType] || d.docType}
                        </Badge>
                        <Badge
                          className={
                            d.direction === "issued"
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[10px]"
                              : "bg-purple-500/10 text-purple-700 dark:text-purple-400 text-[10px]"
                          }
                        >
                          {d.direction === "issued" ? "발급" : "수령"}
                        </Badge>
                        {isExpired && <Badge className="bg-red-500 text-white text-[10px]">만료</Badge>}
                        {isExpiringSoon && <Badge className="bg-amber-500 text-white text-[10px]">만료 임박</Badge>}
                      </div>
                      <div className="font-medium text-sm mt-1 truncate">{d.title}</div>
                      {d.docNumber && <div className="text-xs text-muted-foreground font-mono">{d.docNumber}</div>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {d.issuedAt && <div>발행: {fmtDate(d.issuedAt)}</div>}
                    {d.receivedAt && <div>수령: {fmtDate(d.receivedAt)}</div>}
                    {d.expiresAt && <div>만료: {fmtDate(d.expiresAt)}</div>}
                    {d.fileName && (
                      <div className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        <span className="truncate">{d.fileName}</span>
                      </div>
                    )}
                    {d.notes && <div className="text-foreground/70 mt-1">{d.notes}</div>}
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    {d.fileUrl && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={d.fileUrl} target="_blank" rel="noreferrer">
                          <Download className="w-3.5 h-3.5 mr-1" /> 다운로드
                        </a>
                      </Button>
                    )}
                    {d.direction === "received" && !d.receivedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markRecvMut.mutate({ id: d.id })}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 수령확인
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => {
                        if (confirm(`'${d.title}' 서류를 삭제할까요?`)) deleteMut.mutate({ id: d.id });
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocumentDialogContent({
  partnerId,
  onSubmit,
  isPending,
}: {
  partnerId: number;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    docType: "contract" as keyof typeof DOC_TYPE_LABEL,
    title: "",
    docNumber: "",
    direction: "received" as "issued" | "received",
    fileUrl: "",
    fileName: "",
    issuedAt: "",
    expiresAt: "",
    notes: "",
  });
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>서류 등록</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>서류 유형 *</Label>
            <Select value={form.docType} onValueChange={(v) => setForm({ ...form, docType: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>방향 *</Label>
            <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="issued">발급 (당사 → 거래처)</SelectItem>
                <SelectItem value="received">수령 (거래처 → 당사)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>제목 *</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="2026년 공급 계약서"
          />
        </div>
        <div>
          <Label>문서 번호</Label>
          <Input value={form.docNumber} onChange={(e) => setForm({ ...form, docNumber: e.target.value })} placeholder="CONT-2026-001" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>발행일</Label>
            <Input type="date" value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} />
          </div>
          <div>
            <Label>만료일</Label>
            <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>파일 URL (S3 등)</Label>
          <Input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://..." />
        </div>
        <div>
          <Label>파일명</Label>
          <Input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} />
        </div>
        <div>
          <Label>메모</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={!form.title.trim() || isPending}>
          저장
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Phase 2: Analytics Tab ───
function AnalyticsTab({ partnerId }: { partnerId: number }) {
  const [months, setMonths] = useState(12);
  const { data, isLoading } = trpc.partnerCrm.analytics.useQuery({ partnerId, months });
  const { data: quoteResp } = trpc.partnerCrm.quoteResponseTime.useQuery({ partnerId });
  const monthly = (data?.monthly ?? []) as any[];
  const activityByType = (data?.activityByType ?? []) as any[];

  const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>;
  if (monthly.length === 0 && activityByType.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          <Activity className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>분석할 데이터가 없습니다</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">기간:</span>
        {[6, 12, 24, 36].map((m) => (
          <Button key={m} size="sm" variant={months === m ? "default" : "outline"} onClick={() => setMonths(m)}>
            {m}개월
          </Button>
        ))}
      </div>
      {/* 견적 응답 분석 */}
      {quoteResp && quoteResp.totalSentQuotes > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">견적 응답 분석</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <Stat label="총 발송 견적" value={`${quoteResp.totalSentQuotes}건`} />
              <Stat label="수락" value={`${quoteResp.acceptedCount}건`} />
              <Stat label="거절" value={`${quoteResp.rejectedCount}건`} />
              <Stat
                label="평균 수락 일수"
                value={
                  quoteResp.acceptedCount > 0 ? `${quoteResp.avgDaysToAccept.toFixed(1)}일` : "-"
                }
              />
              <Stat
                label="수락률"
                value={
                  quoteResp.acceptanceRate !== null
                    ? `${quoteResp.acceptanceRate.toFixed(0)}%`
                    : "-"
                }
              />
            </div>
            {quoteResp.pendingCount > 0 && (
              <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                ⏳ 응답 대기 견적 {quoteResp.pendingCount}건 있음
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base">월별 매입/매출 추이</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                <RTooltip formatter={(v: any) => fmtKRW(v)} />
                <Legend />
                <Bar dataKey="purchaseAmount" name="매입" fill="#10b981" />
                <Bar dataKey="saleAmount" name="매출" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">월별 거래 건수</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip />
                <Legend />
                <Line type="monotone" dataKey="purchaseCount" name="매입 건수" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="saleCount" name="매출 건수" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {activityByType.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">활동 유형 분포</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={activityByType}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(e: any) => `${ACTIVITY_LABEL[e.type] || e.type}: ${e.count}`}
                  >
                    {activityByType.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
