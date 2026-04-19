import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

import { todayLocal } from "../../lib/dateUtils";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function ShippingInspection() {
  const L = useIndustryLabel();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const utils = trpc.useUtils();

  // 검사 기록 목록 조회
  const { data: records = [], isLoading } = trpc.inspection.shipping.list.useQuery({});

  // 검사 기록 상세 조회
  const { data: selectedRecord } = trpc.inspection.shipping.getById.useQuery(
    { id: selectedRecordId! },
    { enabled: !!selectedRecordId }
  );

  // 검사 기록 생성
  const createMutation = trpc.inspection.shipping.create.useMutation({
    onSuccess: () => {
      toast.success("출하 검사 기록이 생성되었습니다.");
      setIsCreateDialogOpen(false);
      utils.inspection.shipping.list.invalidate();
    },
    onError: (error: { message: string }) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  // 검사 상태 변경
  const updateStatusMutation = trpc.inspection.shipping.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("검사 상태가 변경되었습니다.");
      utils.inspection.shipping.list.invalidate();
      utils.inspection.shipping.getById.invalidate();
    },
    onError: (error: { message: string }) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  // 검사 기록 생성 폼
  const [formData, setFormData] = useState({
    batchId: 1,
    batchCode: "",
    productCode: "",
    productName: "",
    inspectionDate: todayLocal(),
    inspectorName: "",
    quantity: "",
    notes: "",
  });

  const [inspectionItems, setInspectionItems] = useState([
    {
      itemName: "외관 검사",
      standard: "포장 상태 양호",
      result: "",
      passed: "pass" as "pass" | "fail" | "na",
      sortOrder: 1,
    },
    {
      itemName: "중량 검사",
      standard: "규격 범위 내",
      result: "",
      passed: "pass" as "pass" | "fail" | "na",
      sortOrder: 2,
    },
    {
      itemName: "라벨 검사",
      standard: "라벨 정보 정확",
      result: "",
      passed: "pass" as "pass" | "fail" | "na",
      sortOrder: 3,
    },
  ]);

  const handleCreateInspection = () => {
    if (!formData.batchCode || !formData.productName) {
      toast.error("필수 항목을 입력해주세요.");
      return;
    }

    createMutation.mutate({
      ...formData,
      items: inspectionItems,
    });
  };

  const handleStatusChange = (id: number, status: "pending" | "completed" | "rejected", result?: "pass" | "fail" | "hold") => {
    updateStatusMutation.mutate({ id, status, inspectionResult: result });
  };

  // 필터링된 기록
  const filteredRecords = records.filter((record: any) => {
    const matchesSearch =
      record.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.batchCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.productCode?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || record.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">출하 검사</h1>
          <p className="text-muted-foreground mt-1">
            완제품 출하 전 최종 검사를 기록합니다.
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              신규 검사 기록
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>출하 검사 기록 생성</DialogTitle>
              <DialogDescription>
                완제품 출하 전 최종 검사 항목을 기록합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>배치 코드 *</Label>
                  <Input
                    value={formData.batchCode}
                    onChange={(e) =>
                      setFormData({ ...formData, batchCode: e.target.value })
                    }
                    placeholder="BATCH-001"
                  />
                </div>
                <div>
                  <Label>제품 코드</Label>
                  <Input
                    value={formData.productCode}
                    onChange={(e) =>
                      setFormData({ ...formData, productCode: e.target.value })
                    }
                    placeholder="PROD-001"
                  />
                </div>
                <div>
                  <Label>제품명 *</Label>
                  <Input
                    value={formData.productName}
                    onChange={(e) =>
                      setFormData({ ...formData, productName: e.target.value })
                    }
                    placeholder="햄버거 패티"
                  />
                </div>
                <div>
                  <Label>검사 날짜</Label>
                  <Input
                    type="date"
                    value={formData.inspectionDate}
                    onChange={(e) =>
                      setFormData({ ...formData, inspectionDate: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>검사자</Label>
                  <Input
                    value={formData.inspectorName}
                    onChange={(e) =>
                      setFormData({ ...formData, inspectorName: e.target.value })
                    }
                    placeholder="홍길동"
                  />
                </div>
                <div>
                  <Label>수량</Label>
                  <Input
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, quantity: e.target.value })
                    }
                    placeholder="1000개"
                  />
                </div>
              </div>

              <div>
                <Label>검사 항목</Label>
                <div className="space-y-2 mt-2">
                  {inspectionItems.map((item, index) => (
                    <Card key={index}>
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <Label className="text-xs">항목명</Label>
                            <Input
                              value={item.itemName}
                              onChange={(e) => {
                                const newItems = [...inspectionItems];
                                newItems[index].itemName = e.target.value;
                                setInspectionItems(newItems);
                              }}
                              placeholder="검사 항목"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">기준</Label>
                            <Input
                              value={item.standard}
                              onChange={(e) => {
                                const newItems = [...inspectionItems];
                                newItems[index].standard = e.target.value;
                                setInspectionItems(newItems);
                              }}
                              placeholder="검사 기준"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">결과</Label>
                            <Input
                              value={item.result}
                              onChange={(e) => {
                                const newItems = [...inspectionItems];
                                newItems[index].result = e.target.value;
                                setInspectionItems(newItems);
                              }}
                              placeholder="검사 결과"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">판정</Label>
                            <Select
                              value={item.passed}
                              onValueChange={(value: "pass" | "fail" | "na") => {
                                const newItems = [...inspectionItems];
                                newItems[index].passed = value;
                                setInspectionItems(newItems);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pass">합격</SelectItem>
                                <SelectItem value="fail">불합격</SelectItem>
                                <SelectItem value="na">해당없음</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setInspectionItems([
                        ...inspectionItems,
                        {
                          itemName: "",
                          standard: "",
                          result: "",
                          passed: "pass",
                          sortOrder: inspectionItems.length + 1,
                        },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    검사 항목 추가
                  </Button>
                </div>
              </div>

              <div>
                <Label>비고</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="추가 메모"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                취소
              </Button>
              <Button onClick={handleCreateInspection} disabled={createMutation.isPending}>
                {createMutation.isPending ? "생성 중..." : "생성"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 필터 및 검색 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="제품명, 배치 코드, 제품 코드로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="상태 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="pending">대기 중</SelectItem>
                <SelectItem value="completed">완료</SelectItem>
                <SelectItem value="rejected">반려</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 검사 기록 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>검사 기록 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              로딩 중...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              검사 기록이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>검사 날짜</TableHead>
                  <TableHead>{`${L("batch")} 코드`}</TableHead>
                  <TableHead>제품명</TableHead>
                  <TableHead>수량</TableHead>
                  <TableHead>검사자</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>판정</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record: any) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      {record.inspectionDate
                        ? new Date(record.inspectionDate).toLocaleDateString("ko-KR")
                        : "-"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {record.batchCode || "-"}
                    </TableCell>
                    <TableCell>{record.productName || "-"}</TableCell>
                    <TableCell>{record.quantity || "-"}</TableCell>
                    <TableCell>{record.inspectorName || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          record.status === "completed"
                            ? "default"
                            : record.status === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {record.status === "pending"
                          ? "대기 중"
                          : record.status === "completed"
                          ? "완료"
                          : "반려"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {record.inspectionResult ? (
                        <Badge
                          variant={
                            record.inspectionResult === "pass"
                              ? "default"
                              : record.inspectionResult === "fail"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {record.inspectionResult === "pass"
                            ? "합격"
                            : record.inspectionResult === "fail"
                            ? "불합격"
                            : "해당없음"}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedRecordId(record.id);
                            setIsDetailDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {record.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                handleStatusChange(record.id, "completed", "pass" as "pass" | "fail" | "hold")
                              }
                            >
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                handleStatusChange(record.id, "rejected", "fail" as "pass" | "fail" | "hold")
                              }
                            >
                              <XCircle className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 상세 보기 다이얼로그 */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>출하 검사 상세</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">배치 코드</Label>
                  <p className="font-medium">{selectedRecord.batchCode}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">제품명</Label>
                  <p className="font-medium">{selectedRecord.productName}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">제품 코드</Label>
                  <p className="font-medium">{selectedRecord.productCode || "-"}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">검사 날짜</Label>
                  <p className="font-medium">
                    {selectedRecord.inspectionDate
                      ? new Date(selectedRecord.inspectionDate).toLocaleDateString("ko-KR")
                      : "-"}
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">검사자</Label>
                  <p className="font-medium">{selectedRecord.inspectorName || "-"}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">수량</Label>
                  <p className="font-medium">{selectedRecord.quantity || "-"}</p>
                </div>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">검사 항목</Label>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>항목명</TableHead>
                      <TableHead>기준</TableHead>
                      <TableHead>결과</TableHead>
                      <TableHead>판정</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRecord.items.map((item: any, index: any) => (
                      <TableRow key={index}>
                        <TableCell>{item.itemName}</TableCell>
                        <TableCell>{item.standard}</TableCell>
                        <TableCell>{item.result}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.passed === "pass"
                                ? "default"
                                : item.passed === "fail"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {item.passed === "pass"
                              ? "합격"
                              : item.passed === "fail"
                              ? "불합격"
                              : "해당없음"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedRecord.notes && (
                <div>
                  <Label className="text-sm text-muted-foreground">비고</Label>
                  <p className="mt-1">{selectedRecord.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsDetailDialogOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
