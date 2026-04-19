/**
 * BankTransactionTab.tsx 분해 — Upload / AutoMatchPreview 다이얼로그.
 *
 * 수동 매칭(Match) 다이얼로그는 상태 의존이 커서 메인 파일에 유지.
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";

// ─── 타입 ──────────────────────────────────────────

export interface UploadResult {
  success: number;
  duplicate: number;
  failed: number;
  autoMatched?: number;
  errors?: Array<{ row?: number; message?: string; error?: string }>;
}

export interface AutoMatchPreviewItem {
  transactionId: number;
  transactionDate?: string | Date | null;
  description?: string | null;
  amount: number | string;
  transactionType: "deposit" | "withdrawal";
  accountingAccountId: number;
  ruleName?: string | null;
}

export interface AccountingAccountLite {
  id: number;
  code?: string | null;
  name: string;
}

// ═══════════════════════════════════════════════════
// 1. Upload Dialog
// ═══════════════════════════════════════════════════

export interface BankUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uploadFile: File | null;
  uploadResult: UploadResult | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  uploadPending: boolean;
}

export function BankUploadDialog({
  open,
  onOpenChange,
  uploadFile,
  uploadResult,
  fileInputRef,
  onFileSelect,
  onUpload,
  uploadPending,
}: BankUploadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Excel 파일 업로드</DialogTitle>
          <DialogDescription>
            은행 거래 내역 Excel 파일을 업로드하세요. "템플릿 다운로드" 버튼으로 양식을 먼저 확인하시는
            것을 권장합니다. 업로드 후 자동으로 매칭 규칙이 적용됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="file">Excel 파일 선택 (.xlsx, .xls)</Label>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.xls"
              ref={fileInputRef}
              onChange={onFileSelect}
            />
            {uploadFile && (
              <p className="text-sm text-muted-foreground mt-2">
                선택된 파일: {uploadFile.name}
              </p>
            )}
          </div>

          {uploadResult && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">업로드 결과</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">성공: {uploadResult.success}건</span>
                </div>
                {uploadResult.duplicate > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm">중복: {uploadResult.duplicate}건</span>
                  </div>
                )}
                {uploadResult.failed > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm">실패: {uploadResult.failed}건</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <span className="text-sm">자동 매칭: {uploadResult.autoMatched || 0}건</span>
                </div>
                {uploadResult.errors && uploadResult.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-medium mb-1">오류 목록:</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {uploadResult.errors.map((error, idx) => (
                        <p key={idx} className="text-xs text-red-600">
                          행 {error.row}: {error.error || error.message}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={onUpload} disabled={!uploadFile || uploadPending}>
            {uploadPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            업로드
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════
// 2. AI Auto-Match Preview Dialog
// ═══════════════════════════════════════════════════

export interface AutoMatchPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoMatchPreview: AutoMatchPreviewItem[];
  selectedPreviewIds: Set<number>;
  accountingAccounts: AccountingAccountLite[];
  onToggleAll: () => void;
  onToggleId: (id: number) => void;
  onApply: () => void;
  applyPending: boolean;
}

export function AutoMatchPreviewDialog({
  open,
  onOpenChange,
  autoMatchPreview,
  selectedPreviewIds,
  accountingAccounts,
  onToggleAll,
  onToggleId,
  onApply,
  applyPending,
}: AutoMatchPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI 자동 매칭 미리보기
          </DialogTitle>
          <DialogDescription>
            학습된 매칭 규칙으로 자동 매칭 가능한 거래 <strong>{autoMatchPreview.length}건</strong>을
            찾았습니다. 적용할 거래만 선택한 후 확정하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={
                autoMatchPreview.length > 0 &&
                selectedPreviewIds.size === autoMatchPreview.length
              }
              onCheckedChange={onToggleAll}
            />
            <span className="text-sm font-medium">
              전체 선택 ({selectedPreviewIds.size}/{autoMatchPreview.length})
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            선택한 거래는 매칭 확정 + 자동 분개됩니다
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-8 py-2"></th>
                <th className="py-2">거래일</th>
                <th className="py-2">적요</th>
                <th className="py-2 text-right">금액</th>
                <th className="py-2">→ 계정과목</th>
                <th className="py-2">규칙</th>
              </tr>
            </thead>
            <tbody>
              {autoMatchPreview.map((item) => {
                const acc = accountingAccounts.find(
                  (a) => Number(a.id) === Number(item.accountingAccountId),
                );
                return (
                  <tr
                    key={item.transactionId}
                    className="border-b hover:bg-muted/40 cursor-pointer"
                    onClick={() => onToggleId(item.transactionId)}
                  >
                    <td className="py-2">
                      <Checkbox
                        checked={selectedPreviewIds.has(item.transactionId)}
                        onCheckedChange={() => onToggleId(item.transactionId)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {item.transactionDate
                        ? new Date(item.transactionDate).toLocaleDateString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                          })
                        : "-"}
                    </td>
                    <td className="py-2 max-w-[240px] truncate" title={item.description ?? undefined}>
                      {item.description || "-"}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      <span
                        className={
                          item.transactionType === "deposit"
                            ? "text-blue-600"
                            : "text-red-600"
                        }
                      >
                        {item.transactionType === "deposit" ? "+" : "-"}
                        {Number(item.amount).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2">
                      {acc ? (
                        <Badge variant="outline" className="text-xs font-normal">
                          {acc.code} · {acc.name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          #{item.accountingAccountId}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground truncate max-w-[120px]" title={item.ruleName ?? undefined}>
                      {item.ruleName}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={onApply}
            disabled={selectedPreviewIds.size === 0 || applyPending}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {applyPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            선택한 {selectedPreviewIds.size}건 매칭 확정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
