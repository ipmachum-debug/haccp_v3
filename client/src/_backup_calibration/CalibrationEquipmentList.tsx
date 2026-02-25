import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Search, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CalibrationEquipmentList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(true);

  const { data: equipment, isLoading, refetch } = trpc.calibration.listEquipment.useQuery({
    search,
    isActive: isActiveFilter,
  });

  const deleteMutation = trpc.calibration.deleteEquipment.useMutation({
    onSuccess: () => {
      toast({
        title: "삭제 완료",
        description: "검교정설비가 삭제되었습니다.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>검교정설비 관리</CardTitle>
              <CardDescription>검교정설비를 등록하고 관리합니다</CardDescription>
            </div>
            <Button onClick={() => setLocation("/calibration/equipment/new")}>
              <Plus className="mr-2 h-4 w-4" />
              새 설비 등록
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* 검색 및 필터 */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="설비명 또는 코드로 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={isActiveFilter === undefined ? "default" : "outline"}
                onClick={() => setIsActiveFilter(undefined)}
              >
                전체
              </Button>
              <Button
                variant={isActiveFilter === true ? "default" : "outline"}
                onClick={() => setIsActiveFilter(true)}
              >
                사용중
              </Button>
              <Button
                variant={isActiveFilter === false ? "default" : "outline"}
                onClick={() => setIsActiveFilter(false)}
              >
                미사용
              </Button>
            </div>
          </div>

          {/* 테이블 */}
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : equipment && equipment.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>코드</TableHead>
                  <TableHead>설비명</TableHead>
                  <TableHead>검교정구분</TableHead>
                  <TableHead>모델</TableHead>
                  <TableHead>제조회사</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipment.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.code}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <Badge variant={item.calibrationType === "certified" ? "default" : "secondary"}>
                        {item.calibrationType === "certified" ? "공인기관" : "사내"}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.model || "-"}</TableCell>
                    <TableCell>{item.manufacturer || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? "default" : "secondary"}>
                        {item.isActive ? "사용중" : "미사용"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocation(`/calibration/equipment/${item.id}`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>등록된 검교정설비가 없습니다.</p>
              <Button className="mt-4" onClick={() => setLocation("/calibration/equipment/new")}>
                <Plus className="mr-2 h-4 w-4" />
                첫 설비 등록하기
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
