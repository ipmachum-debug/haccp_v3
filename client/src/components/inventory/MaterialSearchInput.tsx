import { useState } from "react";
import { Package, Search, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function MaterialSearchInput({ selectedId, selectedName, onSelect, onClear, required = false, label }: {
  selectedId: number | null;
  selectedName: string;
  onSelect: (id: number, name: string, data?: any) => void;
  onClear: () => void;
  required?: boolean;
  label?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { data: _raw } = trpc.material.list.useQuery({ limit: 200, search: search || undefined, itemTypes: ["raw_material", "subsidiary", "external_product"] });
  const mats: any[] = (_raw as any)?.items ?? (Array.isArray(_raw) ? _raw : []);

  return (
    <div className="relative">
      {label && <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label} {required && <span className="text-red-500">*</span>}</label>}
      {selectedId ? (
        <div className="flex items-center gap-2 h-9 px-3 border rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border-blue-300 dark:border-blue-700">
          <Package className="h-3.5 w-3.5 text-blue-600 shrink-0" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate flex-1">{selectedName}</span>
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-red-500 transition shrink-0"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input type="text" value={search} placeholder="원재료 검색 (클릭 시 전체 목록)"
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            className="w-full h-9 pl-8 pr-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
        </div>
      )}
      {open && !selectedId && (
        <div className="search-dropdown search-dropdown-scroll">
          {mats.length === 0 && <div className="search-dropdown-empty">{search ? "검색 결과 없음" : "원재료를 검색하세요"}</div>}
          {mats.slice(0, 20).map((m: any) => (
            <button key={m.id} type="button"
              className="search-dropdown-item"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(m.id, m.materialName || m.itemName || `M${m.id}`, m); setSearch(""); setOpen(false); }}>
              <Package className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
              <span className="font-medium truncate">{m.materialName || m.itemName}</span>
              <span className="search-dropdown-meta">{m.materialCode || m.itemCode || `M${m.id}`}</span>
              {m.unit && <span className="search-dropdown-meta ml-auto rounded bg-muted px-1.5 py-0.5">{m.unit}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
