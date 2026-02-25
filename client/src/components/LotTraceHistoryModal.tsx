import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface LotTraceHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LotTraceHistoryModal({ open, onOpenChange }: LotTraceHistoryModalProps) {
  const { data: history, isLoading: historyLoading } = trpc.traceability.getHistory.useQuery(undefined, {
    enabled: open,
  });
  
  const { data: topSearched, isLoading: topLoading } = trpc.traceability.getTopSearched.useQuery(undefined, {
    enabled: open,
  });
  
  const { data: userStats, isLoading: statsLoading } = trpc.traceability.getUserStats.useQuery(undefined, {
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>LOT 추적 이력</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="history" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="history">추적 이력</TabsTrigger>
            <TabsTrigger value="top">자주 조회된 LOT</TabsTrigger>
            <TabsTrigger value="stats">사용자 통계</TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="space-y-4">
            {historyLoading ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : history && history.length > 0 ? (
              <div className="space-y-2">
                {history.map((item: any) => (
                  <div key={item.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">
                          {item.traceType === "forward" ? "정방향 추적" : "역방향 추적"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          LOT 번호: {item.searchLotNumber}
                        </div>
                        {item.userName && (
                          <div className="text-sm text-muted-foreground">
                            추적자: {item.userName}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(item.createdAt), "yyyy-MM-dd HH:mm", { locale: ko })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                추적 이력이 없습니다.
              </div>
            )}
          </TabsContent>

          <TabsContent value="top" className="space-y-4">
            {topLoading ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : topSearched && topSearched.length > 0 ? (
              <div className="space-y-2">
                {topSearched.map((item: any, index: number) => (
                  <div key={index} className="border rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium">LOT 번호: {item.searchLotNumber}</div>
                      <div className="text-sm text-muted-foreground">
                        추적 횟수: {item.searchCount}회
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-primary">#{index + 1}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                조회된 LOT가 없습니다.
              </div>
            )}
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            {statsLoading ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : userStats && userStats.length > 0 ? (
              <div className="space-y-2">
                {userStats.map((item: any) => (
                  <div key={item.userId || "unknown"} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">
                          {item.userName || "알 수 없음"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          총 {item.traceCount}회 추적
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <div>정방향: {item.forwardCount}회</div>
                        <div>역방향: {item.backwardCount}회</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                사용자 통계가 없습니다.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
