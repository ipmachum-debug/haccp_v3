import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import DailyCloseTab from "@/components/closing/DailyCloseTab";
import MonthlyCloseTab from "@/components/closing/MonthlyCloseTab";
import MonthlySummaryTab from "@/components/closing/MonthlySummaryTab";

export default function ClosingManagement() {
  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">마감 관리</h1>
          <p className="text-muted-foreground mt-2">
            일일 마감, 월간 마감, 월 마감 관리를 통합적으로 수행합니다.
          </p>
        </div>
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="daily">일일 마감</TabsTrigger>
            <TabsTrigger value="monthly">월간 마감</TabsTrigger>
            <TabsTrigger value="summary">월 마감 관리</TabsTrigger>
          </TabsList>
          <Card className="mt-6 p-6">
            <TabsContent value="daily" className="mt-0">
              <DailyCloseTab />
            </TabsContent>
            <TabsContent value="monthly" className="mt-0">
              <MonthlyCloseTab />
            </TabsContent>
            <TabsContent value="summary" className="mt-0">
              <MonthlySummaryTab />
            </TabsContent>
          </Card>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
