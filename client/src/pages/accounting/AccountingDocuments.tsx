import { useState, useMemo } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Search,
  CheckCircle,
  Clock,
  XCircle,
  FolderOpen,
  RotateCcw,
  FileCheck,
  BookOpen,
  Receipt,
  File,
  AlertCircle,
} from "lucide-react";
import { Link } from "wouter";

export default function AccountingDocuments() {
  const [category, setCategory] = useState<string | undefined>();
  const [year, setYear] = useState<number | undefined>();
  const [month, setMonth] = useState<number | undefined>();
  const [searchQuery, setSearchQuery] = useState<string>("");
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
      setUploadForm({
        category: "monthly_report", year: new Date().getFullYear(),
        month: new Date().getMonth() + 1, title: "", description: "",
        fileName: "", fileKey: "", fileUrl: "",
      });
    },
    onError: (error: { message: string }) => { toast.error(`업로드 실패: ${error.message}`); },
  });

  const deleteMutation = trpc.accountingDocuments.delete.useMutation({
    onSuccess: () => { toast.success("문서가 삭제되었습니다."); refetch(); },
    onError: (error: { message: string }) => { toast.error(`삭제 실패: ${error.message}`); },
  });

  const handleUpload = () => {
    if (!uploadForm.title || !uploadForm.fileName) {
      toast.error("제목과 파일명은 필수입니다.");
      return;
    }
    const fileKey = `accounting/documents/${uploadForm.year}/${uploadForm.month}/${Date.now()}_${uploadForm.fileName}`;
    const fileUrl = `https://placeholder.com/${fileKey}`;
    uploadMutation.mutate({ ...uploadForm, fileKey, fileUrl });
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 이 문서를 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  // 필터 초기화
  const handleResetFilters = () => {
    setCategory(undefined);
    setYear(undefined);
    setMonth(undefined);
    setSearchQuery("");
  };

  // 검색 필터링
  const filteredDocuments = useMemo(() => {
    if (!documents) return [];
    if (!searchQuery) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter((doc: any) =>
      doc.title.toLowerCase().includes(q) ||
      (doc.description && doc.description.toLowerCase().includes(q)) ||
      (doc.fileName && doc.fileName.toLowerCase().includes(q))
    );
  }, [documents, searchQuery]);

  // KPI 계산
  const kpiData = useMemo(() => {
    if (!documents) return { total: 0, uploaded: 0, reviewing: 0, completed: 0 };
    return {
      total: documents.length,
      uploaded: documents.filter((d: any) => d.status === "uploaded").length,
      reviewing: documents.filter((d: any) => d.status === "requested" || d.status === "reviewed").length,
      completed: documents.filter((d: any) => d.status === "completed").length,
    };
  }, [documents]);

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      monthly_report: "월 마감 리포트", tax_invoice: "세금계산서",
      receipt: "영수증", journal_entry: "분개장", other: "기타",
    };
    return labels[cat] || cat;
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "tax_invoice": return <Receipt className="h-5 w-5" />;
      case "receipt": return <FileCheck className="h-5 w-5" />;
      case "journal_entry": return <BookOpen className="h-5 w-5" />;
      case "monthly_report": return <FileText className="h-5 w-5" />;
      default: return <File className="h-5 w-5" />;
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "tax_invoice": return "bg-blue-50 text-blue-500 dark:bg-blue-950";
      case "receipt": return "bg-teal-50 text-teal-500 dark:bg-teal-950";
      case "journal_entry": return "bg-purple-50 text-purple-500 dark:bg-purple-950";
      case "monthly_report": return "bg-indigo-50 text-indigo-500 dark:bg-indigo-950";
      default: return "bg-gray-50 text-gray-500 dark:bg-gray-900";
    }
  };

  const getCategoryBadge = (cat: string) => {
    const colorMap: Record<string, string> = {
      monthly_report: "text-indigo-600 border-indigo-200 bg-indigo-50",
      tax_invoice: "text-blue-600 border-blue-200 bg-blue-50",
      receipt: "text-teal-600 border-teal-200 bg-teal-50",
      journal_entry: "text-purple-600 border-purple-200 bg-purple-50",
      other: "",
    };
    return (
      <Badge variant="outline" className={`text-xs ${colorMap[cat] || ""}`}>
        {getCategoryLabel(cat)}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "requested":
        return <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300 bg-yellow-50"><Clock className="h-3 w-3" />요청됨</Badge>;
      case "uploaded":
        return <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300 bg-blue-50"><Upload className="h-3 w-3" />업로드됨</Badge>;
      case "reviewed":
        return <Badge variant="outline" className="gap-1 text-purple-600 border-purple-300 bg-purple-50"><Eye className="h-3 w-3" />검토됨</Badge>;
      case "completed":
        return <Badge variant="outline" className="gap-1 text-green-600 border-green-300 bg-green-50"><CheckCircle className="h-3 w-3" />완료</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />반려</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">외부회계 문서함</h1>
              <p className="text-sm text-muted-foreground">세무대리인과의 자료 교환 및 문서 관리</p>
            </div>
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
                <DialogDescription>회계 관련 문서를 업로드하여 외부 회계사와 공유하세요</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="upload-category">문서 유형</Label>
                    <Select value={uploadForm.category} onValueChange={(value: any) => setUploadForm({ ...uploadForm, category: value })}>
                      <SelectTrigger id="upload-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly_report">월 마감 리포트</SelectItem>
                        <SelectItem value="tax_invoice">세금계산서</SelectItem>
                        <SelectItem value="receipt">영수증</SelectItem>
                        <SelectItem value="journal_entry">분개장</SelectItem>
                        <SelectItem value="other">기타</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="upload-year">연도</Label>
                      <Input id="upload-year" type="number" value={uploadForm.year} onChange={(e) => setUploadForm({ ...uploadForm, year: parseInt(e.target.value) })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="upload-month">월</Label>
                      <Input id="upload-month" type="number" value={uploadForm.month} onChange={(e) => setUploadForm({ ...uploadForm, month: parseInt(e.target.value) })} min={1} max={12} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upload-title">문서 제목</Label>
                  <Input id="upload-title" value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} placeholder="예: 2026년 1월 월 마감 리포트" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upload-description">설명 (선택)</Label>
                  <Input id="upload-description" value={uploadForm.description || ""} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} placeholder="문서에 대한 추가 설명" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upload-file">파일명</Label>
                  <Input id="upload-file" value={uploadForm.fileName} onChange={(e) => setUploadForm({ ...uploadForm, fileName: e.target.value })} placeholder="예: monthly_report_2026_01.pdf" />
                  <p className="text-xs text-muted-foreground">추후 드래그 앤 드롭 업로드 기능이 추가될 예정입니다.</p>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={handleUpload} disabled={uploadMutation.isPending} className="flex-1">
                    {uploadMutation.isPending ? "업로드 중..." : "업로드"}
                  </Button>
                  <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>취소</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">전체 문서</p>
                  <p className="text-2xl font-bold">{kpiData.total}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                  <FileText className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-indigo-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">업로드됨</p>
                  <p className="text-2xl font-bold">{kpiData.uploaded}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
                  <Upload className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">검토 대기</p>
                  <p className="text-2xl font-bold">{kpiData.reviewing}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                  <AlertCircle className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">완료</p>
                  <p className="text-2xl font-bold text-green-600">{kpiData.completed}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-50 text-green-500">
                  <CheckCircle className="h-4 w-4" />
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
                필터
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
                <Label className="text-xs">문서 유형</Label>
                <Select value={category || "all"} onValueChange={(value) => setCategory(value === "all" ? undefined : value)}>
                  <SelectTrigger><SelectValue placeholder="전체" /></SelectTrigger>
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
              <div className="space-y-1.5">
                <Label className="text-xs">연도</Label>
                <Input type="number" placeholder="전체" value={year || ""} onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : undefined)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">월</Label>
                <Input type="number" placeholder="전체" value={month || ""} onChange={(e) => setMonth(e.target.value ? parseInt(e.target.value) : undefined)} min={1} max={12} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">제목/설명 검색</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="검색어 입력..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 문서 목록 */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex gap-4">
                    <div className="h-12 w-12 bg-muted/50 rounded-lg animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-1/3 bg-muted/50 rounded animate-pulse" />
                      <div className="h-4 w-2/3 bg-muted/50 rounded animate-pulse" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDocuments && filteredDocuments.length > 0 ? (
              filteredDocuments.map((doc: any) => (
                <Card key={doc.id} className="group hover:shadow-md transition-all hover:border-primary/20">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${getCategoryColor(doc.category)}`}>
                          {getCategoryIcon(doc.category)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <h3 className="font-semibold text-base truncate">{doc.title}</h3>
                            {getStatusBadge(doc.status)}
                            {getCategoryBadge(doc.category)}
                          </div>
                          {doc.description && (
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-1">{doc.description}</p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="font-medium">{doc.year}년 {doc.month ? `${doc.month}월` : ""}</span>
                            <span className="text-muted-foreground/40">|</span>
                            <span>{doc.fileName}</span>
                            <span className="text-muted-foreground/40">|</span>
                            <span>업로드: {new Date(doc.createdAt).toLocaleDateString("ko-KR")}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Link href={`/accounting/documents/${doc.id}`}>
                          <Button variant="outline" size="sm" className="h-8">
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            상세
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => window.open(doc.fileUrl, "_blank")}>
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          다운로드
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(doc.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <FolderOpen className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
                  <p className="text-base font-medium text-muted-foreground">
                    {searchQuery ? "검색 결과가 없습니다." : "업로드된 문서가 없습니다."}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {searchQuery ? "다른 검색어를 시도하거나 필터를 초기화해주세요." : "문서를 업로드하여 시작하세요."}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
