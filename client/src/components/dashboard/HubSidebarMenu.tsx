/**
 * 허브 사이드바 (UI/UX 개편 2-b-1, 2026-10-14)
 *
 * WORK/회계/HACCP 탭 대신 업무 허브 8개 + 플랫폼으로 메뉴를 그린다 (14-ui-ux-restructure-spec.md §3).
 * 항목 집합은 탭 사이드바와 같다 — 레지스트리 buildHubMenu 가 같은 경로를 하나로 합치고 허브로 묶은 결과를 받는다.
 * 허브는 접고 펼 수 있고, 현재 경로가 속한 허브는 자동으로 펼친다. 펼침 상태는 이 브라우저에만 저장.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { getIcon } from "@/domain/engines/clientMenuEngine";
import { HUB_TABS, HUBS_WITH_HOME, hubHomePath, hubTabOf, type HubSection, type HubId, type HubTabId } from "@shared/navigation/menuRegistry";

export type HubMenuEntry = HubSection<React.ComponentType<{ className?: string }>>["items"][number];
export type HubMenuSection = HubSection<React.ComponentType<{ className?: string }>>;

const TONE: Record<HubSection["hub"]["tone"], { icon: string; active: string; bar: string }> = {
  blue:   { icon: "text-blue-600 dark:text-blue-400",     active: "bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-300",       bar: "bg-blue-500" },
  orange: { icon: "text-orange-600 dark:text-orange-400", active: "bg-orange-50 text-orange-800 dark:bg-orange-500/10 dark:text-orange-300", bar: "bg-orange-500" },
  green:  { icon: "text-emerald-600 dark:text-emerald-400", active: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300", bar: "bg-emerald-500" },
  violet: { icon: "text-violet-600 dark:text-violet-400", active: "bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300", bar: "bg-violet-500" },
  red:    { icon: "text-red-600 dark:text-red-400",       active: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300",           bar: "bg-red-500" },
  amber:  { icon: "text-amber-600 dark:text-amber-400",   active: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",   bar: "bg-amber-500" },
  teal:   { icon: "text-teal-600 dark:text-teal-400",     active: "bg-teal-50 text-teal-800 dark:bg-teal-500/10 dark:text-teal-300",       bar: "bg-teal-500" },
  slate:  { icon: "text-slate-600 dark:text-slate-400",   active: "bg-slate-100 text-slate-800 dark:bg-slate-500/10 dark:text-slate-300",  bar: "bg-slate-500" },
  yellow: { icon: "text-yellow-600 dark:text-yellow-400", active: "bg-yellow-50 text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-300", bar: "bg-yellow-500" },
};

const STORAGE_KEY = "sidebar-hubs-open";
const TAB_STORAGE_KEY = "sidebar-hub-tabs";

function loadTabs(): Partial<Record<HubId, HubTabId>> {
  try { const r = localStorage.getItem(TAB_STORAGE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

function loadOpen(): Partial<Record<HubId, boolean>> {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

export default function HubSidebarMenu({
  sections, location, isCollapsed, isActivePath, isFavorite, onToggleFavorite, onNavigate,
}: {
  sections: HubMenuSection[];
  location: string;
  isCollapsed: boolean;
  isActivePath: (path: string) => boolean;
  isFavorite: (path: string) => boolean;
  onToggleFavorite: (entry: HubMenuEntry) => void;
  onNavigate: (path: string) => void;
}) {
  const [open, setOpen] = useState<Partial<Record<HubId, boolean>>>(loadOpen);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(open)); } catch {} }, [open]);

  // 허브 안 탭 (매입·매출 관리의 [매입|매출]) — 선택은 이 브라우저에 기억, 매입·매출 화면으로 이동하면 그 탭으로 자동 전환
  const [tabs, setTabs] = useState<Partial<Record<HubId, HubTabId>>>(loadTabs);
  useEffect(() => { try { localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabs)); } catch {} }, [tabs]);
  useEffect(() => {
    const t = hubTabOf(location);
    if (!t) return;
    const owner = sections.find((s) => s.items.some((i) => i.hubTab === t))?.hub.id;
    if (owner) setTabs((cur) => (cur[owner] === t ? cur : { ...cur, [owner]: t }));
  }, [location, sections]);

  // 현재 경로가 속한 허브는 **화면을 이동했을 때만** 펼친다. 그 뒤에는 사용자가 접을 수 있어야 한다
  // (이전: 항상 강제로 펼쳐서 매입 조회 화면에서 구매·입고 허브가 접히지 않았다 — 2026-10-14 대표 보고)
  const activeHub = useMemo(
    () => sections.find((s) => location === hubHomePath(s.hub.id))?.hub.id   // 허브 입구 화면
      ?? sections.find((s) => s.items.some((i) => isActivePath(i.path)))?.hub.id ?? null,
    [sections, location, isActivePath]);
  useEffect(() => {
    if (activeHub) setOpen((s) => (s[activeHub] ? s : { ...s, [activeHub]: true }));
  }, [location, activeHub]);

  return (
    // shrink-0: 사이드바(SidebarMenu = flex-col) 높이가 화면보다 길면 이 블록이 flex 축소되어
    // 아래 즐겨찾기가 허브 목록 위에 겹쳐 그려졌다 (2026-10-14 대표 화면). 축소 금지 → 사이드바가 스크롤된다.
    <div className="flex flex-col gap-1 shrink-0">
      {sections.map(({ hub, items }, idx) => {
        const tone = TONE[hub.tone];
        const HubIcon = getIcon(hub.icon);
        const isOpen = open[hub.id] ?? (hub.id === activeHub || idx === 0);
        const hubTabs = HUB_TABS[hub.id];
        const currentTab: HubTabId | undefined = hubTabs ? (tabs[hub.id] ?? hubTabs[0].id) : undefined;
        // 접힌(아이콘) 사이드바에서는 탭 없이 전부 보인다
        const visible = hubTabs && !isCollapsed ? items.filter((i) => !i.hubTab || i.hubTab === currentTab) : items;
        return (
          <Collapsible key={hub.id} open={isCollapsed ? true : isOpen} onOpenChange={(v) => setOpen((s) => ({ ...s, [hub.id]: v }))}>
            {!isCollapsed && (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] font-semibold tracking-tight",
                    "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                    hub.id === activeHub && "text-sidebar-foreground",
                  )}
                  aria-expanded={isOpen}
                >
                  <span className={cn("h-4 w-1 rounded-full shrink-0", tone.bar)} />
                  <HubIcon className={cn("h-3.5 w-3.5 shrink-0", tone.icon)} />
                  <span className="flex-1 text-left truncate">{hub.label}</span>
                  <span className="text-[10px] text-sidebar-foreground/40 tabular-nums">{items.length}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-sidebar-foreground/40 transition-transform", isOpen ? "" : "-rotate-90")} />
                </button>
              </CollapsibleTrigger>
            )}
            <CollapsibleContent>
              <div className={cn("flex flex-col gap-0.5", !isCollapsed && "pl-2 pb-1")}>
                {/* 3-b: 허브 입구 — "지금 처리할 것" */}
                {!isCollapsed && HUBS_WITH_HOME.includes(hub.id) && (
                  <button type="button" onClick={() => onNavigate(hubHomePath(hub.id))} data-testid={`hub-home-${hub.id}`}
                    className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
                      location === hubHomePath(hub.id) ? tone.active : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/50")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", tone.bar)} /> 한눈에 보기
                  </button>
                )}
                {hubTabs && !isCollapsed && (
                  <div role="tablist" aria-label={`${hub.label} 구분`} className="grid gap-1 rounded-lg bg-sidebar-accent/60 p-0.5 my-1"
                    style={{ gridTemplateColumns: `repeat(${hubTabs.length}, minmax(0, 1fr))` }}>
                    {hubTabs.map((t) => (
                      <button key={t.id} type="button" role="tab" aria-selected={currentTab === t.id} data-testid={`hub-tab-${t.id}`}
                        onClick={() => setTabs((cur) => ({ ...cur, [hub.id]: t.id }))}
                        className={cn("h-7 rounded-md text-[12px] font-semibold transition-colors",
                          currentTab === t.id ? cn("bg-background shadow-sm", tone.icon) : "text-sidebar-foreground/55 hover:text-sidebar-foreground")}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
                {visible.map((item, i, list) => {
                  const active = isActivePath(item.path);
                  const fav = isFavorite(item.path);
                  // 소구역 제목 (예: 플랫폼 허브의 'AI·자동화') — 앞 항목과 소구역이 바뀔 때만
                  const showSection = !isCollapsed && !!item.section && item.section !== list[i - 1]?.section;
                  return (
                    <div key={item.path}>
                    {showSection && (
                      <p className="px-2 pt-2 pb-0.5 text-[10px] font-semibold text-sidebar-foreground/45 tracking-wide">{item.section}</p>
                    )}
                    <SidebarMenuItem>
                      <div className="flex items-center gap-1 w-full">
                        <SidebarMenuButton
                          isActive={active}
                          onClick={() => onNavigate(item.path)}
                          tooltip={isCollapsed ? `${hub.label} · ${item.label}` : item.label}
                          className={cn(
                            "h-8 font-normal flex-1 text-[13px] rounded-lg",
                            active ? `${tone.active} font-medium` : "text-slate-600 hover:text-foreground hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                            item.highlight && "border border-primary/20 font-medium",
                          )}
                        >
                          <item.icon className={cn("h-4 w-4", active ? tone.icon : "text-slate-400 dark:text-slate-500")} />
                          <span className="truncate">{item.label}</span>
                        </SidebarMenuButton>
                        {!isCollapsed && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleFavorite(item); }}
                            className="p-1 hover:bg-accent rounded mr-1"
                            title={fav ? "즐겨찾기 제거" : "즐겨찾기 추가"}
                            aria-label={fav ? "즐겨찾기 제거" : "즐겨찾기 추가"}
                          >
                            <Star className={cn("h-3.5 w-3.5", fav ? "fill-amber-400/80 text-amber-400/80" : "text-muted-foreground/30")} />
                          </button>
                        )}
                      </div>
                    </SidebarMenuItem>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
