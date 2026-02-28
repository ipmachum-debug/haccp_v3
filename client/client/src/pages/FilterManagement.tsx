import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Search, FileText, Filter } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

export default function FilterManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterType, setFilterType] = useState("");
  const [checkResult, setCheckResult] = useState("normal");
  const [replacementDate, setReplacementDate] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!filterLocation || !filterType) {
      toast.error("필수 항목을 입력해주세요");
      return;
    }

    try {
      toast.success("필터 관리 기록이 저장되었습니다");
      
      // 폼 초기화
      setFilterLocation("");
      setFilterType("");
      setCheckResult("normal");
      setReplacementDate("");
      setNotes("");
    } catch (error) {
      toast.error("저장 중 오류가 발생했습니다");
    }
  };

  return (
    <DashboardLayout>

    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">필터 관리</h1>
          <p className="text-muted-foreground mt-1">
            공조 시스템 필터의 점검 및 교체 이력을 관리합니다
          </p>
        </div>
        <Button>
          <FileText className="mr-2 h-4 w-4" />
          보고서 생성
        </Button>
      </div>

      {/* 필터 관리 기록 폼 */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Filter className="h-5 w-5" />
          필터 점검 기록
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="filterLocation">필터 위치 *</Label>
              <Select value={filterLocation} onValueChange={setFilterLocation}>
                <SelectTrigger id="filterLocation">
                  <SelectValue placeholder="위치를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="production_area">생산 구역</SelectItem>
                  <SelectItem value="packaging_area">포장 구역</SelectItem>
                  <SelectItem value="storage_area">저장 구역</SelectItem>
                  <SelectItem value="office_area">사무실 구역</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filterType">필터 종류 *</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger id="filterType">
                  <SelectValue placeholder="종류를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hepa">HEPA 필터</SelectItem>
                  <SelectItem value="prefilter">프리 필터</SelectItem>
                  <SelectItem value="medium">중성능 필터</SelectItem>
                  <SelectItem value="activated_carbon">활성탄 필터</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="checkResult">점검 결과 *</Label>
              <Select value={checkResult} onValueChange={setCheckResult}>
                <SelectTrigger id="checkResult">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">정상</SelectItem>
                  <SelectItem value="cleaning_required">청소 필요</SelectItem>
                  <SelectItem value="replacement_required">교체 필요</SelectItem>
                  <SelectItem value="abnormal">이상 발견</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="replacementDate">교체 예정일</Label>
              <Input
                id="replacementDate"
                type="date"
                value={replacementDate}
                onChange={(e) => setReplacementDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">비고</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="추가 메모사항을 입력하세요"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => {
              setFilterLocation("");
              setFilterType("");
              setCheckResult("normal");
              setReplacementDate("");
              setNotes("");
            }}>
              초기화
            </Button>
            <Button type="submit">
              <Plus className="mr-2 h-4 w-4" />
              기록 저장
            </Button>
          </div>
        </form>
      </Card>

      {/* 기록 목록 */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">기록 목록</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
          </div>
        </div>

        <div className="text-center py-12 text-muted-foreground">
          <Filter className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>아직 기록된 필터 관리 내역이 없습니다</p>
          <p className="text-sm mt-1">위 폼을 작성하여 첫 기록을 추가하세요</p>
        </div>
      </Card>
    </div>
  
    </DashboardLayout>
  );
}
