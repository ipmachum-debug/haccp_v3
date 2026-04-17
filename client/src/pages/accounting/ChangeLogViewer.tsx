/**
 * 변경이력 조회 — 전표/거래/급여 등 수정 이력
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Search, Loader2 } from "lucide-react";

export default function ChangeLogViewer() {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.changeLog.list.useQuery({
    entityType: entityType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page, limit: 50,
  });

  const actionLabels: Record<string, { label: string; color: string }> = {
    create: { label: "생성", color: "bg-emerald-100 text-emerald-700" },
    update: { label: "수정", color: "bg-blue-100 text-blue-700" },
    delete: { label: "삭제", color: "bg-red-100 text-red-700" },
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <History className="h-5 w-5 text-gray-600" /> 변경이력
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">전표, 거래, 급여 등 데이터 변경 추적</p>
        </div>

        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <Label className="text-[10px]">유형</Label>
                <select className="h-8 text-xs border rounded px-2 w-[120px]" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
                  <option value="">전체</option>
                  <option value="journal_entry">전표</option>
                  <option value="purchase">매입</option>
                  <option value="sale">매출</option>
                  <option value="payroll">급여</option>
                  <option value="attendance">근태</option>
                  <option value="leave">휴가</option>
                </select>
              </div>
              <div>
                <Label className="text-[10px]">시작일</Label>
                <Input type="date" value={startDate} onChange={(e: any) => { setStartDate(e.target.value); setPage(1); }} className="h-8 text-xs w-[130px]" />
              </div>
              <div>
                <Label className="text-[10px]">종료일</Label>
                <Input type="date" value={endDate} onChange={(e: any) => { setEndDate(e.target.value); setPage(1); }} className="h-8 text-xs w-[130px]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-2.5 px-4 border-b">
            <CardTitle className="text-sm">변경 이력 {data ? `(${data.total}건)` : ""}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
            ) : !data?.items?.length ? (
              <div className="py-16 text-center text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>변경 이력이 없습니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="p-2.5 text-left font-medium">시간</th>
                    <th className="p-2.5 text-center font-medium">액션</th>
                    <th className="p-2.5 text-left font-medium">대상</th>
                    <th className="p-2.5 text-left font-medium">필드</th>
                    <th className="p-2.5 text-left font-medium">변경 전</th>
                    <th className="p-2.5 text-left font-medium">변경 후</th>
                    <th className="p-2.5 text-left font-medium">사용자</th>
                  </tr></thead>
                  <tbody>
                    {data.items.map((log: any) => {
                      const act = actionLabels[log.action] || actionLabels.update;
                      return (
                        <tr key={log.id} className="border-b hover:bg-accent/50">
                          <td className="p-2.5 font-mono text-[10px] text-muted-foreground">
                            {log.createdAt ? new Date(log.createdAt).toLocaleString("ko-KR") : "-"}
                          </td>
                          <td className="p-2.5 text-center">
                            <Badge className={`${act.color} text-[9px]`}>{act.label}</Badge>
                          </td>
                          <td className="p-2.5">
                            <span className="text-muted-foreground">{log.entityType}</span>
                            <span className="ml-1 font-mono">#{log.entityId}</span>
                          </td>
                          <td className="p-2.5">{log.fieldName || "-"}</td>
                          <td className="p-2.5 text-red-600 font-mono truncate max-w-[120px]">{log.oldValue || "-"}</td>
                          <td className="p-2.5 text-emerald-700 font-mono truncate max-w-[120px]">{log.newValue || "-"}</td>
                          <td className="p-2.5">{log.userName || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {data && data.total > data.limit && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</Button>
            <span className="text-xs self-center">{page} / {Math.ceil(data.total / data.limit)}</span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / data.limit)} onClick={() => setPage(page + 1)}>다음</Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
