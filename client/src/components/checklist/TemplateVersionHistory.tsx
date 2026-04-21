import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Clock, RotateCcw, User } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface TemplateVersionHistoryProps {
  templateId: number;
  templateName: string;
  isOpen: boolean;
  onClose: () => void;
  onRollback: () => void;
}

/**
 * 템플릿 버전 이력 다이얼로그
 * 템플릿의 수정 이력을 조회하고 이전 버전으로 롤백할 수 있습니다.
 */
export default function TemplateVersionHistory({
  templateId,
  templateName,
  isOpen,
  onClose,
  onRollback,
}: TemplateVersionHistoryProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  // 버전 이력 조회
  const { data: versions, isLoading, refetch } = trpc.qualityChecklist.getTemplateVersions.useQuery(
    { templateId },
    { enabled: isOpen }
  );

  // 롤백 mutation
  const rollbackMutation = trpc.qualityChecklist.rollbackToVersion.useMutation({
    onSuccess: () => {
      toast.success("템플릿이 선택한 버전으로 롤백되었습니다.");
      refetch();
      onRollback();
      onClose();
    },
    onError: (error: { message: string }) => {
      toast.error(`롤백 실패: ${error.message}`);
    },
  });

  const handleRollback = (versionId: number, version: string) => {
    if (confirm(`버전 ${version}로 롤백하시겠습니까? 현재 템플릿 상태는 자동으로 백업됩니다.`)) {
      rollbackMutation.mutate({ versionId });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>템플릿 버전 이력</DialogTitle>
          <DialogDescription>
            {templateName}의 수정 이력입니다. 이전 버전으로 롤백할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : versions && versions.length > 0 ? (
          <div className="space-y-4">
            {versions.map((version: any) => (
              <div
                key={version.id}
                className={`border rounded-lg p-4 hover:bg-accent/50 transition-colors ${
                  selectedVersionId === version.id ? "bg-accent border-primary" : ""
                }`}
                onClick={() => setSelectedVersionId(version.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="font-mono">
                        v{version.version}
                      </Badge>
                      {version.version.includes("rollback-backup") && (
                        <Badge variant="secondary">롤백 백업</Badge>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mb-2">
                      {version.changeDescription || "변경 내용 없음"}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {version.createdAt
                          ? format(new Date(version.createdAt), "yyyy-MM-dd HH:mm", { locale: ko })
                          : "날짜 없음"}
                      </div>
                      {version.createdBy && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          사용자 ID: {version.createdBy}
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRollback(version.id, version.version);
                    }}
                    disabled={rollbackMutation.isPending}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    롤백
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>버전 이력이 없습니다.</p>
            <p className="text-sm mt-2">템플릿을 수정하면 자동으로 버전이 생성됩니다.</p>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
