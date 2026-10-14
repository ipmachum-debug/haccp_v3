/**
 * PageHeader — 페이지 머리 표준 (3-a, 명세 §5)
 *   좌: 제목 + 한 줄 설명 · 우: 주요 작업 버튼(최대 2, 주 버튼 1) · 위: 허브 경로(브레드크럼)
 *
 *   <PageHeader
 *     title="매출 조회" description="매출 거래를 조회하고 확정합니다."
 *     primary={{ label: "＋ 매출 입력", onClick: () => navigate("/dashboard/accounting/sales/create") }}
 *     secondary={{ label: "엑셀 일괄등록", onClick: openUpload, icon: FileSpreadsheet }}
 *   />
 * 브레드크럼은 현재 경로로 레지스트리 허브를 찾아 자동으로 붙는다 (hub 를 넘기면 그 값을 쓴다).
 */
import type { ComponentType, ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HUBS, routeHubOf } from "@shared/navigation/menuRegistry";

export type HeaderAction = {
  label: string;
  onClick: () => void;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
};

/** 경로 → 허브 이름 (브레드크럼 첫 칸). 공개 화면·미분류는 null */
export function hubLabelOf(path: string): string | null {
  const r = routeHubOf(path);
  if (!r || r.hub === "public") return null;
  return HUBS.find((h) => h.id === r.hub)?.label ?? null;
}

export function PageHeader({ title, description, primary, secondary, hub, extra, className }: {
  title: string;
  description?: string;
  primary?: HeaderAction;
  secondary?: HeaderAction;
  /** 브레드크럼 허브 이름 강제 지정 (없으면 경로로 자동) */
  hub?: string | null;
  /** 버튼 외 오른쪽에 둘 것 (기간 선택 등) — 남용 금지 */
  extra?: ReactNode;
  className?: string;
}) {
  const [location] = useLocation();
  const hubLabel = hub === undefined ? hubLabelOf(location) : hub;
  const Btn = ({ a, variant }: { a: HeaderAction; variant: "default" | "outline" }) => (
    <Button size="sm" variant={variant} onClick={a.onClick} disabled={a.disabled} className="gap-1.5">
      {a.icon && <a.icon className="h-4 w-4" />}
      {a.label}
    </Button>
  );
  return (
    <div className={cn("space-y-1.5 mb-4", className)}>
      {hubLabel && (
        <nav aria-label="경로" className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>{hubLabel}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground/70">{title}</span>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {(primary || secondary || extra) && (
          <div className="flex flex-wrap items-center gap-2">
            {extra}
            {secondary && <Btn a={secondary} variant="outline" />}
            {primary && <Btn a={primary} variant="default" />}
          </div>
        )}
      </div>
    </div>
  );
}
