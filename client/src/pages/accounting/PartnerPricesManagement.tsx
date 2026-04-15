/**
 * 거래처별 단가표 관리 페이지 — Phase B (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * - 다중 품목 일괄 등록 (한 거래처에 수십 품목 한 번에)
 * - 엑셀 템플릿 다운로드 + 업로드
 * - 단건 수정 (row 에서 Edit)
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DollarSign,
  Plus,
  Trash2,
  Edit,
  Package,
  FileSpreadsheet,
  Download,
  Upload,
  Sparkles,
  Loader2,
  Eye,
  Printer,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { MaterialCombobox } from "@/components/inventory/MaterialCombobox";
import { ProductCombobox } from "@/components/inventory/ProductCombobox";
import { PartnerSearchInput } from "@/components/inventory/PartnerSearchInput";
import * as XLSX from "xlsx";

const TARGET_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  material: { label: "원재료", color: "bg-blue-100 text-blue-700" },
  product: { label: "제품", color: "bg-purple-100 text-purple-700" },
};

// 일괄 등록용 라인 타입
interface BatchLine {
  id: string;
  targetType: "material" | "product";
  materialId: number | null;
  productId: number | null;
  itemName: string;
  itemCode: string;
  unitPrice: number;
  discountRate: number;
  notes: string;
  // 매칭 메타 (엑셀 업로드 후 표시용)
  confidence?: "high" | "medium" | "low" | "none";
  matchedBy?: string; // code_exact / name_exact / name_similar ...
  originalQuery?: string; // 엑셀에서 입력된 원본 문자열
}

function emptyBatchLine(): BatchLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    targetType: "product", // 기본값: 제품 (일반적으로 고객사 대상 단가 등록이 많음)
    materialId: null,
    productId: null,
    itemName: "",
    itemCode: "",
    unitPrice: 0,
    discountRate: 0,
    notes: "",
  };
}

export default function PartnerPricesManagement() {
  return (
    <DashboardLayout>
      <PartnerPricesContent />
    </DashboardLayout>
  );
}

function PartnerPricesContent() {
  // 필터
  const [partnerFilterId, setPartnerFilterId] = useState<number | null>(null);
  const [partnerFilterName, setPartnerFilterName] = useState<string>("");
  const [targetFilter, setTargetFilter] = useState<string>("all");
  const [activeOnly, setActiveOnly] = useState<boolean>(true);

  // 일괄 등록 Dialog
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchPartnerId, setBatchPartnerId] = useState<number | null>(null);
  const [batchPartnerName, setBatchPartnerName] = useState<string>("");
  const [batchEffectiveFrom, setBatchEffectiveFrom] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [batchEffectiveTo, setBatchEffectiveTo] = useState<string>("");
  const [batchLines, setBatchLines] = useState<BatchLine[]>([emptyBatchLine()]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 단건 수정 Dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    unitPrice: 0,
    discountRate: 0,
    effectiveFrom: "",
    effectiveTo: "",
    notes: "",
  });

  // 일괄 수정 Dialog (전체 불러오기 + AI 일괄 가격 조정)
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditPartnerId, setBulkEditPartnerId] = useState<number | null>(null);
  const [bulkEditPartnerName, setBulkEditPartnerName] = useState<string>("");
  // 로드된 원본 + 사용자가 수정한 draft
  interface BulkEditRow {
    id: number;
    targetType: "material" | "product";
    materialId: number | null;
    productId: number | null;
    itemName: string;
    itemCode: string | null;
    originalUnitPrice: number;
    originalDiscountRate: number;
    unitPrice: number;
    discountRate: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    notes: string;
    isActive: number;
    dirty: boolean; // 사용자가 수정한 상태
    aiApplied?: boolean; // AI 로 적용한 상태
    aiReason?: string;
  }
  const [bulkEditRows, setBulkEditRows] = useState<BulkEditRow[]>([]);
  const [bulkEditSearch, setBulkEditSearch] = useState<string>("");
  const [aiCommand, setAiCommand] = useState<string>("");
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiPreview, setAiPreview] = useState<any>(null);
  const [aiSmartLoading, setAiSmartLoading] = useState(false);

  const utils = trpc.useUtils();

  // 데이터 조회
  const { data: prices = [], isLoading } = trpc.partnerPrice.list.useQuery({
    partnerId: partnerFilterId ?? undefined,
    targetType: targetFilter !== "all" ? (targetFilter as any) : undefined,
    activeOnly,
  });

  // Phase B: 엑셀 업로드 매칭은 서버 matchItems 엔드포인트로 위임
  //   (client 에서 전체 master 를 들고 오지 않음 — 대용량 대응)

  // Mutations
  const createBatchMutation = trpc.partnerPrice.createBatch.useMutation({
    onSuccess: (res: any) => {
      toast({
        title: "일괄 등록 완료",
        description: res.message,
      });
      utils.partnerPrice.list.invalidate();
      if (res.errorCount === 0) {
        closeBatchDialog();
      }
    },
    onError: (e: any) =>
      toast({ title: "등록 실패", description: e.message, variant: "destructive" }),
  });

  const updateMutation = trpc.partnerPrice.update.useMutation({
    onSuccess: () => {
      toast({ title: "단가 수정 완료" });
      utils.partnerPrice.list.invalidate();
      setEditDialogOpen(false);
    },
    onError: (e: any) =>
      toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.partnerPrice.delete.useMutation({
    onSuccess: () => {
      toast({ title: "단가 삭제 완료" });
      utils.partnerPrice.list.invalidate();
    },
    onError: (e: any) =>
      toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  // ─── 상세보기 / PDF 출력 (Phase B Part 2 UI) ────────────
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<any>(null);

  const openDetailDialog = (row: any) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

  // PDF base64 → Blob 헬퍼
  const base64ToPdfBlob = (b64: string): Blob => {
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  };

  // 미리보기 (새 탭)
  const previewPdfMutation = trpc.partnerPrice.generatePdf.useMutation({
    onSuccess: (res: any) => {
      const blob = base64ToPdfBlob(res.pdf);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast({ title: "미리보기", description: "새 탭에서 열렸습니다." });
    },
    onError: (e: any) =>
      toast({ title: "미리보기 실패", description: e.message, variant: "destructive" }),
  });

  // 인쇄 (iframe 자동 프린트)
  const printPdfMutation = trpc.partnerPrice.generatePdf.useMutation({
    onSuccess: (res: any) => {
      const blob = base64ToPdfBlob(res.pdf);
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      iframe.src = url;
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (_) {
          window.open(url, "_blank");
        }
      };
      document.body.appendChild(iframe);
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        } catch (_) { /* ignore */ }
      }, 120_000);
      toast({ title: "인쇄", description: "프린트 대화상자를 엽니다." });
    },
    onError: (e: any) =>
      toast({ title: "인쇄 실패", description: e.message, variant: "destructive" }),
  });

  // 통계
  const stats = useMemo(() => {
    const total = prices.length;
    const materials = prices.filter((p: any) => p.targetType === "material").length;
    const products = prices.filter((p: any) => p.targetType === "product").length;
    const uniquePartners = new Set(prices.map((p: any) => p.partnerId)).size;
    return { total, materials, products, uniquePartners };
  }, [prices]);

  // ─── 일괄 등록 ─────────────────────────────────────
  const openBatchDialog = () => {
    setBatchPartnerId(partnerFilterId);
    setBatchPartnerName(partnerFilterName);
    setBatchEffectiveFrom(new Date().toISOString().slice(0, 10));
    setBatchEffectiveTo("");
    setBatchLines([emptyBatchLine()]);
    setBatchDialogOpen(true);
  };

  const closeBatchDialog = () => {
    setBatchDialogOpen(false);
    setBatchPartnerId(null);
    setBatchPartnerName("");
    setBatchLines([emptyBatchLine()]);
  };

  const addBatchLine = () => setBatchLines((prev) => [...prev, emptyBatchLine()]);
  const addMultipleBatchLines = (n: number) =>
    setBatchLines((prev) => [
      ...prev,
      ...Array.from({ length: n }, () => emptyBatchLine()),
    ]);

  const removeBatchLine = (id: string) => {
    if (batchLines.length === 1) {
      toast({ title: "최소 1개 라인이 필요합니다", variant: "destructive" });
      return;
    }
    setBatchLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateBatchLine = (id: string, patch: Partial<BatchLine>) => {
    setBatchLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  };

  // 일괄 타입 변경: 모든 라인의 targetType 을 한 번에 변경 + 선택된 품목 초기화
  const setAllBatchType = (targetType: "material" | "product") => {
    setBatchLines((prev) =>
      prev.map((l) => ({
        ...l,
        targetType,
        materialId: null,
        productId: null,
        itemName: "",
        itemCode: "",
      })),
    );
    toast({
      title: `전체 라인을 ${targetType === "product" ? "제품" : "원재료"} 로 변경`,
      description: "선택된 품목은 초기화되었습니다. 다시 선택하세요.",
    });
  };

  const handleBatchSave = () => {
    if (!batchPartnerId) {
      toast({ title: "거래처를 선택하세요", variant: "destructive" });
      return;
    }
    if (!batchEffectiveFrom) {
      toast({ title: "유효 시작일을 입력하세요", variant: "destructive" });
      return;
    }

    const validLines = batchLines.filter(
      (l) => l.itemName && l.unitPrice > 0 && (l.materialId || l.productId),
    );
    if (validLines.length === 0) {
      toast({
        title: "유효한 품목이 없습니다",
        description: "품목/단가를 최소 1개 입력하세요",
        variant: "destructive",
      });
      return;
    }

    createBatchMutation.mutate({
      partnerId: batchPartnerId,
      effectiveFrom: batchEffectiveFrom,
      effectiveTo: batchEffectiveTo || undefined,
      items: validLines.map((l) => ({
        targetType: l.targetType,
        materialId: l.materialId || undefined,
        productId: l.productId || undefined,
        itemName: l.itemName,
        itemCode: l.itemCode || undefined,
        unitPrice: l.unitPrice,
        discountRate: l.discountRate || undefined,
        notes: l.notes || undefined,
      })),
    });
  };

  // ─── 엑셀 템플릿 다운로드 ─────────────────────────
  const downloadExcelTemplate = () => {
    const template = [
      {
        "대상타입": "product",
        "품목코드": "PROD-001",
        "품목명": "식빵 1kg",
        "단가": 3500,
        "할인율(%)": 5,
        "메모": "예시 행 - 실제 작성 시 삭제",
      },
      {
        "대상타입": "material",
        "품목코드": "MAT-001",
        "품목명": "밀가루",
        "단가": 1500,
        "할인율(%)": 0,
        "메모": "",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    // 열 너비
    ws["!cols"] = [
      { wch: 10 }, // 대상타입
      { wch: 15 }, // 품목코드
      { wch: 30 }, // 품목명
      { wch: 12 }, // 단가
      { wch: 10 }, // 할인율
      { wch: 25 }, // 메모
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "거래처단가");
    XLSX.writeFile(wb, "거래처_단가_템플릿.xlsx");
    toast({
      title: "엑셀 템플릿 다운로드",
      description:
        "대상타입은 material(원재료) 또는 product(제품). 품목코드로 매칭됩니다.",
    });
  };

  // ─── 엑셀 업로드 (지능형 매칭 적용) ────────────────
  // Phase B (2026-04-14): partnerPrice.matchItems 서버 매칭 사용
  //   - 완전일치 / 포함관계 / Levenshtein 편집거리 / 토큰중복
  //   - 오타/공백/어순/하이픈 변형 자동 허용
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (rows.length === 0) {
        toast({ title: "데이터가 없습니다", variant: "destructive" });
        return;
      }

      // 1) 엑셀 행 → 매칭 요청 아이템 변환
      type ParsedRow = {
        targetType: "material" | "product";
        itemCode: string;
        itemName: string;
        unitPrice: number;
        discountRate: number;
        notes: string;
      };
      const parsedRows: ParsedRow[] = [];

      for (const row of rows) {
        const targetTypeRaw = String(row["대상타입"] || "").trim().toLowerCase();
        const targetType: "material" | "product" =
          targetTypeRaw === "material" || targetTypeRaw === "원재료"
            ? "material"
            : "product";

        const itemCode = String(row["품목코드"] || "").trim();
        const itemName = String(row["품목명"] || "").trim();
        const unitPrice = Number(row["단가"]) || 0;
        const discountRate = Number(row["할인율(%)"] || row["할인율"] || 0) || 0;
        const notes = String(row["메모"] || "").trim();

        if (!itemCode && !itemName) continue;
        if (unitPrice <= 0) continue;

        parsedRows.push({ targetType, itemCode, itemName, unitPrice, discountRate, notes });
      }

      if (parsedRows.length === 0) {
        toast({
          title: "유효한 행이 없습니다",
          description: "대상타입/품목명/단가 컬럼을 확인하세요",
          variant: "destructive",
        });
        return;
      }

      // 2) 서버 매칭 호출
      const matchResults = await utils.partnerPrice.matchItems.fetch({
        items: parsedRows.map((r) => ({
          targetType: r.targetType,
          query: r.itemName,
          itemCode: r.itemCode || undefined,
        })),
      });

      // 3) 결과 → BatchLine 구성
      const newLines: BatchLine[] = parsedRows.map((r, idx) => {
        const mr = matchResults[idx];
        const best = mr?.bestMatch;
        // high / medium 은 자동 채움, low / none 은 품목 선택을 비워두어 사용자가 수동 선택
        const autoApply = best && (mr.confidence === "high" || mr.confidence === "medium");
        return {
          id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 4)}`,
          targetType: r.targetType,
          materialId: autoApply && r.targetType === "material" ? best.id : null,
          productId: autoApply && r.targetType === "product" ? best.id : null,
          itemName: autoApply ? best.name : r.itemName,
          itemCode: autoApply && best.code ? best.code : r.itemCode,
          unitPrice: r.unitPrice,
          discountRate: r.discountRate,
          notes: r.notes,
          confidence: mr?.confidence ?? "none",
          matchedBy: best?.matchedBy,
          originalQuery: r.itemName,
        };
      });

      // 4) confidence 별 집계
      const counts = { high: 0, medium: 0, low: 0, none: 0 };
      for (const line of newLines) {
        counts[line.confidence || "none"]++;
      }

      setBatchLines(newLines);

      toast({
        title: `${newLines.length}건 로드 완료`,
        description:
          `✓ 자동매칭 ${counts.high}건 · ` +
          `⚠ 유사매칭 ${counts.medium}건 · ` +
          `? 후보있음 ${counts.low}건 · ` +
          `✗ 매칭실패 ${counts.none}건` +
          (counts.low + counts.none > 0
            ? "  (낮은 신뢰도 / 실패 건은 품목을 직접 선택하세요)"
            : ""),
      });
    } catch (err: any) {
      toast({
        title: "엑셀 파싱 실패",
        description: err.message || "파일 형식을 확인하세요",
        variant: "destructive",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── AI 매칭 (저신뢰도 건 재처리) ───────────────
  // 규칙기반으로 매칭 실패 / 낮은 신뢰도 건만 골라서 LLM 에 재요청
  const [aiMatching, setAiMatching] = useState(false);
  const runAiMatching = async () => {
    const targetLines = batchLines.filter(
      (l) => l.confidence === "none" || l.confidence === "low",
    );
    if (targetLines.length === 0) {
      toast({
        title: "AI 매칭할 건이 없습니다",
        description: "매칭 실패 / 낮은 신뢰도 건이 없습니다",
      });
      return;
    }

    setAiMatching(true);
    try {
      const aiResults = await utils.partnerPrice.matchItemsAI.fetch({
        items: targetLines.map((l) => ({
          targetType: l.targetType,
          query: l.originalQuery || l.itemName,
          itemCode: l.itemCode || undefined,
        })),
      });

      // 결과로 batchLines 업데이트
      setBatchLines((prev) => {
        const next = [...prev];
        targetLines.forEach((line, idx) => {
          const result = aiResults[idx];
          if (!result || !result.bestMatch) return;
          const lineIdx = next.findIndex((l) => l.id === line.id);
          if (lineIdx === -1) return;
          // AI 결과로 채움
          next[lineIdx] = {
            ...next[lineIdx],
            materialId: result.targetType === "material" ? result.bestMatch.id : null,
            productId: result.targetType === "product" ? result.bestMatch.id : null,
            itemName: result.bestMatch.name,
            itemCode: result.bestMatch.code || next[lineIdx].itemCode,
            confidence: result.confidence,
            matchedBy: "ai_llm",
          };
        });
        return next;
      });

      const successCount = aiResults.filter((r: any) => r.bestMatch).length;
      const failCount = aiResults.length - successCount;
      toast({
        title: `✨ AI 매칭 완료`,
        description: `${successCount}건 추가 매칭 / ${failCount}건 여전히 매칭 실패`,
      });
    } catch (err: any) {
      toast({
        title: "AI 매칭 실패",
        description: err.message || "OPENAI_API_KEY 설정을 확인하세요",
        variant: "destructive",
      });
    } finally {
      setAiMatching(false);
    }
  };

  // ─── 일괄 수정 (전체 불러오기 + AI) ───────────────
  const bulkUpdateMutation = trpc.partnerPrice.bulkUpdate.useMutation({
    onSuccess: (res: any) => {
      toast({
        title: "일괄 수정 완료",
        description: res.message,
      });
      utils.partnerPrice.list.invalidate();
      if (res.errorCount === 0) {
        setBulkEditOpen(false);
      }
    },
    onError: (e: any) =>
      toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  // 거래처 선택 시 해당 거래처의 모든 단가 로드
  const handleBulkEditPartnerSelect = async (partnerId: number, partnerName: string) => {
    setBulkEditPartnerId(partnerId);
    setBulkEditPartnerName(partnerName);
    try {
      const rows = await utils.partnerPrice.listByPartner.fetch({ partnerId });
      const mapped: BulkEditRow[] = (rows as any[]).map((r) => ({
        id: r.id,
        targetType: r.targetType as "material" | "product",
        materialId: r.materialId ?? null,
        productId: r.productId ?? null,
        itemName: r.itemName,
        itemCode: r.itemCode,
        originalUnitPrice: Number(r.unitPrice),
        originalDiscountRate: Number(r.discountRate || 0),
        unitPrice: Number(r.unitPrice),
        discountRate: Number(r.discountRate || 0),
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        notes: r.notes || "",
        isActive: r.isActive,
        dirty: false,
      }));
      setBulkEditRows(mapped);
      toast({
        title: `${mapped.length}건 로드 완료`,
        description: `${partnerName} 의 단가표를 수정할 수 있습니다`,
      });
    } catch (err: any) {
      toast({
        title: "불러오기 실패",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const openBulkEditDialog = () => {
    setBulkEditPartnerId(null);
    setBulkEditPartnerName("");
    setBulkEditRows([]);
    setBulkEditSearch("");
    setAiCommand("");
    setBulkEditOpen(true);
  };

  const updateBulkEditRow = (id: number, patch: Partial<BulkEditRow>) => {
    setBulkEditRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              ...patch,
              dirty:
                (patch.unitPrice !== undefined && patch.unitPrice !== r.originalUnitPrice) ||
                (patch.discountRate !== undefined &&
                  patch.discountRate !== r.originalDiscountRate) ||
                r.dirty,
            }
          : r,
      ),
    );
  };

  const resetBulkEditRow = (id: number) => {
    setBulkEditRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              unitPrice: r.originalUnitPrice,
              discountRate: r.originalDiscountRate,
              dirty: false,
              aiApplied: false,
              aiReason: undefined,
            }
          : r,
      ),
    );
  };

  // AI 자연어 명령 → 가격 조정 미리보기
  const handleAiSmartCommand = async () => {
    if (!aiCommand.trim()) {
      toast({ title: "AI 명령어를 입력하세요", variant: "destructive" });
      return;
    }
    if (bulkEditRows.length === 0) {
      toast({ title: "먼저 거래처를 선택하세요", variant: "destructive" });
      return;
    }

    // 검색 필터 적용된 행만 대상
    const filtered = bulkEditSearch
      ? bulkEditRows.filter(
          (r) =>
            r.itemName.toLowerCase().includes(bulkEditSearch.toLowerCase()) ||
            (r.itemCode || "").toLowerCase().includes(bulkEditSearch.toLowerCase()),
        )
      : bulkEditRows;

    if (filtered.length === 0) {
      toast({ title: "대상 행이 없습니다", variant: "destructive" });
      return;
    }

    if (filtered.length > 100) {
      toast({
        title: "행이 너무 많습니다",
        description: "100건 이하로 검색 필터를 좁혀주세요",
        variant: "destructive",
      });
      return;
    }

    setAiSmartLoading(true);
    try {
      const result = await utils.partnerPrice.aiSmartUpdate.fetch({
        command: aiCommand.trim(),
        rows: filtered.map((r) => ({
          id: r.id,
          targetType: r.targetType,
          itemName: r.itemName,
          itemCode: r.itemCode,
          unitPrice: r.unitPrice,
          discountRate: r.discountRate,
        })),
      });
      setAiPreview(result);
      setAiPreviewOpen(true);
    } catch (err: any) {
      toast({
        title: "AI 가격 조정 실패",
        description: err.message || "OPENAI_API_KEY 설정을 확인하세요",
        variant: "destructive",
      });
    } finally {
      setAiSmartLoading(false);
    }
  };

  // AI 미리보기 결과를 실제 row 에 적용
  const applyAiPreview = () => {
    if (!aiPreview) return;
    const applied: number[] = [];
    setBulkEditRows((prev) =>
      prev.map((r) => {
        const p = aiPreview.preview.find((x: any) => x.id === r.id);
        if (!p || p.skip || p.newUnitPrice === null) return r;
        applied.push(r.id);
        return {
          ...r,
          unitPrice: p.newUnitPrice,
          discountRate: p.newDiscountRate !== null ? p.newDiscountRate : r.discountRate,
          dirty: true,
          aiApplied: true,
          aiReason: p.reason,
        };
      }),
    );
    toast({
      title: `✨ AI 조정 적용`,
      description: `${applied.length}건 적용. "일괄 저장" 버튼으로 DB 반영하세요.`,
    });
    setAiPreviewOpen(false);
    setAiPreview(null);
  };

  // 수정된 행 일괄 저장
  const handleBulkEditSave = () => {
    const dirtyRows = bulkEditRows.filter((r) => r.dirty);
    if (dirtyRows.length === 0) {
      toast({ title: "수정된 행이 없습니다" });
      return;
    }
    bulkUpdateMutation.mutate({
      updates: dirtyRows.map((r) => ({
        id: r.id,
        unitPrice: r.unitPrice,
        discountRate: r.discountRate,
      })),
    });
  };

  // ─── 단건 수정 ─────────────────────────────────────
  const openEditDialog = (row: any) => {
    setEditingRow(row);
    setEditForm({
      unitPrice: Number(row.unitPrice),
      discountRate: Number(row.discountRate || 0),
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo || "",
      notes: row.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = () => {
    if (!editingRow) return;
    if (editForm.unitPrice <= 0) {
      toast({ title: "단가는 양수여야 합니다", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingRow.id,
      unitPrice: editForm.unitPrice,
      discountRate: editForm.discountRate,
      effectiveFrom: editForm.effectiveFrom,
      effectiveTo: editForm.effectiveTo || null,
      notes: editForm.notes || undefined,
    });
  };

  const handleDelete = (row: any) => {
    if (confirm(`${row.partnerName || row.partnerId} · ${row.itemName} 단가를 삭제하시겠습니까?`)) {
      deleteMutation.mutate({ id: row.id });
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            거래처별 단가표
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            공급업체/고객별 원재료·제품 단가를 일괄 등록. 발주/매입/매출 등록 시 자동 적용됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadExcelTemplate}>
            <Download className="h-4 w-4 mr-1" /> 엑셀 템플릿
          </Button>
          <Button
            variant="outline"
            onClick={openBulkEditDialog}
            className="text-violet-700 border-violet-300 hover:bg-violet-50"
          >
            <Sparkles className="h-4 w-4 mr-1" /> AI 일괄 수정
          </Button>
          <Button
            onClick={openBatchDialog}
            className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
          >
            <Plus className="h-4 w-4 mr-1" /> 일괄 등록
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">전체 단가</p>
            <p className="text-2xl font-bold">{stats.total}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">원재료</p>
            <p className="text-2xl font-bold text-blue-600">{stats.materials}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">제품</p>
            <p className="text-2xl font-bold text-purple-600">{stats.products}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">등록된 거래처</p>
            <p className="text-2xl font-bold text-green-600">{stats.uniquePartners}개</p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <Card>
        <CardContent className="py-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">거래처</Label>
              <PartnerSearchInput
                selectedId={partnerFilterId}
                selectedName={partnerFilterName}
                onSelect={(id, name) => {
                  setPartnerFilterId(id);
                  setPartnerFilterName(name);
                }}
                onClear={() => {
                  setPartnerFilterId(null);
                  setPartnerFilterName("");
                }}
                placeholder="거래처 검색 (비우면 전체)"
              />
            </div>
            <div>
              <Label className="text-xs">대상</Label>
              <Select value={targetFilter} onValueChange={setTargetFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="material">원재료만</SelectItem>
                  <SelectItem value="product">제품만</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">활성 상태</Label>
              <Select
                value={activeOnly ? "active" : "all"}
                onValueChange={(v) => setActiveOnly(v === "active")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">활성만</SelectItem>
                  <SelectItem value="all">전체 (비활성 포함)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 목록 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">단가 목록</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>거래처</TableHead>
                <TableHead>대상</TableHead>
                <TableHead>품목</TableHead>
                <TableHead className="text-right">단가</TableHead>
                <TableHead className="text-right">할인</TableHead>
                <TableHead>유효 시작</TableHead>
                <TableHead>유효 종료</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-center">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : prices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    등록된 단가가 없습니다. 우측 상단 "일괄 등록" 또는 "엑셀 템플릿" 으로 시작하세요.
                  </TableCell>
                </TableRow>
              ) : (
                prices.map((row: any) => {
                  const tt = TARGET_TYPE_LABELS[row.targetType] || { label: row.targetType, color: "" };
                  return (
                    <TableRow key={row.id} className="group">
                      <TableCell className="text-sm">{row.partnerName || `#${row.partnerId}`}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={tt.color}>
                          {tt.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{row.itemName}</div>
                        {row.itemCode && (
                          <div className="text-[10px] text-muted-foreground">{row.itemCode}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {Number(row.unitPrice).toLocaleString()}
                        <span className="text-[10px] text-muted-foreground ml-1">{row.currency}</span>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {Number(row.discountRate) > 0 ? `${row.discountRate}%` : "-"}
                      </TableCell>
                      <TableCell className="text-xs">{row.effectiveFrom}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.effectiveTo || "무제한"}
                      </TableCell>
                      <TableCell>
                        {row.isActive === 1 ? (
                          <Badge className="bg-green-600 text-white border-transparent">활성</Badge>
                        ) : (
                          <Badge variant="outline">비활성</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDetailDialog(row)}
                            title="상세보기"
                            className="h-7 w-7 p-0"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              previewPdfMutation.mutate({
                                partnerId: row.partnerId,
                                activeOnly: false,
                              })
                            }
                            disabled={previewPdfMutation.isPending}
                            title="거래처 단가표 PDF 미리보기"
                            className="h-7 w-7 p-0 text-indigo-600"
                          >
                            {previewPdfMutation.isPending &&
                            previewPdfMutation.variables?.partnerId === row.partnerId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              printPdfMutation.mutate({
                                partnerId: row.partnerId,
                                activeOnly: false,
                              })
                            }
                            disabled={printPdfMutation.isPending}
                            title="거래처 단가표 인쇄"
                            className="h-7 w-7 p-0"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(row)}
                            title="수정"
                            className="h-7 w-7 p-0"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(row)}
                            title="삭제"
                            className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ═══ 일괄 등록 Dialog ═══ */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>거래처 단가 일괄 등록</DialogTitle>
            <DialogDescription>
              한 거래처에 여러 품목의 단가를 한 번에 등록합니다. 엑셀 업로드로 수십 건을 빠르게 처리하세요.
            </DialogDescription>
          </DialogHeader>

          {/* 공통 설정 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">거래처 *</Label>
              <PartnerSearchInput
                selectedId={batchPartnerId}
                selectedName={batchPartnerName}
                onSelect={(id, name) => {
                  setBatchPartnerId(id);
                  setBatchPartnerName(name);
                }}
                onClear={() => {
                  setBatchPartnerId(null);
                  setBatchPartnerName("");
                }}
                placeholder="거래처 검색"
              />
            </div>
            <div>
              <Label className="text-xs">유효 시작일 *</Label>
              <Input
                type="date"
                value={batchEffectiveFrom}
                onChange={(e) => setBatchEffectiveFrom(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">유효 종료일</Label>
              <Input
                type="date"
                value={batchEffectiveTo}
                onChange={(e) => setBatchEffectiveTo(e.target.value)}
                className="h-9"
                placeholder="비워두면 무제한"
              />
            </div>
          </div>

          {/* 엑셀 업로드 + 라인 추가 */}
          <div className="flex flex-wrap items-center gap-2 py-2 border-y bg-muted/20 px-3 rounded">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              className="hidden"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="text-emerald-700 border-emerald-300"
            >
              <Upload className="h-3.5 w-3.5 mr-1" /> 엑셀 업로드
            </Button>
            <Button size="sm" variant="outline" onClick={downloadExcelTemplate}>
              <Download className="h-3.5 w-3.5 mr-1" /> 템플릿 받기
            </Button>
            <div className="h-4 w-px bg-border mx-1" />
            <Button size="sm" variant="outline" onClick={addBatchLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> 라인 +1
            </Button>
            <Button size="sm" variant="outline" onClick={() => addMultipleBatchLines(5)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> +5
            </Button>
            <Button size="sm" variant="outline" onClick={() => addMultipleBatchLines(10)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> +10
            </Button>
            <div className="h-4 w-px bg-border mx-1" />
            {/* ✨ AI 재매칭 — 저신뢰도 건만 대상 */}
            <Button
              size="sm"
              variant="outline"
              onClick={runAiMatching}
              disabled={aiMatching}
              className="text-violet-700 border-violet-300 hover:bg-violet-50"
              title="규칙기반 매칭 실패/저신뢰도 건을 AI 로 재매칭"
            >
              {aiMatching ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1" />
              )}
              AI 매칭
              {(() => {
                const count = batchLines.filter(
                  (l) => l.confidence === "none" || l.confidence === "low",
                ).length;
                return count > 0 ? ` (${count})` : "";
              })()}
            </Button>
            <div className="h-4 w-px bg-border mx-1" />
            {/* 일괄 타입 변경 */}
            <span className="text-xs text-muted-foreground">전체 타입:</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAllBatchType("product")}
              className="text-purple-700 border-purple-300 hover:bg-purple-50"
            >
              <Package className="h-3.5 w-3.5 mr-1" /> 전체 제품
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAllBatchType("material")}
              className="text-blue-700 border-blue-300 hover:bg-blue-50"
            >
              <Package className="h-3.5 w-3.5 mr-1" /> 전체 원재료
            </Button>
            <div className="flex-1 text-right text-xs text-muted-foreground">
              총 <span className="font-bold text-foreground">{batchLines.length}</span>건
            </div>
          </div>

          {/* 라인 테이블 */}
          <div className="max-h-[50vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-24">타입</TableHead>
                  <TableHead>품목</TableHead>
                  <TableHead className="w-28 text-right">단가 *</TableHead>
                  <TableHead className="w-20 text-right">할인%</TableHead>
                  <TableHead className="w-40">메모</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchLines.map((line, idx) => (
                  <TableRow key={line.id}>
                    <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <Select
                        value={line.targetType}
                        onValueChange={(v) =>
                          updateBatchLine(line.id, {
                            targetType: v as any,
                            materialId: null,
                            productId: null,
                            itemName: "",
                            itemCode: "",
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="material">원재료</SelectItem>
                          <SelectItem value="product">제품</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {line.materialId || line.productId ? (
                        <div
                          className={`h-8 px-2 flex items-center gap-2 border rounded text-xs ${
                            line.confidence === "high"
                              ? "bg-emerald-50 border-emerald-300"
                              : line.confidence === "medium"
                                ? "bg-amber-50 border-amber-300"
                                : "bg-emerald-50 border-emerald-200"
                          }`}
                        >
                          <Package className="h-3 w-3 shrink-0 text-emerald-600" />
                          <span className="truncate flex-1">{line.itemName}</span>
                          {/* 매칭 신뢰도 배지 */}
                          {line.confidence === "high" && (
                            <span
                              className="text-[9px] px-1 py-px rounded bg-emerald-600 text-white shrink-0"
                              title={`자동 매칭: ${line.matchedBy}`}
                            >
                              ✓ 자동
                            </span>
                          )}
                          {line.confidence === "medium" && (
                            <span
                              className="text-[9px] px-1 py-px rounded bg-amber-500 text-white shrink-0"
                              title={`유사 매칭: ${line.matchedBy} — 확인 필요`}
                            >
                              ⚠ 유사
                            </span>
                          )}
                          {line.itemCode && (
                            <span className="text-[9px] text-muted-foreground shrink-0">
                              {line.itemCode}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              updateBatchLine(line.id, {
                                materialId: null,
                                productId: null,
                                itemName: line.originalQuery || "",
                                itemCode: "",
                                confidence: undefined,
                                matchedBy: undefined,
                              })
                            }
                            className="text-muted-foreground hover:text-red-500 text-xs"
                            title="매칭 해제 / 직접 선택"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {/* 매칭 실패 / 낮은 신뢰도 — 원본 쿼리 표시 + 수동 combobox */}
                          {line.confidence === "none" && line.originalQuery && (
                            <div className="text-[10px] text-rose-600">
                              ✗ 매칭 실패 — "{line.originalQuery}"
                            </div>
                          )}
                          {line.confidence === "low" && line.originalQuery && (
                            <div className="text-[10px] text-orange-600">
                              ? 신뢰도 낮음 — "{line.originalQuery}"
                            </div>
                          )}
                          {line.targetType === "material" ? (
                            <MaterialCombobox
                              selectedId={line.materialId}
                              selectedName={line.itemName}
                              onSelect={(m) =>
                                updateBatchLine(line.id, {
                                  materialId: m.id,
                                  productId: null,
                                  itemName: m.materialName,
                                  itemCode: m.materialCode || "",
                                  confidence: undefined,
                                  matchedBy: undefined,
                                })
                              }
                              onClear={() =>
                                updateBatchLine(line.id, {
                                  materialId: null,
                                  itemName: "",
                                  itemCode: "",
                                })
                              }
                            />
                          ) : (
                            <ProductCombobox
                              selectedId={line.productId}
                              selectedName={line.itemName}
                              onSelect={(p) =>
                                updateBatchLine(line.id, {
                                  productId: p.id,
                                  materialId: null,
                                  itemName: p.productName,
                                  itemCode: p.productCode || "",
                                  confidence: undefined,
                                  matchedBy: undefined,
                                })
                              }
                              onClear={() =>
                                updateBatchLine(line.id, {
                                  productId: null,
                                  itemName: "",
                                  itemCode: "",
                                })
                              }
                            />
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={line.unitPrice || ""}
                        onChange={(e) =>
                          updateBatchLine(line.id, {
                            unitPrice: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 text-right text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={line.discountRate || ""}
                        onChange={(e) =>
                          updateBatchLine(line.id, {
                            discountRate: parseFloat(e.target.value) || 0,
                          })
                        }
                        min={0}
                        max={100}
                        step={0.01}
                        className="h-8 text-right text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.notes}
                        onChange={(e) =>
                          updateBatchLine(line.id, { notes: e.target.value })
                        }
                        className="h-8 text-xs"
                        placeholder="선택"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeBatchLine(line.id)}
                        className="h-7 w-7 p-0 text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <div className="flex-1 text-xs text-muted-foreground">
              <FileSpreadsheet className="inline h-3 w-3 mr-1" />
              중복(같은 거래처+품목+유효시작일) 은 자동 skip 됩니다.
            </div>
            <Button variant="outline" onClick={closeBatchDialog}>
              취소
            </Button>
            <Button
              onClick={handleBatchSave}
              disabled={createBatchMutation.isPending}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
            >
              {createBatchMutation.isPending
                ? "등록 중..."
                : `일괄 등록 (${batchLines.filter((l) => l.itemName && l.unitPrice > 0).length}건)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ AI 일괄 수정 Dialog ═══ */}
      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-600" />
              거래처 단가 일괄 수정 (AI)
            </DialogTitle>
            <DialogDescription>
              거래처를 선택하면 기존 단가표 전체가 로드됩니다. 값을 직접 수정하거나,
              자연어 명령으로 AI 에게 맡길 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          {/* 거래처 선택 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">거래처 *</Label>
              <PartnerSearchInput
                selectedId={bulkEditPartnerId}
                selectedName={bulkEditPartnerName}
                onSelect={handleBulkEditPartnerSelect}
                onClear={() => {
                  setBulkEditPartnerId(null);
                  setBulkEditPartnerName("");
                  setBulkEditRows([]);
                }}
                placeholder="거래처 선택 → 전체 단가 자동 로드"
              />
            </div>
            <div>
              <Label className="text-xs">행 검색 (필터)</Label>
              <Input
                value={bulkEditSearch}
                onChange={(e) => setBulkEditSearch(e.target.value)}
                placeholder="품목명/코드 검색"
                className="h-9"
              />
            </div>
          </div>

          {/* AI 자연어 명령 */}
          {bulkEditRows.length > 0 && (
            <div className="border-2 border-violet-200 bg-violet-50/30 rounded-lg p-3 space-y-2">
              <Label className="text-xs text-violet-900 font-semibold flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                AI 가격 조정 명령 (자연어)
              </Label>
              <div className="flex gap-2">
                <Input
                  value={aiCommand}
                  onChange={(e) => setAiCommand(e.target.value)}
                  placeholder='예: "모든 원재료 5% 인상", "밀가루 관련만 10% 인하", "설탕은 동결"'
                  className="h-9 bg-white"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAiSmartCommand();
                  }}
                />
                <Button
                  onClick={handleAiSmartCommand}
                  disabled={aiSmartLoading || !aiCommand.trim()}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  {aiSmartLoading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1" />
                  )}
                  AI 분석
                </Button>
              </div>
              <p className="text-[10px] text-violet-700">
                ⓘ AI 가 판단 후 미리보기를 표시합니다. 확인 후 "적용" 을 눌러야 실제 반영됩니다.
                저장은 별도 버튼을 눌러야 DB 에 기록됩니다.
              </p>
            </div>
          )}

          {/* 단가 행 테이블 */}
          <div className="flex-1 overflow-auto border rounded">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-20">타입</TableHead>
                  <TableHead>품목</TableHead>
                  <TableHead className="w-32 text-right">현재 단가</TableHead>
                  <TableHead className="w-32 text-right">수정 단가</TableHead>
                  <TableHead className="w-24 text-right">할인%</TableHead>
                  <TableHead className="w-24 text-right">증감</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bulkEditRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      {bulkEditPartnerId
                        ? "이 거래처에 등록된 단가가 없습니다"
                        : "거래처를 선택하면 전체 단가가 로드됩니다"}
                    </TableCell>
                  </TableRow>
                ) : (
                  bulkEditRows
                    .filter((r) =>
                      bulkEditSearch
                        ? r.itemName.toLowerCase().includes(bulkEditSearch.toLowerCase()) ||
                          (r.itemCode || "").toLowerCase().includes(bulkEditSearch.toLowerCase())
                        : true,
                    )
                    .map((row, idx) => {
                      const diff = row.unitPrice - row.originalUnitPrice;
                      const diffPct =
                        row.originalUnitPrice > 0
                          ? Math.round((diff / row.originalUnitPrice) * 10000) / 100
                          : 0;
                      return (
                        <TableRow
                          key={row.id}
                          className={
                            row.dirty
                              ? row.aiApplied
                                ? "bg-violet-50"
                                : "bg-amber-50"
                              : ""
                          }
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                row.targetType === "material"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                              }
                            >
                              {row.targetType === "material" ? "원재료" : "제품"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{row.itemName}</div>
                            {row.itemCode && (
                              <div className="text-[10px] text-muted-foreground">
                                {row.itemCode}
                              </div>
                            )}
                            {row.aiReason && (
                              <div className="text-[10px] text-violet-600 mt-0.5">
                                ✨ {row.aiReason}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">
                            {row.originalUnitPrice.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={row.unitPrice || ""}
                              onChange={(e) =>
                                updateBulkEditRow(row.id, {
                                  unitPrice: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="h-8 text-right text-xs font-mono"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={row.discountRate || ""}
                              onChange={(e) =>
                                updateBulkEditRow(row.id, {
                                  discountRate: parseFloat(e.target.value) || 0,
                                })
                              }
                              min={0}
                              max={100}
                              step={0.01}
                              className="h-8 text-right text-xs"
                            />
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {row.dirty && diff !== 0 ? (
                              <span
                                className={diff > 0 ? "text-rose-600" : "text-emerald-600"}
                              >
                                {diff > 0 ? "+" : ""}
                                {diff.toLocaleString()}
                                <div className="text-[9px]">
                                  ({diffPct > 0 ? "+" : ""}
                                  {diffPct}%)
                                </div>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.dirty && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => resetBulkEditRow(row.id)}
                                className="h-7 w-7 p-0 text-muted-foreground"
                                title="원래 값으로 되돌리기"
                              >
                                ↺
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <div className="flex-1 text-xs text-muted-foreground">
              {bulkEditRows.length > 0 && (
                <>
                  전체 <b>{bulkEditRows.length}</b>건 ·{" "}
                  <span className="text-amber-600">
                    수정됨 {bulkEditRows.filter((r) => r.dirty).length}건
                  </span>{" "}
                  ·{" "}
                  <span className="text-violet-600">
                    AI 적용 {bulkEditRows.filter((r) => r.aiApplied).length}건
                  </span>
                </>
              )}
            </div>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleBulkEditSave}
              disabled={bulkUpdateMutation.isPending || bulkEditRows.filter((r) => r.dirty).length === 0}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {bulkUpdateMutation.isPending
                ? "저장 중..."
                : `일괄 저장 (${bulkEditRows.filter((r) => r.dirty).length}건)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ AI 조정 미리보기 Dialog ═══ */}
      <Dialog open={aiPreviewOpen} onOpenChange={setAiPreviewOpen}>
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
                {aiPreview?.preview?.map((p: any) => (
                  <TableRow key={p.id} className={p.skip ? "opacity-50" : ""}>
                    <TableCell className="text-sm">
                      <div>{p.itemName}</div>
                      {p.itemCode && (
                        <div className="text-[10px] text-muted-foreground">{p.itemCode}</div>
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
            <Button variant="outline" onClick={() => setAiPreviewOpen(false)}>
              취소
            </Button>
            <Button
              onClick={applyAiPreview}
              className="bg-violet-600 hover:bg-violet-700"
              disabled={!aiPreview || aiPreview.affectedCount === 0}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {aiPreview?.affectedCount || 0}건 적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ 단건 수정 Dialog ═══ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
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
                    setEditForm({ ...editForm, discountRate: parseFloat(e.target.value) || 0 })
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
                  onChange={(e) => setEditForm({ ...editForm, effectiveFrom: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">유효 종료일</Label>
                <Input
                  type="date"
                  value={editForm.effectiveTo}
                  onChange={(e) => setEditForm({ ...editForm, effectiveTo: e.target.value })}
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
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={updateMutation.isPending}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
            >
              수정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ 단가 상세보기 Dialog (Phase B Part 2 UI) ═══ */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-indigo-600" />
              단가 상세보기
            </DialogTitle>
            <DialogDescription>
              거래처별 단가 등록 정보 (읽기 전용)
            </DialogDescription>
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
                  className={
                    TARGET_TYPE_LABELS[detailRow.targetType]?.color || ""
                  }
                >
                  {TARGET_TYPE_LABELS[detailRow.targetType]?.label ||
                    detailRow.targetType}
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
                  <div className="font-mono text-xs">
                    {detailRow.itemCode || "-"}
                  </div>
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
                    {detailRow.effectiveFrom}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">유효 종료</div>
                  <div className="font-mono text-xs">
                    {detailRow.effectiveTo || "무제한"}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground">메모</div>
                  <div className="text-sm whitespace-pre-wrap p-2 bg-slate-50 dark:bg-slate-900/30 rounded min-h-[40px]">
                    {detailRow.notes || (
                      <span className="text-muted-foreground italic">
                        (메모 없음)
                      </span>
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
              onClick={() => {
                if (detailRow) {
                  previewPdfMutation.mutate({
                    partnerId: detailRow.partnerId,
                    activeOnly: false,
                  });
                }
              }}
              disabled={previewPdfMutation.isPending}
              className="text-indigo-600"
            >
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              거래처 단가표 PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDetailOpen(false);
                if (detailRow) openEditDialog(detailRow);
              }}
            >
              <Edit className="h-4 w-4 mr-1" />
              수정
            </Button>
            <Button onClick={() => setDetailOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
