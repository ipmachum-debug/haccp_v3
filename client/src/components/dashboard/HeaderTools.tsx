/**
 * 상단 헤더 전역 도구 (UI/UX 개편 3-a, 2026-10-14) — 명세 §5: 헤더 = 검색 · 알림 · 출퇴근 · 프로필
 *
 * GlobalMenuSearch: 지금 사용자에게 보이는 메뉴(허브 사이드바와 같은 목록)에서 화면을 찾아 바로 이동. Ctrl/⌘+K.
 *   새 권한을 만들지 않는다 — 레이아웃이 계산한 '보이는 메뉴' 만 받는다.
 * HeaderProfileMenu: 이름·이메일·역할 + 로그아웃 (사이드바 하단 프로필은 그대로 둔다 — 대표 지시).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Search, LogOut, CornerDownLeft, ArrowLeft, ArrowRight, History, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { HubMenuSection } from "./HubSidebarMenu";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "슈퍼관리자", admin: "관리자", accountant: "회계", worker: "작업자", monitor: "모니터", inspector: "품질", employee: "직원",
};

// 최근 연 화면 — 이 브라우저에만 (없거나 막혀도 검색은 그대로)
const RECENT_KEY = "millio.menuSearch.recent";
const loadRecent = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : []; } catch { return []; }
};
const saveRecent = (path: string) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([path, ...loadRecent().filter((p) => p !== path)].slice(0, 5))); } catch { /* 저장 못 해도 이동은 계속 */ }
};

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-background px-1 font-sans text-[10.5px] text-muted-foreground">
    {children}
  </kbd>
);

const GROUP = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[13px] [&_[cmdk-group-heading]]:text-muted-foreground";
const FOOT_BTN = "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-muted hover:text-foreground";
// 버튼을 눌러도 검색 입력에 포커스 유지 — 이어서 키보드로 고를 수 있게
const keepFocus = (e: React.MouseEvent) => e.preventDefault();
const ITEM = "group flex h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 text-[14px] outline-none data-[selected=true]:bg-muted";

/**
 * 화면 찾기 팔레트 (2026-10-18 대표 요청 — 검색 개수에 따라 창이 커졌다 작아졌다 움직여 어지럽다, 심플하고 고급스럽게)
 *   창은 화면 위쪽에 고정하고 결과 영역 높이도 고정 — 입력해도 창 위치·크기가 그대로다. 결과가 많으면 안에서만 스크롤.
 *   위쪽 탭(전체·허브) 으로 범위를 좁힌다 — 검색어가 비어 있을 때 ← → 로도 바꾼다.
 */
export function GlobalMenuSearch({ sections, onNavigate, compact = false }: {
  sections: HubMenuSection[];
  onNavigate: (path: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string>("all");
  const [recent, setRecent] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) { setQuery(""); setScope("all"); setRecent(loadRecent()); } }, [open]);
  const go = (path: string) => { saveRecent(path); setOpen(false); onNavigate(path); };

  const scopes = useMemo(() => [{ id: "all", label: "전체" }, ...sections.map(({ hub }) => ({ id: String(hub.id), label: hub.label }))], [sections]);
  const shown = scope === "all" ? sections : sections.filter(({ hub }) => String(hub.id) === scope);
  // 최근 연 화면 — 지금 보이는 메뉴에 있는 것만 (권한이 바뀌었으면 빠진다)
  const recentItems = useMemo(() => {
    const byPath = new Map(sections.flatMap(({ hub, items }) => items.map((it) => [it.path, { hub, it }] as const)));
    return recent.map((p) => byPath.get(p)).filter((x): x is NonNullable<typeof x> => !!x);
  }, [sections, recent]);
  const moveScope = (d: number) => {
    const i = scopes.findIndex((s) => s.id === scope);
    setScope(scopes[(i + d + scopes.length) % scopes.length].id);
  };
  const enter = <CornerDownLeft className="ml-auto hidden h-4 w-4 text-muted-foreground group-data-[selected=true]:block" />;

  return (
    <>
      {compact ? (
        <button type="button" aria-label="메뉴 검색" onClick={() => setOpen(true)} data-testid="header-search-mobile"
          className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
          <Search className="h-[18px] w-[18px]" />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} data-testid="header-search"
          className={cn("h-9 w-56 lg:w-72 inline-flex items-center gap-2 rounded-xl border bg-background px-3 text-sm text-muted-foreground",
            "hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40")}>
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">화면 찾기</span>
          <span className="hidden lg:inline-flex items-center gap-0.5"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            // 위쪽 고정 — 가운데 정렬이면 결과 수에 따라 창이 위아래로 움직인다
            "top-[10vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[640px] w-[calc(100%-2rem)]",
            "rounded-[22px] border border-border/50 bg-white dark:bg-zinc-900 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]",
          )}
        >
          <DialogTitle className="sr-only">화면 찾기</DialogTitle>
          <DialogDescription className="sr-only">메뉴 이름으로 화면을 찾아 이동합니다</DialogDescription>
          <CommandPrimitive loop className="flex flex-col">
            <div className="flex items-center gap-3 px-6 pt-5 pb-3">
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                placeholder="검색"
                onKeyDown={(e) => {
                  if (query) return; // 입력 중엔 ← → 가 글자 이동
                  if (e.key === "ArrowLeft") { e.preventDefault(); moveScope(-1); }
                  if (e.key === "ArrowRight") { e.preventDefault(); moveScope(1); }
                }}
                className="h-8 flex-1 border-0 bg-transparent text-[16px] shadow-none outline-none focus:shadow-none focus:ring-0 placeholder:text-muted-foreground"
              />
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/80 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {scopes.map((s) => (
                <button key={s.id} type="button" onClick={() => setScope(s.id)}
                  className={cn("h-8 shrink-0 rounded-lg px-2.5 text-[14px] transition-colors",
                    scope === s.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* 결과 영역 높이 고정 — 입력해도 창 크기가 변하지 않는다 */}
            <CommandPrimitive.List ref={listRef} className="h-[min(400px,55vh)] overflow-y-auto overscroll-contain scroll-py-2 px-3 pb-3">
              <CommandPrimitive.Empty className="flex h-[min(380px,52vh)] items-center justify-center text-[14px] text-muted-foreground">
                찾는 화면이 없습니다
              </CommandPrimitive.Empty>
              {!query && scope === "all" && recentItems.length > 0 && (
                <CommandPrimitive.Group heading="최근 항목" className={GROUP}>
                  {recentItems.map(({ hub, it }) => (
                    <CommandPrimitive.Item key={`recent-${it.path}`} value={`최근 ${it.label} ${hub.label} ${it.path}`} onSelect={() => go(it.path)} className={ITEM}>
                      <History className="h-[18px] w-[18px] shrink-0 text-foreground/70" strokeWidth={1.6} />
                      <span className="truncate">{it.label}</span>
                      <span className="truncate text-[13px] text-muted-foreground group-data-[selected=true]:hidden">{hub.label}</span>
                      {enter}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              )}
              {shown.map(({ hub, items }) => (
                <CommandPrimitive.Group key={hub.id} heading={hub.label} className={GROUP}>
                  {items.map((it) => (
                    <CommandPrimitive.Item key={it.path} value={`${it.label} ${hub.label} ${it.path}`} onSelect={() => go(it.path)} className={ITEM}>
                      <it.icon className="h-[18px] w-[18px] shrink-0 text-foreground/70" />
                      <span className="truncate">{it.label}</span>
                      {it.section && <span className="ml-auto truncate text-[13px] text-muted-foreground group-data-[selected=true]:hidden">{it.section}</span>}
                      {enter}
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))}
            </CommandPrimitive.List>
            <div className="flex h-12 items-center gap-5 border-t border-border/60 px-6 text-[13px] text-muted-foreground">
              {/* 키 안내이자 버튼 — 눌러도 같은 동작 (2026-10-18 대표: 눌러도 아무 동작 안 함) */}
              <button type="button" onMouseDown={keepFocus} onClick={() => setOpen(false)} className={FOOT_BTN}>닫기 <Kbd>Esc</Kbd></button>
              <span className="inline-flex items-center gap-1.5">
                범위 변경
                <button type="button" aria-label="이전 범위" onMouseDown={keepFocus} onClick={() => moveScope(-1)} className="rounded hover:ring-1 hover:ring-border"><Kbd><ArrowLeft className="h-3 w-3" /></Kbd></button>
                <button type="button" aria-label="다음 범위" onMouseDown={keepFocus} onClick={() => moveScope(1)} className="rounded hover:ring-1 hover:ring-border"><Kbd><ArrowRight className="h-3 w-3" /></Kbd></button>
              </span>
              <button type="button" onMouseDown={keepFocus}
                onClick={() => listRef.current?.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]')?.click()}
                className={cn(FOOT_BTN, "ml-auto")}>열기 <Kbd><CornerDownLeft className="h-3 w-3" /></Kbd></button>
            </div>
          </CommandPrimitive>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function HeaderProfileMenu({ name, email, role, onLogout }: { name?: string | null; email?: string | null; role?: string | null; onLogout: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="내 계정" data-testid="header-profile" className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <Avatar className="h-8 w-8 border">
            <AvatarFallback className="text-[11px] font-semibold bg-primary/15 text-primary">{name?.charAt(0).toUpperCase() ?? "?"}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-3 py-2.5">
          <p className="text-sm font-semibold">{name ?? "-"}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{email}</p>
          {role && <p className="text-[11px] text-muted-foreground mt-1">{ROLE_LABEL[role] ?? role}</p>}
        </div>
        <div className="h-px bg-border" />
        <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-destructive focus:text-destructive mt-1">
          <LogOut className="mr-2 h-4 w-4" /> 로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
