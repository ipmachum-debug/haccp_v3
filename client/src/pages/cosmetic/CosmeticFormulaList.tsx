/**
 * 화장품 배합표 마스터 목록 (Phase 2-4a)
 *
 * 라우트: /dashboard/cosmetic/formula
 *
 * 기능:
 *   - 배합표 목록 + 상태/제품 필터
 *   - 신규 등록 (CosmeticFormulaDialog)
 *   - 행 클릭 → detail 페이지 (배합 항목 편집)
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
import { FlaskConical, FileCheck, AlertTriangle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { CosmeticFormulaDialog } from "./CosmeticFormulaDialog";

const STATUS_OPTIONS = [
  { value: null, label: "전체" },
  { value: "draft", label: "작성 중" },
  { value: "approved", label: "승인" },
  { value: "active", label: "운영 표준" },
  { value: "deprecated", label: "구버전" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  approved: "승인",
  active: "운영 표준",
  deprecated: "구버전",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  active: "default",
  deprecated: "destructive",
};

type StatusFilter = "draft" | "approved" | "active" | "deprecated" | null;

export default function CosmeticFormulaList() {
  const [filter, setFilter] = useState<StatusFilter>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, refetch } = trpc.cosmetic.formula.list.useQuery(
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
              <FlaskConical className="w-6 h-6 text-fuchsia-600" />
              배합표 (Formula) 마스터
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              제품별 표준 배합표 관리 — BMR 제조 시 참조 기준이 됩니다.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <FileCheck className="w-4 h-4 mr-1" />
            신규 배합표 등록
          </Button>
        </div>

        {/* 상태 필터 */}
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

        {/* 배합표 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-baseline justify-between">
              <span>배합표 목록 {data ? `(${items.length}건)` : ""}</span>
              <span className="text-xs text-muted-foreground font-normal">자동 갱신 60초</span>
            </CardTitle>
            <CardDescription>
              작성 중 → 승인 → 사용 중 → 구버전. "사용 중" 상태가 BMR 제조의 기준 배합표가 됩니다.
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
                    ? `'${STATUS_LABEL[filter] ?? filter}' 상태 배합표 0건`
                    : "등록된 배합표 0건"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">배합표 코드</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead className="w-20">버전</TableHead>
                    <TableHead className="w-24 text-right">제품 ID</TableHead>
                    <TableHead className="w-28">상태</TableHead>
                    <TableHead className="w-28 text-right">생성일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((f) => (
                    <TableRow key={f.id} className="hover:bg-muted/40">
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/dashboard/cosmetic/formula/${f.id}`}
                          className="text-primary hover:underline"
                        >
                          {f.formulaCode}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{f.name}</TableCell>
                      <TableCell className="text-xs font-mono">{f.version}</TableCell>
                      <TableCell className="text-right text-sm">#{f.productId}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[f.status] ?? "default"}>
                          {STATUS_LABEL[f.status] ?? f.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {f.createdAt
                          ? new Date(f.createdAt as any).toLocaleDateString("ko-KR")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 연계 모듈 안내 */}
        <Card className="bg-muted/30 border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">연계 모듈</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• <strong>BMR 원료 투입</strong> — 배합표 기준값과 실제 투입량 비교 기록</p>
            <p>• <strong>라벨 / 전성분 (INCI)</strong> — 배합표 기반 KFDA 표시 자동 생성</p>
            <p>• <strong>QA 출고 (Release)</strong> — 배합표 승인이 출고 검증의 전제 조건</p>
          </CardContent>
        </Card>
      </div>

      <CosmeticFormulaDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSuccess={refetch}
      />
    </DashboardLayout>
  );
}
