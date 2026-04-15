import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function SaleDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  
  const { data: _saleRaw, isLoading } = trpc.haccpIntegration.getSaleById.useQuery(
    { id: parseInt(id!) },
    { enabled: !!id }
  );
  const sale = _saleRaw as any;

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
    onError: (error: any) => {
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
