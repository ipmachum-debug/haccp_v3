import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface AutocompleteItem {
  id: number | string;
  name: string;
  code?: string;
  subInfo?: string;
  data?: any;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: AutocompleteItem) => void;
  items: AutocompleteItem[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minChars?: number; // 최소 입력 글자 수 (기본값: 1)
}

/**
 * 엑셀/이카운트 스타일 자동완성 입력
 * - 타이핑 시 실시간 매칭 항목 드롭다운
 * - 키보드 네비게이션 (↑↓, Enter)
 * - 빠른 입력을 위한 UX 최적화
 */
export function AutocompleteInput({
  value,
  onChange,
  onSelect,
  items,
  placeholder,
  className,
  disabled = false,
  minChars = 1,
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 검색 필터링
  const filteredItems = items.filter((item) => {
    if (value.length < minChars) return false;
    const query = value.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.code?.toLowerCase().includes(query)
    );
  });

  // 드롭다운 표시 여부
  useEffect(() => {
    setIsOpen(filteredItems.length > 0 && value.length >= minChars);
    setSelectedIndex(0);
  }, [value, filteredItems.length, minChars]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filteredItems.length === 0) return;

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
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (item: AutocompleteItem) => {
    onChange(item.name);
    onSelect?.(item);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (filteredItems.length > 0 && value.length >= minChars) {
            setIsOpen(true);
          }
        }}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
      />

      {/* 드롭다운 */}
      {isOpen && filteredItems.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredItems.map((item, index) => (
            <div
              key={item.id}
              onClick={() => handleSelect(item)}
              className={cn(
                "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors",
                index === selectedIndex
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              <div className="flex-1">
                <div className="font-medium text-sm">{item.name}</div>
                {(item.code || item.subInfo) && (
                  <div className="text-xs opacity-80">
                    {item.code && <span className="mr-2">코드: {item.code}</span>}
                    {item.subInfo && <span>{item.subInfo}</span>}
                  </div>
                )}
              </div>
              {index === selectedIndex && <Check className="h-4 w-4 ml-2" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
