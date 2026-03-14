/**
 * 대시보드 위젯 설정 패널
 * 관리자가 표시할 위젯을 선택할 수 있습니다
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// 사용 가능한 위젯 목록 정의
const AVAILABLE_WIDGETS = [
  { id: "today_batches", label: "오늘 생성 배치", description: "오늘 생성된 배치 수" },
  { id: "in_progress_batches", label: "진행 중 배치", description: "현재 진행 중인 배치 수" },
  { id: "ccp_completion_rate", label: "CCP 점검 완료율", description: "CCP 점검 완료 통계" },
  { id: "pending_approvals", label: "승인 대기", description: "승인 대기 중인 항목" },
  { id: "recent_batches", label: "최근 배치 목록", description: "최근 생성된 배치 목록" },
  { id: "ccp_deviations", label: "CCP 이탈 현황", description: "최근 CCP 이탈 내역" },
  { id: "production_trend", label: "생산 추이", description: "월별 생산 추이 차트" },
  { id: "ccp_deviation_trend", label: "CCP 이탈 추이", description: "CCP 이탈 추이 차트" },
  { id: "material_consumption", label: "원재료 소비", description: "원재료 소비 차트" },
  { id: "monthly_deviation_rate", label: "월별 이탈률", description: "월별 CCP 이탈률 차트" },
];

export default function WidgetSettingsPanel() {
  const [widgetSettings, setWidgetSettings] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // 위젯 설정 조회
  const { data: settings, refetch } = trpc.dashboard.getWidgetSettings.useQuery();

  useEffect(() => {
    if (settings) {
      const settingsMap: Record<string, boolean> = {};
      
      // 기본값: 모든 위젯 표시
      AVAILABLE_WIDGETS.forEach(widget => {
        settingsMap[widget.id] = true;
      });
      
      // 저장된 설정 적용
      settings.forEach((setting: any) => {
        settingsMap[setting.widgetId] = setting.isVisible === 1;
      });
      
      setWidgetSettings(settingsMap);
      setIsLoading(false);
    }
  }, [settings]);

  // 위젯 표시/숨김 업데이트
  const updateMutation = trpc.dashboard.updateWidgetVisibility.useMutation({
    onSuccess: () => {
      toast.success("위젯 설정이 저장되었습니다");
      refetch();
    },
    onError: (error: any) => {
      toast.error(`설정 저장 실패: ${error.message}`);
    },
  });

  const handleToggle = (widgetId: string, isVisible: boolean) => {
    setWidgetSettings(prev => ({
      ...prev,
      [widgetId]: isVisible,
    }));

    updateMutation.mutate({
      widgetId,
      isVisible: isVisible ? 1 : 0,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {AVAILABLE_WIDGETS.map((widget) => (
        <div
          key={widget.id}
          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
        >
          <div className="space-y-0.5">
            <Label htmlFor={widget.id} className="text-base font-medium cursor-pointer">
              {widget.label}
            </Label>
            <p className="text-sm text-muted-foreground">{widget.description}</p>
          </div>
          <Switch
            id={widget.id}
            checked={widgetSettings[widget.id] ?? true}
            onCheckedChange={(checked) => handleToggle(widget.id, checked)}
            disabled={updateMutation.isPending}
          />
        </div>
      ))}
    </div>
  );
}
