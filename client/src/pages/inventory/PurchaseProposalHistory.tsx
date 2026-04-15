import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatLocalDate, todayLocal } from "../../lib/dateUtils";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function PurchaseProposalHistory() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return formatLocalDate(date);
  });
  const [endDate, setEndDate] = useState(() => todayLocal());
  const [selectedStatus, setSelectedStatus] = useState<
    "draft" | "submitted" | "approved" | "received" | "cancelled" | "all"
  >("all");
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | undefined>(undefined);

  // API 호출
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
  const { data: history, isLoading } = trpc.inventory.getPurchaseProposalHistory.useQuery({
    startDate,
    endDate,
    status: selectedStatus === "all" ? undefined : selectedStatus,
    materialId: selectedMaterialId,
  });

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      draft: { label: "초안", variant: "secondary" },
      submitted: { label: "제출됨", variant: "default" },
      approved: { label: "승인됨", variant: "default" },
      received: { label: "입고 완료", variant: "default" },
      cancelled: { label: "취소됨", variant: "destructive" },
    };

    const statusInfo = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const handleApplyFilters = () => {
    // 필터 적용 시 자동으로 refetch됨
  };

  return (
    <DashboardLayout>
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">발주 제안 이력 관리</h1>
          <p className="text-muted-foreground mt-2">
            승인/거부된 발주 제안의 이력을 조회하고 추적합니다
          </p>
        </div>
      </div>

      {/* 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>필터</CardTitle>
          <CardDescription>기간, 상태, 원재료를 선택하여 데이터를 필터링합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">시작일</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">종료일</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">상태</Label>
              <Select
                value={selectedStatus}
                onValueChange={(value) =>
                  setSelectedStatus(value as typeof selectedStatus)
                }
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="draft">초안</SelectItem>
                  <SelectItem value="submitted">제출됨</SelectItem>
                  <SelectItem value="approved">승인됨</SelectItem>
                  <SelectItem value="received">입고 완료</SelectItem>
                  <SelectItem value="cancelled">취소됨</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="material">원재료</Label>
              <Select
                value={selectedMaterialId?.toString() || "all"}
                onValueChange={(value) =>
                  setSelectedMaterialId(value === "all" ? undefined : parseInt(value))
                }
              >
                <SelectTrigger id="material">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {materials?.map((material: any) => (
                    <SelectItem key={material.id} value={material.id.toString()}>
                      {material.materialName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleApplyFilters} className="w-full">
                필터 적용
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 발주 제안 이력 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>발주 제안 이력</CardTitle>
          <CardDescription>발주 제안의 상세 이력 및 항목 정보</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">데이터를 불러오는 중...</p>
            </div>
          ) : history && history.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>발주 번호</TableHead>
                  <TableHead>발주일</TableHead>
                  <TableHead>공급업체</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">총 금액</TableHead>
                  <TableHead>예상 입고일</TableHead>
                  <TableHead>상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.poNumber || "-"}</TableCell>
                    <TableCell>{order.orderDate || "-"}</TableCell>
                    <TableCell>{order.supplierName}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell className="text-right">
                      {order.totalAmount ? `${parseFloat(order.totalAmount).toLocaleString()}원` : "-"}
                    </TableCell>
                    <TableCell>{order.expectedDeliveryDate || "-"}</TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            상세 보기
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>발주 제안 상세 정보</DialogTitle>
                            <DialogDescription>
                              발주 번호: {order.poNumber || "-"}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label className="text-sm font-medium">발주일</Label>
                                <p className="text-sm text-muted-foreground">{order.orderDate || "-"}</p>
                              </div>
                              <div>
                                <Label className="text-sm font-medium">예상 입고일</Label>
                                <p className="text-sm text-muted-foreground">
                                  {order.expectedDeliveryDate || "-"}
                                </p>
                              </div>
                              <div>
                                <Label className="text-sm font-medium">공급업체</Label>
                                <p className="text-sm text-muted-foreground">{order.supplierName}</p>
                              </div>
                              <div>
                                <Label className="text-sm font-medium">상태</Label>
                                <div className="mt-1">{getStatusBadge(order.status)}</div>
                              </div>
                              <div>
                                <Label className="text-sm font-medium">총 금액</Label>
                                <p className="text-sm text-muted-foreground">
                                  {order.totalAmount
                                    ? `${parseFloat(order.totalAmount).toLocaleString()}원`
                                    : "-"}
                                </p>
                              </div>
                              <div>
                                <Label className="text-sm font-medium">생성일</Label>
                                <p className="text-sm text-muted-foreground">
                                  {order.createdAt
                                    ? new Date(order.createdAt).toLocaleString("ko-KR")
                                    : "-"}
                                </p>
                              </div>
                            </div>
                            {order.notes && (
                              <div>
                                <Label className="text-sm font-medium">비고</Label>
                                <p className="text-sm text-muted-foreground">{order.notes}</p>
                              </div>
                            )}
                            <div>
                              <Label className="text-sm font-medium mb-2 block">발주 항목</Label>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>원재료명</TableHead>
                                    <TableHead>원재료 코드</TableHead>
                                    <TableHead className="text-right">수량</TableHead>
                                    <TableHead>단위</TableHead>
                                    <TableHead className="text-right">단가</TableHead>
                                    <TableHead className="text-right">합계</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {order.items.map((item: any) => (
                                    <TableRow key={item.id}>
                                      <TableCell>{item.materialName}</TableCell>
                                      <TableCell>{item.materialCode}</TableCell>
                                      <TableCell className="text-right">
                                        {parseFloat(item.quantity).toFixed(2)}
                                      </TableCell>
                                      <TableCell>{item.unit}</TableCell>
                                      <TableCell className="text-right">
                                        {item.unitPrice
                                          ? `${parseFloat(item.unitPrice).toLocaleString()}원`
                                          : "-"}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {item.totalPrice
                                          ? `${parseFloat(item.totalPrice).toLocaleString()}원`
                                          : "-"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">발주 제안 이력이 없습니다</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}
