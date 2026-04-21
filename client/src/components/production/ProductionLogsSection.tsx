import { trpc } from "@/lib/trpc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProductionLogsSectionProps {
  versionId: number;
}

export default function ProductionLogsSection({ versionId }: ProductionLogsSectionProps) {
  const { data: productionLogs, isLoading: isLoadingProduction } = trpc.mfReport.getProductionLogs.useQuery({ versionId });
  const { data: deductionLogs, isLoading: isLoadingDeduction } = trpc.mfReport.getInventoryDeductionLogs.useQuery({ versionId });

  if (isLoadingProduction || isLoadingDeduction) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="production" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="production">생산 이력</TabsTrigger>
        <TabsTrigger value="deduction">재고 차감 이력</TabsTrigger>
      </TabsList>

      <TabsContent value="production" className="space-y-4">
        {productionLogs && productionLogs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>생산일</TableHead>
                <TableHead>배치 크기 (kg)</TableHead>
                <TableHead>생산 수량</TableHead>
                <TableHead>비고</TableHead>
                <TableHead>등록일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productionLogs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {log.productionDate
                      ? new Date(log.productionDate).toLocaleDateString("ko-KR")
                      : "-"}
                  </TableCell>
                  <TableCell>{log.batchSizeKg}</TableCell>
                  <TableCell>{log.producedQuantity}</TableCell>
                  <TableCell>{log.notes || "-"}</TableCell>
                  <TableCell>
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleDateString("ko-KR")
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>생산 이력이 없습니다</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="deduction" className="space-y-4">
        {deductionLogs && deductionLogs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>재료 유형</TableHead>
                <TableHead>재료 ID</TableHead>
                <TableHead>차감 수량</TableHead>
                <TableHead>단위</TableHead>
                <TableHead>생산일</TableHead>
                <TableHead>배치 크기 (kg)</TableHead>
                <TableHead>차감일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductionLogs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell>{log.materialType}</TableCell>
                  <TableCell>
                    {log.materialId ? `M-${log.materialId}` : log.intermediateId ? `I-${log.intermediateId}` : "-"}
                  </TableCell>
                  <TableCell>{log.deductedQuantity}</TableCell>
                  <TableCell>{log.unit}</TableCell>
                  <TableCell>
                    {log.productionDate
                      ? new Date(log.productionDate).toLocaleDateString("ko-KR")
                      : "-"}
                  </TableCell>
                  <TableCell>{log.batchSizeKg}</TableCell>
                  <TableCell>
                    {log.deductionDate
                      ? new Date(log.deductionDate).toLocaleDateString("ko-KR")
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>재고 차감 이력이 없습니다</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
