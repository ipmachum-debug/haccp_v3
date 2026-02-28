import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Clock, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function ExpiringMaterialsWidget() {
  const { data: materials, isLoading } = trpc.dashboard.getExpiringMaterials.useQuery();

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            유통기한 임박 (7일 이내)
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
            <Clock className="h-5 w-5 text-yellow-500" />
            유통기한 임박 (7일 이내)
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
          {materials && materials.length > 0 ? (
            materials.map((material: any, index: number) => (
              <div key={index} className="flex justify-between items-center border-b pb-2 last:border-0">
                <div>
                  <div className="font-medium">{material.materialName}</div>
                  <div className="text-sm text-muted-foreground">
                    LOT: {material.lotNumber}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-yellow-600">
                    {material.expiryDate}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {material.quantity}{material.unit}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">유통기한 임박 원재료가 없습니다</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
