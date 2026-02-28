import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_LABELS = {
  haccp_basic: "HACCP 기초",
  haccp_advanced: "HACCP 심화",
  hygiene: "위생 관리",
  safety: "안전 관리",
  quality: "품질 관리",
  equipment: "설비 운영",
  regulation: "법규 교육",
  other: "기타",
};

const STATUS_LABELS = {
  active: "활성",
  inactive: "비활성",
  archived: "보관",
};

export default function TrainingCourseList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const { data: courses, isLoading, refetch } = trpc.training.listCourses.useQuery();

  const deleteMutation = trpc.training.deleteCourse.useMutation({
    onSuccess: () => {
      toast.success("교육 과정이 삭제되었습니다");
      refetch();
    },
    onError: (error) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const handleDelete = async (id: number, courseName: string) => {
    if (!confirm(`"${courseName}" 과정을 삭제하시겠습니까?`)) return;
    deleteMutation.mutate({ id });
  };

  const filteredCourses = courses?.filter((course) =>
    course.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    course.courseCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>교육 과정 관리</CardTitle>
            <Button onClick={() => setLocation("/training/courses/new")}>
              <Plus className="w-4 h-4 mr-2" />
              새 과정 등록
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* 검색 및 필터 */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="과정명 또는 과정코드 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="카테고리" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 카테고리</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 테이블 */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : !filteredCourses || filteredCourses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              등록된 교육 과정이 없습니다
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>과정코드</TableHead>
                  <TableHead>과정명</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>교육시간</TableHead>
                  <TableHead>필수여부</TableHead>
                  <TableHead>유효기간</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCourses.map((course) => (
                  <TableRow key={course.id}>
                    <TableCell className="font-medium">{course.courseCode}</TableCell>
                    <TableCell>{course.courseName}</TableCell>
                    <TableCell>{CATEGORY_LABELS[course.category as keyof typeof CATEGORY_LABELS]}</TableCell>
                    <TableCell>{course.duration}분</TableCell>
                    <TableCell>
                      {course.isMandatory ? (
                        <span className="text-red-600 font-medium">필수</span>
                      ) : (
                        <span className="text-muted-foreground">선택</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {course.validityPeriod ? `${course.validityPeriod}개월` : "-"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          course.status === "active"
                            ? "bg-green-100 text-green-700"
                            : course.status === "inactive"
                            ? "bg-gray-100 text-gray-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {STATUS_LABELS[course.status as keyof typeof STATUS_LABELS]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/training/courses/${course.id}`)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(course.id, course.courseName)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
</div>                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
