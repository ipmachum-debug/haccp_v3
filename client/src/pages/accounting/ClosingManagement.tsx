import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DailyCloseTab from "@/components/closing/DailyCloseTab";
import MonthlyCloseTab from "@/components/closing/MonthlyCloseTab";
import MonthlySummaryTab from "@/components/closing/MonthlySummaryTab";
import { CalendarCheck, CalendarRange, BarChart3, ClipboardCheck } from "lucide-react";

export default function ClosingManagement() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">마감 관리</h1>
            <p className="text-sm text-muted-foreground">일일 마감, 월간 마감, 월 마감 관리를 통합적으로 수행합니다.</p>
          </div>
        </div>

        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-11">
            <TabsTrigger value="daily" className="gap-2 data-[state=active]:bg-background">
              <CalendarCheck className="h-4 w-4" />
              일일 마감
            </TabsTrigger>
            <TabsTrigger value="monthly" className="gap-2 data-[state=active]:bg-background">
              <CalendarRange className="h-4 w-4" />
              월간 마감
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-2 data-[state=active]:bg-background">
              <BarChart3 className="h-4 w-4" />
              월 마감 관리
            </TabsTrigger>
          </TabsList>
          <div className="mt-6">
            <TabsContent value="daily" className="mt-0">
              <DailyCloseTab />
            </TabsContent>
            <TabsContent value="monthly" className="mt-0">
              <MonthlyCloseTab />
            </TabsContent>
            <TabsContent value="summary" className="mt-0">
              <MonthlySummaryTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
