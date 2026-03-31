import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Plus, FileText, Users, Calendar, Upload, Download, Eye, X, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { formatLocalDate } from "../lib/dateUtils";

export default function EmployeeHealthChecklist() {
  const [listModalOpen, setListModalOpen] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<any>(null);
  const [uploadedFile, setUploadedFile] = useState<{
    fileUrl: string;
    fileKey: string;
    fileName: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [excelUploading, setExcelUploading] = useState(false);
  const [excelResult, setExcelResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  // 갱신 임박 직원 조회 (최근 5명)
  const { data: upcomingCerts, refetch: refetchUpcoming } =
    trpc.healthCertificate.getUpcoming.useQuery({ limit: 5 });

  // 전체 건강진단서 목록 조회
  const { data: allCerts, refetch: refetchAll } =
    trpc.healthCertificate.list.useQuery({ status: undefined });

  // 직원 목록 조회
  const { data: employees } = trpc.organization.employees.list.useQuery();

  // 통계 조회
  const { data: stats } = trpc.healthCertificate.getStats.useQuery();

  // 건강진단서 등록 mutation
  const createMutation = trpc.healthCertificate.create.useMutation({
    onSuccess: () => {
      toast.success("건강진단서가 등록되었습니다.");
      setFormModalOpen(false);
      refetchUpcoming();
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(`등록 실패: ${error.message}`);
    },
  });

  // 건강진단서 수정 mutation
  const updateMutation = trpc.healthCertificate.update.useMutation({
    onSuccess: () => {
      toast.success("건강진단서가 수정되었습니다.");
      setFormModalOpen(false);
      setEditingCert(null);
      refetchUpcoming();
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(`수정 실패: ${error.message}`);
    },
  });

  // 건강진단서 삭제 mutation
  const deleteMutation = trpc.healthCertificate.delete.useMutation({
    onSuccess: () => {
      toast.success("건강진단서가 삭제되었습니다.");
      refetchUpcoming();
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  // 파일 업로드 mutation
  const uploadFileMutation = trpc.healthCertificate.uploadFile.useMutation({
    onSuccess: (data: any) => {
      setUploadedFile(data);
      toast.success("파일이 업로드되었습니다.");
      setUploading(false);
    },
    onError: (error: any) => {
      toast.error(`업로드 실패: ${error.message}`);
      setUploading(false);
    },
  });

  // Excel 일괄 업로드 mutation
  const bulkUploadMutation = trpc.healthCertificate.bulkUploadFromExcel.useMutation({
    onSuccess: (data: any) => {
      setExcelResult(data);
      toast.success(`업로드 완료: 성공 ${data.success}건, 실패 ${data.failed}건`);
      setExcelUploading(false);
      refetchUpcoming();
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(`업로드 실패: ${error.message}`);
      setExcelUploading(false);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 크기 제한 (16MB)
    if (file.size > 16 * 1024 * 1024) {
      toast.error("파일 크기는 16MB를 초과할 수 없습니다.");
      return;
    }

    // 파일 형식 검증 (PDF, JPG, PNG)
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("PDF, JPG, PNG 파일만 업로드 가능합니다.");
      return;
    }

    setUploading(true);

    // 파일을 base64로 변환
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const base64Data = base64.split(",")[1]; // "data:image/png;base64," 제거

      uploadFileMutation.mutate({
        fileName: file.name,
        fileData: base64Data,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const employeeId = Number(formData.get("employeeId"));
    const employee = employees?.find((e: any) => e.id === employeeId);
    
    const data = {
      employeeId,
      employeeName: employee?.name || "",
      issueDate: new Date(formData.get("issueDate") as string),
      expiryDate: new Date(formData.get("expiryDate") as string),
      fileUrl: uploadedFile?.fileUrl || editingCert?.fileUrl || undefined,
      fileKey: uploadedFile?.fileKey || editingCert?.fileKey || undefined,
      fileName: uploadedFile?.fileName || editingCert?.fileName || undefined,
    };

    if (editingCert) {
      updateMutation.mutate({ 
        id: editingCert.id, 
        issueDate: data.issueDate,
        expiryDate: data.expiryDate,
        fileUrl: data.fileUrl,
        fileKey: data.fileKey,
        fileName: data.fileName,
      });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (cert: any) => {
    setEditingCert(cert);
    setUploadedFile(null);
    setFormModalOpen(true);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelUploading(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // 데이터 변환
      const records = jsonData.map((row: any) => ({
        employeeName: row["직원명"],
        issueDate: new Date(row["발급일"]),
        expiryDate: new Date(row["만료일"]),
      }));

      // 서버로 전송
      bulkUploadMutation.mutate({ records });
    } catch (error) {
      toast.error("Excel 파일 읽기 실패");
      setExcelUploading(false);
    }
  };

  const downloadExcelTemplate = () => {
    const templateData = [
      {
        직원명: "홍길동",
        발급일: "2024-01-01",
        만료일: "2025-01-01",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "건강진단서");

    // 파일 다운로드
    XLSX.writeFile(wb, "건강진단서_업로드_템플릿.xlsx");
    toast.success("템플릿이 다운로드되었습니다.");
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getDaysUntilExpiry = (expiryDate: Date) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusBadge = (expiryDate: Date) => {
    const days = getDaysUntilExpiry(expiryDate);
    
    if (days < 0) {
      return <Badge variant="destructive">만료</Badge>;
    } else if (days <= 7) {
      return <Badge variant="destructive">긴급</Badge>;
    } else if (days <= 30) {
      return <Badge className="bg-orange-500">임박</Badge>;
    } else {
      return <Badge variant="secondary">정상</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">건강진단결과서 관리</h1>
            <p className="text-muted-foreground mt-1">
              건강진단결과서(구, 보건증) 관리 - 1년 1회 의무 갱신
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <FileText className="mr-2 h-4 w-4" />
              출력
            </Button>
            <Dialog open={excelModalOpen} onOpenChange={setExcelModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Excel 일괄 업로드
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Excel 일괄 업로드</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>템플릿 다운로드</Label>
                    <Button
                      variant="outline"
                      onClick={downloadExcelTemplate}
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Excel 템플릿 다운로드
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      템플릿을 다운로드하여 데이터를 입력하세요.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Excel 파일 업로드</Label>
                    <Input
                      id="excelInput"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleExcelUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById("excelInput")?.click()}
                      disabled={excelUploading}
                      className="w-full"
                    >
                      {excelUploading ? (
                        <>업로드 중...</>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Excel 파일 선택
                        </>
                      )}
                    </Button>
                  </div>

                  {excelResult && (
                    <div className="space-y-2">
                      <div className="text-sm">
                        <p className="text-green-600">성공: {excelResult.success}건</p>
                        <p className="text-red-600">실패: {excelResult.failed}건</p>
                      </div>
                      {excelResult.errors.length > 0 && (
                        <div className="space-y-1">
                          <Label>오류 내역</Label>
                          <div className="text-xs text-red-600 space-y-1">
                            {excelResult.errors.map((error, idx) => (
                              <p key={idx}>{error}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={formModalOpen} onOpenChange={setFormModalOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingCert(null); setUploadedFile(null); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  신규 등록
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingCert ? "건강진단서 수정" : "건강진단서 등록"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="employeeId">직원 선택</Label>
                    <Select
                      name="employeeId"
                      defaultValue={editingCert?.employeeId?.toString()}
                      required
                      disabled={!!editingCert}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="직원을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees?.map((emp: any) => (
                          <SelectItem key={emp.id} value={emp.id.toString()}>
                            {emp.name} ({emp.positionName})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="issueDate">발급일</Label>
                      <Input
                        id="issueDate"
                        name="issueDate"
                        type="date"
                        defaultValue={
                          editingCert
                            ? formatLocalDate(new Date(editingCert.issueDate))
                            : ""
                        }
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="expiryDate">만료일</Label>
                      <Input
                        id="expiryDate"
                        name="expiryDate"
                        type="date"
                        defaultValue={
                          editingCert
                            ? formatLocalDate(new Date(editingCert.expiryDate))
                            : ""
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="file">건강진단서 파일 (PDF, JPG, PNG)</Label>
                    <Input
                      id="file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileSelect}
                      disabled={uploading}
                    />
                    {uploading && <p className="text-sm text-muted-foreground">업로드 중...</p>}
                    {uploadedFile && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <Eye className="h-4 w-4" />
                        <span>{uploadedFile.fileName}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setUploadedFile(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {editingCert?.fileUrl && !uploadedFile && (
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Eye className="h-4 w-4" />
                        <a href={editingCert.fileUrl} target="_blank" rel="noopener noreferrer">
                          {editingCert.fileName || "기존 파일 보기"}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setFormModalOpen(false);
                        setEditingCert(null);
                        setUploadedFile(null);
                      }}
                    >
                      취소
                    </Button>
                    <Button type="submit" disabled={uploading}>
                      {editingCert ? "수정" : "등록"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">전체 직원</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.total || 0}명</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">정상</CardTitle>
              <Calendar className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.valid || 0}명</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">갱신 임박</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{stats?.expiringSoon || 0}명</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">만료</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats?.expired || 0}명</div>
            </CardContent>
          </Card>
        </div>

        {/* 갱신 임박 알림 */}
        {upcomingCerts && upcomingCerts.length > 0 && (
          <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                <AlertCircle className="h-5 w-5" />
                갱신 임박 알림
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {upcomingCerts.map((cert: any) => {
                  const daysLeft = getDaysUntilExpiry(cert.expiryDate);
                  return (
                    <div
                      key={cert.id}
                      className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-medium">{cert.employeeName}</p>
                          <p className="text-sm text-muted-foreground">
                            만료일: {new Date(cert.expiryDate).toLocaleDateString("ko-KR")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            daysLeft < 0
                              ? "text-destructive font-bold"
                              : daysLeft <= 7
                              ? "text-destructive font-bold"
                              : "text-orange-500 font-bold"
                          }
                        >
                          {daysLeft >= 0 ? `D-${daysLeft}` : "만료"}
                        </span>
                        {getStatusBadge(cert.expiryDate)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 전체 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>전체 건강진단서 목록</CardTitle>
          </CardHeader>
          <CardContent>
            {!allCerts || allCerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                등록된 건강진단서가 없습니다.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>직원명</TableHead>
                    <TableHead>직급</TableHead>
                    <TableHead>발급일</TableHead>
                    <TableHead>만료일</TableHead>
                    <TableHead>남은 기간</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>파일</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allCerts.map((cert: any) => {
                    const daysLeft = getDaysUntilExpiry(cert.expiryDate);
                    return (
                      <TableRow key={cert.id}>
                        <TableCell className="font-medium">{cert.employeeName}</TableCell>
                        <TableCell>{cert.employee?.position || "-"}</TableCell>
                        <TableCell>
                          {new Date(cert.issueDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          {new Date(cert.expiryDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              daysLeft < 0
                                ? "text-destructive font-bold"
                                : daysLeft <= 7
                                ? "text-destructive font-bold"
                                : daysLeft <= 30
                                ? "text-orange-500 font-bold"
                                : ""
                            }
                          >
                            {daysLeft >= 0 ? `D-${daysLeft}` : "만료"}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(cert.expiryDate)}</TableCell>
                        <TableCell>
                          {cert.fileUrl ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <a href={cert.fileUrl} target="_blank" rel="noopener noreferrer">
                                <Eye className="h-4 w-4" />
                              </a>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(cert)}
                            >
                              수정
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(cert.id)}
                            >
                              삭제
                            </Button>
                          </div>
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
    </DashboardLayout>
  );
}
