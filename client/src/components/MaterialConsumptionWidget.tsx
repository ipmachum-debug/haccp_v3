import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Package2 } from "lucide-react";

export function MaterialConsumptionWidget() {
  const { data, isLoading } = trpc.dashboard.getMaterialConsumption.useQuery();

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">원재료 소비 통계</h3>
          <Package2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-muted animate-pulse rounded" />
          <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">원재료 소비 통계</h3>
          <Package2 className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">데이터가 없습니다</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base md:text-lg font-semibold">원재료 소비 통계</h3>
        <Package2 className="h-4 md:h-5 w-4 md:w-5 text-muted-foreground" />
      </div>

      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.materialId} className="flex justify-between items-center">
            <span className="text-xs md:text-sm text-muted-foreground truncate flex-1">
              {item.materialName}
            </span>
            <span className="text-xs md:text-sm font-medium ml-2">
              {item.totalQuantity.toFixed(2)} {item.unit}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
