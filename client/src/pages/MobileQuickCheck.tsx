import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ClipboardCheck, Package, Search, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

export default function MobileQuickCheck() {
  const [activeTab, setActiveTab] = useState<"ccp" | "inventory">("ccp");
  const [searchQuery, setSearchQuery] = useState("");

  // CCP 점검 현황 조회
  const { data: ccpSchedules } = trpc.dashboard.getTodaySchedules.useQuery();
  
  // 재고 조회
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);

  // 필터링된 데이터
  const filteredCcp = ccpSchedules?.filter((schedule: any) =>
    schedule.ccpName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMaterials = materials?.filter((material: any) =>
    material.materialName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.materialCode?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>

    <div className="min-h-screen bg-background pb-20">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground p-4 shadow-md">
        <h1 className="text-xl font-bold">빠른 점검</h1>
        <p className="text-sm opacity-90">현장 작업자 전용 간편 점검 도구</p>
      </div>

      {/* 탭 버튼 */}
      <div className="grid grid-cols-2 gap-2 p-4">
        <Button
          variant={activeTab === "ccp" ? "default" : "outline"}
          onClick={() => {
            setActiveTab("ccp");
            setSearchQuery("");
          }}
          className="h-16 flex flex-col items-center justify-center gap-1"
        >
          <ClipboardCheck className="h-6 w-6" />
          <span className="text-sm font-semibold">CCP 점검</span>
        </Button>
        <Button
          variant={activeTab === "inventory" ? "default" : "outline"}
          onClick={() => {
            setActiveTab("inventory");
            setSearchQuery("");
          }}
          className="h-16 flex flex-col items-center justify-center gap-1"
        >
          <Package className="h-6 w-6" />
          <span className="text-sm font-semibold">재고 확인</span>
        </Button>
      </div>

      {/* 검색 */}
      <div className="px-4 pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={activeTab === "ccp" ? "CCP 이름 검색..." : "원재료 이름 또는 코드 검색..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 text-base"
          />
        </div>
      </div>

      {/* CCP 점검 탭 */}
      {activeTab === "ccp" && (
        <div className="px-4 space-y-3">
          {filteredCcp && filteredCcp.length > 0 ? (
            filteredCcp.map((schedule: any) => (
              <Card key={schedule.id} className="border-2">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{schedule.ccpName}</CardTitle>
                      <CardDescription className="mt-1">
                        {schedule.productName}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        schedule.status === "completed"
                          ? "default"
                          : schedule.status === "in_progress"
                          ? "secondary"
                          : "outline"
                      }
                      className="ml-2"
                    >
                      {schedule.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {schedule.status === "in_progress" && <AlertCircle className="h-3 w-3 mr-1" />}
                      {schedule.status === "pending" && <XCircle className="h-3 w-3 mr-1" />}
                      {schedule.status === "completed" ? "완료" : schedule.status === "in_progress" ? "진행중" : "대기"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">점검 시간</span>
                      <span className="font-medium">{schedule.scheduledTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">담당자</span>
                      <span className="font-medium">{schedule.assignedTo || "미지정"}</span>
                    </div>
                  </div>
                  <Button
                    className="w-full mt-4 h-12 text-base"
                    onClick={() => {
                      toast.info("CCP 점검 화면으로 이동합니다");
                      window.location.href = `/dashboard/ccp-inspection`;
                    }}
                  >
                    점검 시작
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>오늘 예정된 CCP 점검이 없습니다</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 재고 확인 탭 */}
      {activeTab === "inventory" && (
        <div className="px-4 space-y-3">
          {filteredMaterials && filteredMaterials.length > 0 ? (
            filteredMaterials.map((material: any) => {
              const safetyStock = Number(material.safetyStockLevel) || 0;
              const currentStock = 0; // 현재 재고는 hInventory 테이블에서 조회 필요
              const isLowStock = currentStock < safetyStock;

              return (
                <Card key={material.id} className={`border-2 ${isLowStock ? "border-red-500" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{material.materialName}</CardTitle>
                        <CardDescription className="mt-1">
                          코드: {material.materialCode}
                        </CardDescription>
                      </div>
                      {isLowStock && (
                        <Badge variant="destructive" className="ml-2">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          부족
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">현재 재고</span>
                        <span className={`text-2xl font-bold ${isLowStock ? "text-red-500" : "text-green-600"}`}>
                          {currentStock} {material.unit || "개"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">안전 재고</span>
                        <span className="font-medium">{safetyStock} {material.unit || "개"}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">카테고리</span>
                        <span className="font-medium">{material.category || "미분류"}</span>
                      </div>
                    </div>
                    {isLowStock && (
                      <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                        <p className="text-sm text-red-700 dark:text-red-300">
                          ⚠️ 안전 재고 수준 이하입니다. 발주가 필요합니다.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>등록된 원재료가 없습니다</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  
    </DashboardLayout>
  );
}
