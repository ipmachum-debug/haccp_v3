import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Upload, Sparkles, Loader2, FileText, BookOpen,
  Search, Trash2, RotateCcw, Database, CheckCircle,
} from "lucide-react";
import { formatDate } from "./types";

const DOC_TYPE_LABELS: Record<string, string> = {
  regulation: "법규/규정",
  standard: "기준서/표준",
  sop: "표준작업절차서",
  manual: "매뉴얼/지침서",
  guideline: "가이드라인",
  training: "교육 자료",
  template: "양식/서식",
  faq: "FAQ/Q&A",
  internal: "사내 문서",
  custom: "기타",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  uploaded: { label: "업로드", color: "bg-gray-100 text-gray-600" },
  chunking: { label: "분할중", color: "bg-blue-100 text-blue-600" },
  embedding: { label: "임베딩중", color: "bg-purple-100 text-purple-600" },
  ready: { label: "준비완료", color: "bg-green-100 text-green-600" },
  error: { label: "오류", color: "bg-red-100 text-red-600" },
};

// ============================================================================
// Tab: 지식베이스 (RAG) 관리
// ============================================================================
export function KnowledgeBaseTab() {
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [docType, setDocType] = useState<string>("regulation");
  const [content, setContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");

  const stats = trpc.ai.kbStats.useQuery();
  const documents = trpc.ai.kbListDocuments.useQuery({
    docType: (docTypeFilter === "all" ? undefined : docTypeFilter) as any,
    limit: 50,
  });
  const uploadMutation = trpc.ai.kbUploadDocument.useMutation();
  const deleteMutation = trpc.ai.kbDeleteDocument.useMutation();
  const reindexMutation = trpc.ai.kbReindexDocument.useMutation();
  const searchMutation = trpc.ai.kbSearch.useMutation();
  const utils = trpc.useUtils();

  const handleUpload = async () => {
    if (!title.trim() || !content.trim()) return;
    const result = await uploadMutation.mutateAsync({
      title,
      description: description || undefined,
      docType: docType as any,
      content,
    });
    if (result.success) {
      setShowUpload(false);
      setTitle(""); setDescription(""); setContent("");
      utils.ai.kbListDocuments.invalidate();
      utils.ai.kbStats.invalidate();
    }
  };

  const handleDelete = async (documentId: number) => {
    if (!confirm("이 문서를 삭제하시겠습니까?")) return;
    await deleteMutation.mutateAsync({ documentId });
    utils.ai.kbListDocuments.invalidate();
    utils.ai.kbStats.invalidate();
  };

  const handleReindex = async (documentId: number) => {
    await reindexMutation.mutateAsync({ documentId });
    utils.ai.kbListDocuments.invalidate();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const result = await searchMutation.mutateAsync({
      query: searchQuery,
      topK: 5,
    });
    if (result.success) {
      setSearchResults(result.results);
    }
  };

  const kbStats = stats.data;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <BookOpen className="w-5 h-5" /> 지식베이스 (RAG)
        </h2>
        <Button onClick={() => setShowUpload(true)} size="sm">
          <Upload className="w-4 h-4 mr-2" /> 문서 등록
        </Button>
      </div>

      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="py-2.5 px-3">
          <p className="text-sm text-indigo-800">
            <strong>AI 지식베이스:</strong> HACCP 관련 법규, 기준서, SOP, 매뉴얼 등을 등록하면
            AI가 자동으로 문서를 분석하고 벡터 인덱스를 생성합니다.
            챗봇 "하나"가 질문에 답변할 때 등록된 문서를 참고하여 더 정확한 답변을 제공합니다.
          </p>
        </CardContent>
      </Card>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-indigo-500" />
              <span className="text-xs text-muted-foreground">등록 문서</span>
            </div>
            <div className="text-lg font-bold">{kbStats?.totalDocuments || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">검색 가능</span>
            </div>
            <div className="text-lg font-bold text-green-600">{kbStats?.readyDocuments || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">총 청크</span>
            </div>
            <div className="text-lg font-bold">{kbStats?.totalChunks || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">총 토큰</span>
            </div>
            <div className="text-lg font-bold">{(kbStats?.totalTokens || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* 시맨틱 검색 */}
      <Card>
        <CardContent className="py-2.5 px-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Search className="w-4 h-4" /> 지식베이스 검색
          </h3>
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="HACCP 관련 질문을 입력하세요. 예: CCP 온도 관리 기준은?"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searchMutation.isPending || !searchQuery.trim()}>
              {searchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {searchResults && (
            <div className="space-y-2 mt-3">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">관련 문서를 찾을 수 없습니다.</p>
              ) : (
                searchResults.map((r: any, idx: number) => (
                  <div key={r.chunkId} className="border rounded-lg p-3 hover:bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">{DOC_TYPE_LABELS[r.docType] || r.docType}</Badge>
                      <span className="text-sm font-medium">{r.documentTitle}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        유사도: {Math.round(r.score * 100)}%
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{r.content}</p>
                    {r.metadata?.section && (
                      <p className="text-xs text-indigo-600 mt-1">섹션: {r.metadata.section}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 문서 업로드 다이얼로그 */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>지식베이스 문서 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5">
            <div>
              <Label>문서 제목</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 식품위생법 시행규칙 제36조" />
            </div>
            <div>
              <Label>설명 (선택)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="문서에 대한 간단한 설명" />
            </div>
            <div>
              <Label>문서 유형</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>문서 내용</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="문서 전체 내용을 붙여넣으세요. AI가 자동으로 청크 분할 + 벡터 임베딩을 생성합니다."
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">{content.length}자 입력</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>취소</Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending || !title.trim() || !content.trim()}>
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  문서 분석 중...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  등록 및 인덱싱
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 문서 목록 */}
      <Card>
        <CardContent className="py-2.5 px-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">등록된 문서</h3>
            <Select value={docTypeFilter} onValueChange={(v) => { setDocTypeFilter(v === "all" ? "all" : v); }}>
              <SelectTrigger className="w-[130px] h-7 text-xs">
                <SelectValue placeholder="유형 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {documents.isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (documents.data?.documents || []).length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>등록된 문서가 없습니다. "문서 등록"으로 HACCP 관련 문서를 추가하세요.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead className="w-[120px]">유형</TableHead>
                  <TableHead className="w-[80px]">상태</TableHead>
                  <TableHead className="w-[60px]">청크</TableHead>
                  <TableHead className="w-[80px]">토큰</TableHead>
                  <TableHead className="w-[100px]">등록일</TableHead>
                  <TableHead className="w-[100px]">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(documents.data?.documents || []).map((doc: any) => {
                  const statusConfig = STATUS_LABELS[doc.status] || STATUS_LABELS.uploaded;
                  return (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{doc.title}</p>
                          {doc.description && <p className="text-xs text-muted-foreground truncate max-w-[300px]">{doc.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusConfig.color}`}>
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">{doc.chunkCount}</TableCell>
                      <TableCell className="text-sm">{doc.totalTokens?.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{formatDate(doc.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                            title="재인덱싱"
                            onClick={() => handleReindex(doc.id)}
                            disabled={reindexMutation.isPending}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                            title="삭제"
                            onClick={() => handleDelete(doc.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
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
  );
}
