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
import { Plus, Search, FileText, Radar } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function DetectionEquipmentCheck() {
  const [searchTerm, setSearchTerm] = useState("");
  const [equipmentName, setEquipmentName] = useState("");
  const [checkResult, setCheckResult] = useState("normal");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipmentName) {
      toast.error("장비명을 입력해주세요");
      return;
    }
    toast.success("탐지장비 점검 기록이 저장되었습니다");
    setEquipmentName("");
    setCheckResult("normal");
    setNotes("");
  };

  return (
    <DashboardLayout>

    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">탐지장비 점검</h1>
          <p className="text-muted-foreground mt-1">
            금속탐지기 등 탐지장비의 점검 이력을 관리합니다
          </p>
        </div>
        <Button>
          <FileText className="mr-2 h-4 w-4" />
          보고서 생성
        </Button>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Radar className="h-5 w-5" />
          탐지장비 점검 기록
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="equipmentName">장비명 *</Label>
              <Input
                id="equipmentName"
                value={equipmentName}
                onChange={(e) => setEquipmentName(e.target.value)}
                placeholder="예: 금속탐지기-01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkResult">점검 결과 *</Label>
              <Select value={checkResult} onValueChange={setCheckResult}>
                <SelectTrigger id="checkResult">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">정상</SelectItem>
                  <SelectItem value="calibration_required">교정 필요</SelectItem>
                  <SelectItem value="repair_required">수리 필요</SelectItem>
                  <SelectItem value="abnormal">이상 발견</SelectItem>
                </SelectContent>
              </Select>
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
              setEquipmentName("");
              setCheckResult("normal");
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

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">기록 목록</h2>
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
        <div className="text-center py-12 text-muted-foreground">
          <Radar className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>아직 기록된 탐지장비 점검 내역이 없습니다</p>
        </div>
      </Card>
    </div>
  
    </DashboardLayout>
  );
}
