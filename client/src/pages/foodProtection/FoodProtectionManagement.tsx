/**
 * 식품방어·문화 통합 관리 — Phase Y-10
 *
 * FSSC 22000 v6 필수 추가요건 3종을 하나의 메뉴 + 탭으로 통합.
 *   - 식품방어 (TACCP)     — §2.5.3 / PAS 96
 *   - 식품사기 완화 (VACCP) — §2.5.4 / GFSI
 *   - 식품안전문화          — §2.5.1 / GFSI
 *
 * 각 탭은 기존 industry-aware 페이지를 embedded 모드로 재사용.
 * 직접 URL(/dashboard/food/food-defense 등)은 App.tsx 에 유지 (하위 호환).
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, SearchCheck, Users, Info } from "lucide-react";
import FoodDefensePage from "@/pages/foodDefense/FoodDefensePage";
import FoodFraudPage from "@/pages/foodFraud/FoodFraudPage";
import FoodSafetyCulturePage from "@/pages/foodSafetyCulture/FoodSafetyCulturePage";

export default function FoodProtectionManagement() {
  const [activeTab, setActiveTab] = useState("defense");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-2xl font-bold">식품방어·문화</h1>
          <p className="text-muted-foreground mt-1">
            FSSC 22000 v6 필수 추가요건(식품방어·식품사기 완화·식품안전문화)을 통합 관리합니다.
          </p>
        </div>

        {/* 안내 배너 */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <strong>사용 가이드:</strong> 「식품방어(TACCP)」에서 고의적 위협(오염·변조·사보타주) 평가를,
            「식품사기 완화(VACCP)」에서 경제적 동기의 사기 취약성 평가를,
            「식품안전문화」에서 6개 차원 문화 성숙도 진단을 수행합니다.
          </div>
        </div>

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-12">
            <TabsTrigger value="defense" className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" />
              식품방어 (TACCP)
            </TabsTrigger>
            <TabsTrigger value="fraud" className="flex items-center gap-2 text-sm">
              <SearchCheck className="h-4 w-4" />
              식품사기 완화 (VACCP)
            </TabsTrigger>
            <TabsTrigger value="culture" className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              식품안전문화
            </TabsTrigger>
          </TabsList>

          <TabsContent value="defense" className="mt-4">
            <FoodDefensePage industry="food" embedded />
          </TabsContent>

          <TabsContent value="fraud" className="mt-4">
            <FoodFraudPage industry="food" embedded />
          </TabsContent>

          <TabsContent value="culture" className="mt-4">
            <FoodSafetyCulturePage industry="food" embedded />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
