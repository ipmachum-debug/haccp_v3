/**
 * 화장품 라벨 마스터 목록 (Phase 2-5)
 *
 * 라우트: /dashboard/cosmetic/label
 * KFDA 화장품법 § 19 표기 의무 항목 자동화.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tag, FileCheck, AlertTriangle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { CosmeticLabelDialog } from "./CosmeticLabelDialog";

const STATUS_OPTIONS = [
  { value: null, label: "전체" },
  { value: "draft", label: "작성 중" },
  { value: "approved", label: "승인" },
  { value: "active", label: "사용 중" },
  { value: "deprecated", label: "구버전" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  approved: "승인",
  active: "사용 중",
  deprecated: "구버전",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  active: "default",
  deprecated: "destructive",
};

type StatusFilter = "draft" | "approved" | "active" | "deprecated" | null;

export default function CosmeticLabelList() {
  const [filter, setFilter] = useState<StatusFilter>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, refetch } = trpc.cosmetic.label.list.useQuery(
    filter ? { status: filter } : undefined,
    { refetchInterval: 60_000 },
  );

  const items = data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Tag className="w-6 h-6 text-rose-600" />
              라벨 / 전성분 표시
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              KFDA 화장품법 § 19 표기 의무 자동화 (제품명 / 용량 / 전성분 / 사용방법 / 주의사항)
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <FileCheck className="w-4 h-4 mr-1" />
            신규 라벨 등록
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">상태 필터</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <Button
                  key={opt.value ?? "all"}
                  variant={filter === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-baseline justify-between">
              <span>라벨 목록 {data ? `(${items.length}건)` : ""}</span>
              <span className="text-xs text-muted-foreground font-normal">자동 갱신 60초</span>
            </CardTitle>
            <CardDescription>
              작성 중 → 승인 → 사용 중 → 구버전. "사용 중" 상태 라벨이 KFDA 신고용 표준 라벨입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center">
                <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {filter
                    ? `'${STATUS_LABEL[filter] ?? filter}' 상태 라벨 0건`
                    : "등록된 라벨 0건"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">라벨 코드</TableHead>
                    <TableHead>제품명 (한글)</TableHead>
                    <TableHead>제품명 (영문)</TableHead>
                    <TableHead className="w-24">용량</TableHead>
                    <TableHead className="w-24 text-right">제품 ID</TableHead>
                    <TableHead className="w-28">상태</TableHead>
                    <TableHead className="w-28 text-right">생성일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((l) => (
                    <TableRow key={l.id} className="hover:bg-muted/40">
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/dashboard/cosmetic/label/${l.id}`}
                          className="text-primary hover:underline"
                        >
                          {l.labelCode}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{l.productNameKo}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.productNameEn ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs">{l.capacity ?? "-"}</TableCell>
                      <TableCell className="text-right text-sm">#{l.productId}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[l.status] ?? "default"}>
                          {STATUS_LABEL[l.status] ?? l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {l.createdAt
                          ? new Date(l.createdAt as any).toLocaleDateString("ko-KR")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">향후 확장</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• 라벨 인쇄 미리보기 (PDF) — 50mL / 100g 표준 양식</p>
            <p>• 배합표(Formula) 기반 INCI(전성분) 자동 생성</p>
            <p>• KFDA 신고서 자동 작성</p>
          </CardContent>
        </Card>
      </div>

      <CosmeticLabelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSuccess={refetch}
      />
    </DashboardLayout>
  );
}
