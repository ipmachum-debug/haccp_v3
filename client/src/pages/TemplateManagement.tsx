import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Plus, Edit, Trash2, FileText, Power, PowerOff, Copy, History } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import TemplateForm from "@/components/TemplateForm";
import TemplateVersionHistory from "@/components/TemplateVersionHistory";

/**
 * 템플릿 관리 페이지
 * 품질 체크리스트 템플릿의 생성, 조회, 수정, 삭제 기능 제공
 */
export default function TemplateManagement() {
  // toast from sonner
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versionTemplateId, setVersionTemplateId] = useState<number | null>(null);
  const [versionTemplateName, setVersionTemplateName] = useState<string>("");

  // 템플릿 목록 조회
  const { data: templates, isLoading, refetch } = trpc.qualityChecklist.listTemplates.useQuery({
    category: selectedCategory as any,
  });

  // 템플릿 삭제
  const deleteTemplateMutation = trpc.qualityChecklist.deleteTemplate.useMutation({
    onSuccess: () => {
      toast.success("템플릿이 성공적으로 삭제되었습니다.");
      refetch();
    },
    onError: (error) => {
      toast.error(`템플릿 삭제 실패: ${error.message}`);
    },
  });

  // 템플릿 활성화/비활성화
  const updateTemplateMutation = trpc.qualityChecklist.updateTemplate.useMutation({
    onSuccess: () => {
      toast.success("템플릿 상태가 성공적으로 변경되었습니다.");
      refetch();
    },
    onError: (error) => {
      toast.error(`템플릿 상태 변경 실패: ${error.message}`);
    },
  });

  // 템플릿 복제
  const cloneTemplateMutation = trpc.qualityChecklist.cloneTemplate.useMutation({
    onSuccess: () => {
      toast.success("템플릿이 성공적으로 복제되었습니다.");
      refetch();
    },
    onError: (error) => {
      toast.error(`템플릿 복제 실패: ${error.message}`);
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("정말로 이 템플릿을 삭제하시겠습니까?")) {
      deleteTemplateMutation.mutate({ id });
    }
  };

  const handleToggleActive = (id: number, currentStatus: boolean) => {
    updateTemplateMutation.mutate({
      id,
      isActive: !currentStatus,
    });
  };

  const handleClone = (id: number) => {
    if (confirm("이 템플릿을 복제하시게습니까?")) {
      cloneTemplateMutation.mutate({ id });
    }
  };

  const handleEdit = (template: any) => {
    setSelectedTemplate(template);
    setIsFormOpen(true);
  };

  const handleCreate = () => {
    setSelectedTemplate(null);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setSelectedTemplate(null);
    refetch();
  };

  const handleViewVersions = (template: any) => {
    setVersionTemplateId(template.id);
    setVersionTemplateName(template.name);
    setVersionHistoryOpen(true);
  };

  const handleVersionHistoryClose = () => {
    setVersionHistoryOpen(false);
    setVersionTemplateId(null);
    setVersionTemplateName("");
  };

  const handleRollback = () => {
    refetch();
  };

  const categories = [
    { value: undefined, label: "전체" },
    { value: "CCP", label: "CCP 관리" },
    { value: "SANITATION", label: "위생 관리" },
    { value: "QUALITY", label: "품질 관리" },
    { value: "SAFETY", label: "안전 관리" },
    { value: "TRAINING", label: "교육 관리" },
    { value: "MAINTENANCE", label: "시설 관리" },
  ];

  const getCategoryLabel = (category: string) => {
    return categories.find((c) => c.value === category)?.label || category;
  };

  const getStatusBadge = (template: any) => {
    if (!template.isActive) {
      return <Badge variant="secondary">비활성</Badge>;
    }

    const autoTriggerRules = template.autoTriggerRules as any;
    if (autoTriggerRules?.mode === "auto") {
      return <Badge variant="default">자동 생성</Badge>;
    }

    return <Badge variant="outline">수동 생성</Badge>;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* 헤더 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            템플릿 관리
          </h1>
          <p className="text-muted-foreground mt-2">
            품질 체크리스트 템플릿을 생성하고 관리하세요
          </p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreate} size="lg" className="gap-2">
              <Plus className="w-5 h-5" />
              새 템플릿 생성
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedTemplate ? "템플릿 수정" : "새 템플릿 생성"}
              </DialogTitle>
              <DialogDescription>
                체크리스트 템플릿의 기본 정보와 항목을 설정하세요
              </DialogDescription>
            </DialogHeader>
            <TemplateForm
              template={selectedTemplate}
              onSuccess={handleFormClose}
              onCancel={handleFormClose}
            />
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* 카테고리 필터 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2 flex-wrap"
      >
        {categories.map((category) => (
          <Button
            key={category.value || "all"}
            variant={selectedCategory === category.value ? "default" : "outline"}
            onClick={() => setSelectedCategory(category.value)}
            size="sm"
          >
            {category.label}
          </Button>
        ))}
      </motion.div>

      {/* 템플릿 목록 */}
      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">템플릿을 불러오는 중...</p>
        </div>
      ) : templates && templates.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {templates.map((template, index) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="hover:shadow-lg transition-all duration-300 hover:scale-[1.02]">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        {template.name}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {template.description || "설명 없음"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Badge variant="secondary">
                      {getCategoryLabel(template.category)}
                    </Badge>
                    {getStatusBadge(template)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(template)}
                        className="flex-1"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        수정
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleClone(template.id)}
                        className="flex-1"
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        복제
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewVersions(template)}
                        className="flex-1"
                      >
                        <History className="w-4 h-4 mr-1" />
                        이력
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(template.id, template.isActive === 1)}
                        className="flex-1"
                      >
                        {template.isActive === 1 ? (
                          <>
                            <PowerOff className="w-4 h-4 mr-1" />
                            비활성화
                          </>
                        ) : (
                          <>
                            <Power className="w-4 h-4 mr-1" />
                            활성화
                          </>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center py-12"
        >
          <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-lg">
            {selectedCategory
              ? "해당 카테고리에 템플릿이 없습니다"
              : "아직 생성된 템플릿이 없습니다"}
          </p>
          <Button onClick={handleCreate} className="mt-4">
            <Plus className="w-4 h-4 mr-2" />
            첫 템플릿 생성하기
          </Button>
        </motion.div>
      )}

      {/* 버전 이력 다이얼로그 */}
      {versionTemplateId && (
        <TemplateVersionHistory
          templateId={versionTemplateId}
          templateName={versionTemplateName}
          isOpen={versionHistoryOpen}
          onClose={handleVersionHistoryClose}
          onRollback={handleRollback}
        />
      )}
    </div>
  );
}
