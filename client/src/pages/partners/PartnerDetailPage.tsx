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
  const t = name.replace(/^(주식회사|㈜|\(주\))\s*/, "").trim();
  if (!t) return "?";
  if (/[가-힣]/.test(t[0])) return t[0];
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
  const [tab, setTab] = useState<"overview" | "contacts" | "activities" | "tags">("overview");

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

      {/* 헤더 카드 */}
      <Card>
        <CardContent className="p-6 flex items-start gap-6">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shrink-0 ring-4 ring-background shadow-lg"
            style={{
              background: `linear-gradient(135deg, hsl(${hue}, 65%, 55%), hsl(${(hue + 30) % 360}, 65%, 45%))`,
            }}
          >
            {init}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{p.company_name || p.companyName}</h1>
              {p.grade === "vip" && (
                <Badge className="bg-amber-500 text-white">
                  <Star className="w-3 h-3 mr-1 fill-current" /> VIP
                </Badge>
              )}
              <PartnerTypeBadge type={p.partner_type || p.partnerType} />
            </div>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              {p.biz_no && <span>📋 {p.biz_no}</span>}
              {p.ceo_name && <span>👤 {p.ceo_name}</span>}
              {p.phone && <span>📞 {p.phone}</span>}
              {p.email && <span>✉ {p.email}</span>}
            </div>
            {p.address && (
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {p.address}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {p.phone && (
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${p.phone}`}>
                  <Phone className="w-4 h-4 mr-1" /> 전화
                </a>
              </Button>
            )}
            {p.email && (
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${p.email}`}>
                  <Mail className="w-4 h-4 mr-1" /> 메일
                </a>
              </Button>
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
        <TabsList>
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="contacts">
            담당자 {overview.counts.contacts > 0 && <Badge variant="secondary" className="ml-1">{overview.counts.contacts}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="activities">
            활동 이력 {overview.counts.activities > 0 && <Badge variant="secondary" className="ml-1">{overview.counts.activities}</Badge>}
          </TabsTrigger>
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
        <CardHeader><CardTitle className="text-base">거래 조건</CardTitle></CardHeader>
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
