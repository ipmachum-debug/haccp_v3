/**
 * AI 생산입력 파서 컴포넌트 (Phase 2: 학습 기반 개선)
 * 
 * Phase 2 기능:
 * - 학습 데이터 기반 매칭 ("학습됨" 배지 표시)
 * - 사용자 교정 시 alias→product 매핑 자동 학습
 * - 학습 통계 표시 (학습된 alias 수, 평균 정확도)
 * - 수동 제품 검색 (매칭 실패 시)
 * - 파싱 히스토리 저장 + 정확도 추적
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import {
  Sparkles, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Search, ArrowRight,
  Wand2, RotateCcw, XCircle, Brain, TrendingUp,
  BookOpen, Zap, Edit3
} from "lucide-react";
import { toast } from "sonner";

// ===== Types =====
interface ParsedItem {
  rawName: string;
  parsedName: string;
  quantityKg: number;
  confidence: number;
  matchSource?: "learned" | "fuzzy";
  learnedUseCount?: number;
  matched: {
    productId: number;
    productName: string;
    itemCode: string;
    matchScore: number;
    skus: Array<{
      id: number;
      skuCode: string;
      skuName: string;
      netWeightG: number | null;
      piecesPerPack: number;
      packsPerBox: number;
      salesUnit: string;
      kgPerSalesUnit: number;
      isDefault: number;
    }>;
  } | null;
  candidates: Array<{
    productId: number;
    productName: string;
    itemCode: string;
    matchScore: number;
  }>;
}

interface ConfirmedItem {
  productId: number;
  productName: string;
  quantityKg: number;
  skuOutputs?: Record<number, string>;
}

// Tracks whether each item was user-corrected (for learning)
interface CorrectionTracker {
  originalProductId: number | null;
  wasCorrected: boolean;
}

interface Props {
  onConfirm: (items: ConfirmedItem[]) => void;
  onClose?: () => void;
}

// ===== Score Badge =====
function MatchScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : score >= 60 ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-red-100 text-red-700 border-red-200";
  const label = score >= 80 ? "정확" : score >= 60 ? "유사" : "낮음";
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${color}`}>
      {label} {Math.round(score)}%
    </Badge>
  );
}

// ===== Learned Badge =====
function LearnedBadge({ useCount }: { useCount: number }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 border-violet-200 gap-0.5">
            <Brain className="h-2.5 w-2.5" />
            학습됨
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">이전 사용에서 학습된 매칭입니다 (사용 {useCount}회)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ===== Parse Method Badge =====
function ParseMethodBadge({ method, learnedMatchCount }: { method: "ai" | "regex" | "learned" | null; learnedMatchCount?: number }) {
  if (method === "learned") {
    return (
      <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-600 gap-0.5">
        <Brain className="h-2.5 w-2.5" />
        학습 매칭 {learnedMatchCount ? `(${learnedMatchCount}건)` : ""}
      </Badge>
    );
  }
  if (method === "ai") {
    return (
      <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-600 gap-0.5">
        <Sparkles className="h-2.5 w-2.5" />
        AI 분석
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 gap-0.5">
      <Zap className="h-2.5 w-2.5" />
      패턴 분석
    </Badge>
  );
}

// ===== Product Search Mini Component =====
function ProductSearchInline({ onSelect }: { onSelect: (productId: number, productName: string) => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchResults = trpc.aiProductionParser.searchProducts.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 1 }
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Search className="h-3 w-3 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="제품명 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-7 text-xs"
        />
      </div>
      {searchQuery.length >= 1 && searchResults.data && (
        <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
          {searchResults.data.length > 0 ? (
            searchResults.data.map((r) => (
              <button
                key={r.productId}
                className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                onClick={() => onSelect(r.productId, r.productName)}
              >
                <span className="font-medium">{r.productName}</span>
                <span className="text-muted-foreground text-[10px]">{r.itemCode}</span>
              </button>
            ))
          ) : (
            <p className="text-[10px] text-muted-foreground px-2 py-1">검색 결과가 없습니다</p>
          )}
        </div>
      )}
      {searchQuery.length >= 1 && searchResults.isLoading && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground px-2">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          검색 중...
        </div>
      )}
    </div>
  );
}

// ===== Main Component =====
export default function AIProductionParser({ onConfirm, onClose }: Props) {
  const [inputText, setInputText] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [confirmedItems, setConfirmedItems] = useState<Map<number, ConfirmedItem>>(new Map());
  const [correctionTrackers, setCorrectionTrackers] = useState<Map<number, CorrectionTracker>>(new Map());
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [parseMethod, setParseMethod] = useState<"ai" | "regex" | "learned" | null>(null);
  const [unparsedText, setUnparsedText] = useState("");
  const [learnedMatchCount, setLearnedMatchCount] = useState(0);
  const [step, setStep] = useState<"input" | "review" | "confirm">("input");
  const [showStats, setShowStats] = useState(false);

  // Learning stats query
  const statsQuery = trpc.aiProductionParser.getLearningStats.useQuery(undefined, {
    enabled: step === "input",
    staleTime: 30000,
  });

  // Save corrections mutation
  const saveCorrectionsMutation = trpc.aiProductionParser.saveCorrections.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        if (data.correctionCount > 0) {
          toast.success(data.message, {
            description: `${data.savedAliasCount}개 alias가 학습되었습니다`,
            duration: 4000,
          });
        }
      }
    },
    onError: (err) => {
      console.error("[AI Parser] 학습 저장 실패:", err.message);
    },
  });

  // Parse mutation
  const parseMutation = trpc.aiProductionParser.parseProductionText.useMutation({
    onSuccess: (data) => {
      setParsedItems(data.items as ParsedItem[]);
      setParseMethod(data.parseMethod as "ai" | "regex" | "learned");
      setUnparsedText(data.unparsedText || "");
      setLearnedMatchCount(data.learnedMatchCount || 0);

      // Auto-confirm items with high match score
      const autoConfirmed = new Map<number, ConfirmedItem>();
      const trackers = new Map<number, CorrectionTracker>();

      (data.items as ParsedItem[]).forEach((item: ParsedItem, idx: number) => {
        // Track original match for correction detection
        trackers.set(idx, {
          originalProductId: item.matched?.productId || null,
          wasCorrected: false,
        });

        if (item.matched && item.matched.matchScore >= 70 && item.quantityKg > 0) {
          autoConfirmed.set(idx, {
            productId: item.matched.productId,
            productName: item.matched.productName,
            quantityKg: item.quantityKg,
          });
        }
      });

      setConfirmedItems(autoConfirmed);
      setCorrectionTrackers(trackers);
      setStep("review");

      const matchedCount = (data.items as ParsedItem[]).filter((i: ParsedItem) => i.matched).length;
      const learnedCount = data.learnedMatchCount || 0;

      if (learnedCount > 0 && matchedCount === data.items.length) {
        toast.success(`${data.items.length}개 항목 모두 매칭! (학습 ${learnedCount}건)`, {
          description: "이전 사용에서 학습된 데이터를 활용했습니다",
        });
      } else if (matchedCount === data.items.length) {
        toast.success(`${data.items.length}개 항목 모두 매칭 성공!`);
      } else {
        toast.info(`${matchedCount}/${data.items.length}개 항목 매칭 완료. 나머지를 확인해주세요.`);
      }
    },
    onError: (err) => {
      toast.error(`파싱 실패: ${err.message}`);
    },
  });

  // Handlers
  const handleParse = useCallback(() => {
    if (!inputText.trim()) {
      toast.error("생산 내용을 입력해주세요");
      return;
    }
    parseMutation.mutate({ text: inputText.trim() });
  }, [inputText, parseMutation]);

  const handleSelectProduct = (idx: number, productId: number, productName: string) => {
    const item = parsedItems[idx];
    const updated = new Map(confirmedItems);
    updated.set(idx, {
      productId,
      productName,
      quantityKg: item.quantityKg,
    });
    setConfirmedItems(updated);

    // Track correction
    const tracker = correctionTrackers.get(idx);
    if (tracker) {
      const newTrackers = new Map(correctionTrackers);
      newTrackers.set(idx, {
        ...tracker,
        wasCorrected: tracker.originalProductId !== productId,
      });
      setCorrectionTrackers(newTrackers);
    }

    setExpandedIdx(null);
    setSearchIdx(null);
  };

  const handleUpdateQuantity = (idx: number, qty: number) => {
    const existing = confirmedItems.get(idx);
    if (existing) {
      const updated = new Map(confirmedItems);
      updated.set(idx, { ...existing, quantityKg: qty });
      setConfirmedItems(updated);
    }
  };

  const handleRemoveItem = (idx: number) => {
    const updated = new Map(confirmedItems);
    updated.delete(idx);
    setConfirmedItems(updated);
  };

  const handleConfirmAll = () => {
    const items = Array.from(confirmedItems.values()).filter(i => i.productId && i.quantityKg > 0);
    if (items.length === 0) {
      toast.error("확인된 항목이 없습니다");
      return;
    }

    // Build correction data for learning
    const corrections = Array.from(confirmedItems.entries()).map(([idx, confirmed]) => {
      const parsed = parsedItems[idx];
      const tracker = correctionTrackers.get(idx);
      return {
        rawName: parsed?.rawName || "",
        parsedName: parsed?.parsedName || "",
        productId: confirmed.productId,
        productName: confirmed.productName,
        quantityKg: confirmed.quantityKg,
        wasCorrected: tracker?.wasCorrected || false,
      };
    });

    // Save corrections for learning (fire-and-forget)
    saveCorrectionsMutation.mutate({
      inputText: inputText,
      parseMethod: parseMethod || "ai",
      corrections,
    });

    onConfirm(items);
    toast.success(`${items.length}개 항목이 생산 목록에 추가되었습니다`);
    resetState();
  };

  const resetState = () => {
    setInputText("");
    setParsedItems([]);
    setConfirmedItems(new Map());
    setCorrectionTrackers(new Map());
    setExpandedIdx(null);
    setSearchIdx(null);
    setParseMethod(null);
    setUnparsedText("");
    setLearnedMatchCount(0);
    setStep("input");
    setShowStats(false);
  };

  const totalKg = Array.from(confirmedItems.values()).reduce((s, i) => s + (i.quantityKg || 0), 0);
  const correctedCount = Array.from(correctionTrackers.values()).filter(t => t.wasCorrected).length;

  return (
    <Card className="border-2 border-indigo-200 dark:border-indigo-800 shadow-lg overflow-hidden">
      {/* Header */}
      <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                AI 생산입력 파서
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-300 text-violet-500 font-normal">
                  Phase 2
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                자연어로 생산 계획을 입력하면 AI가 자동으로 제품과 수량을 추출합니다
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {step === "input" && statsQuery.data && statsQuery.data.aliasCount > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-violet-600 hover:bg-violet-50"
                      onClick={() => setShowStats(!showStats)}
                    >
                      <Brain className="h-3.5 w-3.5 mr-1" />
                      <span className="text-[10px]">{statsQuery.data.aliasCount}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">학습 통계 {showStats ? "숨기기" : "보기"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Learning Stats Panel */}
        {showStats && statsQuery.data && (
          <div className="p-3 rounded-lg bg-violet-50/70 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-400">
              <TrendingUp className="h-3.5 w-3.5" />
              학습 통계
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-lg font-bold text-violet-700">{statsQuery.data.aliasCount}</div>
                <div className="text-[10px] text-muted-foreground">학습된 alias</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-violet-700">{statsQuery.data.totalUses}</div>
                <div className="text-[10px] text-muted-foreground">총 사용 횟수</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-violet-700">
                  {(statsQuery.data.avgAccuracy * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-muted-foreground">평균 정확도</div>
              </div>
            </div>
            {statsQuery.data.topAliases.length > 0 && (
              <div className="pt-2 border-t border-violet-200 dark:border-violet-700">
                <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                  <BookOpen className="h-2.5 w-2.5" />
                  자주 사용되는 매칭
                </div>
                <div className="flex flex-wrap gap-1">
                  {statsQuery.data.topAliases.slice(0, 5).map((a, i) => (
                    <Badge key={i} variant="outline" className="text-[9px] bg-white dark:bg-gray-900 gap-0.5">
                      {a.alias} → {a.productName}
                      <span className="text-violet-500">({a.useCount})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Input */}
        {step === "input" && (
          <div className="space-y-3">
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`생산 계획을 자유롭게 입력하세요.

예시:
콩고물쑥떡 150kg, 롤크림떡(초코) 200kg
카스테라왕찹쌀떡 100kg
한입빙수 인절미 80kg`}
              rows={5}
              className="resize-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700 text-sm"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                제품명과 수량(kg)을 쉼표, 줄바꿈으로 구분하여 입력하세요
                {statsQuery.data && statsQuery.data.aliasCount > 0 && (
                  <span className="text-violet-500 ml-1">
                    | 학습된 매칭 {statsQuery.data.aliasCount}건 활용 가능
                  </span>
                )}
              </p>
              <Button
                onClick={handleParse}
                disabled={!inputText.trim() || parseMutation.isPending}
                className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-md"
                size="sm"
              >
                {parseMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    분석 중...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-1.5" />
                    AI 분석
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === "review" && (
          <div className="space-y-3">
            {/* Parse method badge + stats */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <ParseMethodBadge method={parseMethod} learnedMatchCount={learnedMatchCount} />
                {learnedMatchCount > 0 && parseMethod !== "learned" && (
                  <Badge variant="outline" className="text-[10px] border-violet-200 text-violet-500 gap-0.5">
                    <Brain className="h-2.5 w-2.5" />
                    학습 {learnedMatchCount}건
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {parsedItems.length}개 항목 발견 | {confirmedItems.size}개 확인됨
                  {correctedCount > 0 && (
                    <span className="text-amber-600 ml-1">| {correctedCount}개 수정됨</span>
                  )}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={resetState} className="text-xs text-muted-foreground">
                <RotateCcw className="h-3 w-3 mr-1" />
                다시 입력
              </Button>
            </div>

            {/* Unparsed text warning */}
            {unparsedText && (
              <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                인식하지 못한 부분: "{unparsedText}"
              </div>
            )}

            {/* Item list */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {parsedItems.map((item, idx) => {
                const confirmed = confirmedItems.get(idx);
                const tracker = correctionTrackers.get(idx);
                const isExpanded = expandedIdx === idx;
                const isSearching = searchIdx === idx;
                const hasMatch = !!item.matched;
                const isLearned = item.matchSource === "learned";
                const wasCorrected = tracker?.wasCorrected || false;

                return (
                  <div
                    key={idx}
                    className={`rounded-lg border p-3 transition-all ${
                      confirmed
                        ? wasCorrected
                          ? "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20"
                          : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                        : hasMatch
                        ? isLearned
                          ? "border-violet-200 bg-violet-50/30 dark:border-violet-800 dark:bg-violet-950/20"
                          : "border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20"
                        : "border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-950/20"
                    }`}
                  >
                    {/* Main row */}
                    <div className="flex items-center gap-2">
                      {/* Status icon */}
                      {confirmed ? (
                        wasCorrected ? (
                          <Edit3 className="h-4 w-4 text-amber-500 shrink-0" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        )
                      ) : hasMatch ? (
                        isLearned ? (
                          <Brain className="h-4 w-4 text-violet-500 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-blue-500 shrink-0" />
                        )
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                      )}

                      {/* Item info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]" title={item.rawName}>
                            "{item.rawName}"
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">
                            {confirmed ? confirmed.productName : item.matched?.productName || item.parsedName}
                          </span>
                          {/* Badges */}
                          {isLearned && item.learnedUseCount ? (
                            <LearnedBadge useCount={item.learnedUseCount} />
                          ) : (
                            item.matched && <MatchScoreBadge score={item.matched.matchScore} />
                          )}
                          {wasCorrected && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200 gap-0.5">
                              <Edit3 className="h-2.5 w-2.5" />
                              수정됨
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Quantity */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          type="number"
                          className="h-7 w-20 text-xs text-right"
                          value={confirmed?.quantityKg ?? item.quantityKg ?? ""}
                          onChange={(e) => {
                            const qty = parseFloat(e.target.value) || 0;
                            if (confirmed) {
                              handleUpdateQuantity(idx, qty);
                            }
                          }}
                          disabled={!confirmed}
                        />
                        <span className="text-[10px] text-muted-foreground">kg</span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {!confirmed && item.matched && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-emerald-600 hover:bg-emerald-100"
                                  onClick={() => handleSelectProduct(idx, item.matched!.productId, item.matched!.productName)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">{item.matched.productName} 선택</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {/* Search button for manual matching */}
                        {!confirmed && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-7 px-2 text-xs ${isSearching ? "text-indigo-600 bg-indigo-50" : "text-muted-foreground hover:bg-gray-100"}`}
                                  onClick={() => setSearchIdx(isSearching ? null : idx)}
                                >
                                  <Search className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">제품 직접 검색</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {confirmed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-red-500 hover:bg-red-100"
                            onClick={() => handleRemoveItem(idx)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1.5"
                          onClick={() => {
                            setExpandedIdx(isExpanded ? null : idx);
                            if (isSearching) setSearchIdx(null);
                          }}
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>

                    {/* Inline product search */}
                    {isSearching && (
                      <div className="mt-2 pt-2 border-t border-dashed">
                        <ProductSearchInline
                          onSelect={(productId, productName) => {
                            handleSelectProduct(idx, productId, productName);
                            setSearchIdx(null);
                          }}
                        />
                      </div>
                    )}

                    {/* Expanded: Candidate list */}
                    {isExpanded && !isSearching && (
                      <div className="mt-2 pt-2 border-t border-dashed">
                        <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Search className="h-3 w-3" />
                          후보 제품 목록 (클릭하여 선택)
                        </p>
                        {item.candidates.length > 0 ? (
                          <div className="space-y-1">
                            {item.candidates.map((c) => (
                              <button
                                key={c.productId}
                                className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between transition-colors ${
                                  confirmed?.productId === c.productId
                                    ? "bg-emerald-100 dark:bg-emerald-900/30 ring-1 ring-emerald-300"
                                    : "hover:bg-gray-100 dark:hover:bg-gray-800"
                                }`}
                                onClick={() => handleSelectProduct(idx, c.productId, c.productName)}
                              >
                                <span>
                                  <span className="font-medium">{c.productName}</span>
                                  <span className="text-muted-foreground ml-1">({c.itemCode})</span>
                                </span>
                                <MatchScoreBadge score={c.matchScore} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-xs text-muted-foreground px-2">
                              매칭되는 제품을 찾을 수 없습니다.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs w-full"
                              onClick={() => {
                                setSearchIdx(idx);
                                setExpandedIdx(null);
                              }}
                            >
                              <Search className="h-3 w-3 mr-1" />
                              제품 직접 검색
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary & Actions */}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">
                  확인된 항목: <strong>{confirmedItems.size}건</strong> | 
                  총 생산량: <strong>{totalKg.toFixed(1)}kg</strong>
                  {correctedCount > 0 && (
                    <span className="text-amber-600 ml-1">
                      | 수정 {correctedCount}건 (학습 예정)
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-indigo-600"
                  onClick={() => {
                    const autoConfirmed = new Map(confirmedItems);
                    parsedItems.forEach((item, idx) => {
                      if (!autoConfirmed.has(idx) && item.matched && item.matched.matchScore >= 50 && item.quantityKg > 0) {
                        autoConfirmed.set(idx, {
                          productId: item.matched.productId,
                          productName: item.matched.productName,
                          quantityKg: item.quantityKg,
                        });
                      }
                    });
                    setConfirmedItems(autoConfirmed);
                  }}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  전체 자동 확인
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleConfirmAll}
                  disabled={confirmedItems.size === 0 || saveCorrectionsMutation.isPending}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md"
                  size="sm"
                >
                  {saveCorrectionsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      학습 저장 중...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      {confirmedItems.size}개 항목 생산 목록에 추가
                      {correctedCount > 0 && " + 학습"}
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={resetState}>
                  취소
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
