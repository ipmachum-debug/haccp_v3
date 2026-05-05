/**
 * Partner Feed Page — CRM Phase 1 (SNS 친구목록 스타일)
 *
 * 디자인 원칙:
 *   - SNS (인스타·디스코드 친구목록) 친숙함
 *   - 한 눈에 거래처 상태 파악: 컬러 링 (활동/연체/신규) + 태그 칩
 *   - 빠른 검색 + 필터 pills + 뷰 토글 (Grid / List)
 *   - 카드 호버 시 퀵 액션 (전화/메일/360 페이지)
 *
 * 데이터:
 *   - trpc.partners.list — 기존 거래처 목록
 *   - trpc.partnerCrm.tagList — 거래처별 태그 (per-card 호출 — 추후 batch)
 *   - 마지막 활동: partner.updated_at (현재) → 추후 partner_activities.MAX(occurred_at) batch endpoint
 *
 * 작성: 2026-05-05
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Phone,
  Mail,
  ExternalLink,
  Grid3x3,
  List,
  Plus,
  Building2,
  ShoppingCart,
  Truck,
  Star,
  AlertTriangle,
  Sparkles,
  FileText,
} from "lucide-react";
import { ROUTES } from "@/lib/routePaths";

type PartnerType = "supplier" | "customer" | "subcontractor" | "all";

/** 거래처 이름 → hash → hue (HSL 컬러) */
function nameToHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** 이니셜 (한글 2자 또는 영문 2자) — 가독성 + 정체성 */
function initials(name: string): string {
  if (!name) return "?";
  // 회사 prefix / suffix 정리
  const trimmed = name
    .replace(/^(주식회사|㈜|\(주\))\s*/g, "")
    .replace(/\s*(주식회사|㈜|\(주\))$/g, "")
    .trim();
  if (!trimmed) return "?";

  // 한글: 의미 있는 2글자 (예: "하늘사랑" → "하늘", "한강에프디에스" → "한강")
  if (/[가-힣]/.test(trimmed[0])) {
    // 첫 2글자 (한글일 때)
    return trimmed.slice(0, 2);
  }
  // 영숫자 혼합 (B2C / 11번가 등)
  // 숫자/영문 첫 두 글자
  return trimmed.slice(0, 2).toUpperCase();
}

/** 마지막 활동 → 한국어 상대시각 */
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
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}주 전`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}

/** 상태 링 색상 결정 — 우선순위: 위험(빨강) > 신규(파랑) > 활동(녹색) > 일반(회색) */
function getStatusRing(p: any): { ring: string; tooltip: string } {
  const updatedDays = p.updatedAt
    ? Math.floor((Date.now() - new Date(p.updatedAt).getTime()) / 86400000)
    : 999;
  const createdDays = p.createdAt
    ? Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000)
    : 999;

  if (p.isActive === 0 || p.isActive === false) {
    return { ring: "ring-2 ring-red-500/60", tooltip: "비활성" };
  }
  if (createdDays <= 14) {
    return { ring: "ring-2 ring-blue-500/70", tooltip: "신규 거래처" };
  }
  if (updatedDays <= 7) {
    return { ring: "ring-2 ring-emerald-500/70", tooltip: "최근 활동" };
  }
  if (updatedDays > 90) {
    return { ring: "ring-2 ring-amber-500/60", tooltip: "장기 무거래" };
  }
  return { ring: "ring-2 ring-muted-foreground/20", tooltip: "" };
}

export default function PartnerFeedPage() {
  return (
    <DashboardLayout>
      <PartnerFeedContent />
    </DashboardLayout>
  );
}

function PartnerFeedContent() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PartnerType>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const { data: partners = [], isLoading } = trpc.partners.list.useQuery(
    typeFilter === "all" ? undefined : { partnerType: typeFilter },
  );

  // 모든 거래처의 태그 (batch — 추후 server batch endpoint 로 교체)
  // 1차: 클라이언트는 partner.metadata 또는 첫 화면에서 태그 표시 생략 가능
  // 여기서는 prototype 으로 제외 (Phase 1.1 에서 batch tag endpoint 추가 예정)

  // 검색 + 태그 필터링
  const filteredPartners = useMemo(() => {
    let list = partners as any[];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p: any) =>
          p.companyName?.toLowerCase().includes(q) ||
          p.bizNo?.toLowerCase().includes(q) ||
          p.contactPerson?.toLowerCase().includes(q) ||
          p.ceoName?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [partners, search]);

  // 통계
  const stats = useMemo(() => {
    const all = partners as any[];
    return {
      total: all.length,
      supplier: all.filter((p) => p.partnerType === "supplier").length,
      customer: all.filter((p) => p.partnerType === "customer").length,
      subcontractor: all.filter((p) => p.partnerType === "subcontractor").length,
      newCount: all.filter((p) => {
        const days = p.createdAt
          ? Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000)
          : 999;
        return days <= 14;
      }).length,
      stale: all.filter((p) => {
        const days = p.updatedAt
          ? Math.floor((Date.now() - new Date(p.updatedAt).getTime()) / 86400000)
          : 999;
        return days > 90;
      }).length,
    };
  }, [partners]);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            거래처 피드
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            전체 {stats.total}곳 · 신규 {stats.newCount}곳 · 장기무거래 {stats.stale}곳
          </p>
        </div>
        <Button onClick={() => navigate(ROUTES.ACCOUNTING_PARTNERS)} variant="outline">
          <Plus className="w-4 h-4 mr-1" /> 거래처 등록 / 관리
        </Button>
      </div>

      {/* 검색 + 뷰 토글 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="거래처명 / 사업자번호 / 담당자 / 대표자 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11"
          />
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button
            size="sm"
            variant={view === "grid" ? "default" : "ghost"}
            onClick={() => setView("grid")}
            className="h-9 w-9 p-0"
            title="카드 보기"
          >
            <Grid3x3 className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={view === "list" ? "default" : "ghost"}
            onClick={() => setView("list")}
            className="h-9 w-9 p-0"
            title="리스트 보기"
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 필터 pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterPill
          active={typeFilter === "all"}
          onClick={() => setTypeFilter("all")}
          icon={<Building2 className="w-3.5 h-3.5" />}
        >
          전체 ({stats.total})
        </FilterPill>
        <FilterPill
          active={typeFilter === "supplier"}
          onClick={() => setTypeFilter("supplier")}
          icon={<Truck className="w-3.5 h-3.5" />}
        >
          공급처 ({stats.supplier})
        </FilterPill>
        <FilterPill
          active={typeFilter === "customer"}
          onClick={() => setTypeFilter("customer")}
          icon={<ShoppingCart className="w-3.5 h-3.5" />}
        >
          고객 ({stats.customer})
        </FilterPill>
        <FilterPill
          active={typeFilter === "subcontractor"}
          onClick={() => setTypeFilter("subcontractor")}
          icon={<Building2 className="w-3.5 h-3.5" />}
        >
          외주 ({stats.subcontractor})
        </FilterPill>
        <span className="mx-1 h-4 border-l border-border" />
        <FilterPill
          active={false}
          onClick={() => setSearch(search ? "" : "VIP")}
          icon={<Star className="w-3.5 h-3.5 text-amber-500" />}
        >
          VIP
        </FilterPill>
      </div>

      {/* 콘텐츠 */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">불러오는 중...</div>
      ) : filteredPartners.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {search ? `"${search}" 와 일치하는 거래처가 없습니다` : "거래처가 없습니다"}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredPartners.map((p: any) => (
            <PartnerCard key={p.id} partner={p} onClick={() => navigate(`/dashboard/partners/${p.id}`)} />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {filteredPartners.map((p: any) => (
            <PartnerListRow key={p.id} partner={p} onClick={() => navigate(`/dashboard/partners/${p.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub Components ───

function FilterPill({
  children,
  active,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted hover:bg-muted/70 text-muted-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function PartnerCard({ partner, onClick }: { partner: any; onClick: () => void }) {
  const hue = nameToHue(partner.companyName || "");
  const init = initials(partner.companyName || "");

  // status 별 좌측 accent bar 색
  const accent = getAccentColor(partner);
  const typeLabel =
    partner.partnerType === "supplier"
      ? "공급처"
      : partner.partnerType === "customer"
      ? "고객"
      : partner.partnerType === "subcontractor"
      ? "외주"
      : partner.partnerType;
  const TypeIcon =
    partner.partnerType === "supplier" ? Truck : partner.partnerType === "customer" ? ShoppingCart : Building2;
  const typeColor =
    partner.partnerType === "supplier"
      ? "text-emerald-600 dark:text-emerald-400"
      : partner.partnerType === "customer"
      ? "text-blue-600 dark:text-blue-400"
      : "text-purple-600 dark:text-purple-400";

  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer hover:shadow-md hover:border-primary/30 transition-all relative overflow-hidden"
    >
      {/* 좌측 accent bar — status 색상 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent.bar}`} />

      <CardContent className="p-3 pl-4">
        {/* 헤더: 작은 아바타 + 회사명 (좌우 배치) */}
        <div className="flex items-start gap-2.5 mb-2">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm"
            style={{
              background: `linear-gradient(135deg, hsl(${hue}, 60%, 50%), hsl(${(hue + 30) % 360}, 60%, 42%))`,
            }}
            title={partner.companyName}
          >
            {init}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-sm leading-tight truncate" title={partner.companyName}>
                {partner.companyName || "(이름 없음)"}
              </span>
              {partner.grade === "vip" && (
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
              )}
            </div>
            <div className={`flex items-center gap-1 text-[11px] mt-0.5 ${typeColor}`}>
              <TypeIcon className="w-3 h-3" />
              <span>{typeLabel}</span>
              {accent.label && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className={accent.text}>{accent.label}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 본문: 담당자 / 연락처 (있을 때만) */}
        {(partner.contactPerson || partner.phone) && (
          <div className="text-[11px] text-muted-foreground space-y-0.5 mb-2 pl-[50px]">
            {partner.contactPerson && (
              <div className="truncate">👤 {partner.contactPerson}</div>
            )}
            {partner.phone && <div className="truncate">📞 {partner.phone}</div>}
          </div>
        )}

        {/* 푸터: 마지막 활동 + 퀵 액션 (항상 노출, 호버 시 강조) */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <span className="text-[10px] text-muted-foreground">
            {relativeTime(partner.updatedAt)}
          </span>
          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
            {partner.phone && (
              <a
                href={`tel:${partner.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="h-6 w-6 rounded hover:bg-emerald-500/10 flex items-center justify-center text-emerald-600"
                title={`전화: ${partner.phone}`}
              >
                <Phone className="w-3 h-3" />
              </a>
            )}
            {partner.email && (
              <a
                href={`mailto:${partner.email}`}
                onClick={(e) => e.stopPropagation()}
                className="h-6 w-6 rounded hover:bg-blue-500/10 flex items-center justify-center text-blue-600"
                title={`메일: ${partner.email}`}
              >
                <Mail className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="h-6 w-6 rounded hover:bg-primary/10 flex items-center justify-center text-primary"
              title="360 페이지 열기"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** 거래처 status → 좌측 accent bar + 라벨 색상 */
function getAccentColor(p: any): { bar: string; label?: string; text?: string } {
  if (p.isActive === 0 || p.isActive === false) {
    return { bar: "bg-red-500", label: "비활성", text: "text-red-600" };
  }
  const updatedDays = p.updatedAt
    ? Math.floor((Date.now() - new Date(p.updatedAt).getTime()) / 86400000)
    : 999;
  const createdDays = p.createdAt
    ? Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000)
    : 999;
  if (createdDays <= 14) {
    return { bar: "bg-blue-500", label: "신규", text: "text-blue-600" };
  }
  if (updatedDays <= 7) {
    return { bar: "bg-emerald-500" };
  }
  if (updatedDays > 90) {
    return { bar: "bg-amber-500", label: "장기무거래", text: "text-amber-600" };
  }
  return { bar: "bg-muted-foreground/20" };
}

function PartnerListRow({ partner, onClick }: { partner: any; onClick: () => void }) {
  const status = getStatusRing(partner);
  const hue = nameToHue(partner.companyName || "");
  const init = initials(partner.companyName || "");
  const typeLabel =
    partner.partnerType === "supplier"
      ? "공급처"
      : partner.partnerType === "customer"
      ? "고객"
      : partner.partnerType === "subcontractor"
      ? "외주"
      : "기타";

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 hover:bg-accent/50 cursor-pointer transition-colors"
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${status.ring}`}
        style={{
          background: `linear-gradient(135deg, hsl(${hue}, 65%, 55%), hsl(${(hue + 30) % 360}, 65%, 45%))`,
        }}
      >
        {init}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{partner.companyName}</span>
          {partner.grade === "vip" && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />}
          <Badge variant="secondary" className="text-[10px]">
            {typeLabel}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {partner.contactPerson && <>👤 {partner.contactPerson}</>}
          {partner.phone && <> · {partner.phone}</>}
          {partner.bizNo && <> · {partner.bizNo}</>}
        </div>
      </div>
      <div className="text-xs text-muted-foreground shrink-0">{relativeTime(partner.updatedAt)}</div>
      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <ExternalLink className="w-4 h-4" />
      </Button>
    </div>
  );
}
