/**
 * DetailLayout — 상세 화면 표준 (3-a, 명세 §5)
 *   상단 요약 → 탭: 정보 / 이력 / 첨부 / 승인 (있는 것만). 탭은 URL(?tab=)에 유지.
 *
 *   <DetailLayout
 *     header={<PageHeader title={`매출 ${sale.code}`} … />}
 *     summary={[{ label: "거래처", value: sale.partnerName }, { label: "상태", value: <StatusBadge status={sale.status} domain="sale" /> }]}
 *     tabs={[{ id: "info", label: "정보", content: <SaleInfo/> }, { id: "history", label: "이력", content: <ChangeLog/> }]}
 *   />
 */
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { cn } from "@/lib/utils";

export type DetailTab = { id: "info" | "history" | "attachments" | "approval" | (string & {}); label: string; content: ReactNode; badge?: number };

export function DetailLayout({ header, summary, tabs, className }: {
  header?: ReactNode;
  summary?: Array<{ label: string; value: ReactNode }>;
  tabs: DetailTab[];
  className?: string;
}) {
  const [tab, setTab] = useTabWithUrl("tab", tabs[0]?.id ?? "info");
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;
  return (
    <div className={cn("space-y-4", className)}>
      {header}
      {summary && summary.length > 0 && (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl border bg-card p-4">
          {summary.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
              <dd className="text-sm font-medium mt-0.5 break-words">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {tabs.length > 1 ? (
        <Tabs value={current} onValueChange={setTab}>
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
                {t.label}
                {!!t.badge && <span className="rounded-full bg-primary/10 text-primary px-1.5 text-[10px] font-semibold">{t.badge}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => <TabsContent key={t.id} value={t.id} className="mt-4">{t.content}</TabsContent>)}
        </Tabs>
      ) : (
        tabs[0]?.content
      )}
    </div>
  );
}
