import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Edit } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
export default function MaterialInspectionDetail() {
  const L = useIndustryLabel();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const inspectionId = params.id ? parseInt(params.id, 10) : 0;
  
  // 수정 Dialog 상태
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [appearance, setAppearance] = useState("");
  const [odor, setOdor] = useState("");
  const [color, setColor] = useState("");
  const [temperature, setTemperature] = useState("");
  const [result, setResult] = useState<"pass" | "fail" | "conditional">("pass");

  const { data: inspection, isLoading, refetch } = trpc.inspection.material.getById.useQuery({ id: inspectionId });
  
  // 수정 mutation
  const updateMutation = trpc.inspection.material.update.useMutation({
    onSuccess: () => {
      toast.success("검사 내용이 수정되었습니다");
      setEditDialogOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`오류: ${error.message}`);
    },
  });
  
  // Dialog 열릴 때 기존 데이터 로드
  const handleEditClick = () => {
    if (inspection) {
      setAppearance(inspection.appearance || "");
      setOdor(inspection.odor || "");
      setColor(inspection.color || "");
      setTemperature(inspection.temperature?.toString() || "");
      setResult(inspection.result || "pass");
      setEditDialogOpen(true);
    }
  };
  
  // 수정 저장
  const handleSaveEdit = () => {
    updateMutation.mutate({
      id: inspectionId,
      appearance: appearance || undefined,
      odor: odor || undefined,
      color: color || undefined,
      temperature: temperature ? parseFloat(temperature) : undefined,
      result: result,
    });
  };

  const updateStatusMutation = trpc.inspection.material.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("검사 상태가 변경되었습니다");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  const handleStatusChange = (newStatus: "pending" | "completed" | "rejected") => {
    if (confirm(`검사 상태를 "${getStatusLabel(newStatus)}"(으)로 변경하시겠습니까?`)) {
      updateStatusMutation.mutate({ id: inspectionId, status: newStatus });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      pending: "secondary",
      completed: "default",
      rejected: "destructive",
    };
    const labels: Record<string, string> = {
      pending: "대기",
      completed: "완료",
      rejected: "반려",
    };
    return (
    <DashboardLayout>

      <Badge variant={variants[status] || "default"}>
        {labels[status] || status}
      </Badge>
    
    </DashboardLayout>
  );
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "대기",
      completed: "완료",
      rejected: "반려",
    };
    return labels[status] || status;
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return <Badge variant="secondary">미검사</Badge>;
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      pass: "default",
      fail: "destructive",
      na: "secondary",
    };
    const labels: Record<string, string> = {
      pass: "합격",
      fail: "불합격",
      na: "해당없음",
    };
    return (
      <Badge variant={variants[result] || "secondary"}>
        {labels[result] || result}
      </Badge>
    );
  };

  const getPassedIcon = (passed: boolean | null) => {
    if (passed === null) return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    return passed ? (
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">검사 기록을 찾을 수 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard/inspections/material")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">원재료 검사 상세</h1>
            <p className="text-muted-foreground mt-1">
              검사 ID: {inspection.id}
            </p>
          </div>
        </div>
        {getStatusBadge(inspection.status)}
      </div>

      {/* 기본 정보 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>검사 기본 정보</CardTitle>
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" onClick={handleEditClick}>
                <Edit className="h-4 w-4 mr-1" />
                상세 내용 수정
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>육안검사 상세 내용 수정</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="appearance">외관</Label>
                  <Textarea
                    id="appearance"
                    value={appearance}
                    onChange={(e) => setAppearance(e.target.value)}
                    placeholder="예: 이물질 없음, 변색 없음"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="odor">냄새</Label>
                  <Textarea
                    id="odor"
                    value={odor}
                    onChange={(e) => setOdor(e.target.value)}
                    placeholder="예: 이취 없음, 정상"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">색상</Label>
                  <Input
                    id="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="예: 정상, 연한 분홍색"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="temperature">온도 (℃)</Label>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="예: 5.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="result">검사 결과</Label>
                  <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pass">합격</SelectItem>
                      <SelectItem value="fail">불합격</SelectItem>
                      <SelectItem value="conditional">조건부 합격</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                  취소
                </Button>
                <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "저장 중..." : "저장"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">원재료명</p>
              <p className="text-lg font-semibold">{inspection.materialName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">LOT 번호</p>
              <p className="text-lg">{inspection.lotNumber}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">검사일</p>
              <p className="text-lg">{new Date(inspection.inspectionDate).toLocaleDateString('ko-KR')}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">검사자</p>
              <p className="text-lg">{inspection.inspectorName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">공급업체</p>
              <p className="text-lg">{inspection.supplierName || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">검사 결과</p>
              <div className="mt-1">{getResultBadge(inspection.inspectionResult)}</div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">외관</p>
              <p className="text-lg">{inspection.appearance || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">냄새</p>
              <p className="text-lg">{inspection.odor || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">색상</p>
              <p className="text-lg">{inspection.color || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">온도</p>
              <p className="text-lg">{inspection.temperature ? `${inspection.temperature}℃` : "-"}</p>
            </div>
          </div>
          {inspection.notes && (
            <div className="mt-4">
              <p className="text-sm font-medium text-muted-foreground">비고</p>
              <p className="text-base mt-1">{inspection.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 검사 항목 */}
      <Card>
        <CardHeader>
          <CardTitle>검사 항목</CardTitle>
          <CardDescription>
            총 {inspection.items?.length || 0}개 항목
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">순서</TableHead>
                <TableHead>항목명</TableHead>
                <TableHead>기준</TableHead>
                <TableHead>결과</TableHead>
                <TableHead className="w-[100px] text-center">합격 여부</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inspection.items && inspection.items.length > 0 ? (
                inspection.items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.sortOrder}</TableCell>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    <TableCell>{item.standard}</TableCell>
                    <TableCell>{item.result}</TableCell>
                    <TableCell className="text-center">
                      {getPassedIcon(item.passed)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    검사 항목이 없습니다
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 상태 변경 */}
      <Card>
        <CardHeader>
          <CardTitle>상태 변경</CardTitle>
          <CardDescription>
            검사 상태를 변경할 수 있습니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={inspection.status === "pending" ? "default" : "outline"}
              onClick={() => handleStatusChange("pending")}
              disabled={updateStatusMutation.isPending || inspection.status === "pending"}
            >
              대기
            </Button>
            <Button
              variant={inspection.status === "completed" ? "default" : "outline"}
              onClick={() => handleStatusChange("completed")}
              disabled={updateStatusMutation.isPending || inspection.status === "completed"}
            >
              완료
            </Button>
            <Button
              variant={inspection.status === "rejected" ? "default" : "outline"}
              onClick={() => handleStatusChange("rejected")}
              disabled={updateStatusMutation.isPending || inspection.status === "rejected"}
            >
              반려
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
