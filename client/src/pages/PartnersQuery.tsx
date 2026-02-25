import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Download, Search, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

export default function PartnersQuery() {
  return (
    <DashboardLayout>
      <PartnersQueryContent />
    </DashboardLayout>
  );
}

function PartnersQueryContent() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"all" | "purchases" | "sales" | "balance">("all");

  // 거래처 목록 조회
  const { data: partners = [] } = trpc.partners.list.useQuery();

  // 매입 거래 조회
  const { data: purchases = [] } = trpc.haccpIntegration.getAllPurchases.useQuery();

  // 매출 거래 조회
  const { data: sales = [] } = trpc.haccpIntegration.getAllSales.useQuery();

  // 날짜 필터링 함수
  const filterByDate = (transactions: any[]) => {
    return transactions.filter((transaction: any) => {
      const transactionDate = new Date(transaction.transactionDate);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      if (start && transactionDate < start) return false;
      if (end && transactionDate > end) return false;

      return true;
    });
  };

  // 거래처별 집계 함수
  const aggregateByPartner = () => {
    const filteredPurchases = filterByDate(purchases);
    const filteredSales = filterByDate(sales);

    const partnerMap = new Map<number, {
      partnerId: number;
      partnerName: string;
      purchaseAmount: number;
      purchaseCount: number;
      saleAmount: number;
      saleCount: number;
      balance: number;
    }>();

    // 매입 집계
    filteredPurchases.forEach((purchase: any) => {
      if (!purchase.partnerId) return;
      
      const existing = partnerMap.get(purchase.partnerId) || {
        partnerId: purchase.partnerId,
        partnerName: purchase.partnerName || "-",
        purchaseAmount: 0,
        purchaseCount: 0,
        saleAmount: 0,
        saleCount: 0,
        balance: 0,
      };

      existing.purchaseAmount += Number(purchase.amount || 0) + Number(purchase.taxAmount || 0);
      existing.purchaseCount += 1;
      partnerMap.set(purchase.partnerId, existing);
    });

    // 매출 집계
    filteredSales.forEach((sale: any) => {
      if (!sale.partnerId) return;
      
      const existing = partnerMap.get(sale.partnerId) || {
        partnerId: sale.partnerId,
        partnerName: sale.partnerName || "-",
        purchaseAmount: 0,
        purchaseCount: 0,
        saleAmount: 0,
        saleCount: 0,
        balance: 0,
      };

      existing.saleAmount += Number(sale.amount || 0) + Number(sale.taxAmount || 0);
      existing.saleCount += 1;
      partnerMap.set(sale.partnerId, existing);
    });

    // 잔액 계산 (매출 - 매입)
    partnerMap.forEach((value) => {
      value.balance = value.saleAmount - value.purchaseAmount;
    });

    return Array.from(partnerMap.values());
  };

  const partnerAggregates = aggregateByPartner();

  // 엑셀 다운로드
  const handleExcelDownload = () => {
    let excelData: any[] = [];
    let sheetName = "";

    if (activeTab === "all") {
      excelData = partnerAggregates.map((partner) => ({
        거래처명: partner.partnerName,
        매입금액: partner.purchaseAmount,
        매입건수: partner.purchaseCount,
        매출금액: partner.saleAmount,
        매출건수: partner.saleCount,
        잔액: partner.balance,
      }));
      sheetName = "전체조회";
    } else if (activeTab === "purchases") {
      excelData = partnerAggregates
        .filter((p) => p.purchaseCount > 0)
        .map((partner) => ({
          거래처명: partner.partnerName,
          매입금액: partner.purchaseAmount,
          매입건수: partner.purchaseCount,
        }));
      sheetName = "매입조회";
    } else if (activeTab === "sales") {
      excelData = partnerAggregates
        .filter((p) => p.saleCount > 0)
        .map((partner) => ({
          거래처명: partner.partnerName,
          매출금액: partner.saleAmount,
          매출건수: partner.saleCount,
        }));
      sheetName = "매출조회";
    } else if (activeTab === "balance") {
      excelData = partnerAggregates.map((partner) => ({
        거래처명: partner.partnerName,
        잔액: partner.balance,
      }));
      sheetName = "잔액조회";
    }

    if (excelData.length === 0) {
      toast({
        title: "다운로드 실패",
        description: "다운로드할 데이터가 없습니다.",
        variant: "destructive",
      });
      return;
    }

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `거래처조회_${sheetName}_${new Date().toISOString().split("T")[0]}.xlsx`);

    toast({
      title: "다운로드 완료",
      description: "엑셀 파일이 다운로드되었습니다.",
    });
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">거래처 조회</h1>
      </div>

      {/* 필터 카드 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            조회 조건
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 시작일 */}
            <div className="space-y-2">
              <Label htmlFor="startDate">시작일</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* 종료일 */}
            <div className="space-y-2">
              <Label htmlFor="endDate">종료일</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* 엑셀 다운로드 버튼 */}
            <div className="flex items-end">
              <Button onClick={handleExcelDownload} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                엑셀 다운로드
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 탭 구조 */}
      <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">전체 조회</TabsTrigger>
          <TabsTrigger value="purchases">매입 조회</TabsTrigger>
          <TabsTrigger value="sales">매출 조회</TabsTrigger>
          <TabsTrigger value="balance">잔액 조회</TabsTrigger>
        </TabsList>

        {/* 전체 조회 탭 */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  전체 조회 (매입 + 매출)
                </div>
                <span className="text-sm text-muted-foreground">
                  총 {partnerAggregates.length}개 거래처
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {partnerAggregates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  조회된 거래처가 없습니다.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>거래처명</TableHead>
                        <TableHead className="text-right">매입금액</TableHead>
                        <TableHead className="text-right">매입건수</TableHead>
                        <TableHead className="text-right">매출금액</TableHead>
                        <TableHead className="text-right">매출건수</TableHead>
                        <TableHead className="text-right">잔액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerAggregates.map((partner) => (
                        <TableRow key={partner.partnerId}>
                          <TableCell>{partner.partnerName}</TableCell>
                          <TableCell className="text-right">
                            {partner.purchaseAmount.toLocaleString()}원
                          </TableCell>
                          <TableCell className="text-right">{partner.purchaseCount}건</TableCell>
                          <TableCell className="text-right">
                            {partner.saleAmount.toLocaleString()}원
                          </TableCell>
                          <TableCell className="text-right">{partner.saleCount}건</TableCell>
                          <TableCell className={`text-right font-semibold ${partner.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {partner.balance.toLocaleString()}원
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 매입 조회 탭 */}
        <TabsContent value="purchases">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  매입 조회
                </div>
                <span className="text-sm text-muted-foreground">
                  총 {partnerAggregates.filter((p) => p.purchaseCount > 0).length}개 거래처
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {partnerAggregates.filter((p) => p.purchaseCount > 0).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  조회된 매입 거래처가 없습니다.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>거래처명</TableHead>
                        <TableHead className="text-right">매입금액</TableHead>
                        <TableHead className="text-right">매입건수</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerAggregates
                        .filter((p) => p.purchaseCount > 0)
                        .map((partner) => (
                          <TableRow key={partner.partnerId}>
                            <TableCell>{partner.partnerName}</TableCell>
                            <TableCell className="text-right">
                              {partner.purchaseAmount.toLocaleString()}원
                            </TableCell>
                            <TableCell className="text-right">{partner.purchaseCount}건</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 매출 조회 탭 */}
        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  매출 조회
                </div>
                <span className="text-sm text-muted-foreground">
                  총 {partnerAggregates.filter((p) => p.saleCount > 0).length}개 거래처
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {partnerAggregates.filter((p) => p.saleCount > 0).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  조회된 매출 거래처가 없습니다.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>거래처명</TableHead>
                        <TableHead className="text-right">매출금액</TableHead>
                        <TableHead className="text-right">매출건수</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerAggregates
                        .filter((p) => p.saleCount > 0)
                        .map((partner) => (
                          <TableRow key={partner.partnerId}>
                            <TableCell>{partner.partnerName}</TableCell>
                            <TableCell className="text-right">
                              {partner.saleAmount.toLocaleString()}원
                            </TableCell>
                            <TableCell className="text-right">{partner.saleCount}건</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 잔액 조회 탭 */}
        <TabsContent value="balance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  잔액 조회
                </div>
                <span className="text-sm text-muted-foreground">
                  총 {partnerAggregates.length}개 거래처
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {partnerAggregates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  조회된 거래처가 없습니다.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>거래처명</TableHead>
                        <TableHead className="text-right">잔액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerAggregates.map((partner) => (
                        <TableRow key={partner.partnerId}>
                          <TableCell>{partner.partnerName}</TableCell>
                          <TableCell className={`text-right font-semibold ${partner.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {partner.balance.toLocaleString()}원
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
