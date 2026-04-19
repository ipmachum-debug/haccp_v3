import { useState, useMemo, useEffect, useRef } from "react";
import { Package, Search, X, ChevronDown, Plus, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * ProductCombobox — 제품 선택 콤보박스 (검색 + 자동완성 + 최근 사용)
 * ═══════════════════════════════════════════════════════════════════════
 * MaterialCombobox 와 동일한 패턴이지만 h_products_v2 기반.
 *
 * 사용처:
 *   - EditSaleDialog.tsx (매출 등록/수정)
 *   - SalesManagement.tsx
 *
 * 특징:
 *   - trpc.product.list 실시간 검색
 *   - localStorage 기반 최근 사용 제품 (MAX 5)
 *   - 선택된 제품의 코드/카테고리/단위 표시
 */

const RECENT_PRODUCTS_KEY = "haccp:recent-products";
const MAX_RECENT = 5;

interface ProductItem {
  id: number;
  productName: string;
  productCode?: string;
  unit?: string;
  category?: string;
}

interface ProductComboboxProps {
  selectedId: number | null;
  selectedName?: string;
  onSelect: (product: ProductItem) => void;
  onClear?: () => void;
  onCreateNew?: () => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

function loadRecentProductIds(): number[] {
  try {
    const raw = localStorage.getItem(RECENT_PRODUCTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecentProductId(id: number) {
  try {
    const current = loadRecentProductIds();
    const next = [id, ...current.filter((x) => x !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function ProductCombobox({
  selectedId,
  selectedName,
  onSelect,
  onClear,
  onCreateNew,
  required = false,
  label,
  placeholder = "제품 검색... (이름/코드)",
  disabled = false,
}: ProductComboboxProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<number[]>(() => loadRecentProductIds());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: rawList, isLoading } = trpc.product.list.useQuery({
    limit: 200,
    search: search || undefined,
  });
  const products: ProductItem[] = useMemo(() => {
    const items: any[] = (rawList as any)?.items ?? (Array.isArray(rawList) ? rawList : []);
    return items.map((p: any) => ({
      id: p.id,
      productName: p.productName || `P${p.id}`,
      productCode: p.productCode || undefined,
      unit: p.unit || undefined,
      category: p.category || undefined,
    }));
  }, [rawList]);

  const { recentProducts, otherProducts } = useMemo(() => {
    const recent: ProductItem[] = [];
    const other: ProductItem[] = [];
    for (const p of products) {
      if (recentIds.includes(p.id)) recent.push(p);
      else other.push(p);
    }
    recent.sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
    return { recentProducts: recent, otherProducts: other };
  }, [products, recentIds]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedId),
    [products, selectedId],
  );

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (p: ProductItem) => {
    pushRecentProductId(p.id);
    setRecentIds(loadRecentProductIds());
    onSelect(p);
    setSearch("");
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClear?.();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {selectedId && selectedProduct ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(true)}
          className="w-full flex items-center gap-2 h-10 px-3 border rounded-lg bg-purple-50/60 dark:bg-purple-950/20 border-purple-300 dark:border-purple-700 hover:bg-purple-100/80 dark:hover:bg-purple-900/40 transition text-left disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Package className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-purple-700 dark:text-purple-300 truncate">
              {selectedProduct.productName}
            </div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              {selectedProduct.productCode && <span>{selectedProduct.productCode}</span>}
              {selectedProduct.unit && <span>· {selectedProduct.unit}</span>}
              {selectedProduct.category && <span>· {selectedProduct.category}</span>}
            </div>
          </div>
          {onClear && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="text-muted-foreground hover:text-red-500 transition shrink-0 p-0.5"
              aria-label="선택 해제"
            >
              <X className="h-4 w-4" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      ) : selectedId && selectedName ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(true)}
          className="w-full flex items-center gap-2 h-10 px-3 border rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 hover:bg-amber-100/80 transition text-left"
        >
          <Package className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="flex-1 text-sm text-amber-700 dark:text-amber-300 truncate">
            {selectedName} (ID: {selectedId})
          </span>
          {onClear && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="text-muted-foreground hover:text-red-500 transition"
            >
              <X className="h-4 w-4" />
            </span>
          )}
        </button>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="w-full h-10 pl-9 pr-8 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
      )}

      {open && !disabled && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border rounded-lg shadow-xl max-h-80 overflow-hidden flex flex-col">
          {selectedId && (
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  placeholder="다른 제품 검색..."
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-2 border rounded text-xs bg-background focus:ring-1 focus:ring-purple-500/30"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                검색 중...
              </div>
            )}

            {!isLoading && products.length === 0 && (
              <div className="px-3 py-4 text-center">
                <div className="text-xs text-muted-foreground mb-2">
                  {search ? `'${search}' 검색 결과 없음` : "등록된 제품이 없습니다"}
                </div>
                {onCreateNew && (
                  <button
                    type="button"
                    onClick={() => {
                      onCreateNew();
                      setOpen(false);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-purple-500 text-white rounded hover:bg-purple-600 transition"
                  >
                    <Plus className="w-3 h-3" /> 신규 제품 등록
                  </button>
                )}
              </div>
            )}

            {!isLoading && recentProducts.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase bg-muted/40 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 최근 사용
                </div>
                {recentProducts.map((p) => (
                  <ProductRow key={`r-${p.id}`} product={p} onSelect={handleSelect} />
                ))}
              </div>
            )}

            {!isLoading && otherProducts.length > 0 && (
              <div>
                {recentProducts.length > 0 && (
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase bg-muted/40">
                    전체 제품
                  </div>
                )}
                {otherProducts.slice(0, 30).map((p) => (
                  <ProductRow key={`o-${p.id}`} product={p} onSelect={handleSelect} />
                ))}
              </div>
            )}
          </div>

          {onCreateNew && products.length > 0 && (
            <div className="border-t p-2">
              <button
                type="button"
                onClick={() => {
                  onCreateNew();
                  setOpen(false);
                }}
                className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30 rounded transition"
              >
                <Plus className="w-3 h-3" /> 새 제품 등록
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductRow({
  product,
  onSelect,
}: {
  product: ProductItem;
  onSelect: (p: ProductItem) => void;
}) {
  return (
    <button
      type="button"
      className="w-full text-left px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-950/30 text-xs flex items-center gap-2 border-b border-border/40 last:border-0 transition"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onSelect(product)}
    >
      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="font-medium truncate flex-1">{product.productName}</span>
      {product.productCode && (
        <span className="text-[10px] text-muted-foreground shrink-0">{product.productCode}</span>
      )}
      {product.unit && (
        <span className="text-[10px] text-muted-foreground shrink-0 px-1.5 py-0.5 bg-muted/50 rounded">
          {product.unit}
        </span>
      )}
    </button>
  );
}
