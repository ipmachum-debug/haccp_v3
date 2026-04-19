import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Edit, History } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function RecipeDetail() {
  const L = useIndustryLabel();
  const [, params] = useRoute("/dashboard/recipes/:id");
  const recipeId = params?.id ? parseInt(params.id) : 0;

  const { data: recipe, isLoading } = trpc.recipeManagement.getById.useQuery(
    { id: recipeId },
    { enabled: recipeId > 0 }
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="text-center py-12 text-muted-foreground">
            로딩 중...
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!recipe) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="text-center py-12 text-muted-foreground">
            레시피를 찾을 수 없습니다.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/dashboard/recipes">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                목록으로
              </Button>
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">{recipe.recipeName}</h1>
                <Badge variant={recipe.isActive === 1 ? "default" : "secondary"}>
                  {recipe.isActive === 1 ? "활성" : "비활성"}
                </Badge>
                <Badge variant="outline">{recipe.version}</Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                {recipe.description || "설명이 없습니다."}
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/dashboard/recipes/${recipeId}/versions`}>
                <Button variant="outline">
                  <History className="mr-2 h-4 w-4" />
                  버전 이력
                </Button>
              </Link>
              <Link href={`/dashboard/recipes/${recipeId}/edit`}>
                <Button>
                  <Edit className="mr-2 h-4 w-4" />
                  수정
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>{`${L("batch")} 정보`}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">배치 크기</span>
                <span className="font-medium">
                  {recipe.batchSize} {recipe.batchUnit}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">수율</span>
                <span className="font-medium">{recipe.yieldRate}%</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>소요 시간</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">준비 시간</span>
                <span className="font-medium">{recipe.preparationTime || "-"} 분</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">조리 시간</span>
                <span className="font-medium">{recipe.cookingTime || "-"} 분</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">총 소요 시간</span>
                <span className="font-medium">{recipe.totalTime || "-"} 분</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{`${L("material")} 목록`}</CardTitle>
          </CardHeader>
          <CardContent>
            {!recipe.lines || recipe.lines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                등록된 원재료가 없습니다.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>순서</TableHead>
                    <TableHead>원재료</TableHead>
                    <TableHead>투입량</TableHead>
                    <TableHead>배합 비율</TableHead>
                    <TableHead>비고</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipe.lines
                    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                    .map((line: any) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.sortOrder}</TableCell>
                        <TableCell className="font-medium">
                          원재료 ID: {line.materialId}
                        </TableCell>
                        <TableCell>
                          {line.quantity} {line.unit}
                        </TableCell>
                        <TableCell>{line.percentage ? `${line.percentage}%` : "-"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {line.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>작성 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">작성자</span>
              <span>ID: {recipe.createdBy}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">작성일</span>
              <span>{new Date(recipe.createdAt).toLocaleString("ko-KR")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">최종 수정일</span>
              <span>{new Date(recipe.updatedAt).toLocaleString("ko-KR")}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
