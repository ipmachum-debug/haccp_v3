import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Package, TrendingUp, AlertTriangle, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings } from "lucide-react";

export default function InventoryTurnoverDashboard() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [thresholdDays, setThresholdDays] = useState(90);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [thresholdRate, setThresholdRate] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(true);
  
  // 재고 회전율 조회
  const { data: turnoverData, isLoading: isLoadingTurnover } = trpc.inventory.getTurnoverRate.useQuery({
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });
  
  // 장기 재고 항목 조회
  const { data: slowMovingItems, isLoading: isLoadingSlowMoving } = trpc.inventory.getSlowMovingItems.useQuery({
    thresholdDays,
  });
  
  // 재고 회전율 임계값 설정 조회
  const { data: turnoverSettings } = trpc.inventory.getTurnoverSettings.useQuery();
  
  // 재고 회전율 임계값 설정 mutation
  const setThresholdMutation = trpc.inventory.setTurnoverThreshold.useMutation({
    onSuccess: () => {
      alert("재고 회전율 임계값이 설정되었습니다.");
      setIsSettingsOpen(false);
      setSelectedMaterialId(null);
      setThresholdRate("");
      setAlertEnabled(true);
    },
    onError: (error: any) => {
      alert(`설정 실패: ${error.message}`);
    },
  });
  
  // 재고 회전율 자동 알림 생성 mutation
  const checkAlertsMutation = trpc.inventory.checkAndCreateTurnoverAlerts.useMutation({
    onSuccess: (data: any) => {
      alert(`재고 회전율 자동 알림 생성 완료: ${data.alertsCreated}개 생성`);
    },
    onError: (error: any) => {
      alert(`알림 생성 실패: ${error.message}`);
    },
  });
  
  const handleSetThreshold = () => {
    if (!selectedMaterialId || !thresholdRate) {
      alert("원재료와 임계값을 모두 입력해주세요.");
      return;
    }
    setThresholdMutation.mutate({
      materialId: selectedMaterialId,
      thresholdRate: parseFloat(thresholdRate),
      alertEnabled,
    });
  };
  
  // 차트 색상
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
  
  // 회전율 상태 배지
  const getTurnoverBadge = (rate: number) => {
    if (rate >= 2) {
      return <Badge className="bg-green-500">우수</Badge>;
    } else if (rate >= 1) {
      return <Badge className="bg-blue-500">양호</Badge>;
    } else if (rate >= 0.5) {
      return <Badge className="bg-yellow-500">보통</Badge>;
    } else {
      return <Badge className="bg-red-500">부진</Badge>;
    }
  };
  
  // 상위 10개 원재료
  const top10Materials = turnoverData?.slice(0, 10) || [];
  
  // 하위 10개 원재료 (장기 재고 위험)
  const bottom10Materials = turnoverData?.slice(-10).reverse() || [];
  
  return (
    <DashboardLayout>
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>재고 회전율 알림 설정</DialogTitle>
            <DialogDescription>
              원재료별 재고 회전율 임계값을 설정하면, 임계값 이하로 떨어질 경우 자동으로 알림이 생성됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="material">원재료</Label>
              <select
                id="material"
                className="w-full border rounded-md p-2"
                value={selectedMaterialId || ""}
                onChange={(e) => setSelectedMaterialId(Number(e.target.value))}
              >
                <option value="">원재료를 선택하세요</option>
                {turnoverData?.map((item: any) => (
                  <option key={item.materialId} value={item.materialId}>
                    {item.materialName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="thresholdRate">임계값 (회전율)</Label>
              <Input
                id="thresholdRate"
                type="number"
                step="0.1"
                placeholder="예: 0.5"
                value={thresholdRate}
                onChange={(e) => setThresholdRate(e.target.value)}
              />
              <p className="text-sm text-muted-foreground mt-1">
                설정한 값 이하로 회전율이 떨어지면 알림이 생성됩니다.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="alertEnabled"
                checked={alertEnabled}
                onChange={(e) => setAlertEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="alertEnabled" className="text-sm font-normal">
                자동 알림 활성화 (임계값 이하 시 자동으로 알림 생성)
              </Label>
            </div>
            {turnoverSettings && turnoverSettings.length > 0 && (
              <div>
                <Label>현재 설정된 임계값</Label>
                <div className="mt-2 space-y-2">
                  {turnoverSettings.map((setting: any) => (
                    <div key={setting.id} className="flex justify-between items-center text-sm">
                      <span>{setting.materialName}</span>
                      <Badge>{setting.thresholdRate}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSetThreshold} disabled={setThresholdMutation.isPending}>
              {setThresholdMutation.isPending ? "설정 중..." : "설정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex flex-col gap-6">
        {/* 헤더 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">재고 회전율 분석</h1>
            <p className="text-muted-foreground mt-1">원재료별 재고 회전율을 분석하여 재고 관리를 최적화하세요</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => checkAlertsMutation.mutate()} disabled={checkAlertsMutation.isPending} variant="outline">
              {checkAlertsMutation.isPending ? "처리 중..." : "재고 회전율 알림 수동 실행"}
            </Button>
            <Button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              알림 설정
            </Button>
          </div>
        </div>
        
        {/* 필터 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              기간 설정
            </CardTitle>
            <CardDescription>분석 기간을 설정하세요 (기본: 최근 1년)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="startDate">시작일</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="endDate">종료일</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="thresholdDays">장기 재고 기준 (일)</Label>
                <Input
                  id="thresholdDays"
                  type="number"
                  value={thresholdDays}
                  onChange={(e) => setThresholdDays(parseInt(e.target.value) || 90)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* 요약 통계 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 회전율</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {turnoverData && turnoverData.length > 0
                  ? (turnoverData.reduce((sum: any, item: any) => sum + item.turnoverRate, 0) / turnoverData.length).toFixed(2)
                  : "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">회/기간</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 원재료 수</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{turnoverData?.length || 0}</div>
              <p className="text-xs text-muted-foreground">개</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">장기 재고 항목</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{slowMovingItems?.length || 0}</div>
              <p className="text-xs text-muted-foreground">{thresholdDays}일 이상 보관</p>
            </CardContent>
          </Card>
        </div>
        
        {/* 회전율 상위 10개 */}
        <Card>
          <CardHeader>
            <CardTitle>회전율 상위 10개 원재료</CardTitle>
            <CardDescription>가장 빠르게 소진되는 원재료입니다</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTurnover ? (
              <div className="text-center py-12">로딩 중...</div>
            ) : top10Materials.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">데이터가 없습니다</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={top10Materials}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="materialName" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="turnoverRate" fill="#3b82f6" name="회전율" />
                  </BarChart>
                </ResponsiveContainer>
                
                <div className="mt-6 space-y-2">
                  {top10Materials.map((item: any, index: any) => (
                    <div key={item.materialId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold text-muted-foreground">#{index + 1}</div>
                        <div>
                          <div className="font-medium">{item.materialName}</div>
                          <div className="text-sm text-muted-foreground">
                            현재 재고: {item.currentStock.toLocaleString()} | 평균 재고: {item.avgStock.toFixed(1)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold">{item.turnoverRate}회</div>
                          <div className="text-sm text-muted-foreground">{item.turnoverDays.toFixed(0)}일/회</div>
                        </div>
                        {getTurnoverBadge(item.turnoverRate)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* 회전율 하위 10개 (장기 재고 위험) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              회전율 하위 10개 원재료 (장기 재고 위험)
            </CardTitle>
            <CardDescription>재고 회전이 느린 원재료로 재고 관리 개선이 필요합니다</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTurnover ? (
              <div className="text-center py-12">로딩 중...</div>
            ) : bottom10Materials.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">데이터가 없습니다</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={bottom10Materials}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="materialName" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="turnoverRate" fill="#ef4444" name="회전율" />
                  </BarChart>
                </ResponsiveContainer>
                
                <div className="mt-6 space-y-2">
                  {bottom10Materials.map((item: any, index: any) => (
                    <div key={item.materialId} className="flex items-center justify-between p-3 border rounded-lg bg-red-50">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold text-muted-foreground">#{index + 1}</div>
                        <div>
                          <div className="font-medium">{item.materialName}</div>
                          <div className="text-sm text-muted-foreground">
                            현재 재고: {item.currentStock.toLocaleString()} | 평균 재고: {item.avgStock.toFixed(1)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold">{item.turnoverRate}회</div>
                          <div className="text-sm text-muted-foreground">
                            {item.turnoverDays > 0 ? `${item.turnoverDays.toFixed(0)}일/회` : "회전 없음"}
                          </div>
                        </div>
                        {getTurnoverBadge(item.turnoverRate)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* 장기 재고 LOT 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              장기 재고 LOT 목록
            </CardTitle>
            <CardDescription>{thresholdDays}일 이상 보관 중인 LOT입니다</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSlowMoving ? (
              <div className="text-center py-12">로딩 중...</div>
            ) : !slowMovingItems || slowMovingItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">장기 재고 항목이 없습니다</div>
            ) : (
              <div className="space-y-2">
                {slowMovingItems.map((item: any) => (
                  <div key={item.lotId} className="flex items-center justify-between p-3 border rounded-lg bg-orange-50">
                    <div>
                      <div className="font-medium">{item.materialName}</div>
                      <div className="text-sm text-muted-foreground">LOT: {item.lotNumber}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-semibold">{item.currentQuantity.toLocaleString()}</div>
                        <div className="text-sm text-muted-foreground">
                          {item.daysSinceCreation}일 경과
                        </div>
                      </div>
                      <Badge className="bg-orange-500">{item.daysSinceCreation}일</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
