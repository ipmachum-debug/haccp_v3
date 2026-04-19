/**
 * BankTransactionTab.tsx 분해 — 수동 매칭 Dialog (Manual Match).
 *
 * 가장 복잡한 다이얼로그 — 입금 매칭 3모드 (AR 회수 / 매출 인식 / 기타)
 *   + 미수 AR 목록 할당 + 계정과목 선택 + 규칙 학습.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import type { RouterOutput } from "@/lib/trpcTypes";

// ─── 타입 (메인 파일과 동기화) ──────────────────

type PartnerRow = RouterOutput["partners"]["list"][number];
type PartnerRowExt = PartnerRow & { name?: string };
type OpenArRow = RouterOutput["bankTransaction"]["listOpenArByPartner"][number];

export type DepositMatchMode = "ar" | "sale" | "account";

export interface SelectedTransaction {
  id: number;
  description?: string | null;
  amount: number | string;
  transactionType: "deposit" | "withdrawal";
  transactionDate?: string | Date | null;
  txDate?: string | Date | null;
}

export interface GroupedAccounts {
  assets: Array<{ id: number; code?: string | null; name: string }>;
  liabilities: Array<{ id: number; code?: string | null; name: string }>;
  equity: Array<{ id: number; code?: string | null; name: string }>;
  revenue: Array<{ id: number; code?: string | null; name: string }>;
  expenses: Array<{ id: number; code?: string | null; name: string }>;
  other: Array<{ id: number; code?: string | null; name: string }>;
}

export interface ManualMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  selectedTransaction: SelectedTransaction | null;

  // 매칭 모드 (입금 전용)
  depositMatchMode: DepositMatchMode;
  setDepositMatchMode: (mode: DepositMatchMode) => void;

  // AR 회수 모드
  arPartnerId: string;
  setArPartnerId: (id: string) => void;
  partnersArr: PartnerRow[];
  openArList: OpenArRow[];
  openArLoading: boolean;
  arAllocations: Record<number, number>;
  setArAllocations: (next: Record<number, number>) => void;

  // 계정 선택 모드
  matchAccountingId: string;
  setMatchAccountingId: (id: string) => void;
  groupedAccounts: GroupedAccounts;
  categoryLabels: Record<string, string>;

  // 규칙 학습
  learnRuleOnMatch: boolean;
  setLearnRuleOnMatch: (b: boolean) => void;

  // 액션
  onMatch: () => void;
  matchPending: boolean;
  matchAsArRecoveryPending: boolean;
}

export function ManualMatchDialog({
  open,
  onOpenChange,
  selectedTransaction,
  depositMatchMode,
  setDepositMatchMode,
  arPartnerId,
  setArPartnerId,
  partnersArr,
  openArList,
  openArLoading,
  arAllocations,
  setArAllocations,
  matchAccountingId,
  setMatchAccountingId,
  groupedAccounts,
  categoryLabels,
  learnRuleOnMatch,
  setLearnRuleOnMatch,
  onMatch,
  matchPending,
  matchAsArRecoveryPending,
}: ManualMatchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>수동 매칭</DialogTitle>
          <DialogDescription>
            거래에 대한 계정과목을 지정하여 매칭합니다. 매칭 정보는 자동 매칭 규칙에 학습됩니다.
          </DialogDescription>
        </DialogHeader>
        {selectedTransaction && (
          <div className="space-y-4">
            {/* 거래 정보 */}
            <div className="p-4 bg-muted rounded-lg space-y-1">
              <p className="text-sm font-medium">거래 정보</p>
              <p className="text-sm text-muted-foreground">
                내용: {selectedTransaction.description || "-"}
              </p>
              <p className="text-sm text-muted-foreground">
                금액: {parseFloat(String(selectedTransaction.amount)).toLocaleString()}원
                ({selectedTransaction.transactionType === "deposit" ? "입금" : "출금"})
              </p>
              <p className="text-sm text-muted-foreground">
                거래일:{" "}
                {selectedTransaction.transactionDate
                  ? format(new Date(selectedTransaction.transactionDate), "yyyy-MM-dd")
                  : selectedTransaction.txDate
                    ? format(new Date(selectedTransaction.txDate), "yyyy-MM-dd")
                    : "-"}
              </p>
            </div>

            {/* 입금 매칭 3모드 선택 */}
            {selectedTransaction.transactionType === "deposit" && (
              <div>
                <Label className="text-xs mb-1.5 block">입금 매칭 유형</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDepositMatchMode("ar")}
                    className={`p-2.5 rounded-lg border-2 text-left transition ${
                      depositMatchMode === "ar"
                        ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-sm font-medium flex items-center gap-1">💰 AR 회수</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      외상 매출금 회수 (기존 매출에 대한 입금)
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositMatchMode("sale")}
                    className={`p-2.5 rounded-lg border-2 text-left transition ${
                      depositMatchMode === "sale"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-sm font-medium flex items-center gap-1">🛒 매출 인식</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      전표 없이 직접 매출 계정 분개
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositMatchMode("account")}
                    className={`p-2.5 rounded-lg border-2 text-left transition ${
                      depositMatchMode === "account"
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-sm font-medium flex items-center gap-1">📎 기타</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      이자 수익, 환입, 기타 수익
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* AR 회수 모드 — 거래처 + 미수 AR 목록 */}
            {selectedTransaction.transactionType === "deposit" &&
              depositMatchMode === "ar" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">거래처 *</Label>
                    <Select value={arPartnerId} onValueChange={setArPartnerId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="고객 거래처 선택" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {partnersArr
                          .filter((p: PartnerRow) => p.partnerType === "customer" || !p.partnerType)
                          .map((p: PartnerRowExt) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.companyName || p.name}
                              {p.bizNo ? ` (${p.bizNo})` : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {arPartnerId && (
                    <div>
                      <Label className="text-xs mb-1.5 block">
                        미수금 선택 * (합계:{" "}
                        {Object.values(arAllocations)
                          .reduce((s, a) => s + (a || 0), 0)
                          .toLocaleString()}{" "}
                        / 입금:{" "}
                        {Math.abs(parseFloat(String(selectedTransaction.amount))).toLocaleString()})
                      </Label>
                      <div className="border rounded-lg max-h-[250px] overflow-y-auto">
                        {openArLoading ? (
                          <div className="p-4 text-center text-xs text-muted-foreground">
                            미수 AR 조회 중...
                          </div>
                        ) : openArList.length === 0 ? (
                          <div className="p-4 text-center text-xs text-muted-foreground">
                            이 거래처의 미수금이 없습니다. '매출 인식' 또는 '기타' 모드를 사용하세요.
                          </div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-muted/60">
                              <tr>
                                <th className="text-left px-2 py-1.5">발생일</th>
                                <th className="text-right px-2 py-1.5">원금</th>
                                <th className="text-right px-2 py-1.5">미수잔액</th>
                                <th className="text-right px-2 py-1.5 w-[110px]">회수 금액</th>
                              </tr>
                            </thead>
                            <tbody>
                              {openArList.map((ar: OpenArRow) => {
                                const allocated = arAllocations[ar.id] || 0;
                                return (
                                  <tr key={ar.id} className="border-t hover:bg-muted/30">
                                    <td className="px-2 py-1.5">
                                      {ar.occurredAt
                                        ? format(new Date(ar.occurredAt), "yy-MM-dd")
                                        : "-"}
                                      {ar.memo && (
                                        <div className="text-[9px] text-muted-foreground truncate max-w-[120px]">
                                          {ar.memo}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                                      {Number(ar.originalAmount).toLocaleString()}
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold text-red-600">
                                      {Number(ar.remainingAmount).toLocaleString()}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <Input
                                        type="number"
                                        value={allocated || ""}
                                        onChange={(e) => {
                                          const v = parseFloat(e.target.value) || 0;
                                          const max = Number(ar.remainingAmount);
                                          setArAllocations({
                                            ...arAllocations,
                                            [ar.id]: Math.min(v, max),
                                          });
                                        }}
                                        placeholder={String(ar.remainingAmount)}
                                        className="h-7 text-right text-xs"
                                        max={ar.remainingAmount}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                      {openArList.length > 0 && (
                        <div className="flex gap-2 mt-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              // 자동 할당: 오래된 것부터 입금액만큼
                              const txAmt = Math.abs(parseFloat(String(selectedTransaction.amount)));
                              let remaining = txAmt;
                              const next: Record<number, number> = {};
                              for (const ar of openArList) {
                                if (remaining <= 0.01) break;
                                const take = Math.min(remaining, Number(ar.remainingAmount));
                                next[ar.id] = take;
                                remaining -= take;
                              }
                              setArAllocations(next);
                            }}
                          >
                            자동 할당 (오래된 것부터)
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setArAllocations({})}
                          >
                            전체 초기화
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            {/* 계정과목 선택 — account/sale 모드 (출금은 항상) */}
            {!(
              selectedTransaction.transactionType === "deposit" && depositMatchMode === "ar"
            ) && (
              <div>
                <Label htmlFor="accountingId">계정과목 *</Label>
                <Select value={matchAccountingId} onValueChange={setMatchAccountingId}>
                  <SelectTrigger id="accountingId">
                    <SelectValue placeholder="계정과목을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px]">
                    {selectedTransaction?.transactionType === "deposit" ? (
                      <>
                        {groupedAccounts.revenue.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>💰 수익 (입금 권장)</SelectLabel>
                            {groupedAccounts.revenue.map((acc) => (
                              <SelectItem key={acc.id} value={String(acc.id)}>
                                {acc.code} · {acc.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {groupedAccounts.assets.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>자산</SelectLabel>
                            {groupedAccounts.assets.map((acc) => (
                              <SelectItem key={acc.id} value={String(acc.id)}>
                                {acc.code} · {acc.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </>
                    ) : (
                      <>
                        {groupedAccounts.expenses.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>💸 비용 (출금 권장)</SelectLabel>
                            {groupedAccounts.expenses.map((acc) => (
                              <SelectItem key={acc.id} value={String(acc.id)}>
                                {acc.code} · {acc.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {groupedAccounts.liabilities.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>부채</SelectLabel>
                            {groupedAccounts.liabilities.map((acc) => (
                              <SelectItem key={acc.id} value={String(acc.id)}>
                                {acc.code} · {acc.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </>
                    )}
                    {/* 나머지 분류 */}
                    {(
                      ["assets", "liabilities", "equity", "revenue", "expenses", "other"] as const
                    )
                      .filter((k) => {
                        if (selectedTransaction?.transactionType === "deposit") {
                          return k !== "revenue" && k !== "assets";
                        }
                        return k !== "expenses" && k !== "liabilities";
                      })
                      .map((k) =>
                        groupedAccounts[k].length > 0 ? (
                          <SelectGroup key={k}>
                            <SelectLabel>{categoryLabels[k]}</SelectLabel>
                            {groupedAccounts[k].map((acc) => (
                              <SelectItem key={acc.id} value={String(acc.id)}>
                                {acc.code} · {acc.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ) : null,
                      )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  계정과목을 선택하면 해당 거래가 매칭됩니다.
                </p>
              </div>
            )}

            {/* 규칙 자동 학습 옵션 */}
            <div className="flex items-start gap-2 p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <Checkbox
                id="learnRule"
                checked={learnRuleOnMatch}
                onCheckedChange={(checked) => setLearnRuleOnMatch(!!checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label
                  htmlFor="learnRule"
                  className="text-sm font-medium cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                  이 패턴을 자동 매칭 규칙으로 학습
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  체크하면 이후 AI 자동 매칭 시 같은 거래처/적요를 가진 미매칭 거래들이 자동으로 검색됩니다.
                </p>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={onMatch}
            disabled={(() => {
              if (!selectedTransaction) return true;
              if (matchPending || matchAsArRecoveryPending) return true;
              if (
                selectedTransaction.transactionType === "deposit" &&
                depositMatchMode === "ar"
              ) {
                if (!arPartnerId) return true;
                const totalAllocated = Object.values(arAllocations).reduce(
                  (s, a) => s + (a || 0),
                  0,
                );
                if (totalAllocated <= 0) return true;
                return false;
              }
              return !matchAccountingId;
            })()}
          >
            {(matchPending || matchAsArRecoveryPending) && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            매칭 확정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
