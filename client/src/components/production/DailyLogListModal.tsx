import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, CheckCircle, Clock, XCircle, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DailyLogListModalProps {
  onViewDetail: (logId: number) => void;
}

export function DailyLogListModal({ onViewDetail }: DailyLogListModalProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // 일일일지 목록 조회
  const { data: logs, isLoading } = trpc.dailyLog.list.useQuery({
    startDate: undefined,
    endDate: undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  // 상태별 색상 및 아이콘
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> 작성 중</Badge>;
      case "pending_review":
        return <Badge variant="default" className="gap-1"><Eye className="w-3 h-3" /> 검토 대기</Badge>;
      case "pending_approval":
        return <Badge variant="default" className="gap-1"><Eye className="w-3 h-3" /> 승인 대기</Badge>;
      case "approved":
        return <Badge variant={"default" as any} className="gap-1 bg-green-600 text-white"><CheckCircle className="w-3 h-3" /> 승인됨</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> 반려됨</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* 상태 필터 */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
        >
          전체
        </Button>
        <Button
          variant={statusFilter === "draft" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("draft")}
        >
          작성 중
        </Button>
        <Button
          variant={statusFilter === "pending_review" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("pending_review")}
        >
          검토 대기
        </Button>
        <Button
          variant={statusFilter === "pending_approval" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("pending_approval")}
        >
          승인 대기
        </Button>
        <Button
          variant={statusFilter === "approved" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("approved")}
        >
          승인됨
        </Button>
        <Button
          variant={statusFilter === "rejected" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("rejected")}
        >
          반려됨
        </Button>
      </div>

      {/* 일일일지 목록 */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            로딩 중...
          </div>
        ) : logs && logs.length > 0 ? (
          logs.map((log: any) => (
            <div
              key={log.id}
              className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => onViewDetail(log.id)}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">{log.log_date}</span>
                    </div>
                    {getStatusBadge(log.status)}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>작성자: {log.creator_name || "미지정"}</span>
                    </div>
                    {log.reviewer_name && (
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>검토자: {log.reviewer_name}</span>
                      </div>
                    )}
                    {log.approver_name && (
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>승인자: {log.approver_name}</span>
                      </div>
                    )}
                  </div>

                  {log.notes && (
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {log.notes}
                    </p>
                  )}
                </div>

                <Button variant="ghost" size="sm" className="ml-4">
                  <Eye className="w-4 h-4 mr-1" />
                  상세보기
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            작성된 일일일지가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
