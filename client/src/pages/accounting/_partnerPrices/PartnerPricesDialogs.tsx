/**
 * PartnerPricesManagement.tsx 분해 — 3개 Dialog 컴포넌트 묶음.
 *
 * 포함:
 *  - PriceEditDialog        단건 수정 다이얼로그
 *  - AiPreviewDialog        AI 가격 조정 미리보기
 *  - PriceDetailDialog      상세보기 (읽기 전용) + PDF 출력 + 수정 이동
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit, Eye, FileSpreadsheet, Sparkles } from "lucide-react";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
// ─── 타입 ─────────────────────────────────────────

export interface PriceEditForm {
  unitPrice: number;
  discountRate: number;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
}

export interface PriceDetailRow {
  id?: number;
  partnerId: number;
  partnerName?: string | null;
  targetType: string;
  materialId?: number | null;
  productId?: number | null;
  itemName: string;
  itemCode?: string | null;
  // Drizzle DECIMAL → string on the wire, but callers may pass number too
  unitPrice: number | string;
  currency?: string | null;
  discountRate?: number | string | null;
  effectiveFrom: string | Date;
  effectiveTo?: string | Date | null;
  notes?: string | null;
  isActive: number;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface AiPreviewItem {
  id: number;
  itemName: string;
  itemCode?: string | null;
  currentPrice: number;
  newUnitPrice: number | null;
  newDiscountRate?: number | null;
  priceDiff: number;
  priceDiffPct: number;
  reason?: string;
  skip?: boolean;
}

export interface AiPreviewResult {
  summary?: string;
  affectedCount: number;
  skippedCount: number;
  preview: AiPreviewItem[];
}

const TARGET_TYPE_COLORS: Record<string, { label: string; color: string }> = {
  material: { label: "원재료", color: "bg-blue-100 text-blue-700" },
  product: { label: "제품", color: "bg-purple-100 text-purple-700" },
};

// ═══════════════════════════════════════════════════
// 1. 단건 수정 Dialog
// ═══════════════════════════════════════════════════

export interface PriceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRow: { partnerName?: string | null; itemName?: string | null } | null;
  editForm: PriceEditForm;
  setEditForm: (form: PriceEditForm) => void;
  onSave: () => void;
  updatePending: boolean;
}

export function PriceEditDialog({
  open,
  onOpenChange,
  editingRow,
  editForm,
  setEditForm,
  onSave,
  updatePending,
}: PriceEditDialogProps) {
  const L = useIndustryLabel();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>단가 수정</DialogTitle>
          <DialogDescription>
            {editingRow?.partnerName} · {editingRow?.itemName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">단가 *</Label>
              <Input
                type="number"
                value={editForm.unitPrice || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, unitPrice: parseFloat(e.target.value) || 0 })
                }
                className="h-9 text-right"
              />
            </div>
            <div>
              <Label className="text-xs">할인율 (%)</Label>
              <Input
                type="number"
                value={editForm.discountRate || ""}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    discountRate: parseFloat(e.target.value) || 0,
                  })
                }
                min={0}
                max={100}
                step={0.01}
                className="h-9 text-right"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">유효 시작일 *</Label>
              <Input
                type="date"
                value={editForm.effectiveFrom}
                onChange={(e) =>
                  setEditForm({ ...editForm, effectiveFrom: e.target.value })
                }
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">유효 종료일</Label>
              <Input
                type="date"
                value={editForm.effectiveTo}
                onChange={(e) =>
                  setEditForm({ ...editForm, effectiveTo: e.target.value })
                }
                className="h-9"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">메모</Label>
            <Textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={onSave}
            disabled={updatePending}
            className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
          >
            수정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════
// 2. AI 가격 조정 미리보기 Dialog
// ═══════════════════════════════════════════════════

export interface AiPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiPreview: AiPreviewResult | null;
  onApply: () => void;
}

export function AiPreviewDialog({
  open,
  onOpenChange,
  aiPreview,
  onApply,
}: AiPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            AI 가격 조정 미리보기
          </DialogTitle>
          <DialogDescription>
            {aiPreview?.summary || "AI 가 분석한 결과입니다. 적용 전에 확인하세요."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 text-xs">
          <Badge className="bg-emerald-600 text-white">
            ✓ 조정 {aiPreview?.affectedCount || 0}건
          </Badge>
          <Badge variant="outline">⊘ 제외 {aiPreview?.skippedCount || 0}건</Badge>
        </div>

        <div className="flex-1 overflow-auto border rounded">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>품목</TableHead>
                <TableHead className="text-right">현재</TableHead>
                <TableHead className="text-right">변경</TableHead>
                <TableHead className="text-right">증감</TableHead>
                <TableHead>판단</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aiPreview?.preview?.map((p) => (
                <TableRow key={p.id} className={p.skip ? "opacity-50" : ""}>
                  <TableCell className="text-sm">
                    <div>{p.itemName}</div>
                    {p.itemCode && (
                      <div className="text-[10px] text-muted-foreground">
                        {p.itemCode}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {Number(p.currentPrice).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold">
                    {p.skip
                      ? "-"
                      : p.newUnitPrice !== null
                        ? Number(p.newUnitPrice).toLocaleString()
                        : "-"}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {p.skip ? (
                      <span className="text-muted-foreground">제외</span>
                    ) : p.priceDiff !== 0 ? (
                      <span
                        className={p.priceDiff > 0 ? "text-rose-600" : "text-emerald-600"}
                      >
                        {p.priceDiff > 0 ? "+" : ""}
                        {p.priceDiffPct}%
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground max-w-xs">
                    {p.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={onApply}
            className="bg-violet-600 hover:bg-violet-700"
            disabled={!aiPreview || aiPreview.affectedCount === 0}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            {aiPreview?.affectedCount || 0}건 적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════
// 3. 상세보기 Dialog (읽기 전용) — PDF 출력 + 수정 이동
// ═══════════════════════════════════════════════════

export interface PriceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detailRow: PriceDetailRow | null;
  onDownloadPdf: (row: PriceDetailRow) => void;
  pdfPending: boolean;
  onEdit: (row: PriceDetailRow) => void;
}

export function PriceDetailDialog({
  open,
  onOpenChange,
  detailRow,
  onDownloadPdf,
  pdfPending,
  onEdit,
}: PriceDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-indigo-600" />
            단가 상세보기
          </DialogTitle>
          <DialogDescription>거래처별 단가 등록 정보 (읽기 전용)</DialogDescription>
        </DialogHeader>
        {detailRow && (
          <div className="space-y-4 py-2">
            {/* 상태 배지 */}
            <div className="flex items-center gap-2">
              {detailRow.isActive === 1 ? (
                <Badge className="bg-green-600 text-white">활성</Badge>
              ) : (
                <Badge variant="outline">비활성</Badge>
              )}
              <Badge
                variant="outline"
                className={TARGET_TYPE_COLORS[detailRow.targetType]?.color || ""}
              >
                {TARGET_TYPE_COLORS[detailRow.targetType]?.label || detailRow.targetType}
              </Badge>
            </div>

            {/* 상세 필드 그리드 */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">거래처</div>
                <div className="font-semibold text-base">
                  {detailRow.partnerName || `#${detailRow.partnerId}`}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">품목명</div>
                <div className="font-medium">{detailRow.itemName}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">품목 코드</div>
                <div className="font-mono text-xs">{detailRow.itemCode || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">단가</div>
                <div className="font-mono text-lg font-bold text-indigo-600">
                  {Number(detailRow.unitPrice).toLocaleString()}
                  <span className="text-xs text-muted-foreground ml-1">
                    {detailRow.currency || "KRW"}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">할인율</div>
                <div className="font-medium">
                  {Number(detailRow.discountRate || 0) > 0
                    ? `${detailRow.discountRate}%`
                    : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">유효 시작</div>
                <div className="font-mono text-xs">
                  {detailRow.effectiveFrom instanceof Date
                    ? detailRow.effectiveFrom.toISOString().slice(0, 10)
                    : detailRow.effectiveFrom}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">유효 종료</div>
                <div className="font-mono text-xs">
                  {detailRow.effectiveTo
                    ? detailRow.effectiveTo instanceof Date
                      ? detailRow.effectiveTo.toISOString().slice(0, 10)
                      : detailRow.effectiveTo
                    : "무제한"}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">메모</div>
                <div className="text-sm whitespace-pre-wrap p-2 bg-slate-50 dark:bg-slate-900/30 rounded min-h-[40px]">
                  {detailRow.notes || (
                    <span className="text-muted-foreground italic">(메모 없음)</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">등록일</div>
                <div className="text-xs text-muted-foreground">
                  {detailRow.createdAt
                    ? new Date(detailRow.createdAt).toLocaleString("ko-KR")
                    : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">최종 수정</div>
                <div className="text-xs text-muted-foreground">
                  {detailRow.updatedAt
                    ? new Date(detailRow.updatedAt).toLocaleString("ko-KR")
                    : "-"}
                </div>
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => detailRow && onDownloadPdf(detailRow)}
            disabled={pdfPending || !detailRow}
            className="text-indigo-600"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            거래처 단가표 PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (detailRow) {
                onOpenChange(false);
                onEdit(detailRow);
              }
            }}
          >
            <Edit className="h-4 w-4 mr-1" />
            수정
          </Button>
          <Button onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
