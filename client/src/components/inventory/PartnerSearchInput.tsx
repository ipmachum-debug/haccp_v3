import { useState } from "react";
import { Building2, Search, X } from "lucide-react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";

export function PartnerSearchInput({ partnerType, selectedId, selectedName, onSelect, onClear, required = false, label, placeholder }: {
  partnerType?: "supplier" | "customer" | "subcontractor";
  selectedId: number | null;
  selectedName: string;
  onSelect: (id: number, name: string) => void;
  onClear: () => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  // 포커스 시 즉시 검색 (빈 검색어도 허용 → 전체 목록 표시)
  const q = trpc.partners.search.useQuery(
    open ? { search: search || "", partnerType, limit: 20 } : skipToken,
    { staleTime: 10_000 }
  );
  const results: any[] = (q.data as any[]) ?? [];
  return (
    <div className="relative">
      {label && <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label} {required && <span className="text-red-500">*</span>}</label>}
      {selectedId ? (
        <div className="flex items-center gap-2 h-9 px-3 border rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700">
          <Building2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate flex-1">{selectedName}</span>
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-red-500 transition shrink-0"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input type="text" value={search} placeholder={placeholder || "거래처 검색 (클릭 시 전체 목록)"}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            className="w-full h-9 pl-8 pr-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
        </div>
      )}
      {open && !selectedId && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-52 overflow-y-auto">
          {q.isFetching && <div className="px-3 py-2 text-xs text-muted-foreground text-center">검색 중...</div>}
          {!q.isFetching && results.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground text-center">{search ? "검색 결과 없음" : "등록된 거래처가 없습니다"}</div>}
          {results.map((p: any) => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-xs flex items-center gap-2 border-b last:border-0"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(p.id, p.company_name); setSearch(""); setOpen(false); }}>
              <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{p.company_name}</span>
              {p.biz_no && <span className="text-[10px] text-muted-foreground shrink-0">{p.biz_no}</span>}
              <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 ml-auto">
                {p.partner_type === "supplier" ? "공급" : p.partner_type === "customer" ? "고객" : "외주"}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
