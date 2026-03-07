import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  
  const { data: _purchaseRaw, isLoading } = trpc.haccpIntegration.getPurchaseById.useQuery(
    { id: parseInt(id!) },
    { enabled: !!id }
  );
  const purchase = _purchaseRaw as any;

  const downloadPdfMutation = trpc.haccpIntegration.generatePurchasePdf.useMutation({
    onSuccess: (data) => {
      // PDF 다운로드
      const link = document.createElement("a");
      link.href = data.pdfUrl;
      link.download = `매입거래명세서_${purchase?.transactionDate}_${purchase?.partnerName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("거래명세서 PDF가 다운로드되었습니다.");
    },
    onError: (error) => {
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

  if (!purchase) {
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
              onClick={() => setLocation("/dashboard/accounting/purchases/list")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">매입 거래 상세</h1>
          </div>
          <Button
            onClick={() => downloadPdfMutation.mutate({ id: parseInt(id!) })}
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
                <div className="font-medium">{purchase.transactionDate}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">공급업체</div>
                <div className="font-medium">{purchase.partnerName}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">구분</div>
                <div className="font-medium">{purchase.type}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">상태</div>
                <div className="font-medium">{purchase.status}</div>
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
                    {purchase.items?.map((item: any, index: number) => (
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
                      <td className="text-right py-2 px-4">{purchase.totalAmount.toLocaleString()}원</td>
                      <td className="text-right py-2 px-4">{purchase.totalTax.toLocaleString()}원</td>
                      <td className="text-right py-2 px-4">{purchase.grandTotal.toLocaleString()}원</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 메모 */}
          {purchase.notes && (
            <Card>
              <CardHeader>
                <CardTitle>메모</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{purchase.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
