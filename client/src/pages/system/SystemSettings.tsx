import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Settings, Package, Tag } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function SystemSettings() {
  const [erpEnabled, setErpEnabled] = useState(false);

  const { data: settings, refetch } = trpc.system.getSettings.useQuery();
  const updateSetting = trpc.system.updateSetting.useMutation({
    onSuccess: () => {
      toast.success("설정이 저장되었습니다");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  useEffect(() => {
    if (settings) {
      const erpSetting = settings.find((s: any) => s.settingKey === "erp_module_enabled");
      setErpEnabled(erpSetting?.settingValue === "true");
    }
  }, [settings]);

  const handleErpToggle = (checked: boolean) => {
    setErpEnabled(checked);
    updateSetting.mutate({
      key: "erp_module_enabled",
      value: checked ? "true" : "false",
      description: "ERP 모듈 활성화 여부 (매출/출고 관리 기능)",
    });
  };

  return (
    <DashboardLayout>

    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            시스템 설정
          </h1>
          <p className="text-muted-foreground">
            시스템 전역 설정을 관리합니다
          </p>
        </div>
      </div>

      {/* 카테고리 관리 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            카테고리 관리
          </CardTitle>
          <CardDescription>
            원재료, 제품, 매입, 매출 카테고리를 관리합니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.href = "/category-management"}>
            카테고리 관리 페이지로 이동
          </Button>
        </CardContent>
      </Card>

      {/* ERP 모듈 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            ERP 모듈
          </CardTitle>
          <CardDescription>
            매출/출고 관리 기능을 활성화하거나 비활성화합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="erp-enabled" className="text-base">
                ERP 모듈 활성화
              </Label>
              <div className="text-sm text-muted-foreground">
                활성화 시 재고 거래 내역 기록, 매출 관리, 출고 관리 기능이 추가됩니다
              </div>
            </div>
            <Switch
              id="erp-enabled"
              checked={erpEnabled}
              onCheckedChange={handleErpToggle}
              disabled={updateSetting.isPending}
            />
          </div>

          {erpEnabled && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                ERP 모듈 활성화됨
              </h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• 재고 거래 내역 기록 (입고/출고)</li>
                <li>• 매출 관리 기능</li>
                <li>• 재고 소비 패턴 분석 (실제 데이터 기반)</li>
                <li>• 재고 예측 알고리즘 고도화</li>
              </ul>
            </div>
          )}

          {!erpEnabled && (
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                💡 ERP 모듈을 비활성화하면 HACCP 전용 시스템으로 사용할 수 있습니다.
                재고 거래 내역 기록 및 매출 관리 기능이 메뉴에서 숨겨집니다.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 추가 설정 카드 (향후 확장) */}
      <Card>
        <CardHeader>
          <CardTitle>기타 설정</CardTitle>
          <CardDescription>
            추가 시스템 설정 항목이 여기에 표시됩니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            현재 사용 가능한 추가 설정이 없습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  
    </DashboardLayout>
  );
}
