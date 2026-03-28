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
  FileText, Upload, Sparkles, Loader2, XCircle, FileCheck,
} from "lucide-react";
import { STANDARD_TYPE_LABELS, formatDate } from "./types";
import type { ParsedItem } from "./types";

// ============================================================================
// Tab 3: 기준서 관리 ({"기준서 \u2192 체크리스트 자동생성"})
// ============================================================================
export function StandardsTab() {
  const [showUpload, setShowUpload] = useState(false);
  const [name, setName] = useState("");
  const [standardType, setStandardType] = useState("sanitation");
  const [content, setContent] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [currentStandardId, setCurrentStandardId] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const standards = trpc.ai.listStandards.useQuery();
  const uploadMutation = trpc.ai.uploadStandard.useMutation();
  const createMutation = trpc.ai.createChecklistFromStandard.useMutation();
  const utils = trpc.useUtils();

  const handleUploadAndParse = async () => {
    if (!name.trim() || !content.trim()) return;
    const result = await uploadMutation.mutateAsync({
      name, standardType: standardType as any, content,
    });
    if (result.success) {
      setParsedItems(result.parsedItems as ParsedItem[]);
      setCurrentStandardId(result.standardId);
      setShowUpload(false);
      setShowPreview(true);
    }
  };

  const handleCreateTemplate = async () => {
    if (!currentStandardId || parsedItems.length === 0) return;
    const result = await createMutation.mutateAsync({
      standardId: currentStandardId,
      templateName: `${name} 체크리스트`,
      category: "QUALITY",
      items: parsedItems,
    });
    if (result.success) {
      setShowPreview(false);
      setParsedItems([]);
      setName("");
      setContent("");
      utils.ai.listStandards.invalidate();
    }
  };

  const removeItem = (id: string) => {
    setParsedItems(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{"기준서 \u2192 체크리스트 자동생성"}</h2>
        <Button onClick={() => setShowUpload(true)} size="sm">
          <Upload className="w-4 h-4 mr-2" /> 기준서 업로드
        </Button>
      </div>

      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="py-2.5 px-3">
          <p className="text-sm text-indigo-800">
            <strong>사용법:</strong> HACCP 기준서(관리기준, 위생관리기준 등)를 붙여넣으면 AI가 자동으로 점검항목을 추출하여
            체크리스트 템플릿을 생성합니다. 회사마다 기준이 비슷하므로 기준서만 주면 바로 쓸 수 있는 체크리스트가 나옵니다.
          </p>
        </CardContent>
      </Card>

      {/* 기준서 업로드 다이얼로그 */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>기준서 업로드</DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5">
            <div>
              <Label>기준서 이름</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 위생관리기준서 v2.0" />
            </div>
            <div>
              <Label>기준서 유형</Label>
              <Select value={standardType} onValueChange={setStandardType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STANDARD_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>기준서 내용 (붙여넣기)</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="기준서 전체 내용을 붙여넣으세요. AI가 자동으로 점검항목을 추출합니다."
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">{content.length}/50,000자</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>취소</Button>
            <Button onClick={handleUploadAndParse} disabled={uploadMutation.isPending || !name.trim() || !content.trim()}>
              {uploadMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              AI 분석 시작
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파싱 결과 미리보기 및 편집 */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI 추출 결과 - {parsedItems.length}개 항목</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            AI가 기준서에서 추출한 점검항목입니다. 불필요한 항목은 삭제하고, 확인 후 체크리스트를 생성하세요.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="w-[100px]">분류</TableHead>
                <TableHead>점검항목</TableHead>
                <TableHead className="w-[150px]">기준</TableHead>
                <TableHead className="w-[80px]">주기</TableHead>
                <TableHead className="w-[80px]">유형</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsedItems.map((item, idx) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{idx + 1}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{item.category}</Badge></TableCell>
                  <TableCell className="text-sm">{item.checkItem}</TableCell>
                  <TableCell className="text-xs">{item.standard}</TableCell>
                  <TableCell className="text-xs">{item.frequency}</TableCell>
                  <TableCell className="text-xs">{item.itemType}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                      onClick={() => removeItem(item.id)}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>취소</Button>
            <Button onClick={handleCreateTemplate} disabled={createMutation.isPending || parsedItems.length === 0}>
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileCheck className="w-4 h-4 mr-2" />}
              체크리스트 템플릿 생성 ({parsedItems.length}개 항목)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 기존 기준서 목록 */}
      <Card>
        <CardContent className="py-2.5 px-3">
          <h3 className="text-sm font-semibold mb-2">등록된 기준서</h3>
          {standards.isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (standards.data?.standards || []).length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>등록된 기준서가 없습니다. 위 "기준서 업로드" 버튼으로 시작하세요.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead className="w-[150px]">유형</TableHead>
                  <TableHead className="w-[100px]">상태</TableHead>
                  <TableHead className="w-[80px]">항목 수</TableHead>
                  <TableHead className="w-[120px]">등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(standards.data?.standards || []).map((std: any) => (
                  <TableRow key={std.id}>
                    <TableCell className="font-medium">{std.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{STANDARD_TYPE_LABELS[std.standard_type] || std.standard_type}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={std.status === "applied" ? "default" : "outline"} className="text-xs">
                        {std.status === "uploaded" ? "업로드" : std.status === "parsed" ? "파싱완료" : std.status === "reviewed" ? "검토완료" : "적용됨"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{std.item_count || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(std.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
