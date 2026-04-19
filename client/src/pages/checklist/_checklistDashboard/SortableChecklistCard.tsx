/**
 * ChecklistDashboard 분해 — 드래그 가능한 체크리스트 카드 컴포넌트.
 * 카테고리별 항목을 dnd-kit으로 정렬 가능하게 표시.
 */
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { List, PlusCircle } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function SortableChecklistCard({ item, category }: { item: any; category: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const ItemIcon = item.icon;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="hover:shadow-lg transition-shadow cursor-move">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${category.bgColor}`}>
                <ItemIcon className={`h-5 w-5 ${category.color}`} />
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">
              {category.filterLabel}
            </Badge>
          </div>
          <CardTitle className="text-lg">{item.title}</CardTitle>
          <CardDescription className="text-sm">{item.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {item.listPath && item.createPath && (
            <div className="flex gap-2">
              <Link href={item.listPath} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  <List className="h-4 w-4 mr-1" />
                  목록
                </Button>
              </Link>
              <Link href={item.createPath} className="flex-1">
                <Button size="sm" className="w-full">
                  <PlusCircle className="h-4 w-4 mr-1" />
                  새 항목
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
