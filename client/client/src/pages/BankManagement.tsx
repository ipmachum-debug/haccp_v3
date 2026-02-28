import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import DashboardLayout from "@/components/DashboardLayout";
import BankAccountTab from "@/components/bank/BankAccountTab";
import BankTransactionTab from "@/components/bank/BankTransactionTab";
import MatchingRuleTab from "@/components/bank/MatchingRuleTab";

export default function BankManagement() {
  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">은행 관리</h1>
          <p className="text-muted-foreground mt-2">
            은행 계좌, 거래 내역, 매칭 규칙을 통합 관리합니다
          </p>
        </div>

        <Tabs defaultValue="accounts" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="accounts">은행 계좌 관리</TabsTrigger>
            <TabsTrigger value="transactions">은행 거래 매칭</TabsTrigger>
            <TabsTrigger value="rules">매칭 규칙 관리</TabsTrigger>
          </TabsList>

          <Card className="mt-6 p-6">
            <TabsContent value="accounts" className="mt-0">
              <BankAccountTab />
            </TabsContent>
            <TabsContent value="transactions" className="mt-0">
              <BankTransactionTab />
            </TabsContent>
            <TabsContent value="rules" className="mt-0">
              <MatchingRuleTab />
            </TabsContent>
          </Card>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
