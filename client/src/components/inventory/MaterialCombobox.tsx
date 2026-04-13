import { useState, useMemo, useEffect, useRef } from "react";
import { Package, Search, X, ChevronDown, Plus, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * MaterialCombobox — 원재료 선택 콤보박스 (검색 + 자동완성 + 최근 사용)
 * ═══════════════════════════════════════════════════════════════════════
 * 특징:
 *   - 검색어 기반 실시간 필터
 *   - 공급업체 선택 시 이전에 매입했던 원재료 우선 표시 (스마트 추천)
 *   - localStorage 기반 최근 사용 원재료 별도 섹션
 *   - 원재료 미등록 시 "신규 등록" 단축 버튼 (콜백)
 *   - 선택된 원재료의 코드/단위/카테고리 표시
 *
 * 사용처:
 *   - EditPurchaseDialog.tsx (매입 등록/수정)
 *   - 기타 매입 관련 폼
 */

const RECENT_MATERIALS_KEY = "haccp:recent-materials";
const MAX_RECENT = 5;

interface MaterialItem {
  id: number;
  materialName: string;
  materialCode?: string;
  unit?: string;
  category?: string;
}

interface MaterialComboboxProps {
  selectedId: number | null;
  selectedName?: string;
  partnerId?: number | null; // 공급업체 선택 시 스마트 추천
  onSelect: (material: MaterialItem) => void;
  onClear?: () => void;
  onCreateNew?: () => void; // 신규 원재료 등록 버튼 클릭
  required?: boolean;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

function loadRecentMaterialIds(): number[] {
  try {
    const raw = localStorage.getItem(RECENT_MATERIALS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function pushRecentMaterialId(id: number) {
  try {
    const current = loadRecentMaterialIds();
    const next = [id, ...current.filter((x) => x !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_MATERIALS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function MaterialCombobox({
  selectedId,
  selectedName,
  partnerId,
  onSelect,
  onClear,
  onCreateNew,
  required = false,
  label,
  placeholder = "원재료 검색... (이름/코드)",
  disabled = false,
}: MaterialComboboxProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<number[]>(() => loadRecentMaterialIds());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 원재료 목록 조회 (tRPC)
  const { data: rawList, isLoading } = trpc.material.list.useQuery({
    limit: 200,
    search: search || undefined,
  });
  const materials: MaterialItem[] = useMemo(() => {
    const items: any[] = (rawList as any)?.items ?? (Array.isArray(rawList) ? rawList : []);
    return items.map((m: any) => ({
      id: m.id,
      materialName: m.materialName || m.itemName || `M${m.id}`,
      materialCode: m.materialCode || m.itemCode || undefined,
      unit: m.unit || undefined,
      category: m.category || undefined,
    }));
  }, [rawList]);

  // 공급업체 기반 스마트 추천: 해당 partner 로부터 매입한 원재료 목록
  // (백엔드가 없으면 비워둠 — 추후 서버 엔드포인트 추가 시 연동)
  const supplierMaterialIds = useMemo<Set<number>>(() => new Set(), [partnerId]);

  // 그룹 분류
  const { recentMats, supplierMats, otherMats } = useMemo(() => {
    const recent: MaterialItem[] = [];
    const supplier: MaterialItem[] = [];
    const other: MaterialItem[] = [];
    for (const m of materials) {
      if (recentIds.includes(m.id)) recent.push(m);
      else if (supplierMaterialIds.has(m.id)) supplier.push(m);
      else other.push(m);
    }
    // 최근 사용 정렬 (최신 순서 유지)
    recent.sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id));
    return { recentMats: recent, supplierMats: supplier, otherMats: other };
  }, [materials, recentIds, supplierMaterialIds]);

  // 선택된 원재료 정보 (표시용)
  const selectedMaterial = useMemo(
    () => materials.find((m) => m.id === selectedId),
    [materials, selectedId],
  );

  // 외부 클릭 시 팝오버 닫기
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

  // 선택 처리
  const handleSelect = (m: MaterialItem) => {
    pushRecentMaterialId(m.id);
    setRecentIds(loadRecentMaterialIds());
    onSelect(m);
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

      {/* 선택 상태 / 검색 입력 */}
      {selectedId && selectedMaterial ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(true)}
          className="w-full flex items-center gap-2 h-10 px-3 border rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border-blue-300 dark:border-blue-700 hover:bg-blue-100/80 dark:hover:bg-blue-900/40 transition text-left disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Package className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">
              {selectedMaterial.materialName}
            </div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              {selectedMaterial.materialCode && <span>{selectedMaterial.materialCode}</span>}
              {selectedMaterial.unit && <span>· {selectedMaterial.unit}</span>}
              {selectedMaterial.category && <span>· {selectedMaterial.category}</span>}
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
        // 선택된 ID 는 있으나 목록에 없는 경우 (legacy 데이터 표시 폴백)
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
            className="w-full h-10 pl-9 pr-8 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
      )}

      {/* 드롭다운 팝오버 */}
      {open && !disabled && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border rounded-lg shadow-xl max-h-80 overflow-hidden flex flex-col">
          {/* 검색창 (선택 상태에서 드롭다운 열었을 때) */}
          {selectedId && (
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  placeholder="다른 원재료 검색..."
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-2 border rounded text-xs bg-background focus:ring-1 focus:ring-blue-500/30"
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

            {!isLoading && materials.length === 0 && (
              <div className="px-3 py-4 text-center">
                <div className="text-xs text-muted-foreground mb-2">
                  {search ? `'${search}' 검색 결과 없음` : "등록된 원재료가 없습니다"}
                </div>
                {onCreateNew && (
                  <button
                    type="button"
                    onClick={() => {
                      onCreateNew();
                      setOpen(false);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                  >
                    <Plus className="w-3 h-3" /> 신규 원재료 등록
                  </button>
                )}
              </div>
            )}

            {!isLoading && recentMats.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase bg-muted/40 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 최근 사용
                </div>
                {recentMats.map((m) => (
                  <MaterialRow key={`r-${m.id}`} material={m} onSelect={handleSelect} />
                ))}
              </div>
            )}

            {!isLoading && supplierMats.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase bg-muted/40">
                  이 공급업체 이전 매입
                </div>
                {supplierMats.map((m) => (
                  <MaterialRow key={`s-${m.id}`} material={m} onSelect={handleSelect} />
                ))}
              </div>
            )}

            {!isLoading && otherMats.length > 0 && (
              <div>
                {(recentMats.length > 0 || supplierMats.length > 0) && (
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase bg-muted/40">
                    전체 원재료
                  </div>
                )}
                {otherMats.slice(0, 30).map((m) => (
                  <MaterialRow key={`o-${m.id}`} material={m} onSelect={handleSelect} />
                ))}
              </div>
            )}
          </div>

          {onCreateNew && materials.length > 0 && (
            <div className="border-t p-2">
              <button
                type="button"
                onClick={() => {
                  onCreateNew();
                  setOpen(false);
                }}
                className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded transition"
              >
                <Plus className="w-3 h-3" /> 새 원재료 등록
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MaterialRow({
  material,
  onSelect,
}: {
  material: MaterialItem;
  onSelect: (m: MaterialItem) => void;
}) {
  return (
    <button
      type="button"
      className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-xs flex items-center gap-2 border-b border-border/40 last:border-0 transition"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onSelect(material)}
    >
      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="font-medium truncate flex-1">{material.materialName}</span>
      {material.materialCode && (
        <span className="text-[10px] text-muted-foreground shrink-0">{material.materialCode}</span>
      )}
      {material.unit && (
        <span className="text-[10px] text-muted-foreground shrink-0 px-1.5 py-0.5 bg-muted/50 rounded">
          {material.unit}
        </span>
      )}
    </button>
  );
}
