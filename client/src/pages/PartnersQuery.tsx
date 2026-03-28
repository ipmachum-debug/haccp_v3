import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsTrigger, TabsList } from "@/components/ui/tabs";
import {
  Download,
  Search,
  FileText,
  Users,
  ShoppingCart,
  TrendingUp,
  Wallet,
  RotateCcw,
  ArrowUpDown,
  Building2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

import { todayLocal } from "../lib/dateUtils";

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
  const [partnerSearch, setPartnerSearch] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"all" | "purchases" | "sales" | "balance">("all");
  const [sortField, setSortField] = useState<string>("partnerName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // 거래처 목록 조회
  const { data: partners = [] } = trpc.partners.list.useQuery();

  // 매입/매출 거래 조회
  const { data: purchases = [] } = trpc.haccpIntegration.getAllPurchases.useQuery();
  const { data: sales = [] } = trpc.haccpIntegration.getAllSales.useQuery();

  // 날짜 필터링
  const filterByDate = (transactions: any[]) => {
    return transactions.filter((t: any) => {
      const d = new Date(t.transactionDate);
      if (startDate && d < new Date(startDate)) return false;
      if (endDate && d > new Date(endDate)) return false;
      return true;
    });
  };

  // 거래처별 집계
  const partnerAggregates = useMemo(() => {
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

    filteredPurchases.forEach((p: any) => {
      if (!p.partnerId) return;
      const existing = partnerMap.get(p.partnerId) || {
        partnerId: p.partnerId, partnerName: p.partnerName || "-",
        purchaseAmount: 0, purchaseCount: 0, saleAmount: 0, saleCount: 0, balance: 0,
      };
      existing.purchaseAmount += Number(p.amount || 0) + Number(p.taxAmount || 0);
      existing.purchaseCount += 1;
      partnerMap.set(p.partnerId, existing);
    });

    filteredSales.forEach((s: any) => {
      if (!s.partnerId) return;
      const existing = partnerMap.get(s.partnerId) || {
        partnerId: s.partnerId, partnerName: s.partnerName || "-",
        purchaseAmount: 0, purchaseCount: 0, saleAmount: 0, saleCount: 0, balance: 0,
      };
      existing.saleAmount += Number(s.amount || 0) + Number(s.taxAmount || 0);
      existing.saleCount += 1;
      partnerMap.set(s.partnerId, existing);
    });

    partnerMap.forEach((v) => { v.balance = v.saleAmount - v.purchaseAmount; });

    let result = Array.from(partnerMap.values());

    // 거래처명 검색 필터
    if (partnerSearch) {
      result = result.filter((p) => p.partnerName.toLowerCase().includes(partnerSearch.toLowerCase()));
    }

    // 정렬
    result.sort((a: any, b: any) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [purchases, sales, startDate, endDate, partnerSearch, sortField, sortDirection]);

  // KPI 계산
  const kpiData = useMemo(() => {
    const totalPartners = partnerAggregates.length;
    const totalPurchase = partnerAggregates.reduce((s, p) => s + p.purchaseAmount, 0);
    const totalSale = partnerAggregates.reduce((s, p) => s + p.saleAmount, 0);
    const netBalance = totalSale - totalPurchase;
    return { totalPartners, totalPurchase, totalSale, netBalance };
  }, [partnerAggregates]);

  // 정렬 토글
  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // 필터 초기화
  const handleResetFilters = () => {
    setStartDate("");
    setEndDate("");
    setPartnerSearch("");
  };

  // 엑셀 다운로드
  const handleExcelDownload = () => {
    let excelData: any[] = [];
    let sheetName = "";

    const getTabData = () => {
      switch (activeTab) {
        case "purchases":
          return {
            data: partnerAggregates.filter((p) => p.purchaseCount > 0).map((p) => ({
              거래처명: p.partnerName, 매입금액: p.purchaseAmount, 매입건수: p.purchaseCount,
            })),
            sheet: "매입조회",
          };
        case "sales":
          return {
            data: partnerAggregates.filter((p) => p.saleCount > 0).map((p) => ({
              거래처명: p.partnerName, 매출금액: p.saleAmount, 매출건수: p.saleCount,
            })),
            sheet: "매출조회",
          };
        case "balance":
          return {
            data: partnerAggregates.map((p) => ({
              거래처명: p.partnerName, 잔액: p.balance,
            })),
            sheet: "잔액조회",
          };
        default:
          return {
            data: partnerAggregates.map((p) => ({
              거래처명: p.partnerName, 매입금액: p.purchaseAmount, 매입건수: p.purchaseCount,
              매출금액: p.saleAmount, 매출건수: p.saleCount, 잔액: p.balance,
            })),
            sheet: "전체조회",
          };
      }
    };

    const { data, sheet } = getTabData();
    excelData = data;
    sheetName = sheet;

    if (excelData.length === 0) {
      toast({ title: "다운로드 실패", description: "다운로드할 데이터가 없습니다.", variant: "destructive" });
      return;
    }

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `거래처조회_${sheetName}_${todayLocal()}.xlsx`);
    toast({ title: "다운로드 완료", description: "엑셀 파일이 다운로드되었습니다." });
  };

  const formatCurrency = (value: number) => value.toLocaleString();

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <button
      className="flex items-center gap-1 text-xs font-semibold hover:text-foreground transition-colors"
      onClick={() => toggleSort(field)}
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "text-primary" : "text-muted-foreground/50"}`} />
    </button>
  );

  // 탭별 합계 행 계산
  const purchasePartners = partnerAggregates.filter((p) => p.purchaseCount > 0);
  const salesPartners = partnerAggregates.filter((p) => p.saleCount > 0);

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">거래처 조회</h1>
            <p className="text-sm text-muted-foreground">거래처별 매입/매출 현황을 조회합니다.</p>
          </div>
        </div>
      </div>

      {/* KPI 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">총 거래처</p>
                <p className="text-2xl font-bold">{kpiData.totalPartners}<span className="text-sm font-normal text-muted-foreground ml-1">곳</span></p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-50 text-purple-500">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">총 매입</p>
                <p className="text-2xl font-bold">{formatCurrency(kpiData.totalPurchase)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span></p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">총 매출</p>
                <p className="text-2xl font-bold">{formatCurrency(kpiData.totalSale)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span></p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${kpiData.netBalance >= 0 ? "border-l-green-500" : "border-l-red-500"}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">순 잔액</p>
                <p className={`text-2xl font-bold ${kpiData.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(kpiData.netBalance)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span>
                </p>
              </div>
              <div className={`flex h-9 w-9 items-center justify-center rounded-full ${kpiData.netBalance >= 0 ? "bg-green-50 text-green-500" : "bg-red-50 text-red-500"}`}>
                <Wallet className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 카드 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              조회 조건
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={handleResetFilters} className="text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              초기화
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">거래처명 검색</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="거래처명 검색..." value={partnerSearch} onChange={(e) => setPartnerSearch(e.target.value)} className="pl-8" />
              </div>
            </div>
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
          <TabsTrigger value="all" className="gap-1.5">
            전체 조회
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{partnerAggregates.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="purchases" className="gap-1.5">
            매입 조회
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{purchasePartners.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-1.5">
            매출 조회
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{salesPartners.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="balance" className="gap-1.5">
            잔액 조회
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{partnerAggregates.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* 전체 조회 */}
        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  전체 조회 (매입 + 매출)
                </CardTitle>
                <span className="text-sm text-muted-foreground">총 {partnerAggregates.length}개 거래처</span>
              </div>
            </CardHeader>
            <CardContent>
              {partnerAggregates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Users className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-base font-medium">조회된 거래처가 없습니다.</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead><SortHeader field="partnerName">거래처명</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="purchaseAmount">매입금액</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="purchaseCount">매입건수</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="saleAmount">매출금액</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="saleCount">매출건수</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="balance">잔액</SortHeader></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerAggregates.map((p) => (
                        <TableRow key={p.partnerId} className="hover:bg-muted/20">
                          <TableCell className="font-medium">{p.partnerName}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(p.purchaseAmount)}원</TableCell>
                          <TableCell className="text-right tabular-nums">{p.purchaseCount}건</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(p.saleAmount)}원</TableCell>
                          <TableCell className="text-right tabular-nums">{p.saleCount}건</TableCell>
                          <TableCell className={`text-right tabular-nums font-semibold ${p.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(p.balance)}원
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* 합계 행 */}
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell>합계</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(kpiData.totalPurchase)}원</TableCell>
                        <TableCell className="text-right tabular-nums">{partnerAggregates.reduce((s, p) => s + p.purchaseCount, 0)}건</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(kpiData.totalSale)}원</TableCell>
                        <TableCell className="text-right tabular-nums">{partnerAggregates.reduce((s, p) => s + p.saleCount, 0)}건</TableCell>
                        <TableCell className={`text-right tabular-nums ${kpiData.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(kpiData.netBalance)}원
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 매입 조회 */}
        <TabsContent value="purchases" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4" />
                  매입 조회
                </CardTitle>
                <span className="text-sm text-muted-foreground">총 {purchasePartners.length}개 거래처</span>
              </div>
            </CardHeader>
            <CardContent>
              {purchasePartners.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-base font-medium">조회된 매입 거래처가 없습니다.</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead><SortHeader field="partnerName">거래처명</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="purchaseAmount">매입금액</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="purchaseCount">매입건수</SortHeader></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchasePartners.map((p) => (
                        <TableRow key={p.partnerId} className="hover:bg-muted/20">
                          <TableCell className="font-medium">{p.partnerName}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(p.purchaseAmount)}원</TableCell>
                          <TableCell className="text-right tabular-nums">{p.purchaseCount}건</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell>합계</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(purchasePartners.reduce((s, p) => s + p.purchaseAmount, 0))}원</TableCell>
                        <TableCell className="text-right tabular-nums">{purchasePartners.reduce((s, p) => s + p.purchaseCount, 0)}건</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 매출 조회 */}
        <TabsContent value="sales" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" />
                  매출 조회
                </CardTitle>
                <span className="text-sm text-muted-foreground">총 {salesPartners.length}개 거래처</span>
              </div>
            </CardHeader>
            <CardContent>
              {salesPartners.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-base font-medium">조회된 매출 거래처가 없습니다.</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead><SortHeader field="partnerName">거래처명</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="saleAmount">매출금액</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="saleCount">매출건수</SortHeader></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesPartners.map((p) => (
                        <TableRow key={p.partnerId} className="hover:bg-muted/20">
                          <TableCell className="font-medium">{p.partnerName}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(p.saleAmount)}원</TableCell>
                          <TableCell className="text-right tabular-nums">{p.saleCount}건</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell>합계</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(salesPartners.reduce((s, p) => s + p.saleAmount, 0))}원</TableCell>
                        <TableCell className="text-right tabular-nums">{salesPartners.reduce((s, p) => s + p.saleCount, 0)}건</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 잔액 조회 */}
        <TabsContent value="balance" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4" />
                  잔액 조회
                </CardTitle>
                <span className="text-sm text-muted-foreground">총 {partnerAggregates.length}개 거래처</span>
              </div>
            </CardHeader>
            <CardContent>
              {partnerAggregates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Wallet className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-base font-medium">조회된 거래처가 없습니다.</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead><SortHeader field="partnerName">거래처명</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="purchaseAmount">매입 합계</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="saleAmount">매출 합계</SortHeader></TableHead>
                        <TableHead className="text-right"><SortHeader field="balance">잔액 (매출-매입)</SortHeader></TableHead>
                        <TableHead className="w-[200px]">비율</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerAggregates.map((p) => {
                        const maxVal = Math.max(kpiData.totalSale, kpiData.totalPurchase) || 1;
                        const balancePercent = Math.abs(p.balance) / maxVal * 100;
                        return (
                          <TableRow key={p.partnerId} className="hover:bg-muted/20">
                            <TableCell className="font-medium">{p.partnerName}</TableCell>
                            <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency(p.purchaseAmount)}원</TableCell>
                            <TableCell className="text-right tabular-nums text-emerald-600">{formatCurrency(p.saleAmount)}원</TableCell>
                            <TableCell className={`text-right tabular-nums font-semibold ${p.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {p.balance >= 0 ? "+" : ""}{formatCurrency(p.balance)}원
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${p.balance >= 0 ? "bg-green-400" : "bg-red-400"}`}
                                    style={{ width: `${Math.min(balancePercent, 100)}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell>합계</TableCell>
                        <TableCell className="text-right tabular-nums text-blue-600">{formatCurrency(kpiData.totalPurchase)}원</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">{formatCurrency(kpiData.totalSale)}원</TableCell>
                        <TableCell className={`text-right tabular-nums ${kpiData.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {kpiData.netBalance >= 0 ? "+" : ""}{formatCurrency(kpiData.netBalance)}원
                        </TableCell>
                        <TableCell />
                      </TableRow>
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
