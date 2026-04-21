import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Calendar, AlertTriangle, CheckCircle, Clock, Package } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function InventoryLots() {
  const L = useIndustryLabel();
  const [searchTerm, setSearchTerm] = useState("");

  // LOT 목록 조회 (임시 - API 구현 필요)
  const { data: lots = [], isLoading } = trpc.inventory.listLots.useQuery();

  // 검색 필터링
  const filteredLots = lots.filter((lot: any) =>
    lot.lotNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lot.materialName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 알람 상태 표시
  const getAlertStatus = (lot: any) => {
    if (!lot.expiryDate) return null;

    const today = new Date();
    const expiryDate = new Date(lot.expiryDate);
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { label: "만료됨", color: "bg-red-100 text-red-800", icon: AlertTriangle };
    } else if (daysUntilExpiry <= 7) {
      return { label: "만료 임박", color: "bg-orange-100 text-orange-800", icon: Clock };
    } else {
      return { label: "정상", color: "bg-green-100 text-green-800", icon: CheckCircle };
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">LOT 추적 관리</h1>
        <p className="text-muted-foreground">
          재고 LOT별 소비기한, 생산일자, 알람 상태를 관리합니다
        </p>
      </div>

      {/* 검색 및 필터 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>LOT 검색</CardTitle>
          <CardDescription>LOT 번호 또는 원재료명으로 검색</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="LOT 번호 또는 원재료명 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LOT 목록 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            LOT 목록
          </CardTitle>
          <CardDescription>
            총 {filteredLots.length}개의 LOT
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : filteredLots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "검색 결과가 없습니다" : "등록된 LOT가 없습니다"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>LOT 번호</TableHead>
                  <TableHead>{`${L("material")}명`}</TableHead>
                  <TableHead>수량</TableHead>
                  <TableHead>생산일자</TableHead>
                  <TableHead>소비기한</TableHead>
                  <TableHead>알람 상태</TableHead>
                  <TableHead>등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLots.map((lot: any) => {
                  const alertStatus = getAlertStatus(lot);
                  const AlertIcon = alertStatus?.icon;

                  return (
                    <TableRow key={lot.id}>
                      <TableCell className="font-mono font-semibold">{lot.lotNumber}</TableCell>
                      <TableCell>{lot.materialName || "-"}</TableCell>
                      <TableCell>{lot.quantity} {lot.unit}</TableCell>
                      <TableCell>
                        {lot.productionDate ? (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(lot.productionDate), "yyyy-MM-dd")}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {lot.expiryDate ? (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(lot.expiryDate), "yyyy-MM-dd")}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {alertStatus && AlertIcon ? (
                          <Badge className={alertStatus.color}>
                            <AlertIcon className="h-3 w-3 mr-1" />
                            {alertStatus.label}
                          </Badge>
                        ) : (
                          <Badge variant="outline">날짜 미설정</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lot.createdAt ? format(new Date(lot.createdAt), "yyyy-MM-dd") : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
