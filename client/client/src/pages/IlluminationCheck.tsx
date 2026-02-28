import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lightbulb, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

export default function IlluminationCheck() {
  const [searchTerm, setSearchTerm] = useState("");
  const [location, setLocation] = useState("");
  const [luxValue, setLuxValue] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location || !luxValue) {
      toast.error("위치와 조도값을 입력해주세요");
      return;
    }
    toast.success("조도 점검 기록이 저장되었습니다");
    setLocation("");
    setLuxValue("");
  };

  return (
    <DashboardLayout>

    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">조도점검</h1>
          <p className="text-muted-foreground mt-1">작업장 조도 측정 이력을 관리합니다</p>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Lightbulb className="h-5 w-5" />
          조도 측정 기록
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">측정 위치 *</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 작업장 A구역" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="luxValue">조도값 (lux) *</Label>
              <Input id="luxValue" type="number" value={luxValue} onChange={(e) => setLuxValue(e.target.value)} placeholder="예: 300" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setLocation(""); setLuxValue(""); }}>초기화</Button>
            <Button type="submit"><Plus className="mr-2 h-4 w-4" />기록 저장</Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">기록 목록</h2>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-64" />
          </div>
        </div>
        <div className="text-center py-12 text-muted-foreground">
          <Lightbulb className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>아직 기록된 조도 점검 내역이 없습니다</p>
        </div>
      </Card>
    </div>
  
    </DashboardLayout>
  );
}
