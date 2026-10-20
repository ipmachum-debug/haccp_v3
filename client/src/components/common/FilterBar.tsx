/**
 * FilterBar + useUrlFilters — 검색·필터 표준 (3-a, 명세 §5)
 *   한 줄: 검색창(좌) · 기간 · 상태 · 기타 필터 · [초기화]. 필터 값은 URL 쿼리에 유지 (새로고침·공유·뒤로가기에도 유지)
 *
 *   const [f, setF, reset] = useUrlFilters({ q: "", from: "", to: "", status: "all" });
 *   <FilterBar search={{ value: f.q, onChange: (v) => setF({ q: v }), placeholder: "거래처·품목" }} onReset={reset}>
 *     <Input type="date" value={f.from} onChange={(e) => setF({ from: e.target.value })} />
 *     <Select value={f.status} onValueChange={(v) => setF({ status: v })}>…</Select>
 *   </FilterBar>
 */
import { useCallback, useMemo, type ReactNode } from "react";
import { useSearch } from "wouter";
import { replaceQuery } from "@/lib/urlState";
import { Search, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** URL 쿼리 ↔ 필터 값 (순수 함수 — 테스트 대상). 기본값과 같은 값은 쿼리에서 뺀다 */
export function readFilters<T extends Record<string, string>>(search: string, defaults: T): T {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out = { ...defaults };
  for (const k of Object.keys(defaults) as (keyof T)[]) {
    const v = p.get(String(k));
    if (v != null) (out as Record<string, string>)[String(k)] = v;
  }
  return out;
}
export function writeFilters<T extends Record<string, string>>(search: string, defaults: T, next: Partial<T>): string {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [k, v] of Object.entries(next)) {
    if (v == null || v === "" || v === defaults[k as keyof T]) p.delete(k);
    else p.set(k, String(v));
  }
  const q = p.toString();
  return q ? `?${q}` : "";
}

export function useUrlFilters<T extends Record<string, string>>(defaults: T): [T, (next: Partial<T>) => void, () => void] {
  const search = useSearch();
  const values = useMemo(() => readFilters(search, defaults), [search]); // eslint-disable-line react-hooks/exhaustive-deps
  // 2026-10-21: 지금 주소(window.location)를 기준으로 바꾼다 — 같은 화면의 탭 훅이 방금 바꾼 쿼리를 덮지 않게,
  //   기존 history.state 는 그대로 (replaceQuery). 방문 이력은 쌓지 않는다 (검색 한 글자마다 이력이 생기지 않게).
  const set = useCallback((next: Partial<T>) => {
    const patch: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(next)) patch[k] = v == null || v === "" || v === defaults[k as keyof T] ? null : String(v);
    replaceQuery(patch);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = useCallback(() => {
    replaceQuery(Object.fromEntries(Object.keys(defaults).map((k) => [k, null])));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [values, set, reset];
}

export function FilterBar({ search, children, onReset, className }: {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  children?: ReactNode;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5 mb-4", className)} role="search">
      {search && (
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search.value} onChange={(e) => search.onChange(e.target.value)} placeholder={search.placeholder ?? "검색"} className="h-9 pl-8" />
        </div>
      )}
      {children}
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="h-9 gap-1 text-muted-foreground ml-auto">
          <RotateCcw className="h-3.5 w-3.5" /> 초기화
        </Button>
      )}
    </div>
  );
}
