import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

export default function CalibrationManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [equipment, setEquipment] = useState("");
  const [calibrationDate, setCalibrationDate] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipment || !calibrationDate) {
      toast.error("장비명과 교정일자를 입력해주세요");
      return;
    }
    toast.success("검교정 기록이 저장되었습니다");
    setEquipment("");
    setCalibrationDate("");
  };

  return (
    <DashboardLayout>

    <div className="container mx-auto py-6 space-y-6">
      <div><h1 className="text-3xl font-bold">검교정 관리</h1><p className="text-muted-foreground mt-1">측정 장비의 검교정 이력을 관리합니다</p></div>
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><Settings className="h-5 w-5" />검교정 기록</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label htmlFor="equipment">장비명 *</Label><Input id="equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="예: 온도계-01" /></div>
            <div className="space-y-2"><Label htmlFor="calibrationDate">교정일자 *</Label><Input id="calibrationDate" type="date" value={calibrationDate} onChange={(e) => setCalibrationDate(e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setEquipment(""); setCalibrationDate(""); }}>초기화</Button>
            <Button type="submit"><Plus className="mr-2 h-4 w-4" />기록 저장</Button>
          </div>
        </form>
      </Card>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-semibold">기록 목록</h2><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-64" /></div></div>
        <div className="text-center py-12 text-muted-foreground"><Settings className="mx-auto h-12 w-12 mb-4 opacity-50" /><p>아직 기록된 검교정 내역이 없습니다</p></div>
      </Card>
    </div>
  
    </DashboardLayout>
  );
}
