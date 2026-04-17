/**
 * AccountCombobox — 계정과목 검색/자동완성 콤보박스
 * MaterialCombobox와 동일한 안정적 UX 패턴
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { Search, ChevronDown, X, BookOpen } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface AccountItem {
  id: number;
  code: string;
  name: string;
  category: string;
}

interface AccountComboboxProps {
  selectedId: number | null;
  selectedCode?: string;
  selectedName?: string;
  onSelect: (account: AccountItem) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const categoryLabels: Record<string, string> = {
  assets: "자산", liabilities: "부채", equity: "자본", revenue: "수익", expenses: "비용",
};

const categoryColors: Record<string, string> = {
  assets: "text-blue-600", liabilities: "text-red-600", equity: "text-purple-600",
  revenue: "text-emerald-600", expenses: "text-amber-600",
};

export function AccountCombobox({
  selectedId, selectedCode, selectedName, onSelect, onClear,
  placeholder = "계정과목 검색...", disabled = false, className = "",
}: AccountComboboxProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: accountsData } = trpc.accountingAccounts.list.useQuery({});
  const accounts: AccountItem[] = useMemo(() => {
    const items = (accountsData as any)?.items ?? (Array.isArray(accountsData) ? accountsData : []);
    return items
      .filter((a: any) => a.isActive === "Y" || a.isActive === 1)
      .map((a: any) => ({ id: a.id, code: a.code, name: a.name, category: a.category }));
  }, [accountsData]);

  const filtered = useMemo(() => {
    if (!search) return accounts;
    const q = search.toLowerCase();
    return accounts.filter((a) =>
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (categoryLabels[a.category] || "").includes(q)
    );
  }, [accounts, search]);

  // 카테고리별 그룹
  const grouped = useMemo(() => {
    const groups: Record<string, AccountItem[]> = {};
    for (const acc of filtered) {
      const cat = acc.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(acc);
    }
    return groups;
  }, [filtered]);

  const selectedAccount = useMemo(() => accounts.find((a) => a.id === selectedId), [accounts, selectedId]);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (acc: AccountItem) => {
    onSelect(acc);
    setSearch("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* 선택된 상태 */}
      {selectedId && selectedAccount ? (
        <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(true)}
          className="w-full flex items-center gap-2 h-10 px-3 border rounded-lg bg-blue-50/60 border-blue-300 hover:bg-blue-100/80 transition text-left disabled:opacity-60">
          <BookOpen className="h-4 w-4 text-blue-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-blue-700">{selectedAccount.code} {selectedAccount.name}</span>
            <span className={`text-[10px] ml-1.5 ${categoryColors[selectedAccount.category] || ""}`}>
              {categoryLabels[selectedAccount.category] || ""}
            </span>
          </div>
          {onClear && (
            <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-muted-foreground hover:text-red-500 p-0.5"><X className="h-4 w-4" /></span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      ) : selectedId && selectedCode ? (
        <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(true)}
          className="w-full flex items-center gap-2 h-10 px-3 border rounded-lg bg-amber-50/60 border-amber-300 text-left">
          <BookOpen className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-700">{selectedCode} {selectedName}</span>
          {onClear && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="text-muted-foreground hover:text-red-500 ml-auto"><X className="h-4 w-4" /></span>}
        </button>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input ref={inputRef} type="text" value={search} placeholder={placeholder} disabled={disabled}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            className="w-full h-10 pl-9 pr-8 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition disabled:opacity-60" />
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
      )}

      {/* 드롭다운 — 고정 위치 */}
      {open && !disabled && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border rounded-lg shadow-xl max-h-72 overflow-hidden flex flex-col">
          {/* 검색창 (선택 상태에서) */}
          {selectedId && (
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input type="text" autoFocus value={search} placeholder="계정코드 또는 이름 검색..."
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-2 border rounded text-xs bg-background focus:ring-1 focus:ring-blue-500/30" />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {search ? `'${search}' 검색 결과 없음` : "계정과목이 없습니다"}
              </div>
            ) : (
              Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase bg-muted/40 sticky top-0">
                    {categoryLabels[cat] || cat}
                  </div>
                  {items.map((acc) => (
                    <button key={acc.id} type="button"
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs flex items-center gap-2 border-b border-border/20 last:border-0 transition"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(acc)}>
                      <span className="font-mono text-[10px] text-muted-foreground w-10 shrink-0">{acc.code}</span>
                      <span className="font-medium truncate flex-1">{acc.name}</span>
                      <span className={`text-[9px] ${categoryColors[acc.category] || ""} shrink-0`}>
                        {categoryLabels[acc.category] || ""}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
