import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchModalItem {
  id: number | string;
  name: string;
  code?: string;
  subInfo?: string; // 추가 정보 (예: 사업자번호, 단가 등)
  data?: any; // 원본 데이터
}

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: SearchModalItem[];
  onSelect: (item: SearchModalItem) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
}

/**
 * 엑셀/이카운트 스타일 검색 모달
 * - 실시간 검색 필터링
 * - 키보드 네비게이션 (↑↓ 방향키, Enter 선택, Esc 닫기)
 * - 빠른 검색을 위한 UX 최적화
 */
export function SearchModal({
  open,
  onOpenChange,
  title,
  description,
  items,
  onSelect,
  searchPlaceholder = "검색어를 입력하세요",
  emptyMessage = "검색 결과가 없습니다",
  loading = false,
}: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredItems = items.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.code?.toLowerCase().includes(query) ||
      item.subInfo?.toLowerCase().includes(query)
    );
  });

  // 모달 열릴 때 검색창 포커스 및 초기화
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // 선택된 항목이 보이도록 스크롤
  useEffect(() => {
    if (listRef.current && filteredItems.length > 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [selectedIndex, filteredItems]);

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredItems.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
        break;
      case "Enter":
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          handleSelect(filteredItems[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onOpenChange(false);
        break;
    }
  };

  const handleSelect = (item: SearchModalItem) => {
    onSelect(item);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
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
            }}
            onKeyDown={handleKeyDown}
            className="pl-10 h-12 text-base"
          />
        </div>

        {/* 결과 목록 */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto border rounded-md"
          style={{ minHeight: "300px", maxHeight: "400px" }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              로딩 중...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <div className="divide-y">
              {filteredItems.map((item, index) => (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 cursor-pointer transition-colors",
                    index === selectedIndex
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <div className="flex-1">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-sm opacity-80">
                      {item.code && <span className="mr-3">코드: {item.code}</span>}
                      {item.subInfo && <span>{item.subInfo}</span>}
                    </div>
                  </div>
                  {index === selectedIndex && <Check className="h-5 w-5 ml-2" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 하단 안내 */}
        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          <kbd className="px-2 py-1 bg-muted rounded">↑↓</kbd> 이동 ·{" "}
          <kbd className="px-2 py-1 bg-muted rounded">Enter</kbd> 선택 ·{" "}
          <kbd className="px-2 py-1 bg-muted rounded">Esc</kbd> 닫기
        </div>
      </DialogContent>
    </Dialog>
  );
}
