import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Plus, Edit, Copy, Trash2, FileText } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

const CATEGORY_LABELS: Record<string, string> = {
  CCP: "CCP 점검",
  SANITATION: "위생 관리",
  QUALITY: "품질 관리",
  SAFETY: "안전 관리",
  TRAINING: "교육 훈련",
  MAINTENANCE: "보정 관리",
};

const CATEGORY_COLORS: Record<string, string> = {
  CCP: "bg-red-100 text-red-800",
  SANITATION: "bg-blue-100 text-blue-800",
  QUALITY: "bg-green-100 text-green-800",
  SAFETY: "bg-yellow-100 text-yellow-800",
  TRAINING: "bg-purple-100 text-purple-800",
  MAINTENANCE: "bg-gray-100 text-gray-800",
};

export default function ChecklistTemplates() {
  const [, setLocation] = useLocation();
  const { hasRole } = useAuth();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: templates, isLoading, refetch } = trpc.checklistTemplate.list.useQuery({
    category: categoryFilter === "all" ? undefined : categoryFilter,
    isActive: true,
  });

  const deleteMutation = trpc.checklistTemplate.delete.useMutation({
    onSuccess: () => {
      alert("템플릿이 삭제되었습니다.");
      refetch();
    },
    onError: (error: any) => {
      alert(`삭제 실패: ${error.message}`);
    },
  });

  const duplicateMutation = trpc.checklistTemplate.duplicate.useMutation({
    onSuccess: () => {
      alert("템플릿이 복사되었습니다.");
      refetch();
    },
    onError: (error: any) => {
      alert(`복사 실패: ${error.message}`);
    },
  });

  const handleDelete = (id: number, name: string) => {
    if (confirm(`"${name}" 템플릿을 삭제하시겠습니까?`)) {
      deleteMutation.mutate({ id });
    }
  };

  const handleDuplicate = (id: number, name: string) => {
    const newName = prompt(`새 템플릿 이름을 입력하세요:`, `${name} (복사본)`);
    if (newName) {
      duplicateMutation.mutate({ id, newName });
    }
  };

  if (!hasRole(["admin"])) {
    return (
    <DashboardLayout>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>접근 권한 없음</CardTitle>
            <CardDescription>
              체크리스트 템플릿 관리는 관리자만 접근할 수 있습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    
    </DashboardLayout>
  );
  }

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">체크리스트 템플릿 관리</h1>
          <p className="text-muted-foreground mt-2">
            배치 생산 및 품질 관리를 위한 체크리스트 템플릿을 생성하고 관리합니다.
          </p>
        </div>
        <Button onClick={() => setLocation("/checklist-templates/new")}>
          <Plus className="w-4 h-4 mr-2" />
          새 템플릿 생성
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>템플릿 목록</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">카테고리:</span>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="CCP">CCP 점검</SelectItem>
                  <SelectItem value="SANITATION">위생 관리</SelectItem>
                  <SelectItem value="QUALITY">품질 관리</SelectItem>
                  <SelectItem value="SAFETY">안전 관리</SelectItem>
                  <SelectItem value="TRAINING">교육 훈련</SelectItem>
                  <SelectItem value="MAINTENANCE">보정 관리</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              로딩 중...
            </div>
          ) : !templates || templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>등록된 템플릿이 없습니다.</p>
              <p className="text-sm mt-2">
                "새 템플릿 생성" 버튼을 클릭하여 첫 템플릿을 만들어보세요.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>템플릿 이름</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>CCP 타입</TableHead>
                  <TableHead className="text-center">항목 수</TableHead>
                  <TableHead className="text-center">우선순위</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template: any) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">
                      {template.name}
                      {template.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {template.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={CATEGORY_COLORS[template.category] || ""}>
                        {CATEGORY_LABELS[template.category] || template.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {template.ccpType ? (
                        <Badge variant="outline">{template.ccpType}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {template.items?.length || 0}개
                    </TableCell>
                    <TableCell className="text-center">
                      {template.priority}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setLocation(`/checklist-templates/${template.id}`)
                          }
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleDuplicate(template.id, template.name)
                          }
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleDelete(template.id, template.name)
                          }
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}
