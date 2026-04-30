/**
 * 화장품 안정성시험 목록 (Phase 2-8)
 *
 * 라우트: /dashboard/cosmetic/stability
 * ICH Q1A 가이드라인 기반 — long_term / accelerated / stress 시험 관리.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Thermometer, FileCheck, AlertTriangle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { toast } from "@/hooks/use-toast";

const STATUS_LABEL: Record<string, string> = {
  planned: "계획",
  in_progress: "진행 중",
  completed: "완료",
  failed: "실패",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  planned: "secondary",
  in_progress: "default",
  completed: "default",
  failed: "destructive",
};

const TYPE_LABEL: Record<string, string> = {
  long_term: "장기 (25°C/60%RH)",
  accelerated: "가속 (40°C/75%RH)",
  stress: "스트레스 (고온/광선)",
};

const TYPE_PRESETS: Record<
  string,
  { temp: number; humidity: number; light: "dark" | "ambient" | "direct_sunlight"; months: number }
> = {
  long_term: { temp: 25, humidity: 60, light: "dark", months: 36 },
  accelerated: { temp: 40, humidity: 75, light: "dark", months: 6 },
  stress: { temp: 50, humidity: 75, light: "direct_sunlight", months: 1 },
};

export default function CosmeticStabilityList() {
  const [createOpen, setCreateOpen] = useState(false);
  const [productId, setProductId] = useState<string>("");
  const [testType, setTestType] = useState<"long_term" | "accelerated" | "stress">(
    "long_term",
  );

  const { data: tests, refetch } = trpc.cosmetic.stability.list.useQuery(
    undefined,
    { refetchInterval: 60_000 },
  );
  const { data: productsData } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (productsData as any)?.items ?? (productsData as any) ?? [];

  const createMutation = trpc.cosmetic.stability.create.useMutation();

  const items = tests ?? [];
  const preset = TYPE_PRESETS[testType];

  const handleCreate = async () => {
    if (!productId) {
      toast({ title: "제품 필수", variant: "destructive" });
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        productId: Number(productId),
        testType,
        storageTempC: preset.temp,
        storageHumidity: preset.humidity,
        storageLight: preset.light,
        plannedDurationMonths: preset.months,
      });
      toast({ title: `안정성시험 ${result.testCode} 등록 (planned)` });
      setCreateOpen(false);
      setProductId("");
      setTestType("long_term");
      refetch();
    } catch (e: any) {
      toast({ title: "등록 실패", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Thermometer className="w-6 h-6 text-orange-600" />
              안정성시험 (Stability Test)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              ICH Q1A 가이드라인 기반 — 장기/가속/스트레스 시험으로 사용기한 결정 (Phase 2-8)
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <FileCheck className="w-4 h-4 mr-1" />
            신규 시험 등록
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-baseline justify-between">
              <span>시험 목록 {tests ? `(${items.length}건)` : ""}</span>
              <span className="text-xs text-muted-foreground font-normal">자동 갱신 60초</span>
            </CardTitle>
            <CardDescription>
              planned → in_progress → completed (또는 failed). 관측치는 detail 페이지에서 (향후).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="py-12 text-center">
                <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">등록된 시험 0건</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">시험 코드</TableHead>
                    <TableHead className="w-24 text-right">제품</TableHead>
                    <TableHead className="w-32">유형</TableHead>
                    <TableHead className="w-28">조건</TableHead>
                    <TableHead className="w-20 text-right">기간</TableHead>
                    <TableHead className="w-28">시작일</TableHead>
                    <TableHead className="w-24">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((t) => (
                    <TableRow key={t.id} className="hover:bg-muted/40">
                      <TableCell className="font-mono text-sm">{t.testCode}</TableCell>
                      <TableCell className="text-right text-sm">#{t.productId}</TableCell>
                      <TableCell className="text-xs">{TYPE_LABEL[t.testType] ?? t.testType}</TableCell>
                      <TableCell className="text-xs">
                        {t.storageTempC ?? "-"}°C
                        {t.storageHumidity !== null && ` / ${t.storageHumidity}%RH`}
                      </TableCell>
                      <TableCell className="text-right text-xs">{t.plannedDurationMonths}개월</TableCell>
                      <TableCell className="text-xs">
                        {t.startedAt ? String(t.startedAt).slice(0, 10) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[t.status] ?? "default"}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </Badge>
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
            <CardTitle className="text-sm">ICH Q1A 시험 유형 (자동 적용)</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• <strong>장기 (long_term)</strong>: 25°C/60%RH, 차광, 36개월 — 사용기한 결정 표준</p>
            <p>• <strong>가속 (accelerated)</strong>: 40°C/75%RH, 차광, 6개월 — 빠른 안정성 평가</p>
            <p>• <strong>스트레스 (stress)</strong>: 50°C 또는 광선 조사, 1개월 — 극단 환경 검증</p>
          </CardContent>
        </Card>
      </div>

      {/* 신규 시험 dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>신규 안정성시험 등록</DialogTitle>
            <DialogDescription>
              시험 유형 선택 시 ICH Q1A 표준 조건이 자동 적용됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="stbProduct">제품 *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="stbProduct">
                  <SelectValue placeholder="제품 선택" />
                </SelectTrigger>
                <SelectContent>
                  {(products as any[]).map((p: any) => (
                    <SelectItem key={String(p.id)} value={String(p.id)}>
                      {p.productCode ? `[${p.productCode}] ` : ""}
                      {p.productName ?? p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stbType">시험 유형</Label>
              <Select value={testType} onValueChange={(v: any) => setTestType(v)}>
                <SelectTrigger id="stbType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="long_term">장기 (25°C/60%RH, 36개월)</SelectItem>
                  <SelectItem value="accelerated">가속 (40°C/75%RH, 6개월)</SelectItem>
                  <SelectItem value="stress">스트레스 (50°C+/광선, 1개월)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border p-3 text-xs bg-muted/40">
              <div className="font-medium mb-1">자동 적용 조건</div>
              <div>온도: {preset.temp}°C · 습도: {preset.humidity}%RH</div>
              <div>조명: {preset.light === "dark" ? "차광" : preset.light === "ambient" ? "일반 실내" : "직사광"}</div>
              <div>기간: {preset.months}개월</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
            <Button onClick={handleCreate}>등록 (planned)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
