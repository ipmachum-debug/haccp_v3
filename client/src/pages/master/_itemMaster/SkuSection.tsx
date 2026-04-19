/**
 * ItemMasterManagement 분해 — SKU 섹션 (수정/삭제 버튼 포함).
 */
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus } from "lucide-react";

export function SkuSection({ skuList, onAddSku, onEditSku, onDeleteSku }: {
  itemId: number;
  itemCode: string;
  itemName: string;
  skuList: any[];
  onAddSku: () => void;
  onEditSku: (sku: any) => void;
  onDeleteSku: (skuId: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">SKU (포장 규격) 목록</h4>
        <Button size="sm" variant="outline" onClick={onAddSku}>
          <Plus className="h-3 w-3 mr-1" /> SKU 추가
        </Button>
      </div>
      {skuList.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 SKU가 없습니다.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU 코드</TableHead>
              <TableHead>SKU 명칭</TableHead>
              <TableHead>판매단위</TableHead>
              <TableHead>개당 중량(g)</TableHead>
              <TableHead>팩당 개수</TableHead>
              <TableHead>박스당 팩수</TableHead>
              <TableHead className="text-right">판매단위당 kg</TableHead>
              <TableHead className="text-right">단가</TableHead>
              <TableHead>기본</TableHead>
              <TableHead className="w-[80px]">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skuList.map((sku: any) => (
              <TableRow key={sku.id}>
                <TableCell className="font-mono text-xs">{sku.skuCode}</TableCell>
                <TableCell>{sku.skuName}</TableCell>
                <TableCell>{sku.salesUnit}</TableCell>
                <TableCell>{sku.netWeightG || "-"}</TableCell>
                <TableCell>{sku.piecesPerPack || 1}</TableCell>
                <TableCell>{sku.packsPerBox || 1}</TableCell>
                <TableCell className="text-right font-mono">
                  {Number(sku.kgPerSalesUnit).toFixed(4)}
                </TableCell>
                <TableCell className="text-right">
                  {Number(sku.unitPrice || 0).toLocaleString()}원
                </TableCell>
                <TableCell>
                  {sku.isDefault ? (
                    <Badge className="bg-green-500 text-white text-xs">기본</Badge>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => onEditSku(sku)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => onDeleteSku(sku.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
