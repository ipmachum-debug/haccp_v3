import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, Download, Loader2 } from "lucide-react";
import { SeverityBadge } from "./SeverityBadge";
import { formatDate } from "./types";
import type { AlertItem } from "./types";

// ============================================================================
// Tab 2: 알림 관리
// ============================================================================
export function AlertsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const alerts = trpc.ai.listAlerts.useQuery({
    status: statusFilter as any || undefined,
    severity: (severityFilter === "all" ? undefined : severityFilter) as any,
    limit: 100,
  });

  const updateMutation = trpc.ai.updateAlert.useMutation();
  const utils = trpc.useUtils();

  const handleUpdateStatus = async (alertId: number, status: "acknowledged" | "resolved" | "dismissed") => {
    await updateMutation.mutateAsync({ alertId, status });
    utils.ai.listAlerts.invalidate();
    utils.ai.dashboardSummary.invalidate();
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="상태 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="acknowledged">확인됨</SelectItem>
            <SelectItem value="resolved">해결됨</SelectItem>
            <SelectItem value="dismissed">무시됨</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="심각도 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="critical">위험</SelectItem>
            <SelectItem value="high">높음</SelectItem>
            <SelectItem value="medium">보통</SelectItem>
            <SelectItem value="low">낮음</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground">총 {alerts.data?.total || 0}건</span>
          <CsvExportButton statusFilter={statusFilter} severityFilter={severityFilter} />
        </div>
      </div>

      {alerts.isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (alerts.data?.alerts || []).length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>해당 조건의 알림이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(alerts.data?.alerts || []).map((alert: AlertItem) => (
            <Card key={alert.id} className="hover:shadow-sm transition">
              <CardContent className="py-2.5 px-3">
                <div className="flex items-start gap-2">
                  <SeverityBadge severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>{alert.entity_type}</span>
                      {alert.entity_code && <span>| {alert.entity_code}</span>}
                      <span>| {formatDate(alert.created_at)}</span>
                    </div>
                  </div>
                  {alert.status === "active" && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="outline" size="sm" className="text-xs h-7"
                        onClick={() => handleUpdateStatus(alert.id, "acknowledged")}>
                        확인
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-7 text-green-600"
                        onClick={() => handleUpdateStatus(alert.id, "resolved")}>
                        해결
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground"
                        onClick={() => handleUpdateStatus(alert.id, "dismissed")}>
                        무시
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CSV 내보내기 버튼
// ============================================================================
function CsvExportButton({ statusFilter, severityFilter }: { statusFilter: string; severityFilter: string }) {
  const exportMutation = trpc.ai.exportAlertsCsv.useMutation();

  const handleExport = async () => {
    const result = await exportMutation.mutateAsync({
      status: statusFilter as any,
      severity: severityFilter === "all" ? undefined : severityFilter as any,
    });
    // CSV 다운로드
    const blob = new Blob(["\uFEFF" + result.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-alerts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exportMutation.isPending}>
      {exportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      <span className="ml-1 hidden sm:inline">CSV</span>
    </Button>
  );
}
