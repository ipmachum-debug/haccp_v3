/**
 * 템플릿 커스터마이징 컴포넌트
 * 사용자가 필요한 필드만 선택하여 템플릿을 생성할 수 있는 기능
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Save, Trash2 } from "lucide-react";

interface Field {
  key: string;
  label: string;
  required: boolean;
  description?: string;
}

interface TemplateCustomizerProps {
  open: boolean;
  onClose: () => void;
  templateType: "material" | "supplier" | "product";
}

// 각 템플릿 타입별 필드 정의
const TEMPLATE_FIELDS: Record<string, Field[]> = {
  material: [
    { key: "materialName", label: "원재료명", required: true, description: "필수 항목" },
    { key: "specification", label: "규격", required: false },
    { key: "unit", label: "단위", required: true, description: "필수 항목" },
    { key: "safetyStock", label: "안전재고", required: true, description: "필수 항목" },
    { key: "shelfLifeDays", label: "유통기한(일)", required: false },
    { key: "storageMethod", label: "보관방법", required: false },
    { key: "notes", label: "비고", required: false },
  ],
  supplier: [
    { key: "supplierName", label: "거래처명", required: true, description: "필수 항목" },
    { key: "businessNumber", label: "사업자번호", required: true, description: "필수 항목" },
    { key: "contactPerson", label: "대표자명", required: false },
    { key: "phone", label: "연락처", required: false },
    { key: "address", label: "주소", required: false },
    { key: "email", label: "이메일", required: false },
    { key: "notes", label: "비고", required: false },
  ],
  product: [
    { key: "productName", label: "제품명", required: true, description: "필수 항목" },
    { key: "category", label: "카테고리", required: false },
    { key: "unit", label: "단위", required: false },
    { key: "unitPrice", label: "단가", required: false },
    { key: "shelfLifeMonths", label: "유통기한(월)", required: false },
    { key: "description", label: "설명", required: false },
  ],
};

const TEMPLATE_NAMES = {
  material: "원재료",
  supplier: "거래처",
  product: "제품",
};

export default function TemplateCustomizer({ open, onClose, templateType }: TemplateCustomizerProps) {
  const fields = TEMPLATE_FIELDS[templateType];
  const [selectedFields, setSelectedFields] = useState<string[]>(
    fields.filter((f) => f.required).map((f) => f.key)
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // 저장된 템플릿 목록 조회
  const { data: savedTemplates, refetch: refetchTemplates } = trpc.templateSettings.getList.useQuery(
    { templateType },
    { enabled: open }
  );

  // 템플릿 저장 mutation
  const saveTemplateMutation = trpc.templateSettings.create.useMutation({
    onSuccess: () => {
      toast.success("템플릿이 저장되었습니다");
      setShowSaveDialog(false);
      setTemplateName("");
      refetchTemplates();
    },
    onError: (error) => {
      toast.error(`템플릿 저장 실패: ${error.message}`);
    },
  });

  // 템플릿 삭제 mutation
  const deleteTemplateMutation = trpc.templateSettings.delete.useMutation({
    onSuccess: () => {
      toast.success("템플릿이 삭제되었습니다");
      refetchTemplates();
    },
    onError: (error) => {
      toast.error(`템플릿 삭제 실패: ${error.message}`);
    },
  });

  // 필드 선택/해제 핸들러
  const handleFieldToggle = (fieldKey: string, required: boolean) => {
    if (required) return; // 필수 필드는 선택 해제 불가

    setSelectedFields((prev) =>
      prev.includes(fieldKey) ? prev.filter((k) => k !== fieldKey) : [...prev, fieldKey]
    );
  };

  // 저장된 템플릿 불러오기
  const handleLoadTemplate = async (templateId: number) => {
    const template = savedTemplates?.find((t: any) => t.id === templateId);
    if (!template) return;

    const parsedFields = JSON.parse(template.selectedFields as string) as string[];
    setSelectedFields(parsedFields);
    toast.success(`"${template.templateName}" 템플릿을 불러왔습니다`);
  };

  // 템플릿 저장 핸들러
  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      toast.error("템플릿 이름을 입력해주세요");
      return;
    }

    saveTemplateMutation.mutate({
      templateType,
      templateName: templateName.trim(),
      selectedFields,
    });
  };

  // 템플릿 삭제 핸들러
  const handleDeleteTemplate = (templateId: number) => {
    if (confirm("정말 이 템플릿을 삭제하시겠습니까?")) {
      deleteTemplateMutation.mutate({ id: templateId });
    }
  };

  // 템플릿 생성 핸들러
  const handleGenerateTemplate = async () => {
    if (selectedFields.length === 0) {
      toast.error("최소 1개 이상의 필드를 선택해야 합니다");
      return;
    }

    setIsGenerating(true);

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(`${TEMPLATE_NAMES[templateType]} 목록`);

      // 선택된 필드만 헤더에 추가
      const selectedFieldsData = fields.filter((f) => selectedFields.includes(f.key));
      worksheet.columns = selectedFieldsData.map((field) => ({
        header: field.required ? `${field.label}*` : field.label,
        key: field.key,
        width: 20,
      }));

      // 헤더 스타일 적용
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4472C4" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 25;

      // 사용법 안내 시트 추가
      const instructionSheet = workbook.addWorksheet("📖 사용법");
      instructionSheet.columns = [{ width: 80 }];

      const instructions = [
        `📋 ${TEMPLATE_NAMES[templateType]} 커스텀 템플릿 사용법`,
        "",
        "✅ 선택된 필드:",
        ...selectedFieldsData.map((f) => `  • ${f.label}${f.required ? " (필수)" : " (선택)"}`),
        "",
        "📝 데이터 입력:",
        "  1. 첫 번째 시트에 데이터를 입력하세요",
        "  2. 필수 항목(*)은 반드시 입력해야 합니다",
        "  3. 헤더(첫 번째 행)는 절대 수정하지 마세요",
        "",
        "💾 저장 및 업로드:",
        "  1. 데이터 입력 완료 후 파일을 저장하세요",
        `  2. 마스터데이터 관리 > ${TEMPLATE_NAMES[templateType]} 탭에서 '일괄 업로드' 버튼 클릭`,
        "  3. 저장한 파일을 선택하여 업로드",
        "  4. 미리보기에서 데이터 확인 후 '등록' 버튼 클릭",
      ];

      instructions.forEach((text, index) => {
        const row = instructionSheet.addRow([text]);
        if (index === 0) {
          row.font = { bold: true, size: 16, color: { argb: "FF70AD47" } };
          row.height = 30;
        } else if (text.startsWith("✅") || text.startsWith("📝") || text.startsWith("💾")) {
          row.font = { bold: true, size: 12 };
        }
      });

      // 파일 생성 및 다운로드
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${TEMPLATE_NAMES[templateType]}_커스텀_템플릿.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("커스텀 템플릿이 다운로드되었습니다");
      onClose();
    } catch (error: any) {
      toast.error(`템플릿 생성 오류: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{TEMPLATE_NAMES[templateType]} 템플릿 커스터마이징</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            필요한 필드만 선택하여 템플릿을 생성하세요. 필수 항목은 자동으로 포함됩니다.
          </p>

          <Separator />

          {/* 저장된 템플릿 목록 */}
          {savedTemplates && savedTemplates.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">저장된 템플릿</Label>
              <div className="space-y-2">
                {savedTemplates.map((template: any) => (
                  <div key={template.id} className="flex items-center justify-between p-2 border rounded-lg">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadTemplate(template.id)}
                      className="flex-1 justify-start"
                    >
                      {template.templateName}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTemplate(template.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
              <Separator />
            </div>
          )}

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {fields.map((field) => {
              const isSelected = selectedFields.includes(field.key);
              const isDisabled = field.required;

              return (
                <div key={field.key} className="flex items-start space-x-3 p-3 rounded-lg border">
                  <Checkbox
                    id={field.key}
                    checked={isSelected}
                    disabled={isDisabled}
                    onCheckedChange={() => handleFieldToggle(field.key, field.required)}
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor={field.key}
                      className={`font-medium ${isDisabled ? "text-muted-foreground" : "cursor-pointer"}`}
                    >
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {field.description && (
                      <p className="text-sm text-muted-foreground mt-1">{field.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Separator />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              선택된 필드: <strong>{selectedFields.length}</strong>개
            </span>
            <Button variant="link" size="sm" onClick={() => setSelectedFields(fields.map((f) => f.key))}>
              전체 선택
            </Button>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex-1 flex gap-2">
            {showSaveDialog ? (
              <>
                <Input
                  placeholder="템플릿 이름 입력"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveTemplate()}
                />
                <Button onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  저장
                </Button>
                <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                  취소
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setShowSaveDialog(true)}>
                <Save className="mr-2 h-4 w-4" />
                현재 설정 저장
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isGenerating}>
              닫기
            </Button>
            <Button onClick={handleGenerateTemplate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <FileDown className="mr-2 h-4 w-4" />
                  템플릿 생성
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
