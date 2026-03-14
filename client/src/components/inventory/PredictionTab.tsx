import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableHeader, TableRow, TableBody } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { StyledTable, TH, TD, SectionTitle, Loading, Empty, fmt, fmtDate } from "./InventoryHelpers";

export function PredictionTab() {
  const [days, setDays] = useState(30);
  const { data: preds, isLoading } = trpc.inventory.predictAllShortage.useQuery({ days });
  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <SectionTitle icon={AlertCircle} title="재고 부족 예측" desc="과거 사용 패턴 기반" />
          <Select value={days.toString()} onValueChange={(v) => setDays(+v)}>
            <SelectTrigger className="w-28 h-10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[7,14,30,60].map(d => <SelectItem key={d} value={d.toString()}>{d}일</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? <Loading /> : !preds?.length ? <Empty text="부족 예상 원재료 없음" /> : (
          <StyledTable>
            <TableHeader><TableRow>
              <TH>원재료</TH><TH>현재고</TH><TH>일평균</TH>
              <TH>부족일</TH><TH className="text-center">D-day</TH><TH className="text-center">우선</TH>
            </TableRow></TableHeader>
            <TableBody>
              {preds.map((p: any) => (
                <TableRow key={p.materialId} className="hover:bg-muted/30">
                  <TD>
                    <span className="font-medium">{p.materialName}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{p.materialCode}</span>
                  </TD>
                  <TD className="font-mono">{fmt(p.currentStock)} {p.unit}</TD>
                  <TD className="font-mono">{fmt(p.avgDailyUsage)} {p.unit}</TD>
                  <TD className="text-muted-foreground">{p.predictedShortageDate ? fmtDate(p.predictedShortageDate) : "-"}</TD>
                  <TD className="text-center">
                    <Badge variant={p.daysUntilShortage <= 7 ? "destructive" : "secondary"} className="text-xs px-2.5 py-1">{p.daysUntilShortage}일</Badge>
                  </TD>
                  <TD className="text-center">
                    <Badge variant={p.daysUntilShortage <= 7 ? "destructive" : p.daysUntilShortage <= 14 ? "secondary" : "outline"} className="text-xs px-2.5 py-1">
                      {p.daysUntilShortage <= 7 ? "긴급" : p.daysUntilShortage <= 14 ? "높음" : "보통"}
                    </Badge>
                  </TD>
                </TableRow>
              ))}
            </TableBody>
          </StyledTable>
        )}
      </CardContent>
    </Card>
  );
}
