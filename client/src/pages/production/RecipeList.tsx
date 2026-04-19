import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Eye, Edit, Copy, Power, PowerOff, Search } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { toast } from "sonner";

export default function RecipeList() {

  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);

  const { data: recipes, isLoading, refetch } = trpc.recipeManagement.list.useQuery({
    isActive: filterActive,
  });

  const toggleActiveMutation = trpc.recipeManagement.toggleActive.useMutation({
    onSuccess: () => {
      toast.success("레시피 상태가 변경되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  const duplicateMutation = trpc.recipeManagement.duplicate.useMutation({
    onSuccess: () => {
      toast.success("레시피가 복제되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  const handleToggleActive = (id: number, currentStatus: number) => {
    toggleActiveMutation.mutate({
      id,
      isActive: currentStatus === 0,
    });
  };

  const handleDuplicate = (id: number, recipeName: string) => {
    const newName = prompt(`복제할 레시피 이름을 입력하세요:`, `${recipeName} (복사본)`);
    if (newName) {
      duplicateMutation.mutate({ id, newRecipeName: newName });
    }
  };

  const filteredRecipes = recipes?.filter((recipe: any) =>
    recipe.recipeName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold">레시피 관리</h1>
              <p className="text-muted-foreground mt-1">
                제품 제조를 위한 레시피(품목제조보고서)를 관리합니다.
              </p>
            </div>
            <Link href="/dashboard/recipes/create">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                레시피 등록
              </Button>
            </Link>
          </div>

          <div className="flex gap-4 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="레시피 이름 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterActive === undefined ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive(undefined)}
              >
                전체
              </Button>
              <Button
                variant={filterActive === true ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive(true)}
              >
                활성
              </Button>
              <Button
                variant={filterActive === false ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive(false)}
              >
                비활성
              </Button>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>레시피 목록</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                로딩 중...
              </div>
            ) : !filteredRecipes || filteredRecipes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? "검색 결과가 없습니다." : "등록된 레시피가 없습니다."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>레시피 이름</TableHead>
                    <TableHead>버전</TableHead>
                    <TableHead>배치 크기</TableHead>
                    <TableHead>수율</TableHead>
                    <TableHead>소요 시간</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecipes.map((recipe: any) => (
                    <TableRow key={recipe.id}>
                      <TableCell className="font-medium">{recipe.recipeName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{recipe.version}</Badge>
                      </TableCell>
                      <TableCell>
                        {recipe.batchSize} {recipe.batchUnit}
                      </TableCell>
                      <TableCell>{recipe.yieldRate}%</TableCell>
                      <TableCell>{recipe.totalTime || "-"} 분</TableCell>
                      <TableCell>
                        <Badge variant={recipe.isActive === 1 ? "default" : "secondary"}>
                          {recipe.isActive === 1 ? "활성" : "비활성"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                        <div className="flex justify-end gap-2">
                          <Link href={`/dashboard/recipes/${recipe.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link href={`/dashboard/recipes/${recipe.id}/edit`}>
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDuplicate(recipe.id, recipe.recipeName)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(recipe.id, recipe.isActive)}
                          >
                            {recipe.isActive === 1 ? (
                              <PowerOff className="h-4 w-4 text-destructive" />
                            ) : (
                              <Power className="h-4 w-4 text-green-600" />
                            )}
                          </Button>
                        </div>
</div>                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
