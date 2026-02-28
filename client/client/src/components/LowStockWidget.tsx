import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertCircle, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function LowStockWidget() {
  const { data: warnings, isLoading } = trpc.dashboard.getLowStockWarnings.useQuery();

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            재고 부족 경고
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">로딩 중...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            재고 부족 경고
          </div>
          <Link href="/inventory">
            <Button variant="ghost" size="sm" className="h-8 gap-1">
              보기
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {warnings && warnings.length > 0 ? (
            warnings.map((warning: any, index: number) => (
              <div key={index} className="flex justify-between items-center border-b pb-2 last:border-0">
                <div>
                  <div className="font-medium">{warning.materialName}</div>
                  <div className="text-sm text-muted-foreground">
                    안전 재고: {warning.safetyStock}{warning.unit}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-500">
                    {warning.currentStock}{warning.unit}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Math.round((warning.currentStock / warning.safetyStock) * 100)}%
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">재고 부족 경고가 없습니다</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
