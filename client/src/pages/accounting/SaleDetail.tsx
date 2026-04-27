import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ArrowLeft, Package } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function SaleDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const saleIdNum = id ? parseInt(id) : NaN;

  const { data: _saleRaw, isLoading } = trpc.haccpIntegration.getSaleById.useQuery(
    { id: saleIdNum },
    { enabled: !!id }
  );
  const sale = _saleRaw as any;

  // 차감된 LOT 추적 (사후 조회)
  const { data: lotTrace } = trpc.haccpIntegration.getSaleLotTrace.useQuery(
    { saleId: saleIdNum },
    { enabled: !!id && !isNaN(saleIdNum) },
  );
  const lotRows = (lotTrace as any[]) ?? [];

  const downloadPdfMutation = trpc.haccpIntegration.generateSalePDF.useMutation({
    onSuccess: (data: any) => {
      // Base64 → Blob → 다운로드
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = data.filename || `매출거래명세서_${sale?.transactionDate}_${sale?.partnerName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success("거래명세서 PDF가 다운로드되었습니다.");
    },
    onError: (error: { message: string }) => {
      toast.error(`PDF 생성 실패: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!sale) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-muted-foreground">거래 정보를 찾을 수 없습니다.</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/dashboard/accounting/sales/list")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">매출 거래 상세</h1>
          </div>
          <Button
            onClick={() => downloadPdfMutation.mutate({ saleId: parseInt(id!) })}
            disabled={downloadPdfMutation.isPending}
          >
            <Download className="h-4 w-4 mr-2" />
            {downloadPdfMutation.isPending ? "생성 중..." : "거래명세서 PDF 다운로드"}
          </Button>
        </div>

        <div className="grid gap-6">
          {/* 기본 정보 */}
          <Card>
            <CardHeader>
              <CardTitle>기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">거래일자</div>
                <div className="font-medium">{sale.transactionDate}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">고객사</div>
                <div className="font-medium">{sale.partnerName}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">구분</div>
                <div className="font-medium">{sale.type}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">상태</div>
                <div className="font-medium">{sale.status}</div>
              </div>
            </CardContent>
          </Card>

          {/* 품목 정보 */}
          <Card>
            <CardHeader>
              <CardTitle>품목 정보</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4">품목명</th>
                      <th className="text-right py-2 px-4">수량</th>
                      <th className="text-right py-2 px-4">단가</th>
                      <th className="text-right py-2 px-4">금액</th>
                      <th className="text-right py-2 px-4">세액</th>
                      <th className="text-right py-2 px-4">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.items?.map((item: any, index: number) => (
                      <tr key={index} className="border-b">
                        <td className="py-2 px-4">{item.itemName}</td>
                        <td className="text-right py-2 px-4">{item.quantity.toLocaleString()}</td>
                        <td className="text-right py-2 px-4">{item.unitPrice.toLocaleString()}원</td>
                        <td className="text-right py-2 px-4">{item.amount.toLocaleString()}원</td>
                        <td className="text-right py-2 px-4">{item.tax.toLocaleString()}원</td>
                        <td className="text-right py-2 px-4 font-medium">
                          {item.total.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td colSpan={3} className="py-2 px-4 text-right">
                        총 합계
                      </td>
                      <td className="text-right py-2 px-4">{sale.totalAmount.toLocaleString()}원</td>
                      <td className="text-right py-2 px-4">{sale.totalTax.toLocaleString()}원</td>
                      <td className="text-right py-2 px-4">{sale.grandTotal.toLocaleString()}원</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 차감된 LOT 추적 (HACCP 추적성 / 거래처 LOT 확인) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                차감된 LOT
                {lotRows.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {lotRows.length}건
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lotRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  이 매출에 연결된 차감 기록이 없습니다.
                  {sale.status !== "approved" && sale.status !== "received" && (
                    <span className="ml-2 text-amber-700">
                      (매출이 아직 승인되지 않아 LOT 차감이 발생하지 않았을 수 있습니다)
                    </span>
                  )}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 px-2">품목</th>
                        <th className="text-left py-2 px-2">LOT 번호</th>
                        <th className="text-right py-2 px-2">차감수량</th>
                        <th className="text-right py-2 px-2">단가</th>
                        <th className="text-right py-2 px-2">금액</th>
                        <th className="text-left py-2 px-2">생산일</th>
                        <th className="text-left py-2 px-2">소비기한</th>
                        <th className="text-left py-2 px-2">차감일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lotRows.map((r: any) => {
                        const itemName = r.productName || r.materialName || "-";
                        const itemCode = r.productCode || r.materialCode || "";
                        return (
                          <tr key={r.txId} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2">
                              <div className="font-medium">{itemName}</div>
                              {itemCode && (
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  {itemCode}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2 font-mono text-xs">
                              {r.lotNumber || (
                                <span className="text-muted-foreground italic">LOT 없음</span>
                              )}
                            </td>
                            <td className="text-right py-2 px-2 tabular-nums">
                              {r.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {r.unit}
                            </td>
                            <td className="text-right py-2 px-2 tabular-nums">
                              {r.unitCost > 0 ? `₩${r.unitCost.toLocaleString()}` : "-"}
                            </td>
                            <td className="text-right py-2 px-2 tabular-nums">
                              {r.amount > 0 ? `₩${r.amount.toLocaleString()}` : "-"}
                            </td>
                            <td className="py-2 px-2 text-xs">
                              {r.productionDate ? String(r.productionDate).slice(0, 10) : "-"}
                            </td>
                            <td className="py-2 px-2 text-xs">
                              {r.expiryDate ? String(r.expiryDate).slice(0, 10) : "-"}
                            </td>
                            <td className="py-2 px-2 text-xs text-muted-foreground">
                              {r.transactionDate ? String(r.transactionDate).slice(0, 10) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 메모 */}
          {sale.notes && (
            <Card>
              <CardHeader>
                <CardTitle>메모</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{sale.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
