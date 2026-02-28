import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Download,
  Eye,
  Trash2,
  Filter,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { Link } from "wouter";

export default function AccountingDocuments() {
  const [category, setCategory] = useState<string | undefined>();
  const [year, setYear] = useState<number | undefined>();
  const [month, setMonth] = useState<number | undefined>();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // 문서 업로드 폼 상태
  const [uploadForm, setUploadForm] = useState({
    category: "monthly_report" as const,
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    title: "",
    description: "",
    fileName: "",
    fileKey: "",
    fileUrl: "",
  });

  const { data: documents, isLoading, refetch } = trpc.accountingDocuments.list.useQuery({
    category,
    year,
    month,
    limit: 50,
  });

  const uploadMutation = trpc.accountingDocuments.upload.useMutation({
    onSuccess: () => {
      toast.success("문서가 업로드되었습니다.");
      setUploadDialogOpen(false);
      refetch();
      // 폼 초기화
      setUploadForm({
        category: "monthly_report",
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        title: "",
        description: "",
        fileName: "",
        fileKey: "",
        fileUrl: "",
      });
    },
    onError: (error) => {
      toast.error(`업로드 실패: ${error.message}`);
    },
  });

  const deleteMutation = trpc.accountingDocuments.delete.useMutation({
    onSuccess: () => {
      toast.success("문서가 삭제되었습니다.");
      refetch();
    },
    onError: (error) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const handleUpload = () => {
    if (!uploadForm.title || !uploadForm.fileName) {
      toast.error("제목과 파일명은 필수입니다.");
      return;
    }

    // TODO: 실제 파일 업로드 로직 (S3)
    // 현재는 placeholder
    const fileKey = `accounting/documents/${uploadForm.year}/${uploadForm.month}/${Date.now()}_${uploadForm.fileName}`;
    const fileUrl = `https://placeholder.com/${fileKey}`;

    uploadMutation.mutate({
      ...uploadForm,
      fileKey,
      fileUrl,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 이 문서를 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      monthly_report: "월 마감 리포트",
      tax_invoice: "세금계산서",
      receipt: "영수증",
      journal_entry: "분개장",
      other: "기타",
    };
    return labels[cat] || cat;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "requested":
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />요청됨</Badge>;
      case "uploaded":
        return <Badge variant="default" className="gap-1 bg-blue-500"><Upload className="h-3 w-3" />업로드됨</Badge>;
      case "reviewed":
        return <Badge variant="default" className="gap-1 bg-purple-500"><Eye className="h-3 w-3" />검토됨</Badge>;
      case "completed":
        return <Badge variant="default" className="gap-1 bg-green-500"><CheckCircle className="h-3 w-3" />완료</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />반려</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">외부회계 문서함</h1>
            <p className="text-muted-foreground mt-1">
              세무대리인과의 자료 교환 및 문서 관리
            </p>
          </div>
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                문서 업로드
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>문서 업로드</DialogTitle>
                <DialogDescription>
                  회계 관련 문서를 업로드하여 외부 회계사와 공유하세요
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="upload-category">문서 유형</Label>
                    <Select
                      value={uploadForm.category}
                      onValueChange={(value: any) => setUploadForm({ ...uploadForm, category: value })}
                    >
                      <SelectTrigger id="upload-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly_report">월 마감 리포트</SelectItem>
                        <SelectItem value="tax_invoice">세금계산서</SelectItem>
                        <SelectItem value="receipt">영수증</SelectItem>
                        <SelectItem value="journal_entry">분개장</SelectItem>
                        <SelectItem value="other">기타</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="upload-year">연도</Label>
                    <Input
                      id="upload-year"
                      type="number"
                      value={uploadForm.year}
                      onChange={(e) => setUploadForm({ ...uploadForm, year: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-month">월 (선택)</Label>
                  <Input
                    id="upload-month"
                    type="number"
                    value={uploadForm.month}
                    onChange={(e) => setUploadForm({ ...uploadForm, month: parseInt(e.target.value) })}
                    min={1}
                    max={12}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-title">문서 제목</Label>
                  <Input
                    id="upload-title"
                    value={uploadForm.title}
                    onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                    placeholder="예: 2026년 1월 월 마감 리포트"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-description">설명 (선택)</Label>
                  <Input
                    id="upload-description"
                    value={uploadForm.description || ""}
                    onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                    placeholder="문서에 대한 추가 설명"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="upload-file">파일명</Label>
                  <Input
                    id="upload-file"
                    value={uploadForm.fileName}
                    onChange={(e) => setUploadForm({ ...uploadForm, fileName: e.target.value })}
                    placeholder="예: monthly_report_2026_01.pdf"
                  />
                  <p className="text-sm text-muted-foreground">
                    TODO: 실제 파일 업로드 UI 구현 필요
                  </p>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleUpload}
                    disabled={uploadMutation.isPending}
                    className="flex-1"
                  >
                    {uploadMutation.isPending ? "업로드 중..." : "업로드"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setUploadDialogOpen(false)}
                  >
                    취소
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* 필터 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              필터
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="filter-category">문서 유형</Label>
              <Select value={category} onValueChange={(value) => setCategory(value === "all" ? undefined : value)}>
                <SelectTrigger id="filter-category">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="monthly_report">월 마감 리포트</SelectItem>
                  <SelectItem value="tax_invoice">세금계산서</SelectItem>
                  <SelectItem value="receipt">영수증</SelectItem>
                  <SelectItem value="journal_entry">분개장</SelectItem>
                  <SelectItem value="other">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-year">연도</Label>
              <Input
                id="filter-year"
                type="number"
                placeholder="전체"
                value={year || ""}
                onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : undefined)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-month">월</Label>
              <Input
                id="filter-month"
                type="number"
                placeholder="전체"
                value={month || ""}
                onChange={(e) => setMonth(e.target.value ? parseInt(e.target.value) : undefined)}
                min={1}
                max={12}
              />
            </div>
          </CardContent>
        </Card>

        {/* 문서 목록 */}
        <div className="space-y-3">
          {documents && documents.length > 0 ? (
            documents.map((doc) => (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        <FileText className="h-6 w-6 text-blue-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{doc.title}</h3>
                          {getStatusBadge(doc.status)}
                          <Badge variant="outline">{getCategoryLabel(doc.category)}</Badge>
                        </div>
                        {doc.description && (
                          <p className="text-sm text-muted-foreground mb-2">{doc.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>
                            {doc.year}년 {doc.month ? `${doc.month}월` : ""}
                          </span>
                          <span>•</span>
                          <span>{doc.fileName}</span>
                          <span>•</span>
                          <span>업로드: {new Date(doc.createdAt).toLocaleDateString("ko-KR")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/accounting/documents/${doc.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="mr-2 h-4 w-4" />
                          상세
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(doc.fileUrl, "_blank")}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        다운로드
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  업로드된 문서가 없습니다.
                  <br />
                  문서를 업로드해주세요.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
