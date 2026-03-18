import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Clock, CheckCircle2, XCircle, Search, ArrowUpDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export default function StockAlerts() {
  const [resolved, setResolved] = useState<boolean | undefined>(false); // 기본값: 미해제 알람만
  const [alertType, setAlertType] = useState<"low_stock" | "expiring_soon" | "expired" | "overstock" | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<"createdAt" | "expiryDate" | "severity">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const { data: alerts, isLoading, refetch } = trpc.stockAlerts.list.useQuery({ resolved, alertType });

  const filteredAndSortedAlerts = useMemo(() => {
    if (!alerts) return [];
    let filtered = alerts.filter((alert: any) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        (alert.itemName && alert.itemName.toLowerCase().includes(query)) ||
        (alert.lotNumber && alert.lotNumber.toLowerCase().includes(query)) ||
        (alert.message && alert.message.toLowerCase().includes(query))
      );
    });
    filtered.sort((a: any, b: any) => {
      let aValue: any, bValue: any;
      if (sortField === "createdAt") {
        aValue = new Date(a.alertDate || a.createdAt).getTime();
        bValue = new Date(b.alertDate || b.createdAt).getTime();
      } else if (sortField === "expiryDate") {
        aValue = a.expiryDate ? new Date(a.expiryDate).getTime() : 0;
        bValue = b.expiryDate ? new Date(b.expiryDate).getTime() : 0;
      } else if (sortField === "severity") {
        const severityMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
        aValue = severityMap[a.severity || "low"] || 0;
        bValue = severityMap[b.severity || "low"] || 0;
      }
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    });
    return filtered;
  }, [alerts, searchQuery, sortField, sortOrder]);

  const resolveMutation = trpc.stockAlerts.resolve.useMutation({
    onSuccess: () => {
      toast.success("알람이 해제되었습니다");
      refetch();
    },
    onError: (error: any) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  const handleResolve = (id: number) => {
    if (confirm("이 알람을 해제하시겠습니까?")) {
      resolveMutation.mutate({ id });
    }
  };

  const getAlertTypeBadge = (type: string) => {
    switch (type) {
      case "expired":
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" />만료됨</Badge>;
      case "expiring_soon":
        return <Badge variant="default" className="flex items-center gap-1 bg-orange-500"><Clock className="h-3 w-3" />만료 임박</Badge>;
      case "low_stock":
        return <Badge variant="secondary" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />재고 부족</Badge>;
      case "overstock":
        return <Badge variant="outline" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />재고 과다</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string | null) => {
    if (!severity) return null;
    switch (severity) {
      case "high":
        return <Badge variant="destructive">높음</Badge>;
      case "medium":
        return <Badge variant="default" className="bg-orange-500">중간</Badge>;
      case "low":
        return <Badge variant="secondary">낮음</Badge>;
      default:
        return <Badge>{severity}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">재고 알람</h1>
          <p className="text-muted-foreground">
            소비기한/생산일자 기반 알람 및 재고 부족 알람을 관리합니다
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>알람 목록</CardTitle>
                <CardDescription>
                  총 {alerts?.length || 0}건의 알람
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <div className="relative w-[200px]">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="품목명, LOT, 메시지 검색"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select
                  value={`${sortField}-${sortOrder}`}
                  onValueChange={(v) => {
                    const [field, order] = v.split("-") as [typeof sortField, typeof sortOrder];
                    setSortField(field);
                    setSortOrder(order);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt-desc">알람 날짜 내림차순</SelectItem>
                    <SelectItem value="createdAt-asc">알람 날짜 오름차순</SelectItem>
                    <SelectItem value="expiryDate-asc">소비기한 오름차순</SelectItem>
                    <SelectItem value="expiryDate-desc">소비기한 내림차순</SelectItem>
                    <SelectItem value="severity-desc">심각도 높은 순</SelectItem>
                    <SelectItem value="severity-asc">심각도 낮은 순</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={resolved === undefined ? "all" : resolved ? "resolved" : "unresolved"}
                  onValueChange={(v) => {
                    if (v === "all") setResolved(undefined);
                    else if (v === "resolved") setResolved(true);
                    else setResolved(false);
                  }}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unresolved">미해제</SelectItem>
                    <SelectItem value="resolved">해제됨</SelectItem>
                    <SelectItem value="all">전체</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={alertType || "all"}
                  onValueChange={(v) => {
                    if (v === "all") setAlertType(undefined);
                    else setAlertType(v as any);
                  }}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 유형</SelectItem>
                    <SelectItem value="expired">만료됨</SelectItem>
                    <SelectItem value="expiring_soon">만료 임박</SelectItem>
                    <SelectItem value="low_stock">재고 부족</SelectItem>
                    <SelectItem value="overstock">재고 과다</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : filteredAndSortedAlerts && filteredAndSortedAlerts.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>알람 유형</TableHead>
                    <TableHead>품목명</TableHead>
                    <TableHead>LOT 번호</TableHead>
                    <TableHead>알람 날짜</TableHead>
                    <TableHead>소비기한</TableHead>
                    <TableHead>생산일자</TableHead>
                    <TableHead>심각도</TableHead>
                    <TableHead>메시지</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedAlerts.map((alert: any) => (
                    <TableRow key={alert.id}>
                      <TableCell>{getAlertTypeBadge(alert.alertType)}</TableCell>
                      <TableCell className="font-medium">{alert.itemName || "-"}</TableCell>
                      <TableCell>{alert.lotNumber || "-"}</TableCell>
                      <TableCell>{alert.alertDate ? new Date(alert.alertDate).toLocaleDateString("ko-KR") : "-"}</TableCell>
                      <TableCell>{alert.expiryDate ? new Date(alert.expiryDate).toLocaleDateString("ko-KR") : "-"}</TableCell>
                      <TableCell>{alert.productionDate ? new Date(alert.productionDate).toLocaleDateString("ko-KR") : "-"}</TableCell>
                      <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                      <TableCell className="max-w-xs truncate">{alert.message || "-"}</TableCell>
                      <TableCell>
                        {alert.resolvedAt ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm">해제됨</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-orange-600">
                            <Clock className="h-4 w-4" />
                            <span className="text-sm">미해제</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!alert.resolvedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResolve(alert.id)}
                            disabled={resolveMutation.isPending}
                          >
                            해제
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                알람이 없습니다
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
