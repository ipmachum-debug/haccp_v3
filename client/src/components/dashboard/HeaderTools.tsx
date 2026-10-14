/**
 * 상단 헤더 전역 도구 (UI/UX 개편 3-a, 2026-10-14) — 명세 §5: 헤더 = 검색 · 알림 · 출퇴근 · 프로필
 *
 * GlobalMenuSearch: 지금 사용자에게 보이는 메뉴(허브 사이드바와 같은 목록)에서 화면을 찾아 바로 이동. Ctrl/⌘+K.
 *   새 권한을 만들지 않는다 — 레이아웃이 계산한 '보이는 메뉴' 만 받는다.
 * HeaderProfileMenu: 이름·이메일·역할 + 로그아웃 (사이드바 하단 프로필은 그대로 둔다 — 대표 지시).
 */
import { useEffect, useState } from "react";
import { Search, LogOut } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { HubMenuSection } from "./HubSidebarMenu";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "슈퍼관리자", admin: "관리자", accountant: "회계", worker: "작업자", monitor: "모니터", inspector: "품질", employee: "직원",
};

export function GlobalMenuSearch({ sections, onNavigate, compact = false }: {
  sections: HubMenuSection[];
  onNavigate: (path: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (path: string) => { setOpen(false); onNavigate(path); };

  return (
    <>
      {compact ? (
        <button type="button" aria-label="메뉴 검색" onClick={() => setOpen(true)} data-testid="header-search-mobile"
          className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
          <Search className="h-[18px] w-[18px]" />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} data-testid="header-search"
          className={cn("h-9 w-56 lg:w-72 inline-flex items-center gap-2 rounded-xl border bg-muted/40 px-3 text-sm text-muted-foreground",
            "hover:bg-muted/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40")}>
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">화면 찾기</span>
          <kbd className="hidden lg:inline-flex h-5 items-center rounded border bg-background px-1.5 text-[10px] font-mono">Ctrl K</kbd>
        </button>
      )}
      <CommandDialog open={open} onOpenChange={setOpen} title="화면 찾기" description="메뉴 이름으로 화면을 찾아 이동합니다">
        <CommandInput placeholder="예: 매출 조회, CCP, 재고…" />
        <CommandList>
          <CommandEmpty>찾는 화면이 없습니다.</CommandEmpty>
          {sections.map(({ hub, items }) => (
            <CommandGroup key={hub.id} heading={hub.label}>
              {items.map((it) => (
                <CommandItem key={it.path} value={`${it.label} ${hub.label} ${it.path}`} onSelect={() => go(it.path)}>
                  <it.icon className="text-muted-foreground" />
                  <span>{it.label}</span>
                  {it.section && <span className="ml-auto text-[11px] text-muted-foreground">{it.section}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
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
