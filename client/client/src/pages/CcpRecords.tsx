import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Link } from "wouter";
import { FileDown, Filter } from "lucide-react";
import { toast } from "sonner";

export default function CcpRecords() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [filters, setFilters] = useState<{
    ccpType?: string;
    status?: "draft" | "submitted" | "approved" | "rejected";
    startDate?: string;
    endDate?: string;
    productId?: number;
  }>({});
  const [showFilters, setShowFilters] = useState(false);

  // CCP 기록 조회
  const { data: ccpRecords, isLoading } = trpc.ccp.getAllRecords.useQuery({
    ccpType: filters.ccpType,
    status: filters.status,
  });
  
  // 제품 목록 조회
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);
  
  // Excel export mutation
  const exportMutation = trpc.ccp.exportInspectionHistory.useMutation({
    onSuccess: (result) => {
      // Base64를 Blob으로 변환하여 다운로드
      const byteCharacters = atob(result.file);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { 
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel 파일이 다운로드되었습니다");
    },
    onError: (error) => {
      toast.error(`Export 실패: ${error.message}`);
    },
  });

  // CCP 유형별 필터링
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "all") {
      setFilters((prev) => ({ ...prev, ccpType: undefined }));
    } else {
      setFilters((prev) => ({ ...prev, ccpType: value }));
    }
  };
  
  // 필터 적용
  const handleApplyFilters = () => {
    // 필터가 적용되면 자동으로 쿼리가 재실행됨
    setShowFilters(false);
  };
  
  // 필터 초기화
  const handleResetFilters = () => {
    setFilters({});
    setActiveTab("all");
  };
  
  // Excel export 실행
  const handleExport = () => {
    exportMutation.mutate({
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      ccpType: filters.ccpType,
    });
  };
  
  // 필터링된 레코드
  const filteredRecords = ccpRecords?.filter((record) => {
    if (filters.startDate && record.workDate) {
      if (new Date(record.workDate) < new Date(filters.startDate)) {
        return false;
      }
    }
    if (filters.endDate && record.workDate) {
      if (new Date(record.workDate) > new Date(filters.endDate)) {
        return false;
      }
    }
    // productId 필터는 현재 record에 없으므로 주석 처리
    // if (filters.productId && record.productId !== filters.productId) {
    //   return false;
    // }
    return true;
  });

  // 상태별 배지 색상
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-500";
      case "submitted":
        return "bg-blue-500";
      case "approved":
        return "bg-green-500";
      case "rejected":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  // 상태 한글 변환
  const getStatusText = (status: string) => {
    switch (status) {
      case "draft":
        return "작성중";
      case "submitted":
        return "제출됨";
      case "approved":
        return "승인됨";
      case "rejected":
        return "반려됨";
      default:
        return status;
    }
  };

  return (
    

    <div className="container py-4 md:py-6">
      <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">CCP 기록 목록</h1>
          <p className="text-sm md:text-base text-muted-foreground">모든 배치의 CCP 기록을 조회합니다</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="min-h-[44px] min-w-[44px]"
          >
            <Filter className="mr-0 md:mr-2 h-5 w-5" />
            <span className="hidden md:inline">필터</span>
          </Button>
          <Button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="min-h-[44px]"
          >
            <FileDown className="mr-2 h-5 w-5" />
            <span className="hidden sm:inline">Excel </span>내보내기
          </Button>
        </div>
      </div>
      
      {/* 필터 패널 */}
      {showFilters && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>필터 옵션</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="startDate" className="text-sm md:text-base">시작일</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={filters.startDate || ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="min-h-[44px] text-base"
                />
              </div>
              <div>
                <Label htmlFor="endDate" className="text-sm md:text-base">종료일</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={filters.endDate || ""}
                  onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="min-h-[44px] text-base"
                />
              </div>
              <div>
                <Label htmlFor="productFilter">제품</Label>
                <Select
                  value={filters.productId?.toString() || "all"}
                  onValueChange={(value) => 
                    setFilters((prev) => ({ 
                      ...prev, 
                      productId: value === "all" ? undefined : parseInt(value) 
                    }))
                  }
                >
                  <SelectTrigger id="productFilter">
                    <SelectValue placeholder="제품 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id.toString()}>
                        {product.productName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="statusFilter">상태</Label>
                <Select
                  value={filters.status || "all"}
                  onValueChange={(value) => 
                    setFilters((prev) => ({ 
                      ...prev, 
                      status: value === "all" ? undefined : value as any
                    }))
                  }
                >
                  <SelectTrigger id="statusFilter">
                    <SelectValue placeholder="상태 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="draft">작성중</SelectItem>
                    <SelectItem value="submitted">제출됨</SelectItem>
                    <SelectItem value="approved">승인됨</SelectItem>
                    <SelectItem value="rejected">반려됨</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleApplyFilters} className="min-h-[44px] flex-1 md:flex-none">적용</Button>
              <Button variant="outline" onClick={handleResetFilters} className="min-h-[44px] flex-1 md:flex-none">초기화</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-full md:w-auto min-w-max">
            <TabsTrigger value="all" className="min-h-[44px] text-sm md:text-base">전체</TabsTrigger>
            <TabsTrigger value="CCP-1B" className="min-h-[44px] text-sm md:text-base">CCP-1B</TabsTrigger>
            <TabsTrigger value="CCP-2B" className="min-h-[44px] text-sm md:text-base">CCP-2B</TabsTrigger>
            <TabsTrigger value="CCP-3B" className="min-h-[44px] text-sm md:text-base">CCP-3B</TabsTrigger>
            <TabsTrigger value="CCP-4P" className="min-h-[44px] text-sm md:text-base">CCP-4P</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">로딩 중...</p>
            </div>
          ) : !filteredRecords || filteredRecords.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">CCP 기록이 없습니다</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredRecords.map((record) => (
                <Card key={record.id}>
                  <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <CardTitle className="text-base md:text-lg">
                        {record.ccpType} - {record.productName || "제품 미지정"}
                      </CardTitle>
                      <Badge className={getStatusBadgeColor(record.status)}>
                        {getStatusText(record.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-xs md:text-sm text-muted-foreground">배치 코드</p>
                        <p className="font-medium text-sm md:text-base">{record.batchCode || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-xs md:text-sm text-muted-foreground">작업일</p>
                        <p className="font-medium text-sm md:text-base">
                          {record.workDate
                            ? new Date(record.workDate).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs md:text-sm text-muted-foreground">생성일</p>
                        <p className="font-medium text-sm md:text-base">
                          {new Date(record.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-end justify-start sm:justify-end">
                        <Link href={`/ccp-inspection/${record.id}`}>
                          <Button variant="outline" size="sm" className="min-h-[44px] w-full sm:w-auto">
                            상세보기
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  
    
  );
}
