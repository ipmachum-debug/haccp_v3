import { useParams, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, XCircle, Save, CheckCircle2, Printer, History, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function ChecklistDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const instanceId = parseInt(id || "0", 10);

  // 실시간 협업: 폴링 간격 (30초)
  const POLLING_INTERVAL = 30000;

  const { data, isLoading, refetch } = trpc.qualityChecklist.getInstance.useQuery(
    { id: instanceId },
    { 
      enabled: instanceId > 0,
      refetchInterval: POLLING_INTERVAL, // 30초마다 자동 새로고침
    }
  );

  const [itemValues, setItemValues] = useState<Record<number, string>>({});
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [lastModifiedAt, setLastModifiedAt] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 데이터 로드 시 lastModifiedAt 업데이트
  useEffect(() => {
    if (data?.lastModifiedAt) {
      setLastModifiedAt(data.lastModifiedAt);
    }
  }, [data]);

  const { data: historyData } = trpc.qualityChecklist.getItemHistory.useQuery(
    { instanceItemId: selectedItemId! },
    { enabled: selectedItemId !== null }
  );

  const saveItemMutation = trpc.qualityChecklist.saveInstanceItem.useMutation({
    onSuccess: (result) => {
      toast.success("항목이 저장되었습니다.");
      // 저장 성공 시 lastModifiedAt 업데이트
      if (result.updatedAt) {
        setLastModifiedAt(result.updatedAt);
      }
      // 데이터 새로고침
      refetch();
    },
    onError: (error: any) => {
      if (error.data?.code === "CONFLICT") {
        toast.error("다른 사용자가 이 항목을 수정했습니다. 페이지를 새로고침합니다.");
        refetch();
      } else {
        toast.error(`저장 실패: ${error.message}`);
      }
    },
  });

  const completeInstanceMutation = trpc.qualityChecklist.completeInstance.useMutation({
    onSuccess: () => {
      toast.success("체크리스트가 완료되었습니다.");
      setLocation("/quality/checklists/list");
    },
    onError: (error: any) => {
      toast.error(`완료 실패: ${error.message}`);
    },
  });

  const handleSaveItem = (itemId: number, value: string) => {
    saveItemMutation.mutate({
      id: itemId,
      value,
      lastModifiedAt, // 충돌 감지를 위해 클라이언트가 알고 있는 마지막 수정 시간 전송
    });
  };

  const handleComplete = () => {
    completeInstanceMutation.mutate({ id: instanceId });
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    toast.success("최신 데이터로 새로고침되었습니다.");
    setIsRefreshing(false);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "대기 중", variant: "secondary" },
      in_progress: { label: "진행 중", variant: "default" },
      completed: { label: "완료", variant: "outline" },
      pending_review: { label: "승인 대기", variant: "secondary" },
      approved: { label: "승인됨", variant: "outline" },
      rejected: { label: "반려됨", variant: "destructive" },
    };
    const config = variants[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="container py-4 md:py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container py-4 md:py-8">
        <Card className="p-6 md:p-8 text-center">
          <XCircle className="w-12 h-12 md:w-16 md:h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl md:text-2xl font-bold mb-2">체크리스트를 찾을 수 없습니다</h2>
          <Button onClick={() => setLocation("/quality/checklists/list")} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            목록으로 돌아가기
          </Button>
        </Card>
      </div>
    );
  }

  const instance = data.instance;
  const items = data.items || [];

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* 헤더 - 모바일 최적화 */}
      <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-2 md:gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation("/quality/checklists/list")}
            className="shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-bold truncate">체크리스트 상세</h1>
            <p className="text-sm md:text-base text-muted-foreground truncate">
              예정일: {instance.targetDate || "미정"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 justify-between md:justify-end">
          {getStatusBadge(instance.status)}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/quality/checklists/${instanceId}/history`)}
            className="shrink-0"
          >
            <History className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">이력</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="shrink-0"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">새로고침</span>
          </Button>
        </div>
      </div>

      {/* 체크리스트 항목 - 모바일 최적화 */}
      <Card className="p-4 md:p-6 mb-4 md:mb-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4">체크리스트 항목</h2>
        <div className="space-y-4">
          {items && items.length > 0 ? (
            items.map((item: any) => (
              <div key={item.id} className="border-b pb-4 last:border-b-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <label className="block font-medium text-sm md:text-base">{item.itemName}</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setHistoryDialogOpen(true);
                    }}
                    className="self-start sm:self-auto shrink-0"
                  >
                    <History className="w-4 h-4 mr-1" />
                    이력 보기
                  </Button>
                </div>
                {item.itemType === "checkbox" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={itemValues[item.id] === "true" || item.value === "true"}
                      onChange={(e) => {
                        const newValue = e.target.checked ? "true" : "false";
                        setItemValues({ ...itemValues, [item.id]: newValue });
                        handleSaveItem(item.id, newValue);
                      }}
                      disabled={instance.status === "completed"}
                      className="w-5 h-5"
                    />
                    <span className="text-sm text-muted-foreground">확인 완료</span>
                  </div>
                )}
                {item.itemType === "text" && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={itemValues[item.id] !== undefined ? itemValues[item.id] : item.value || ""}
                      onChange={(e) => setItemValues({ ...itemValues, [item.id]: e.target.value })}
                      disabled={instance.status === "completed"}
                      placeholder="값을 입력하세요"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSaveItem(item.id, itemValues[item.id] || "")}
                      disabled={instance.status === "completed" || saveItemMutation.isPending}
                      className="w-full sm:w-auto"
                    >
                      저장
                    </Button>
                  </div>
                )}
                {item.itemType === "number" && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="number"
                      value={itemValues[item.id] !== undefined ? itemValues[item.id] : item.value || ""}
                      onChange={(e) => setItemValues({ ...itemValues, [item.id]: e.target.value })}
                      disabled={instance.status === "completed"}
                      placeholder="숫자를 입력하세요"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSaveItem(item.id, itemValues[item.id] || "")}
                      disabled={instance.status === "completed" || saveItemMutation.isPending}
                      className="w-full sm:w-auto"
                    >
                      저장
                    </Button>
                  </div>
                )}
                {item.itemType === "textarea" && (
                  <div className="space-y-2">
                    <Textarea
                      value={itemValues[item.id] !== undefined ? itemValues[item.id] : item.value || ""}
                      onChange={(e) => setItemValues({ ...itemValues, [item.id]: e.target.value })}
                      disabled={instance.status === "completed"}
                      placeholder="내용을 입력하세요"
                      rows={3}
                      className="resize-none"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSaveItem(item.id, itemValues[item.id] || "")}
                      disabled={instance.status === "completed" || saveItemMutation.isPending}
                      className="w-full sm:w-auto"
                    >
                      저장
                    </Button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-center py-8 text-sm md:text-base">항목이 없습니다.</p>
          )}
        </div>
      </Card>

      {/* 하단 버튼 - 모바일 최적화 */}
      <div className="flex flex-col sm:flex-row gap-2 justify-end">
        <Button 
          variant="outline" 
          onClick={() => setLocation("/quality/checklists/list")}
          className="w-full sm:w-auto"
        >
          목록으로
        </Button>
        <Button 
          variant="outline" 
          onClick={() => window.print()}
          className="w-full sm:w-auto"
        >
          <Printer className="w-4 h-4 mr-2" />
          PDF 출력
        </Button>
        {instance.status !== "completed" && (
          <Button 
            onClick={handleComplete} 
            disabled={completeInstanceMutation.isPending}
            className="w-full sm:w-auto"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            완료 처리
          </Button>
        )}
      </div>

      {/* 이력 조회 다이얼로그 - 모바일 최적화 */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">항목 수정 이력</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {historyData && historyData.length > 0 ? (
              historyData.map((history: any, index: number) => (
                <div key={index} className="border-b pb-3 last:border-b-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                    <span className="font-medium text-sm md:text-base">{history.changedBy}</span>
                    <span className="text-xs md:text-sm text-muted-foreground">
                      {new Date(history.changedAt).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <div className="text-xs md:text-sm">
                    <span className="text-muted-foreground">이전 값:</span>{" "}
                    <span className="line-through">{history.oldValue || "(비어있음)"}</span>
                  </div>
                  <div className="text-xs md:text-sm">
                    <span className="text-muted-foreground">변경 값:</span>{" "}
                    <span className="font-medium">{history.newValue || "(비어있음)"}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm md:text-base">수정 이력이 없습니다.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
      </DashboardLayout>
  );
}
