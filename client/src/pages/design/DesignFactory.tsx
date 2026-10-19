/**
 * 생산 설계 > 우리 공장 (2026-10-19, 설계 18 §13 1단계) — 공장 지도
 *   공정마다 [운전 방식 · 평소 가열시간] + 그 공정에 연결된 설비(평소 온도 · 가열 · 한 번 도는 시간).
 *   같은 설비를 여러 공정이 쓰면 '공유' 로 표시 (예: 설기·약식 증숙이 같은 증숙기 6대).
 * 읽기 전용. 고치는 곳은 기존 화면 — 설비(CCP 모니터링 > 설비기준) · 공정(CCP 한계기준 관리).
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { EDIT_PATHS } from "@/components/design/DesignBits";
import { Loader2, Wrench } from "lucide-react";

const KIND: Record<string, string> = { "CCP-1B": "가열·증숙", "CCP-2B": "굽기", "CCP-4P": "금속검출" };
function modeText(g: any): string {
  if (g.ccpType === "CCP-4P") return "제품이 차례로 통과";
  if (g.mode === "concurrent") return "여러 대를 동시에";
  if (g.mode === "grouped" && g.batchSize > 1) return `${g.batchSize}대씩 묶어서 (남으면 적은 대수)`;
  return "한 대씩 차례로";
}

export default function DesignFactory() {
  const [, navigate] = useLocation();
  const q = trpc.productionDesign.factory.useQuery(undefined, { retry: 1 });
  const groups: any[] = (q.data as any[]) ?? [];
  // 설비 → 그 설비를 쓰는 공정 수 (공유 표시)
  const shared = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const g of groups) for (const e of g.equipments) m.set(e.id, [...(m.get(e.id) ?? []), g.name]);
    return m;
  }, [groups]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader title="우리 공장" description="공정마다 어떤 설비를 어떻게 돌리는지 — 평소 운전값이 생산 계획과 CCP 기록의 기본값이 됩니다."
          primary={{ label: "설비 고치기", icon: Wrench, onClick: () => navigate(EDIT_PATHS.equipment) }}
          secondary={{ label: "공정 고치기", onClick: () => navigate(EDIT_PATHS.process) }} />
        {q.isLoading && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-1 animate-spin" />불러오는 중…</CardContent></Card>}
        {q.isError && <Card><CardContent className="py-8 text-center text-sm text-red-700">{q.error?.message}</CardContent></Card>}
        {!q.isLoading && !groups.length && !q.isError && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">등록된 공정이 없습니다. 공정과 설비를 먼저 등록하세요.</CardContent></Card>}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="factory-map">
          {groups.map((g) => (
            <Card key={g.id} className={g.issues?.some((i: any) => i.level === "red") ? "border-red-300" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{g.name}</CardTitle>
                  <Badge variant="outline">{KIND[g.ccpType] ?? g.ccpType}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {modeText(g)}
                  {g.ccpType !== "CCP-4P" && (g.profileTimeMin != null ? ` · 가열 ${g.profileTimeMin}분` : g.profileCount > 1 ? ` · 가열시간 설정 ${g.profileCount}개 (설비 기본값 사용)` : "")}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {!g.equipments.length && <span className="text-sm text-red-700">연결된 설비 없음</span>}
                  {g.equipments.map((e: any) => {
                    const users = shared.get(e.id) ?? [];
                    return (
                      <div key={e.id} className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                        <div className="font-medium text-sm">{e.name}{users.length > 1 && <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-800" title={users.join(", ")}>공유</span>}</div>
                        {g.ccpType !== "CCP-4P" && (
                          <div className="text-muted-foreground">
                            {[e.tempC != null ? `${e.tempC}℃` : null, e.timeMin != null ? `기본 가열 ${e.timeMin}분` : "기본 가열 ?", e.cycleMin != null ? `한 번 ${e.cycleMin}분` : "한 번 ?"].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(g.issues ?? []).map((i: any, k: number) => <p key={k} className={i.level === "red" ? "text-sm text-red-700" : "text-sm text-amber-800"}>• {i.text}</p>)}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
