import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Check, ChevronDown, ChevronRight, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

export interface SearchModalItem {
  id: number | string;
  name: string;
  code?: string;
  subInfo?: string;
  data?: any;
}

export interface SearchModalColumn {
  key: string;
  label: string;
  searchable?: boolean;
  render?: (value: any, row?: any) => React.ReactNode;
  width?: string; // 컬럼 너비 지정 (예: "80px", "1fr", "2fr")
}

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  // 방법 1: items 직접 전달
  items?: SearchModalItem[];
  // 방법 2: data + columns 전달 (자동 매핑)
  data?: any[];
  columns?: SearchModalColumn[];
  onSelect: (item: any) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  /** 모달 최대 너비 클래스 (기본: max-w-3xl) */
  maxWidthClass?: string;
  /** SKU 선택 기능 활성화 - 품목에 SKU가 있으면 SKU 선택 단계 추가 */
  enableSkuSelection?: boolean;
}

interface DisplayRow {
  original: any;
  searchTexts: string[];
  displayCols: { label: string; value: string }[];
  id: string | number;
}

export function SearchModal({
  open,
  onOpenChange,
  title,
  description,
  items: directItems,
  data,
  columns,
  onSelect,
  searchPlaceholder = "검색어를 입력하세요",
  emptyMessage = "검색 결과가 없습니다",
  loading = false,
  maxWidthClass,
  enableSkuSelection = false,
}: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  
  // SKU 관련 상태
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [selectedSkuIndex, setSelectedSkuIndex] = useState(0);

  // SKU 목록 조회 (확장된 아이템)
  const { data: skuList, isLoading: skuLoading } = trpc.productSku.listByItem.useQuery(
    { itemId: expandedItemId! },
    { enabled: enableSkuSelection && expandedItemId !== null }
  );

  // 컬럼 수에 따라 자동으로 모달 너비 결정
  const resolvedMaxWidth = maxWidthClass
    ? maxWidthClass
    : columns && columns.length >= 5
      ? "max-w-4xl"
      : "max-w-2xl";

  // 컬럼별 grid-template-columns 생성
  const gridTemplateColumns = (() => {
    if (!columns) return "";
    const colWidths = columns.map((col) => {
      if (col.width) return col.width;
      // 기본 너비 추론
      const key = col.key.toLowerCase();
      if (key.includes("type") || key.includes("displaytype") || key === "_displayType") return "70px";
      if (key.includes("code")) return "100px";
      if (key.includes("unit") || key.includes("baseunit")) return "50px";
      if (key.includes("price") || key.includes("단가")) return "70px";
      if (key.includes("name") || key.includes("itemname")) return "2fr";
      if (key.includes("category") || key.includes("카테고리")) return "1.2fr";
      return "1fr";
    });
    return colWidths.join(" ") + " 30px";
  })();

  // data+columns 또는 items를 통합 형태로 변환
  const displayRows: DisplayRow[] = (() => {
    if (data && columns) {
      return data.map((row: any, idx: number) => {
        const searchTexts: string[] = [];
        const displayCols: { label: string; value: string }[] = [];
        columns.forEach((col) => {
          const rawValue = row[col.key];
          const displayValue = col.render ? String(col.render(rawValue, row) ?? "") : String(rawValue ?? "");
          displayCols.push({ label: col.label, value: displayValue });
          if (col.searchable) {
            searchTexts.push(String(rawValue ?? "").toLowerCase());
          }
        });
        return { original: row, searchTexts, displayCols, id: row.id ?? idx };
      });
    } else if (directItems) {
      return directItems.map((item) => ({
        original: item,
        searchTexts: [
          item.name.toLowerCase(),
          (item.code || "").toLowerCase(),
          (item.subInfo || "").toLowerCase(),
        ],
        displayCols: [
          { label: "이름", value: item.name },
          ...(item.code ? [{ label: "코드", value: item.code }] : []),
          ...(item.subInfo ? [{ label: "정보", value: item.subInfo }] : []),
        ],
        id: item.id,
      }));
    }
    return [];
  })();

  // 검색 필터링
  const filteredRows = displayRows.filter((row) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return row.searchTexts.some((text) => text.includes(query));
  });

  // 모달 열릴 때 검색창 포커스 및 초기화
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedIndex(0);
      setExpandedItemId(null);
      setSelectedSkuIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // 선택된 항목이 보이도록 스크롤
  useEffect(() => {
    if (listRef.current && filteredRows.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex, filteredRows]);

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // SKU 선택 모드일 때
    if (expandedItemId !== null && skuList && skuList.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedSkuIndex((prev) => Math.min(prev + 1, skuList.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          if (selectedSkuIndex === 0) {
            // SKU 목록에서 벗어나기
            setExpandedItemId(null);
            setSelectedSkuIndex(0);
          } else {
            setSelectedSkuIndex((prev) => prev - 1);
          }
          break;
        case "Enter":
          e.preventDefault();
          if (skuList[selectedSkuIndex]) {
            handleSkuSelect(skuList[selectedSkuIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setExpandedItemId(null);
          setSelectedSkuIndex(0);
          break;
      }
      return;
    }

    if (filteredRows.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredRows.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredRows.length) % filteredRows.length);
        break;
      case "Enter":
        e.preventDefault();
        if (filteredRows[selectedIndex]) {
          handleRowClick(filteredRows[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onOpenChange(false);
        break;
    }
  };

  const handleSkuSelect = (sku: any) => {
    // SKU 정보를 포함하여 선택 완료
    const parentRow = filteredRows.find((r) => r.original.id === expandedItemId);
    if (parentRow) {
      onSelect({
        ...parentRow.original,
        selectedSku: sku,
        skuId: sku.id,
        skuCode: sku.skuCode,
        skuName: sku.skuName,
        salesUnit: sku.salesUnit,
        kgPerSalesUnit: sku.kgPerSalesUnit,
        unitPrice: sku.unitPrice || parentRow.original.defaultUnitPrice,
      });
    }
    setExpandedItemId(null);
    setSelectedSkuIndex(0);
    onOpenChange(false);
  };

  const handleRowClick = (row: DisplayRow) => {
    if (enableSkuSelection) {
      const itemId = row.original.id;
      const itemType = row.original.itemType;
      
      // 원재료/부자재는 SKU 없이 바로 선택
      if (itemType === "raw_material" || itemType === "subsidiary") {
        onSelect(row.original);
        onOpenChange(false);
        return;
      }
      
      // 자사제품/외부제품은 SKU 확인
      if (expandedItemId === itemId) {
        // 이미 펼쳐져 있으면 접기
        setExpandedItemId(null);
        setSelectedSkuIndex(0);
      } else {
        // SKU 목록 펼치기
        setExpandedItemId(itemId);
        setSelectedSkuIndex(0);
      }
    } else {
      onSelect(row.original);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(resolvedMaxWidth, "max-h-[600px] flex flex-col gap-3")}>
        <DialogHeader className="space-y-1 pb-0">
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-muted-foreground">
              {description}
            </DialogDescription>
          )}
          {enableSkuSelection && (
            <DialogDescription className="text-xs text-blue-600">
              자사제품/외부제품은 클릭하여 SKU를 선택하세요. 원재료/부자재는 바로 선택됩니다.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* 검색 입력 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
              setExpandedItemId(null);
            }}
            onKeyDown={handleKeyDown}
            className="pl-10 h-10 text-sm"
          />
        </div>

        {/* 테이블 헤더 (columns 방식일 때) */}
        {columns && (
          <div
            className="grid px-3 py-2 bg-muted/50 rounded-t-md border-b font-semibold text-xs text-muted-foreground"
            style={{ gridTemplateColumns }}
          >
            {columns.map((col) => (
              <div key={col.key} className="truncate">{col.label}</div>
            ))}
            <div></div>
          </div>
        )}

        {/* 결과 목록 */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto border rounded-md -mt-1"
          style={{ minHeight: "300px", maxHeight: "400px" }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              로딩 중...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div className="divide-y">
              {filteredRows.map((row, index) => (
                <React.Fragment key={row.id}>
                  <div
                    onClick={() => handleRowClick(row)}
                    className={cn(
                      "cursor-pointer transition-colors",
                      expandedItemId === row.original.id
                        ? "bg-blue-50 border-l-2 border-l-blue-500"
                        : index === selectedIndex && expandedItemId === null
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                    )}
                  >
                    {columns ? (
                      <div
                        className="grid px-3 py-2.5 items-center"
                        style={{ gridTemplateColumns }}
                      >
                        {row.displayCols.map((col, colIdx) => (
                          <div key={colIdx} className="text-sm truncate pr-2" title={col.value}>
                            {col.value}
                          </div>
                        ))}
                        <div className="flex justify-center">
                          {enableSkuSelection && (row.original.itemType === "own_product" || row.original.itemType === "external_product") ? (
                            expandedItemId === row.original.id ? (
                              <ChevronDown className="h-4 w-4 text-blue-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )
                          ) : (
                            index === selectedIndex && expandedItemId === null && <Check className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{row.displayCols[0]?.value}</div>
                          <div className="text-sm opacity-80 truncate">
                            {row.displayCols.slice(1).map((col, i) => (
                              <span key={i} className="mr-3">
                                {col.label}: {col.value}
                              </span>
                            ))}
                          </div>
                        </div>
                        {index === selectedIndex && expandedItemId === null && <Check className="h-5 w-5 ml-2 flex-shrink-0" />}
                      </div>
                    )}
                  </div>
                  
                  {/* SKU 확장 영역 */}
                  {enableSkuSelection && expandedItemId === row.original.id && (
                    <div className="bg-blue-50/50 border-l-2 border-l-blue-300">
                      {skuLoading ? (
                        <div className="px-6 py-3 text-sm text-muted-foreground">
                          SKU 목록 로딩 중...
                        </div>
                      ) : !skuList || skuList.length === 0 ? (
                        <div className="px-6 py-3">
                          <p className="text-sm text-muted-foreground mb-2">등록된 SKU가 없습니다.</p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // SKU 없이 품목 자체를 선택
                              onSelect(row.original);
                              setExpandedItemId(null);
                              onOpenChange(false);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            SKU 없이 품목 선택
                          </button>
                        </div>
                      ) : (
                        <div className="px-4 py-2">
                          <div className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            SKU 선택 ({skuList.length}개)
                          </div>
                          <div className="space-y-1">
                            {skuList.map((sku: any, skuIdx: number) => (
                              <div
                                key={sku.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSkuSelect(sku);
                                }}
                                className={cn(
                                  "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-sm transition-colors",
                                  skuIdx === selectedSkuIndex
                                    ? "bg-blue-100 ring-1 ring-blue-400"
                                    : "hover:bg-blue-100/50"
                                )}
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <span className="font-mono text-xs text-blue-600 shrink-0">{sku.skuCode}</span>
                                  <span className="truncate font-medium">{sku.skuName}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">{sku.salesUnit}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    {Number(sku.kgPerSalesUnit || 0).toFixed(3)}kg
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs font-medium">
                                    {Number(sku.unitPrice || 0).toLocaleString()}원
                                  </span>
                                  {sku.isDefault === 1 && (
                                    <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded">기본</span>
                                  )}
                                  {skuIdx === selectedSkuIndex && <Check className="h-4 w-4 text-blue-600" />}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* 결과 수 및 하단 안내 */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
          <span>총 {filteredRows.length}건</span>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd>
            <span>이동</span>
            <span className="mx-0.5">·</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd>
            <span>선택</span>
            <span className="mx-0.5">·</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd>
            <span>닫기</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
