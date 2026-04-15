import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, AlertCircle, Loader2, Search, Shield, Zap, Thermometer, Gauge } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CCP_TYPE_OPTIONS = [
  { value: "CCP-1B", label: "CCP-1B (가열/증숙 공정)", icon: Thermometer, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "CCP-2B", label: "CCP-2B (교반/오븐 공정)", icon: Zap, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { value: "CCP-3B", label: "CCP-3B (UV/냉각 공정)", icon: Thermometer, color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { value: "CCP-4P", label: "CCP-4P (금속검출 공정)", icon: Gauge, color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
];

const CCP_TYPE_COLORS: Record<string, string> = {
  "CCP-1B": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "CCP-2B": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "CCP-3B": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "CCP-4P": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

export default function CcpTemplateManagement({ embedded = false }: { embedded?: boolean } = {}) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: templates, refetch, isLoading } = trpc.ccpTemplate.list.useQuery();
  const createMutation = trpc.ccpTemplate.create.useMutation();
  const updateMutation = trpc.ccpTemplate.update.useMutation();
  const deleteMutation = trpc.ccpTemplate.delete.useMutation();

  const [formData, setFormData] = useState({
    templateName: "",
    productNamePattern: "",
    ccpType: "",
    description: "",
    priority: 0,
    isActive: 1,
  });

  const resetForm = () => {
    setFormData({
      templateName: "",
      productNamePattern: "",
      ccpType: "",
      description: "",
      priority: 0,
      isActive: 1,
    });
  };

  const handleCreate = async () => {
    if (!formData.templateName || !formData.ccpType) {
      toast.error("템플릿 이름과 CCP 타입은 필수 항목입니다.");
      return;
    }
    try {
      await createMutation.mutateAsync(formData);
      toast.success("CCP 템플릿이 생성되었습니다.");
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || "템플릿 생성 실패");
    }
  };

  const handleEdit = (template: any) => {
    setSelectedTemplate(template);
    setFormData({
      templateName: template.templateName || template.template_name || "",
      productNamePattern: template.productNamePattern || template.product_name_pattern || "",
      ccpType: template.ccpType || template.ccp_type || "",
      description: template.description || "",
      priority: template.priority || 0,
      isActive: template.isActive ?? template.is_active ?? 1,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedTemplate) return;
    try {
      await updateMutation.mutateAsync({
        id: selectedTemplate.id,
        ...formData,
      });
      toast.success("CCP 템플릿이 수정되었습니다.");
      setIsEditDialogOpen(false);
      resetForm();
      setSelectedTemplate(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "템플릿 수정 실패");
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    try {
      await deleteMutation.mutateAsync({ id: selectedTemplate.id });
      toast.success("CCP 템플릿이 삭제되었습니다.");
      setIsDeleteDialogOpen(false);
      setSelectedTemplate(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "템플릿 삭제 실패");
    }
  };

  // 필터링
  const filteredTemplates = useMemo(() => {
    if (!templates || !Array.isArray(templates)) return [];
    if (!searchTerm) return templates;
    const lower = searchTerm.toLowerCase();
    return templates.filter((t: any) =>
      (t.templateName || t.template_name || "").toLowerCase().includes(lower) ||
      (t.productNamePattern || t.product_name_pattern || "").toLowerCase().includes(lower) ||
      (t.ccpType || t.ccp_type || "").toLowerCase().includes(lower)
    );
  }, [templates, searchTerm]);

  // 통계
  const stats = useMemo(() => {
    if (!templates || !Array.isArray(templates)) return { total: 0, active: 0, byType: {} as Record<string, number> };
    const total = templates.length;
    const active = templates.filter((t: any) => (t.isActive ?? t.is_active ?? 1) === 1).length;
    const byType: Record<string, number> = {};
    templates.forEach((t: any) => {
      const type = t.ccpType || t.ccp_type || "기타";
      byType[type] = (byType[type] || 0) + 1;
    });
    return { total, active, byType };
  }, [templates]);

  const getField = (template: any, camel: string, snake: string) =>
    template[camel] !== undefined ? template[camel] : template[snake];

  const formDialog = (title: string, description: string, onSubmit: () => void, isPending: boolean, submitLabel: string) => (
    <>
      <DialogHeader>
        <DialogTitle className="text-base">{title}</DialogTitle>
        <DialogDescription className="text-xs">{description}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">템플릿 이름 *</Label>
          <Input
            value={formData.templateName}
            onChange={(e) => setFormData({ ...formData, templateName: e.target.value })}
            placeholder="예: 떡볶이 증숙 CCP"
            className="h-8 text-sm"
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">제품명 패턴</Label>
          <Input
            value={formData.productNamePattern}
            onChange={(e) => setFormData({ ...formData, productNamePattern: e.target.value })}
            placeholder="예: 떡볶이, 김치, 만두"
            className="h-8 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            제품명에 이 키워드가 포함되면 해당 CCP가 자동 적용됩니다
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">CCP 타입 *</Label>
          <Select value={formData.ccpType} onValueChange={(v) => setFormData({ ...formData, ccpType: v })}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="CCP 타입 선택" />
            </SelectTrigger>
            <SelectContent>
              {CCP_TYPE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <Badge className={`${opt.color} text-[10px] px-1 py-0`}>{opt.value}</Badge>
                    <span className="text-xs">{opt.label.replace(`${opt.value} `, "")}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">우선순위</Label>
            <Input
              type="number"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              placeholder="0"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">상태</Label>
            <Select value={String(formData.isActive)} onValueChange={(v) => setFormData({ ...formData, isActive: parseInt(v) })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">활성</SelectItem>
                <SelectItem value="0">비활성</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">설명</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="템플릿에 대한 설명"
            rows={2}
            className="text-sm"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); }}>
          취소
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={isPending}>
          {isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />처리 중...</> : submitLabel}
        </Button>
      </DialogFooter>
    </>
  );

  const content = (
    <div className={embedded ? "space-y-4" : "space-y-4 p-6"}>
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            CCP 템플릿 관리
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            제품명 패턴에 따라 자동으로 생성될 CCP 타입을 설정합니다. 배치 생성 시 자동 적용됩니다.
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 text-xs" onClick={resetForm}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              템플릿 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            {formDialog("CCP 템플릿 추가", "새로운 CCP 자동 생성 규칙을 추가합니다.", handleCreate, createMutation.isPending, "생성")}
          </DialogContent>
        </Dialog>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card>
          <CardContent className="py-2 px-3 flex items-center gap-2">
            <div><p className="text-[10px] text-muted-foreground">전체 템플릿</p><p className="text-lg font-bold text-gray-600">{stats.total}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3 flex items-center gap-2">
            <div><p className="text-[10px] text-muted-foreground">활성</p><p className="text-lg font-bold text-green-600">{stats.active}</p></div>
          </CardContent>
        </Card>
        {Object.entries(stats.byType).slice(0, 2).map(([type, count]) => (
          <Card key={type}>
            <CardContent className="py-2 px-3 flex items-center gap-2">
              <div><p className="text-[10px] text-muted-foreground">{type}</p><p className="text-lg font-bold text-blue-600">{count}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 안내 배너 */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="py-2 px-3 text-xs text-blue-800 dark:text-blue-200 space-y-1">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="h-3.5 w-3.5" />
            사용 가이드
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1 text-[11px]">
            <p><strong>제품명 패턴:</strong> 제품명에 포함될 키워드 (예: "떡볶이")</p>
            <p><strong>CCP 타입:</strong> 자동 생성될 CCP (예: CCP-1B, CCP-4P)</p>
            <p><strong>우선순위:</strong> 숫자가 클수록 먼저 적용됩니다</p>
          </div>
        </CardContent>
      </Card>

      {/* 검색 */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="템플릿 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* 템플릿 테이블 */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">템플릿 목록</CardTitle>
          <CardDescription className="text-xs">
            등록된 CCP 자동 생성 규칙 ({filteredTemplates.length}개)
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">템플릿 이름</TableHead>
                  <TableHead className="text-xs">제품명 패턴</TableHead>
                  <TableHead className="text-xs">CCP 타입</TableHead>
                  <TableHead className="text-center text-xs">우선순위</TableHead>
                  <TableHead className="text-center text-xs">상태</TableHead>
                  <TableHead className="text-right text-xs w-[70px]">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.length > 0 ? (
                  filteredTemplates.map((template: any) => {
                    const name = getField(template, "templateName", "template_name");
                    const pattern = getField(template, "productNamePattern", "product_name_pattern");
                    const type = getField(template, "ccpType", "ccp_type");
                    const active = getField(template, "isActive", "is_active") ?? 1;
                    return (
                      <TableRow key={template.id}>
                        <TableCell className="font-medium text-xs py-1.5">{name}</TableCell>
                        <TableCell className="py-1.5">
                          <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                            {pattern || "-"}
                          </code>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Badge className={`${CCP_TYPE_COLORS[type] || ""} text-[10px] px-1.5 py-0`}>
                            {type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs py-1.5">{template.priority}</TableCell>
                        <TableCell className="text-center py-1.5">
                          {active === 1 ? (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">활성</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">비활성</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right py-1.5">
                          <div className="flex justify-end gap-0.5">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(template)} className="h-6 w-6 p-0">
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => { setSelectedTemplate(template); setIsDeleteDialogOpen(true); }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8 text-xs">
                      {searchTerm ? "검색 결과가 없습니다." : "등록된 템플릿이 없습니다. 템플릿을 추가하여 CCP 자동 생성 규칙을 설정하세요."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          {formDialog("CCP 템플릿 수정", "템플릿 정보를 수정합니다.", handleUpdate, updateMutation.isPending, "수정")}
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">템플릿 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              정말로 이 템플릿을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending} className="h-8 text-xs">
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  if (embedded) return content;

  return (
    <DashboardLayout>
      {content}
    </DashboardLayout>
  );
}
